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
from app.services.ai_service import parse_linkedin_posts
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
    """Hybrid Rule-Based + AI pipeline: noise removal → segmentation → AI extraction."""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        results = await parse_linkedin_posts(body.text, user.skills or [])
        valid_jobs = [j for j in results if j.get("is_valid")]
        invalid_jobs = [j for j in results if not j.get("is_valid")]

        from app.services.ai_service import _detect_source
        source = _detect_source(body.text)

        return {
            "jobs": valid_jobs,
            "invalid": invalid_jobs,
            "stats": {
                "blocks_found": len(results),
                "valid": len(valid_jobs),
                "invalid": len(invalid_jobs),
                "source": source,
            },
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {str(e)}")


@router.post("/import/save")
async def save_parsed_jobs(
    body: SaveJobsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Save validated jobs to DB. Deduplicates, archives low-match jobs, returns full stats."""
    from app.services.ai_service import _parse_experience

    saved_count = 0
    duplicates = 0
    archived = 0
    failed = 0

    for job_data in body.jobs:
        try:
            # Field mapping: new AI schema → DB schema
            title = (job_data.get("role") or job_data.get("title") or "").strip() or "Unknown Role"
            company = (job_data.get("company") or "").strip() or "Unknown Company"
            contact_email = job_data.get("email") or job_data.get("contact_email")
            contact_phone = job_data.get("phone") or job_data.get("contact_phone")
            work_mode = (job_data.get("work_mode") or job_data.get("location_type") or "onsite").lower()
            match_score = float(job_data.get("match_score") or 0)
            source_tag = job_data.get("_source") or "text"

            # Parse "2-4 years" → (2, 4)
            exp_min, exp_max = _parse_experience(job_data.get("experience"))

            # Duplicate check: same title + company
            dup = await db.execute(
                select(Job).where(
                    and_(
                        Job.user_id == user.id,
                        Job.title == title,
                        Job.company == company,
                    )
                )
            )
            if dup.scalar_one_or_none():
                duplicates += 1
                continue

            # Auto-archive low-match jobs instead of deleting them
            status = "archived" if match_score < 40 else "new"
            archive_reason = "low_match" if status == "archived" else None
            if status == "archived":
                archived += 1

            job = Job(
                user_id=user.id,
                title=title,
                company=company,
                location=job_data.get("location") or "",
                location_type=work_mode,
                experience_min=exp_min,
                experience_max=exp_max,
                skills=job_data.get("skills") or [],
                description=job_data.get("description") or "",
                contact_email=contact_email,
                contact_phone=contact_phone,
                salary=job_data.get("salary"),
                employment_type=job_data.get("employment_type"),
                match_score=match_score,
                matched_skills=job_data.get("matched_skills") or [],
                missing_skills=job_data.get("missing_skills") or [],
                ai_summary=job_data.get("description"),
                confidence_score=int(job_data.get("confidence_score") or 0),
                smart_tags=job_data.get("smart_tags") or [],
                is_duplicate=False,
                freshness_score=0,
                status=status,
                archive_reason=archive_reason,
                apply_link=job_data.get("apply_link"),
                source=source_tag,
            )
            db.add(job)
            saved_count += 1

        except Exception as e:
            print(f"[Save] Failed to save job '{job_data.get('role')}': {e}")
            failed += 1

    log = ActivityLog(
        user_id=user.id,
        action=f"{saved_count} Jobs Imported",
        description=(
            f"Imported {saved_count} jobs — {archived} archived (low match), "
            f"{duplicates} duplicates skipped, {failed} failed"
        ),
    )
    db.add(log)
    await db.commit()

    return {
        "saved": saved_count,
        "archived": archived,
        "duplicates": duplicates,
        "failed": failed,
    }


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
