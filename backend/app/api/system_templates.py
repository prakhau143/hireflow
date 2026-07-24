"""Admin-only CRUD for platform system email templates (welcome, OTP, application
status, ...). Distinct from /api/templates, which manages each user's own outreach
email templates used when applying to jobs."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.system_email_template import SystemEmailTemplate
from app.utils.auth import require_admin
from app.services.system_email_service import DEFAULT_TEMPLATES, render_template, smtp_send_html

router = APIRouter(prefix="/admin/system-email-templates", tags=["system-email-templates"])

# Representative variables for previewing/test-sending each template type
SAMPLE_VARIABLES: dict[str, dict] = {
    "welcome": {"name": "Alex Johnson"},
    "password_reset_otp": {"name": "Alex Johnson", "otp_spaced": "4 8 3 2 9 1", "expiry_minutes": 10},
    "email_verification": {"name": "Alex Johnson", "verification_link": "https://hireflow.ai/verify?token=sample", "expiry_minutes": 30},
    "application_sent": {"name": "Alex Johnson", "job_title": "Senior Backend Engineer", "company": "Acme Corp"},
    "application_failed": {"name": "Alex Johnson", "job_title": "Senior Backend Engineer", "company": "Acme Corp",
                            "error": "SMTP connection timed out after 3 attempts"},
    "interview_reminder": {"name": "Alex Johnson", "job_title": "Senior Backend Engineer", "company": "Acme Corp",
                            "interview_date": "Monday, July 28 at 2:00 PM"},
    "offer_received": {"name": "Alex Johnson", "job_title": "Senior Backend Engineer", "company": "Acme Corp"},
    "subscription": {"name": "Alex Johnson", "plan_name": "Pro Plan", "amount": "$29.00/month", "renewal_date": "August 24, 2026"},
}


class TemplateUpdateRequest(BaseModel):
    subject: str
    html_body: str
    is_active: bool = True


class RenderDraftRequest(BaseModel):
    """Preview/test-send always render this exact draft — lets the admin see and
    test unsaved edits, not just what's already persisted."""
    subject: str
    html_body: str


def _serialize(t: SystemEmailTemplate, include_body: bool = False) -> dict:
    data = {
        "id": t.id, "type": t.type, "name": t.name, "subject": t.subject,
        "is_active": t.is_active, "updated_at": t.updated_at,
    }
    if include_body:
        data["html_body"] = t.html_body
    return data


async def _get_or_404(db: AsyncSession, template_id: str) -> SystemEmailTemplate:
    t = (await db.execute(
        select(SystemEmailTemplate).where(SystemEmailTemplate.id == template_id)
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


@router.get("")
async def list_templates(db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin)):
    rows = (await db.execute(select(SystemEmailTemplate).order_by(SystemEmailTemplate.name))).scalars().all()
    return [_serialize(t) for t in rows]


@router.get("/{template_id}")
async def get_template(template_id: str, db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin)):
    t = await _get_or_404(db, template_id)
    return _serialize(t, include_body=True)


@router.put("/{template_id}")
async def update_template(
    template_id: str, body: TemplateUpdateRequest,
    db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin),
):
    t = await _get_or_404(db, template_id)
    t.subject = body.subject
    t.html_body = body.html_body
    t.is_active = body.is_active
    await db.commit()
    await db.refresh(t)
    return _serialize(t, include_body=True)


@router.post("/{template_id}/preview")
async def preview_template(
    template_id: str, body: RenderDraftRequest,
    db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin),
):
    t = await _get_or_404(db, template_id)
    variables = SAMPLE_VARIABLES.get(t.type, {})
    subject, html = render_template(body.subject, body.html_body, variables)
    return {"subject": subject, "html": html}


@router.post("/{template_id}/send-test")
async def send_test(
    template_id: str, body: RenderDraftRequest,
    db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin),
):
    t = await _get_or_404(db, template_id)
    variables = SAMPLE_VARIABLES.get(t.type, {})
    subject, html = render_template(body.subject, body.html_body, variables)
    try:
        await asyncio.to_thread(smtp_send_html, admin.email, f"[TEST] {subject}", html)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        err_lower = str(e).lower()
        if "535" in str(e) or "5.7.8" in str(e) or "badcredentials" in err_lower or "authentication" in err_lower:
            raise HTTPException(
                status_code=502,
                detail=(
                    "System email account rejected the App Password (Gmail 535 error). "
                    "Generate a fresh Gmail App Password and update backend/.env (SMTP_USER/SMTP_PASS)."
                ),
            )
        raise HTTPException(status_code=502, detail=f"Failed to send test email: {str(e)}")
    return {"message": f"Test email sent to {admin.email}"}


@router.post("/{template_id}/reset")
async def reset_template(template_id: str, db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin)):
    t = await _get_or_404(db, template_id)
    default = DEFAULT_TEMPLATES.get(t.type)
    if not default:
        raise HTTPException(status_code=400, detail="No coded default exists for this template type")
    t.subject = default["subject"]
    t.html_body = default["html_body"]
    await db.commit()
    await db.refresh(t)
    return _serialize(t, include_body=True)
