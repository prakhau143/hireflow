from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.template import EmailTemplate
from app.utils.auth import get_current_user

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateCreate(BaseModel):
    name: str
    category: str
    subject: str
    body: str
    ai_personalization: bool = True
    attachments: Optional[dict] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    ai_personalization: Optional[bool] = None
    attachments: Optional[dict] = None


_DEFAULT_ATTACH = {"resume": True, "portfolio": True, "github": True, "linkedin": True, "cover_letter": False}

# The 15-category template library seeded for every user (all use {{variables}})
_LIBRARY: list[tuple[str, str, str, str]] = [
    ("Python Backend Application", "Resume Submission",
     "Application for {{role}} at {{company}} — {{name}}",
     "Dear Hiring Team,\n\nI'm applying for the {{role}} position at {{company}}. With {{experience}} of experience and hands-on depth in {{skills}}, I believe I can contribute from week one.\n\nMy resume is attached — I'd welcome the opportunity to discuss the role.\n"),
    ("Cold Outreach", "Cold Outreach",
     "{{skills}} engineer interested in {{company}}",
     "Hi {{recruiter_name}},\n\nI've been following {{company}} and would love to be part of what you're building. My background in {{skills}} maps closely to your stack.\n\nIf there's an open (or upcoming) {{role}} position, I'd love to talk.\n"),
    ("Referral Request", "Referral Request",
     "Quick request — referral for {{role}} at {{company}}",
     "Hi {{recruiter_name}},\n\nI noticed the {{role}} opening at {{company}}. Given my experience with {{matched_skills}}, I believe I'd be a strong fit. Would you be open to referring me, or pointing me to the right person?\n\nResume attached for context — happy to share anything else.\n"),
    ("Polite Follow-up", "Follow-up",
     "Following up — {{role}} application ({{name}})",
     "Hi {{recruiter_name}},\n\nI applied for the {{role}} position on {{today}} and wanted to follow up. I remain very interested and would appreciate any update on the process.\n"),
    ("Internship Application", "Internship",
     "Internship Application — {{role}} | {{name}}",
     "Dear Hiring Team,\n\nI'm applying for the {{role}} internship at {{company}}. I've built hands-on projects with {{skills}} and I'm eager to learn fast and contribute meaningfully.\n\nMy resume is attached — thank you for considering my application.\n"),
    ("Fresher Application", "Fresher",
     "Fresher {{career_goal}} — Application for {{role}}",
     "Dear Hiring Team,\n\nAs a recent graduate skilled in {{skills}}, I'm excited to apply for the {{role}} role at {{company}}. I've invested heavily in practical projects and I'm ready to deliver from day one.\n\nResume attached — I'd love the chance to prove myself.\n"),
    ("Experienced Professional", "Experienced",
     "{{experience}} {{career_goal}} | Application for {{role}}",
     "Dear Hiring Team,\n\nWith {{experience}} in production systems and deep experience across {{skills}}, the {{role}} position at {{company}} is a natural next step for me.\n\nI've attached my resume and would welcome a conversation about how I can add value to the team.\n"),
    ("Remote Position", "Remote",
     "Remote {{role}} Application — {{name}}",
     "Dear Hiring Team,\n\nI'm applying for the remote {{role}} role at {{company}}. I've worked effectively in distributed setups — async communication, strong documentation, and ownership — alongside my core skills in {{skills}}.\n\nResume attached; happy to align on any timezone overlap you need.\n"),
    ("Startup Application", "Startup",
     "Builder mindset — {{role}} at {{company}}",
     "Hi team,\n\nStartups are where I do my best work — shipping fast, wearing multiple hats, and owning outcomes. The {{role}} role at {{company}} fits that energy perfectly, and my experience with {{skills}} means minimal ramp-up.\n\nResume attached — would love to chat.\n"),
    ("MNC Application", "MNC",
     "Application for {{role}} — {{company}} | {{name}}",
     "Dear Hiring Team,\n\nI would like to formally apply for the {{role}} position at {{company}}. My professional experience ({{experience}}) spans {{skills}}, with a consistent record of delivering within structured, large-scale environments.\n\nPlease find my resume attached for your review.\n"),
    ("Recruiter Reply", "Recruiter Reply",
     "Re: {{role}} opportunity",
     "Hi {{recruiter_name}},\n\nThank you for reaching out about the {{role}} position — I'm definitely interested. My current experience with {{matched_skills}} aligns well with what you described.\n\nI've attached my updated resume. When would be a good time to connect?\n"),
    ("Thank You Note", "Thank You",
     "Thank you — {{role}} interview",
     "Hi {{recruiter_name}},\n\nThank you for taking the time to speak with me about the {{role}} position at {{company}}. The conversation strengthened my enthusiasm for the team and the problems you're solving.\n\nLooking forward to the next steps.\n"),
    ("Interview Follow-up", "Interview Follow-up",
     "Following up on my {{role}} interview",
     "Hi {{recruiter_name}},\n\nI wanted to follow up on my interview for the {{role}} position. I remain very excited about the opportunity at {{company}} and I'm happy to provide anything else that would help the decision.\n"),
    ("Offer Negotiation", "Negotiation",
     "Regarding the {{role}} offer",
     "Hi {{recruiter_name}},\n\nThank you for the offer for the {{role}} position — I'm genuinely excited about joining {{company}}. Based on my {{experience}} and current market benchmarks for this skill set, I'd like to discuss the compensation component before finalizing.\n\nOpen to a quick call whenever convenient.\n"),
    ("Networking", "Networking",
     "Connecting — fellow {{career_goal}}",
     "Hi {{recruiter_name}},\n\nI came across your profile while researching {{company}} and really admire the work your team is doing. I'm a {{career_goal}} working with {{skills}}, and I'd value a short conversation about your experience there.\n\nNo agenda — just genuinely keen to learn.\n"),
]


async def _seed_library(db: AsyncSession, user_id: str) -> None:
    for name, category, subject, body in _LIBRARY:
        db.add(EmailTemplate(
            user_id=user_id, name=name, category=category, subject=subject, body=body,
            is_default=True, ai_personalization=True, attachments=dict(_DEFAULT_ATTACH),
        ))
    await db.commit()


@router.get("/")
async def list_templates(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(EmailTemplate).where(EmailTemplate.user_id == user.id).order_by(EmailTemplate.created_at.desc())
    )
    templates = result.scalars().all()
    if not templates:  # first visit → seed the 15-template library
        await _seed_library(db, user.id)
        result = await db.execute(
            select(EmailTemplate).where(EmailTemplate.user_id == user.id).order_by(EmailTemplate.created_at.desc())
        )
        templates = result.scalars().all()
    return templates


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    t = EmailTemplate(user_id=user.id, **body.model_dump())
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@router.patch("/{tid}")
async def update_template(
    tid: str,
    body: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(EmailTemplate).where(EmailTemplate.id == tid, EmailTemplate.user_id == user.id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/{tid}", status_code=204)
async def delete_template(tid: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(EmailTemplate).where(EmailTemplate.id == tid, EmailTemplate.user_id == user.id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(t)
    await db.commit()
