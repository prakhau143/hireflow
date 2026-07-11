from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.utils.auth import get_current_user
from app.models.activity_log import ActivityLog
from app.models.resume import Resume
from datetime import datetime, timezone

router = APIRouter(prefix="/users", tags=["users"])


class OnboardingRequest(BaseModel):
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
    resume_id: Optional[str] = None


class CompleteOnboardingRequest(BaseModel):
    phone: str
    current_role: str
    current_location: str
    linkedin_url: str
    github_url: str
    portfolio_url: str
    years_experience: int
    skills: list[str]
    preferred_roles: list[str]
    preferred_locations: list[str]
    resume_id: str


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
    created_at: datetime

    model_config = {"from_attributes": True}


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


@router.post("/onboarding/complete")
async def complete_onboarding_transaction(
    body: CompleteOnboardingRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify resume belongs to user
    resume_result = await db.execute(
        select(Resume).where(Resume.id == body.resume_id, Resume.user_id == user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    try:
        # Update user profile
        user.phone = body.phone
        user.linkedin_url = body.linkedin_url
        user.github_url = body.github_url
        user.portfolio_url = body.portfolio_url
        user.years_experience = body.years_experience
        user.current_role = body.current_role
        user.current_location = body.current_location
        user.skills = body.skills
        user.preferred_roles = body.preferred_roles
        user.preferred_locations = body.preferred_locations
        user.onboarding_complete = True

        # Log activity
        log = ActivityLog(
            user_id=user.id,
            action="Profile Completed",
            description=f"Onboarding completed for {body.current_role}",
        )
        db.add(log)

        # Commit transaction
        await db.commit()
        await db.refresh(user)

        return {
            "success": True,
            "redirect": "/dashboard",
            "profile_completion": 100,
            "user": user,
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to complete onboarding: {str(e)}")


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
