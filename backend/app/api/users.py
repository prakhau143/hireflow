from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.utils.auth import get_current_user
from app.models.activity_log import ActivityLog
from datetime import datetime, timezone

router = APIRouter(prefix="/users", tags=["users"])


class OnboardingRequest(BaseModel):
    name: str
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    years_experience: Optional[int] = None
    current_role: Optional[str] = None
    current_location: Optional[str] = None
    skills: list[str] = []
    preferred_roles: list[str] = []
    preferred_locations: list[str] = []


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    years_experience: Optional[int] = None
    current_role: Optional[str] = None
    current_location: Optional[str] = None
    skills: Optional[list[str]] = None
    preferred_roles: Optional[list[str]] = None
    preferred_locations: Optional[list[str]] = None
    theme: Optional[str] = None


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    theme: str
    avatar: Optional[str]
    phone: Optional[str]
    linkedin_url: Optional[str]
    github_url: Optional[str]
    portfolio_url: Optional[str]
    years_experience: Optional[int]
    current_role: Optional[str]
    current_location: Optional[str]
    skills: list
    preferred_roles: list
    preferred_locations: list
    onboarding_complete: bool
    created_at: str

    model_config = {"from_attributes": True}

    def model_post_init(self, __context):
        self.created_at = str(self.created_at) if self.created_at else ""


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.post("/onboarding", response_model=UserOut)
async def complete_onboarding(
    body: OnboardingRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    for key, val in body.model_dump().items():
        setattr(user, key, val)
    user.onboarding_complete = True

    log = ActivityLog(
        user_id=user.id,
        action="Profile Completed",
        description=f"Onboarding completed for {body.current_role or 'new user'}",
    )
    db.add(log)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/profile", response_model=UserOut)
async def update_profile(
    body: ProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    for key, val in body.model_dump(exclude_none=True).items():
        setattr(user, key, val)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/readiness")
async def check_readiness(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.resume import Resume
    from app.models.smtp import SmtpConfig

    resume_result = await db.execute(select(Resume).where(Resume.user_id == user.id).limit(1))
    smtp_result = await db.execute(
        select(SmtpConfig).where(SmtpConfig.user_id == user.id, SmtpConfig.is_active == True).limit(1)
    )

    has_resume = resume_result.scalar_one_or_none() is not None
    has_smtp = smtp_result.scalar_one_or_none() is not None

    return {
        "profile_complete": user.onboarding_complete,
        "resume_uploaded": has_resume,
        "smtp_configured": has_smtp,
        "ready": user.onboarding_complete and has_resume and has_smtp,
    }
