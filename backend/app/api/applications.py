"""Bulk apply engine: AI-prepared packages → natural-pace queue → SMTP → tracking."""
import asyncio
import os
import random
import smtplib
import ssl
from datetime import datetime, timezone, timedelta
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.models.user import User
from app.models.job import Job
from app.models.resume import Resume
from app.models.template import EmailTemplate
from app.models.smtp import SmtpConfig
from app.models.smtp_log import SmtpLog
from app.models.application import Application
from app.models.activity_log import ActivityLog
from app.utils.auth import get_current_user
from app.utils.encryption import decrypt_password
from app.services import application_service as agent
from app.services.system_email_service import send_system_email

router = APIRouter(prefix="/applications", tags=["applications"])

DAILY_LIMIT = 450  # stay safely under Gmail's 500/day


class PrepareRequest(BaseModel):
    job_ids: list[str]


class SendItem(BaseModel):
    job_id: str
    to_email: str
    subject: str
    body: str
    template_id: str | None = None
    resume_id: str | None = None
    follow_up_draft: str | None = None
    reply_probability: float | None = None
    reply_reason: str | None = None


class SendRequest(BaseModel):
    items: list[SendItem]
    schedule: bool = True  # stagger sends at a natural pace


async def _sent_today(db: AsyncSession, user_id: str) -> int:
    today = datetime.now(timezone.utc).date().isoformat()
    rows = (await db.execute(
        select(SmtpLog.created_at).where(
            SmtpLog.user_id == user_id,
            SmtpLog.action.in_(("email_sent", "test_sent")),
            SmtpLog.status == "success",
        )
    )).scalars().all()
    return sum(1 for ts in rows if ts and str(ts)[:10] == today)


@router.get("/quota")
async def quota(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    sent = await _sent_today(db, user.id)
    return {"daily_limit": DAILY_LIMIT, "sent_today": sent, "remaining": max(0, DAILY_LIMIT - sent)}


@router.post("/prepare")
async def prepare(body: PrepareRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """AI Application Preparation Agent — one package per selected job (max 10/batch)."""
    if not body.job_ids:
        raise HTTPException(400, "No jobs selected")
    job_ids = body.job_ids[:10]

    jobs = (await db.execute(
        select(Job).where(Job.user_id == user.id, Job.id.in_(job_ids))
    )).scalars().all()
    templates = (await db.execute(
        select(EmailTemplate).where(EmailTemplate.user_id == user.id)
    )).scalars().all()
    resumes = (await db.execute(
        select(Resume).where(Resume.user_id == user.id).order_by(Resume.updated_at.desc())
    )).scalars().all()

    # Duplicate protection: jobs already mailed or queued
    existing = (await db.execute(
        select(Application.job_id).where(
            Application.user_id == user.id,
            Application.job_id.in_(job_ids),
            Application.status.in_(("queued", "sending", "sent")),
        )
    )).scalars().all()
    already = set(existing)

    SKIP_REASONS = {
        "google_form": "Google Form — apply manually (link included)",
        "linkedin": "LinkedIn Easy Apply — apply on LinkedIn",
        "portal": "Company portal — open the apply link",
        "phone": "Phone contact only — call/WhatsApp to apply",
        "none": "Incomplete job — no contact info",
    }

    packages, skipped = [], []
    for job in jobs:
        if job.id in already or job.status == "applied":
            skipped.append({"job_id": job.id, "title": job.title, "reason": "Already applied / queued"})
            continue
        atype = getattr(job, "application_type", None) or ("email" if job.contact_email else "none")
        if atype != "email" or not job.contact_email:
            skipped.append({
                "job_id": job.id, "title": job.title,
                "reason": SKIP_REASONS.get(atype, "No contact email on this job"),
                "apply_link": job.apply_link,
                "application_type": atype,
            })
            continue
        template = agent.pick_template(job, templates)
        resume = agent.pick_resume(job, resumes)
        pkg = await agent.prepare_package(job, user, template, resume)
        pkg["job_title"] = job.title
        pkg["company"] = job.company
        pkg["match_score"] = round(job.match_score or 0)
        packages.append(pkg)

    q = await _sent_today(db, user.id)
    return {
        "packages": packages,
        "skipped": skipped,
        "quota": {"daily_limit": DAILY_LIMIT, "sent_today": q, "remaining": max(0, DAILY_LIMIT - q)},
    }


@router.post("/send")
async def send(body: SendRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Queue prepared emails; a background worker sends them at a natural pace with retries."""
    if not body.items:
        raise HTTPException(400, "Nothing to send")

    smtp = (await db.execute(
        select(SmtpConfig).where(SmtpConfig.user_id == user.id).order_by(SmtpConfig.is_primary.desc())
    )).scalars().first()
    if not smtp:
        raise HTTPException(400, "Configure SMTP first (Email Delivery Center)")

    sent_today = await _sent_today(db, user.id)
    if sent_today + len(body.items) > DAILY_LIMIT:
        raise HTTPException(429, f"Daily limit: {sent_today}/{DAILY_LIMIT} used — only {DAILY_LIMIT - sent_today} left today")

    now = datetime.now(timezone.utc)
    offset = 0
    app_ids = []
    for i, item in enumerate(body.items):
        if i > 0 and body.schedule:
            offset += random.randint(120, 280)  # 2–4.5 min natural gaps
        a = Application(
            user_id=user.id, job_id=item.job_id, template_id=item.template_id,
            resume_id=item.resume_id, to_email=item.to_email, subject=item.subject,
            body=item.body, follow_up_draft=item.follow_up_draft,
            reply_probability=item.reply_probability, reply_reason=item.reply_reason,
            status="queued", scheduled_at=now + timedelta(seconds=offset),
        )
        db.add(a)
        await db.flush()
        app_ids.append(a.id)
        if item.template_id:
            t = (await db.execute(select(EmailTemplate).where(EmailTemplate.id == item.template_id))).scalar_one_or_none()
            if t:
                t.times_used = (t.times_used or 0) + 1
    await db.commit()

    asyncio.create_task(_process_queue(user.id, smtp.id))
    return {"queued": len(app_ids), "application_ids": app_ids,
            "first_send": "in ~5 seconds", "pacing": "2-4 min between emails" if body.schedule else "immediate"}


@router.get("/")
async def list_applications(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(
        select(Application).where(Application.user_id == user.id).order_by(Application.created_at.desc()).limit(100)
    )).scalars().all()
    return rows


# ---------------------------------------------------------------- queue worker

def _smtp_send(smtp_cfg, password: str, to_email: str, subject: str, text_body: str, resume_path: str | None):
    from app.api.smtp import _open_smtp, _clean_email, _clean_str
    from_email = _clean_email(smtp_cfg.from_email, fallback=smtp_cfg.username)
    server = _open_smtp(smtp_cfg.host, smtp_cfg.port, smtp_cfg.encryption, smtp_cfg.username, password)
    msg = MIMEMultipart()
    msg["Subject"] = subject
    from_name = _clean_str(smtp_cfg.from_name)
    msg["From"] = formataddr((from_name, from_email)) if from_name else from_email
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain"))
    if resume_path and os.path.exists(resume_path):
        with open(resume_path, "rb") as f:
            part = MIMEApplication(f.read(), _subtype="pdf")
        part.add_header("Content-Disposition", "attachment", filename=os.path.basename(resume_path))
        msg.attach(part)
    server.sendmail(from_email, [to_email], msg.as_string())
    server.quit()


async def _process_queue(user_id: str, smtp_id: str):
    """Send queued applications one by one at their scheduled time, 3 retries each."""
    while True:
        async with AsyncSessionLocal() as db:
            app_row = (await db.execute(
                select(Application).where(
                    Application.user_id == user_id,
                    Application.status == "queued",
                ).order_by(Application.scheduled_at.asc()).limit(1)
            )).scalars().first()
            if app_row is None:
                return

            sched = app_row.scheduled_at
            if sched is not None:
                if sched.tzinfo is None:
                    sched = sched.replace(tzinfo=timezone.utc)
                wait = (sched - datetime.now(timezone.utc)).total_seconds()
                if wait > 0:
                    await asyncio.sleep(min(wait, 300))
                    continue  # re-check — new items may have jumped the queue

            app_row.status = "sending"
            await db.commit()

            smtp_cfg = (await db.execute(select(SmtpConfig).where(SmtpConfig.id == smtp_id))).scalar_one_or_none()
            resume_path = None
            if app_row.resume_id:
                r = (await db.execute(select(Resume).where(Resume.id == app_row.resume_id))).scalar_one_or_none()
                if r and r.file_url:
                    resume_path = r.file_url.lstrip("/")

            try:
                if smtp_cfg is None:
                    raise RuntimeError("SMTP config deleted")
                password = decrypt_password(smtp_cfg.password_encrypted)
                await asyncio.to_thread(
                    _smtp_send, smtp_cfg, password, app_row.to_email,
                    app_row.subject, app_row.body, resume_path,
                )
                app_row.status = "sent"
                app_row.sent_at = datetime.now(timezone.utc)
                smtp_cfg.emails_sent = (smtp_cfg.emails_sent or 0) + 1
                smtp_cfg.last_sent = datetime.now(timezone.utc)
                job = (await db.execute(select(Job).where(Job.id == app_row.job_id))).scalar_one_or_none()
                job_label = app_row.to_email
                if job:
                    job.status = "applied"
                    job.emails_generated = (job.emails_generated or 0) + 1
                    job_label = f"{job.title} at {job.company}"
                db.add(SmtpLog(user_id=user_id, smtp_id=smtp_id, action="email_sent", status="success",
                               message=f"Application sent to {app_row.to_email}"))
                db.add(ActivityLog(user_id=user_id, action="Application Sent",
                                   description=f"Applied to {job_label} via AI email"))
                await db.commit()

                if job:
                    notify_user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
                    if notify_user:
                        try:
                            await send_system_email(db, "application_sent", notify_user.email, {
                                "name": notify_user.name, "job_title": job.title, "company": job.company,
                            })
                        except Exception as e:
                            print(f"[Applications] application_sent notification failed: {e}")
            except Exception as e:
                app_row.retries = (app_row.retries or 0) + 1
                if app_row.retries >= 3:
                    app_row.status = "failed"
                    app_row.error = str(e)[:500]
                    if smtp_cfg is not None:
                        smtp_cfg.emails_failed = (smtp_cfg.emails_failed or 0) + 1
                    db.add(SmtpLog(user_id=user_id, smtp_id=smtp_id, action="email_failed", status="failed",
                                   message=f"Application to {app_row.to_email} failed: {str(e)[:200]}"))
                else:
                    app_row.status = "queued"
                    app_row.scheduled_at = datetime.now(timezone.utc) + timedelta(seconds=60 * app_row.retries)
                await db.commit()

                if app_row.status == "failed":
                    fail_job = (await db.execute(select(Job).where(Job.id == app_row.job_id))).scalar_one_or_none()
                    notify_user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
                    if fail_job and notify_user:
                        try:
                            await send_system_email(db, "application_failed", notify_user.email, {
                                "name": notify_user.name, "job_title": fail_job.title,
                                "company": fail_job.company, "error": str(e)[:200],
                            })
                        except Exception as email_err:
                            print(f"[Applications] application_failed notification failed: {email_err}")

        await asyncio.sleep(2)
