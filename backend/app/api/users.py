from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional, Dict, Any
from app.database import get_db
from app.models.user import User
from app.utils.auth import get_current_user, require_admin
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
    # Professional identity
    headline: Optional[str] = None
    current_company: Optional[str] = None
    expected_salary: Optional[str] = None
    notice_period: Optional[str] = None
    employment_type_pref: Optional[str] = None
    remote_preference: Optional[str] = None
    timezone: Optional[str] = None
    leetcode_url: Optional[str] = None
    hackerrank_url: Optional[str] = None
    medium_url: Optional[str] = None
    # Structured collections (whole-array replace)
    skill_proficiency: Optional[Dict[str, Any]] = None
    experience_timeline: Optional[list[dict]] = None
    projects: Optional[list[dict]] = None
    certifications: Optional[list[dict]] = None
    # Career goals
    dream_companies: Optional[list[str]] = None
    preferred_domains: Optional[list[str]] = None
    target_salary: Optional[str] = None


class SettingsUpdateRequest(BaseModel):
    notification_prefs: Optional[Dict[str, Any]] = None
    ai_preferences: Optional[Dict[str, Any]] = None
    apply_preferences: Optional[Dict[str, Any]] = None
    appearance_prefs: Optional[Dict[str, Any]] = None
    locale_prefs: Optional[Dict[str, Any]] = None


DEFAULT_NOTIFICATIONS = {
    "job_match": True, "resume_analysis": True, "smtp_status": True,
    "application_sent": True, "interview_reminder": True,
    "ai_reports": True, "weekly_summary": True, "monthly_report": False,
}
DEFAULT_AI_PREFS = {"provider": "groq", "tone": "formal"}
DEFAULT_APPLY_PREFS = {
    "auto_apply": False, "min_match_score": 80, "daily_limit": 25,
    "skip_duplicate": True, "skip_no_contact": True, "skip_low_match": True,
}
DEFAULT_APPEARANCE = {"theme": "dark", "accent": "purple", "animations": True, "compact_mode": False}
DEFAULT_LOCALE = {"language": "en", "country": "IN", "date_format": "DD/MM/YYYY"}


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
    is_active: bool = True
    permissions: Optional[list] = None
    created_at: datetime
    # Professional identity
    headline: Optional[str] = None
    current_company: Optional[str] = None
    expected_salary: Optional[str] = None
    notice_period: Optional[str] = None
    employment_type_pref: Optional[str] = None
    remote_preference: Optional[str] = None
    timezone: Optional[str] = None
    leetcode_url: Optional[str] = None
    hackerrank_url: Optional[str] = None
    medium_url: Optional[str] = None
    skill_proficiency: Optional[Dict[str, Any]] = None
    experience_timeline: Optional[list] = None
    projects: Optional[list] = None
    certifications: Optional[list] = None
    dream_companies: Optional[list] = None
    preferred_domains: Optional[list] = None
    target_salary: Optional[str] = None

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


# ---------------------------------------------------------------- settings

@router.get("/me/settings")
async def get_settings(user: User = Depends(get_current_user)):
    return {
        "notification_prefs": {**DEFAULT_NOTIFICATIONS, **(user.notification_prefs or {})},
        "ai_preferences": {**DEFAULT_AI_PREFS, **(user.ai_preferences or {})},
        "apply_preferences": {**DEFAULT_APPLY_PREFS, **(user.apply_preferences or {})},
        "appearance_prefs": {**DEFAULT_APPEARANCE, **(user.appearance_prefs or {}), "theme": user.theme},
        "locale_prefs": {**DEFAULT_LOCALE, **(user.locale_prefs or {})},
    }


@router.patch("/me/settings")
async def update_settings(
    body: SettingsUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    changed = []
    for key, val in body.model_dump(exclude_none=True).items():
        current = getattr(user, key) or {}
        setattr(user, key, {**current, **val})
        changed.append(key)
    if "appearance_prefs" in changed and body.appearance_prefs and body.appearance_prefs.get("theme"):
        user.theme = body.appearance_prefs["theme"]
    if changed:
        db.add(ActivityLog(user_id=user.id, action="Settings Updated",
                           description=f"Updated: {', '.join(changed)}"))
    await db.commit()
    return await get_settings(user)


# ---------------------------------------------------------------- profile intelligence

@router.get("/me/health-score")
async def health_score(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Deterministic 100-pt profile completeness score — instant, no AI call."""
    from app.services.profile_service import compute_health_score
    best = (await db.execute(
        select(func.max(Resume.ats_score)).where(Resume.user_id == user.id)
    )).scalar()
    return compute_health_score(user, best)


@router.get("/me/career-insights")
async def career_insights(
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """AI Career Path + Interview Readiness + Recruiter View — one cached Groq call."""
    if user.ai_career_insights and not refresh:
        cached = dict(user.ai_career_insights)
        cached["cached"] = True
        return cached

    from app.services.profile_service import compute_health_score, generate_career_insights
    best = (await db.execute(
        select(func.max(Resume.ats_score)).where(Resume.user_id == user.id)
    )).scalar()
    hs = compute_health_score(user, best)

    try:
        data = await generate_career_insights(user, best, hs["score"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI career insights failed: {str(e)}")

    user.ai_career_insights = data
    db.add(ActivityLog(user_id=user.id, action="AI Career Insights Generated",
                       description="Generated career path, interview readiness and recruiter-view preview"))
    await db.commit()
    data["cached"] = False
    return data


@router.get("/me/portfolio-health")
async def portfolio_health(user: User = Depends(get_current_user)):
    """Real HTTP reachability check for GitHub/Portfolio/LinkedIn links."""
    from app.services.profile_service import check_portfolio_health
    return await check_portfolio_health(user)


# ---------------------------------------------------------------- security

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/me/change-password")
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.utils.auth import verify_password, hash_password, create_token
    if not verify_password(body.current_password, user.hashed_password or ""):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    user.hashed_password = hash_password(body.new_password)
    user.token_version = (user.token_version or 0) + 1
    db.add(ActivityLog(user_id=user.id, action="Password Changed", description="Password updated from Settings"))
    await db.commit()
    # Issue a fresh token immediately so this session doesn't get logged out too
    new_token = create_token(user.id, user.role, user.token_version)
    return {"message": "Password updated", "access_token": new_token}


@router.post("/me/logout-all-devices")
async def logout_all_devices(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Invalidate every JWT issued before now. A fresh token is returned so the
    current session stays logged in — every *other* device/tab is signed out."""
    from app.utils.auth import create_token
    user.token_version = (user.token_version or 0) + 1
    db.add(ActivityLog(user_id=user.id, action="Logged Out All Devices", description="All other sessions invalidated"))
    await db.commit()
    new_token = create_token(user.id, user.role, user.token_version)
    return {"message": "All other devices signed out", "access_token": new_token}


# ---------------------------------------------------------------- privacy

@router.post("/me/clear-ai-history")
async def clear_ai_history(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Wipe cached AI outputs: career insights + per-job AI analysis. Scores/matches are untouched."""
    from app.models.job import Job
    user.ai_career_insights = None
    result = await db.execute(select(Job).where(Job.user_id == user.id, Job.ai_analysis.isnot(None)))
    jobs = result.scalars().all()
    for j in jobs:
        j.ai_analysis = None
    db.add(ActivityLog(user_id=user.id, action="AI History Cleared", description=f"Cleared career insights + {len(jobs)} cached job analyses"))
    await db.commit()
    return {"cleared_jobs": len(jobs)}


@router.get("/me/export-data")
async def export_data(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Full export of everything this account owns — GDPR-style data portability."""
    from app.models.job import Job
    from app.models.resume import Resume
    from app.models.application import Application
    from app.models.template import EmailTemplate
    from app.models.smtp import SmtpConfig

    def _rows(model_rows, exclude=()):
        out = []
        for r in model_rows:
            d = {c.name: getattr(r, c.name) for c in r.__table__.columns if c.name not in exclude}
            for k, v in d.items():
                if isinstance(v, datetime):
                    d[k] = v.isoformat()
            out.append(d)
        return out

    jobs = (await db.execute(select(Job).where(Job.user_id == user.id))).scalars().all()
    resumes = (await db.execute(select(Resume).where(Resume.user_id == user.id))).scalars().all()
    apps = (await db.execute(select(Application).where(Application.user_id == user.id))).scalars().all()
    templates = (await db.execute(select(EmailTemplate).where(EmailTemplate.user_id == user.id))).scalars().all()
    smtp = (await db.execute(select(SmtpConfig).where(SmtpConfig.user_id == user.id))).scalars().all()
    activity = (await db.execute(select(ActivityLog).where(ActivityLog.user_id == user.id))).scalars().all()

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "profile": _rows([user], exclude=("hashed_password", "token_version"))[0],
        "jobs": _rows(jobs),
        "resumes": _rows(resumes, exclude=("raw_text",)),
        "applications": _rows(apps),
        "templates": _rows(templates),
        "smtp_configs": _rows(smtp, exclude=("password_encrypted",)),
        "activity_log": _rows(activity),
    }


class DeleteAccountRequest(BaseModel):
    password: str


@router.post("/me/delete-account")
async def delete_account(
    body: DeleteAccountRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Permanently delete this account and everything it owns (cascades via FK)."""
    from app.utils.auth import verify_password
    if not verify_password(body.password, user.hashed_password or ""):
        raise HTTPException(status_code=400, detail="Incorrect password")
    if user.role == "admin":
        admin_count = (await db.execute(select(func.count()).where(User.role == "admin"))).scalar() or 0
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="You are the only admin — promote another user first")
    await db.delete(user)
    await db.commit()
    return {"message": "Account deleted"}


def _user_row(u: User, agg: dict) -> dict:
    return {
        "id": u.id, "name": u.name, "email": u.email, "role": u.role,
        "avatar": u.avatar, "current_role": u.current_role,
        "current_location": u.current_location, "skills": u.skills or [],
        "years_experience": u.years_experience,
        "onboarding_complete": u.onboarding_complete,
        "is_active": u.is_active,
        "permissions": u.permissions,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login": u.last_login.isoformat() if u.last_login else None,
        "job_count": agg["jobs"].get(u.id, 0),
        "application_count": agg["apps"].get(u.id, 0),
        "resume_count": agg["res_count"].get(u.id, 0),
        "best_ats": agg["ats"].get(u.id),
        "smtp_status": agg["smtp"].get(u.id),           # success | failed | None
        "last_active": agg["active"].get(u.id),
    }


async def _user_aggregates(db: AsyncSession) -> dict:
    from app.models.job import Job
    from app.models.application import Application
    from app.models.smtp import SmtpConfig
    jobs = dict((await db.execute(
        select(Job.user_id, func.count()).group_by(Job.user_id))).all())
    apps = dict((await db.execute(
        select(Application.user_id, func.count()).group_by(Application.user_id))).all())
    ats = dict((await db.execute(
        select(Resume.user_id, func.max(Resume.ats_score)).group_by(Resume.user_id))).all())
    res_count = dict((await db.execute(
        select(Resume.user_id, func.count()).group_by(Resume.user_id))).all())
    smtp = {uid: st for uid, st in (await db.execute(
        select(SmtpConfig.user_id, SmtpConfig.test_status))).all()}
    active = {uid: (ts.isoformat() if ts else None) for uid, ts in (await db.execute(
        select(ActivityLog.user_id, func.max(ActivityLog.created_at)).group_by(ActivityLog.user_id))).all()}
    return {"jobs": jobs, "apps": apps, "ats": ats, "res_count": res_count, "smtp": smtp, "active": active}


@router.get("/admin/list")
async def admin_list_users(
    q: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,       # active | suspended
    skill: Optional[str] = None,
    location: Optional[str] = None,
    min_exp: Optional[int] = None,
    max_exp: Optional[int] = None,
    sort: str = "created_at",           # created_at|name|last_login|jobs|applications|ats
    order: str = "desc",
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin-only: paginated, searchable, sortable, filterable user table."""
    users = (await db.execute(select(User))).scalars().all()
    agg = await _user_aggregates(db)
    rows = [_user_row(u, agg) for u in users]

    if q and q.strip():
        s = q.strip().lower()
        rows = [r for r in rows if s in (r["name"] or "").lower() or s in (r["email"] or "").lower()
                or s in (r["current_role"] or "").lower()]
    if role:
        rows = [r for r in rows if r["role"] == role]
    if status == "active":
        rows = [r for r in rows if r["is_active"]]
    elif status == "suspended":
        rows = [r for r in rows if not r["is_active"]]
    if skill:
        rows = [r for r in rows if any(skill.lower() == s.lower() for s in r["skills"])]
    if location:
        rows = [r for r in rows if location.lower() in (r["current_location"] or "").lower()]
    if min_exp is not None:
        rows = [r for r in rows if (r["years_experience"] or 0) >= min_exp]
    if max_exp is not None:
        rows = [r for r in rows if (r["years_experience"] or 0) <= max_exp]

    keymap = {
        "created_at": lambda r: r["created_at"] or "",
        "name": lambda r: (r["name"] or "").lower(),
        "last_login": lambda r: r["last_login"] or r["last_active"] or "",
        "jobs": lambda r: r["job_count"],
        "applications": lambda r: r["application_count"],
        "ats": lambda r: r["best_ats"] or 0,
    }
    rows.sort(key=keymap.get(sort, keymap["created_at"]), reverse=(order != "asc"))

    total = len(rows)
    limit = max(1, min(100, limit))
    return {"items": rows[offset:offset + limit], "total": total, "limit": limit, "offset": offset}


class StatusRequest(BaseModel):
    is_active: bool


@router.patch("/admin/{user_id}/status")
async def admin_set_status(
    user_id: str, body: StatusRequest,
    db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin),
):
    """Suspend / activate an account. Suspended users cannot log in or use the API."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot suspend your own account")
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_active = body.is_active
    db.add(ActivityLog(
        user_id=admin.id,
        action="User Suspended" if not body.is_active else "User Activated",
        description=f"{target.email} was {'suspended' if not body.is_active else 'activated'} by admin",
    ))
    await db.commit()
    return {"id": target.id, "is_active": target.is_active}


@router.post("/admin/{user_id}/reset-password")
async def admin_reset_password(
    user_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin),
):
    """Generate a temporary password (shown once) and force it onto the account."""
    import secrets
    from app.utils.auth import hash_password
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    temp = "HF-" + secrets.token_urlsafe(9)
    target.hashed_password = hash_password(temp)
    target.token_version = (target.token_version or 0) + 1  # invalidate existing sessions
    db.add(ActivityLog(user_id=admin.id, action="Password Reset (admin)",
                       description=f"Temporary password issued for {target.email}"))
    await db.commit()
    return {"id": target.id, "temp_password": temp,
            "note": "Share this once — the user should change it after login"}


class PermissionsRequest(BaseModel):
    permissions: Optional[list[str]] = None  # null = restore defaults (all)


@router.patch("/admin/{user_id}/permissions")
async def admin_set_permissions(
    user_id: str, body: PermissionsRequest,
    db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin),
):
    """DB-driven sidebar access: store the list of nav keys this user may see."""
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.permissions = body.permissions
    db.add(ActivityLog(
        user_id=admin.id, action="Permissions Updated",
        description=f"{target.email} sidebar access → {', '.join(body.permissions) if body.permissions else 'defaults (all)'}",
    ))
    await db.commit()
    return {"id": target.id, "permissions": target.permissions}


@router.get("/admin/{user_id}/detail")
async def admin_user_detail(
    user_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin),
):
    """Everything the profile drawer needs: profile, resumes, applications, activity."""
    from app.models.application import Application
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    agg = await _user_aggregates(db)
    resumes = (await db.execute(
        select(Resume).where(Resume.user_id == user_id).order_by(Resume.updated_at.desc()))).scalars().all()
    apps = (await db.execute(
        select(Application).where(Application.user_id == user_id)
        .order_by(Application.created_at.desc()).limit(10))).scalars().all()
    activity = (await db.execute(
        select(ActivityLog).where(ActivityLog.user_id == user_id)
        .order_by(ActivityLog.created_at.desc()).limit(10))).scalars().all()
    return {
        "user": _user_row(target, agg),
        "profile": {
            "phone": target.phone, "linkedin_url": target.linkedin_url,
            "github_url": target.github_url, "portfolio_url": target.portfolio_url,
            "preferred_roles": target.preferred_roles or [],
            "preferred_locations": target.preferred_locations or [],
        },
        "resumes": [{"id": r.id, "name": r.name, "ats_score": r.ats_score, "file_url": r.file_url} for r in resumes],
        "applications": [{"id": a.id, "to_email": a.to_email, "subject": a.subject,
                          "status": a.status, "created_at": a.created_at} for a in apps],
        "activity": [{"action": l.action, "description": l.description, "created_at": l.created_at} for l in activity],
    }


@router.patch("/admin/{user_id}/role")
async def admin_update_role(
    user_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin-only: promote/demote a user's role."""
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    new_role = body.get("role")
    if new_role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user' or 'admin'")
    target.role = new_role
    await db.commit()
    return {"id": target.id, "role": target.role}


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
