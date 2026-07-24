"""Admin Review Panel APIs — cross-session review queue with tabs, search,
pagination, bulk actions and merge. Every action is written to the activity log."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.models.user import User
from app.models.job import Job
from app.models.activity_log import ActivityLog
from app.utils.auth import get_current_user

router = APIRouter(prefix="/review", tags=["review"])

LOW_CONFIDENCE = 65


def _missing_fields(j: Job) -> list[str]:
    missing = []
    if not j.contact_email and not j.apply_link and not j.contact_phone:
        missing.append("contact")
    if not j.location and j.location_type != "remote":
        missing.append("location")
    if not (j.skills or []):
        missing.append("skills")
    if not j.salary:
        missing.append("salary")
    if not j.description:
        missing.append("description")
    return missing


def _serialize(j: Job) -> dict:
    return {
        "id": j.id, "title": j.title, "company": j.company, "location": j.location,
        "location_type": j.location_type, "skills": j.skills or [],
        "contact_email": j.contact_email, "contact_phone": j.contact_phone,
        "apply_link": j.apply_link, "salary": j.salary, "employment_type": j.employment_type,
        "experience_min": j.experience_min, "experience_max": j.experience_max,
        "match_score": j.match_score, "match_tier": j.match_tier,
        "confidence_score": j.confidence_score, "application_type": j.application_type,
        "review_status": j.review_status, "import_session_id": j.import_session_id,
        "duplicate_reason": j.duplicate_reason,
        "validation_warnings": j.validation_warnings or [],
        "missing_fields": _missing_fields(j),
        "source": j.source, "description": j.description,
        "created_at": j.created_at,
    }


@router.get("/jobs")
async def review_jobs(
    tab: str = Query("pending", pattern="^(pending|approved|rejected|merged|duplicates|low_confidence|all)$"),
    q: Optional[str] = Query(None, description="Search title/company"),
    application_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Paginated review queue. Only jobs that went through the import pipeline
    (review_status set) appear here — manual/legacy rows are excluded."""
    base = [Job.user_id == user.id, Job.review_status.isnot(None)]

    tab_conditions = {
        "pending": [Job.review_status == "pending_review"],
        "approved": [Job.review_status == "approved"],
        "rejected": [Job.review_status == "rejected"],
        "merged": [Job.review_status == "merged"],
        "duplicates": [Job.duplicate_reason.isnot(None)],
        "low_confidence": [Job.confidence_score < LOW_CONFIDENCE, Job.review_status == "pending_review"],
        "all": [],
    }
    conditions = base + tab_conditions[tab]
    if q and q.strip():
        like = f"%{q.strip()}%"
        conditions.append(or_(Job.title.ilike(like), Job.company.ilike(like)))
    if application_type:
        conditions.append(Job.application_type == application_type)

    rows = (await db.execute(
        select(Job).where(*conditions).order_by(Job.created_at.desc())
    )).scalars().all()
    total = len(rows)
    page = rows[offset:offset + limit]

    # Tab counts computed over the whole imported set (cheap: single fetch of 3 cols)
    all_rows = (await db.execute(
        select(Job.review_status, Job.duplicate_reason, Job.confidence_score).where(*base)
    )).all()
    counts = {
        "pending": sum(1 for s, _, _ in all_rows if s == "pending_review"),
        "approved": sum(1 for s, _, _ in all_rows if s == "approved"),
        "rejected": sum(1 for s, _, _ in all_rows if s == "rejected"),
        "merged": sum(1 for s, _, _ in all_rows if s == "merged"),
        "duplicates": sum(1 for _, d, _ in all_rows if d),
        "low_confidence": sum(1 for s, _, c in all_rows if s == "pending_review" and (c or 0) < LOW_CONFIDENCE),
        "all": len(all_rows),
    }

    return {"items": [_serialize(j) for j in page], "total": total,
            "limit": limit, "offset": offset, "counts": counts}


class BulkRequest(BaseModel):
    job_ids: list[str]
    action: str  # approve | reject | delete | merge


@router.post("/bulk")
async def bulk_action(body: BulkRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if body.action not in ("approve", "reject", "delete", "merge"):
        raise HTTPException(400, "action must be approve|reject|delete|merge")
    if not body.job_ids:
        raise HTTPException(400, "No jobs selected")

    rows = (await db.execute(
        select(Job).where(Job.user_id == user.id, Job.id.in_(body.job_ids))
    )).scalars().all()
    if not rows:
        raise HTTPException(404, "No matching jobs")

    if body.action == "merge":
        if len(rows) < 2:
            raise HTTPException(400, "Merge needs at least 2 jobs")
        rows.sort(key=lambda j: -(j.confidence_score or 0))
        primary, losers = rows[0], rows[1:]
        # Fill primary's gaps from the duplicates, union the skills
        skills = list(primary.skills or [])
        for j in losers:
            for field in ("contact_email", "contact_phone", "apply_link", "salary",
                          "employment_type", "location", "description"):
                if not getattr(primary, field) and getattr(j, field):
                    setattr(primary, field, getattr(j, field))
            for s in (j.skills or []):
                if s.lower() not in {x.lower() for x in skills}:
                    skills.append(s)
            j.review_status = "merged"
            j.duplicate_reason = f"Merged into '{primary.title} @ {primary.company}'"
        primary.skills = skills
        db.add(ActivityLog(
            user_id=user.id, action="Jobs Merged",
            description=f"Merged {len(losers)} duplicate(s) into '{primary.title} @ {primary.company}'",
        ))
        await db.commit()
        return {"action": "merge", "primary_id": primary.id, "merged": len(losers)}

    if body.action == "delete":
        titles = [f"{j.title} @ {j.company}" for j in rows[:5]]
        for j in rows:
            await db.delete(j)
        db.add(ActivityLog(
            user_id=user.id, action="Jobs Deleted (review)",
            description=f"Deleted {len(rows)} job(s): {', '.join(titles)}{'…' if len(rows) > 5 else ''}",
        ))
        await db.commit()
        return {"action": "delete", "updated": len(rows)}

    new_status = "approved" if body.action == "approve" else "rejected"
    for j in rows:
        j.review_status = new_status
    db.add(ActivityLog(
        user_id=user.id, action=f"Jobs {new_status.title()} (review)",
        description=f"{len(rows)} job(s) {new_status} via review panel",
    ))
    await db.commit()
    return {"action": body.action, "updated": len(rows)}


class ReviewEdit(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    location_type: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    apply_link: Optional[str] = None
    salary: Optional[str] = None
    employment_type: Optional[str] = None
    skills: Optional[list[str]] = None
    experience_min: Optional[int] = None
    experience_max: Optional[int] = None


@router.patch("/jobs/{job_id}")
async def edit_job(job_id: str, body: ReviewEdit, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    j = (await db.execute(
        select(Job).where(Job.id == job_id, Job.user_id == user.id)
    )).scalar_one_or_none()
    if not j:
        raise HTTPException(404, "Job not found")
    changed = []
    for k, v in body.model_dump(exclude_none=True).items():
        if getattr(j, k) != v:
            setattr(j, k, v)
            changed.append(k)
    if changed:
        db.add(ActivityLog(
            user_id=user.id, action="Job Edited (review)",
            description=f"Edited {', '.join(changed)} on '{j.title} @ {j.company}'",
        ))
    await db.commit()
    await db.refresh(j)
    return _serialize(j)
