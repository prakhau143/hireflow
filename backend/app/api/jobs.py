from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.job import Job
from app.models.activity_log import ActivityLog
from app.utils.auth import get_current_user
from app.services.ai_service import analyze_job_match, parse_linkedin_posts
from datetime import datetime, timezone
import json

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobUpdate(BaseModel):
    status: Optional[str] = None
    archive_reason: Optional[str] = None


class ParseJobsRequest(BaseModel):
    text: str


class SaveJobsRequest(BaseModel):
    jobs: list[dict]


@router.get("/")
async def list_jobs(
    status: Optional[str] = Query(None),
    location_type: Optional[str] = Query(None),
    min_match: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conditions = [Job.user_id == user.id]
    if status:
        conditions.append(Job.status == status)
    if location_type:
        conditions.append(Job.location_type == location_type)
    if min_match is not None:
        conditions.append(Job.match_score >= min_match)

    result = await db.execute(
        select(Job).where(and_(*conditions)).order_by(Job.match_score.desc(), Job.created_at.desc())
    )
    jobs = result.scalars().all()

    if search:
        q = search.lower()
        jobs = [j for j in jobs if q in j.title.lower() or q in j.company.lower()]

    return jobs


@router.post("/import/parse")
async def parse_jobs(
    body: ParseJobsRequest,
    user: User = Depends(get_current_user),
):
    """Send pasted LinkedIn posts to Groq for structured parsing."""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        parsed = await parse_linkedin_posts(body.text, user.skills or [])
        return {"jobs": parsed, "count": len(parsed)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI parsing failed: {str(e)}")


@router.post("/import/save")
async def save_parsed_jobs(
    body: SaveJobsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Save AI-parsed jobs to DB with match scores."""
    saved = []
    for job_data in body.jobs:
        job = Job(
            user_id=user.id,
            title=job_data.get("title", "Unknown Role"),
            company=job_data.get("company", "Unknown Company"),
            hiring_manager=job_data.get("hiring_manager"),
            location=job_data.get("location", ""),
            location_type=job_data.get("location_type", "onsite"),
            experience_min=job_data.get("experience_min", 0),
            experience_max=job_data.get("experience_max", 5),
            skills=job_data.get("skills", []),
            description=job_data.get("description", ""),
            contact_email=job_data.get("contact_email"),
            contact_phone=job_data.get("contact_phone"),
            match_score=job_data.get("match_score", 0.0),
            matched_skills=job_data.get("matched_skills", []),
            missing_skills=job_data.get("missing_skills", []),
            ai_summary=job_data.get("ai_summary"),
            ai_analysis=job_data.get("ai_analysis"),
            smart_tags=job_data.get("smart_tags", []),
            is_duplicate=job_data.get("is_duplicate", False),
            freshness_score=job_data.get("freshness_score", 0),
            status="new",
        )
        db.add(job)
        saved.append(job)

    log = ActivityLog(
        user_id=user.id,
        action=f"{len(saved)} Jobs Imported",
        description=f"Imported {len(saved)} jobs via AI parsing",
    )
    db.add(log)
    await db.commit()

    return {"saved": len(saved)}


@router.get("/{job_id}")
async def get_job(job_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.patch("/{job_id}")
async def update_job(
    job_id: str,
    body: JobUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    for key, val in body.model_dump(exclude_none=True).items():
        setattr(job, key, val)

    if body.status == "archived" and body.archive_reason:
        log = ActivityLog(
            user_id=user.id,
            action="Job Archived",
            description=f"{job.title} at {job.company} archived: {body.archive_reason}",
        )
        db.add(log)

    await db.commit()
    await db.refresh(job)
    return job


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await db.delete(job)
    await db.commit()


@router.get("/stats/dashboard")
async def dashboard_stats(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Job).where(Job.user_id == user.id))
    jobs = result.scalars().all()

    total = len(jobs)
    matched = sum(1 for j in jobs if j.match_score >= 70)
    archived = sum(1 for j in jobs if j.status == "archived")
    emails_total = sum(j.emails_generated for j in jobs)

    all_skills: dict[str, int] = {}
    for j in jobs:
        for s in (j.skills or []):
            all_skills[s] = all_skills.get(s, 0) + 1

    return {
        "jobs_imported": total,
        "matched_jobs": matched,
        "archived": archived,
        "emails_generated": emails_total,
        "match_distribution": [
            {"range": "90-100%", "count": sum(1 for j in jobs if j.match_score >= 90)},
            {"range": "80-90%", "count": sum(1 for j in jobs if 80 <= j.match_score < 90)},
            {"range": "70-80%", "count": sum(1 for j in jobs if 70 <= j.match_score < 80)},
            {"range": "Below 70%", "count": sum(1 for j in jobs if j.match_score < 70)},
        ],
        "skills_demand": sorted(
            [{"skill": k, "count": v} for k, v in all_skills.items()],
            key=lambda x: -x["count"]
        )[:8],
    }
