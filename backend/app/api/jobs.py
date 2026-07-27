from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, delete
from pydantic import BaseModel, Field
from typing import Optional, List
from app.database import get_db
from app.models.user import User
from app.models.job import Job
from app.models.user_job_match import UserJobMatch
from app.models.activity_log import ActivityLog
from app.models.skill import Skill
from app.utils.auth import get_current_user, require_admin
from app.services.ai_service import parse_linkedin_posts, format_experience_range, _parse_experience
from app.services.matching_service import sync_user_job_match
from app.services.job_lifecycle import run_lifecycle_cleanup, get_lifecycle_stats
from app.services.application_service import update_application_method_flags, get_application_badges
from app.data.india_locations import get_states, get_cities, get_all_locations
from datetime import datetime, timezone
import json
import re

router = APIRouter(prefix="/jobs", tags=["jobs"])

VISIBLE = or_(Job.review_status.is_(None), Job.review_status == "approved")


class JobUpdate(BaseModel):
    status: Optional[str] = None
    archive_reason: Optional[str] = None


class ParseJobsRequest(BaseModel):
    text: str


class SaveJobsRequest(BaseModel):
    jobs: list[dict]


class CustomJobCreate(BaseModel):
    """Multi-step custom job creation form"""
    # Step 1: Basic Information
    title: str = Field(..., min_length=1, max_length=200)
    company: str = Field(..., min_length=1, max_length=200)
    company_logo: Optional[str] = None
    company_website: Optional[str] = None
    company_type: Optional[str] = None  # Startup|MNC|SME|Product|Service
    industry: Optional[str] = None
    employment_type: Optional[str] = None  # Full Time|Internship|Contract|Part Time
    job_category: Optional[str] = None
    department: Optional[str] = None
    
    # Step 2: Location
    location: str = ""
    location_type: str = "onsite"  # remote|hybrid|onsite|wfa
    
    # Step 3: Experience
    experience_min: float = 0
    experience_max: float = 5
    
    # Step 4: Salary
    salary: Optional[str] = None
    
    # Step 5: Skills
    skills: List[str] = []
    
    # Step 6-8: Rich text fields
    description: str = ""
    requirements: Optional[str] = None
    responsibilities: Optional[str] = None
    benefits: Optional[str] = None
    
    # Step 9: Contact
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    apply_link: Optional[str] = None
    contact_linkedin: Optional[str] = None
    hiring_manager: Optional[str] = None
    recruiter_linkedin: Optional[str] = None
    
    # Step 10: Publication
    publication_status: str = "published"  # draft|published|scheduled
    scheduled_at: Optional[str] = None  # ISO datetime string


class CustomJobUpdate(BaseModel):
    """Update custom job fields"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    company: Optional[str] = Field(None, min_length=1, max_length=200)
    company_logo: Optional[str] = None
    company_website: Optional[str] = None
    company_type: Optional[str] = None
    industry: Optional[str] = None
    employment_type: Optional[str] = None
    job_category: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    location_type: Optional[str] = None
    experience_min: Optional[float] = None
    experience_max: Optional[float] = None
    salary: Optional[str] = None
    skills: Optional[List[str]] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    responsibilities: Optional[str] = None
    benefits: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    apply_link: Optional[str] = None
    contact_linkedin: Optional[str] = None
    hiring_manager: Optional[str] = None
    recruiter_linkedin: Optional[str] = None
    publication_status: Optional[str] = None
    scheduled_at: Optional[str] = None


# ── Job + UserJobMatch merge helpers ─────────────────────────────────────────

def _serialize_job(job: Job, match: UserJobMatch) -> dict:
    """Merge global Job facts with this viewer's personalized match into the
    flat shape the frontend has always read (JobCard/JobDetail need no changes)."""
    return {
        "id": job.id,
        "title": job.title,
        "company": job.company,
        "company_logo": job.company_logo,
        "company_website": job.company_website,
        "company_type": job.company_type,
        "industry": job.industry,
        "hiring_manager": job.hiring_manager,
        "recruiter_linkedin": job.recruiter_linkedin,
        "location": job.location,
        "location_type": job.location_type,
        "job_category": job.job_category,
        "department": job.department,
        "experience_min": job.experience_min,
        "experience_max": job.experience_max,
        "experience_display": format_experience_range(job.experience_min, job.experience_max),
        "skills": job.skills or [],
        "description": job.description,
        "requirements": job.requirements,
        "responsibilities": job.responsibilities,
        "benefits": job.benefits,
        "raw_text": job.raw_text,
        "contact_email": job.contact_email,
        "contact_linkedin": job.contact_linkedin,
        "contact_phone": job.contact_phone,
        "posted_date": job.posted_date,
        "source": job.source,
        "ai_summary": job.ai_summary,
        "smart_tags": job.smart_tags or [],
        "is_duplicate": job.is_duplicate,
        "freshness_score": job.freshness_score,
        "salary": job.salary,
        "employment_type": job.employment_type,
        "confidence_score": job.confidence_score,
        "confidence_reasons": job.confidence_reasons or [],
        "apply_link": job.apply_link,
        "application_type": job.application_type,
        "primary_application_method": job.primary_application_method,
        "application_badges": get_application_badges(job),
        "review_status": job.review_status,
        "lifecycle_status": job.lifecycle_status,
        "publication_status": job.publication_status,
        "scheduled_at": job.scheduled_at,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        # personalized (per-viewer, from UserJobMatch)
        "match_score": match.match_score,
        "matched_skills": match.matched_skills or [],
        "missing_skills": match.missing_skills or [],
        "match_tier": match.match_tier,
        "experience_badge": match.experience_badge,
        "match_breakdown": match.match_breakdown,
        "score_suggestions": match.score_suggestions,
        "missing_skills_detail": match.missing_skills_detail or [],
        "apply_probability": match.apply_probability,
        "is_recommended": match.is_recommended,
        "status": match.status,
        "archive_reason": match.archive_reason,
        "emails_generated": match.emails_generated,
        "application_method": match.application_method,
        "applied_at": match.applied_at,
    }


async def _latest_resume(db: AsyncSession, user_id: str):
    from app.models.resume import Resume
    return (await db.execute(
        select(Resume).where(Resume.user_id == user_id).order_by(Resume.created_at.desc()).limit(1)
    )).scalars().first()


async def _get_or_create_match(db: AsyncSession, job: Job, user: User) -> UserJobMatch:
    match = (await db.execute(
        select(UserJobMatch).where(UserJobMatch.user_id == user.id, UserJobMatch.job_id == job.id)
    )).scalar_one_or_none()
    if match is None:
        resume = await _latest_resume(db, user.id)
        match = await sync_user_job_match(db, job, user, resume)
        await db.commit()
        await db.refresh(match)
    return match


@router.get("/")
async def list_jobs(
    status: Optional[str] = Query(None),
    location_type: Optional[str] = Query(None),
    min_match: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Every approved job is visible to every user — personalization (score, status,
    matched/missing skills) comes from this viewer's UserJobMatch row, lazily created
    if a job was approved before this row existed for them."""
    conditions = [VISIBLE]
    if location_type:
        conditions.append(Job.location_type == location_type)

    jobs = (await db.execute(select(Job).where(and_(*conditions)))).scalars().all()
    if not jobs:
        return []

    job_ids = [j.id for j in jobs]
    matches = (await db.execute(
        select(UserJobMatch).where(UserJobMatch.user_id == user.id, UserJobMatch.job_id.in_(job_ids))
    )).scalars().all()
    match_by_job = {m.job_id: m for m in matches}

    missing = [j for j in jobs if j.id not in match_by_job]
    if missing:
        resume = await _latest_resume(db, user.id)
        for j in missing:
            match_by_job[j.id] = await sync_user_job_match(db, j, user, resume)
        await db.commit()

    items = [_serialize_job(j, match_by_job[j.id]) for j in jobs]

    if status:
        items = [it for it in items if it["status"] == status]
    if min_match is not None:
        items = [it for it in items if it["match_score"] >= min_match]
    if search:
        q = search.lower()
        items = [it for it in items if q in it["title"].lower() or q in it["company"].lower()]

    # Primary: match_score desc. Secondary: created_at desc. (mirrors the old SQL ORDER BY)
    items.sort(key=lambda it: (it["match_score"] or 0, it["created_at"]), reverse=True)
    return items


@router.post("/import/parse")
async def parse_jobs(
    body: ParseJobsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only pipeline preview — parses pasted text into job candidates for
    review before saving them into the shared global pool.
    
    Uses the integrated enterprise pipeline with:
    - WhatsApp metadata removal
    - Expanded start/end markers
    - Multi-job detection
    - Smart duplicate detection against database
    - Company detection with normalization
    - Skill synonym normalization
    - AI confidence scoring with reasons
    """
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        # Fetch existing jobs for duplicate detection
        existing_jobs_result = await db.execute(
            select(Job.id, Job.title, Job.company, Job.location, Job.contact_email,
                   Job.experience_min, Job.experience_max)
        )
        existing_jobs = [
            {
                "id": j.id,
                "role": j.title,
                "company": j.company,
                "location": j.location,
                "email": j.contact_email,
                "experience_min": j.experience_min,
                "experience_max": j.experience_max,
            }
            for j in existing_jobs_result.all()
        ]
        
        # Run the integrated pipeline
        results, stats = await parse_linkedin_posts(body.text, user, None, existing_jobs)
        valid_jobs   = [j for j in results if j.get("is_valid")]
        invalid_jobs = [j for j in results if not j.get("is_valid")]

        return {
            "jobs":    valid_jobs,
            "invalid": invalid_jobs,
            "stats":   stats,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {str(e)}")


@router.post("/import/save")
async def save_parsed_jobs(
    body: SaveJobsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin saves reviewed jobs into the global pool as pending_review — they go
    live for every user only once approved via the Review Queue. Dedupes globally
    since there's now a single shared pool instead of one per importer.
    
    Uses the smart duplicate detection from the AI service for better accuracy."""
    from app.services.ai_service import _parse_experience, _is_duplicate_job
    import uuid

    saved_count = 0
    duplicates = 0
    failed = 0

    # Fetch existing jobs for duplicate detection
    existing_jobs_result = await db.execute(
        select(Job.id, Job.title, Job.company, Job.location, Job.contact_email, 
               Job.experience_min, Job.experience_max)
    )
    existing_jobs = [
        {
            "id": j.id,
            "role": j.title,
            "company": j.company,
            "location": j.location,
            "email": j.contact_email,
            "experience_min": j.experience_min,
            "experience_max": j.experience_max,
        }
        for j in existing_jobs_result.all()
    ]

    for job_data in body.jobs:
        try:
            title = (job_data.get("role") or job_data.get("title") or "").strip() or "Unknown Role"
            company = (job_data.get("company") or "").strip() or "Unknown Company"
            contact_email = job_data.get("email") or job_data.get("contact_email")
            contact_phone = job_data.get("phone") or job_data.get("contact_phone")
            work_mode = (job_data.get("work_mode") or job_data.get("location_type") or "onsite").lower()
            source_tag = job_data.get("_source") or "text"

            exp_min, exp_max = _parse_experience(job_data.get("experience"))

            # Use smart duplicate detection
            job_dict = {
                "role": title,
                "company": company,
                "location": job_data.get("location") or "",
                "email": contact_email or "",
                "experience_min": exp_min,
                "experience_max": exp_max,
            }
            is_dup, dup_id = _is_duplicate_job(job_dict, existing_jobs)
            
            if is_dup:
                duplicates += 1
                continue

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
                application_type=job_data.get("application_type"),
                hiring_manager=job_data.get("recruiter"),
                ai_summary=job_data.get("description"),
                confidence_score=int(job_data.get("confidence_score") or 0),
                confidence_reasons=job_data.get("confidence_reasons") or [],
                smart_tags=job_data.get("smart_tags") or [],
                is_duplicate=False,
                freshness_score=0,
                review_status="pending_review",
                apply_link=job_data.get("apply_link"),
                source=source_tag,
                lifecycle_status="active",  # New jobs start as active
            )
            db.add(job)
            saved_count += 1

        except Exception as e:
            print(f"[Save] Failed to save job '{job_data.get('role')}': {e}")
            failed += 1

    # Enhanced import report with detailed statistics
    confidence_scores = [int(j.get("confidence_score", 0)) for j in body.jobs if j.get("confidence_score")]
    avg_confidence = round(sum(confidence_scores) / len(confidence_scores), 1) if confidence_scores else 0
    
    # Count by review status
    status_counts = {"valid": 0, "needs_review": 0, "rejected": 0, "duplicate": 0}
    for job_data in body.jobs:
        status = job_data.get("review_status", "unknown")
        if status in status_counts:
            status_counts[status] += 1
    
    # Extract unique companies and skills
    companies = set(j.get("company") for j in body.jobs if j.get("company"))
    all_skills = set()
    for job_data in body.jobs:
        skills = job_data.get("skills") or []
        all_skills.update(skills)
    
    log = ActivityLog(
        user_id=user.id,
        action=f"{saved_count} Jobs Imported",
        description=(
            f"Imported {saved_count} jobs for review — "
            f"{duplicates} duplicates skipped, {failed} failed. "
            f"Avg confidence: {avg_confidence}%. "
            f"Companies: {len(companies)}, Skills: {len(all_skills)}"
        ),
    )
    db.add(log)
    await db.commit()

    return {
        "saved": saved_count,
        "archived": 0,
        "duplicates": duplicates,
        "failed": failed,
        "total_processed": len(body.jobs),
        "status_breakdown": status_counts,
        "average_confidence": avg_confidence,
        "unique_companies": len(companies),
        "unique_skills": len(all_skills),
        "top_companies": list(companies)[:5],
        "top_skills": list(all_skills)[:10],
    }


@router.get("/{job_id}")
async def get_job(job_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    job = (await db.execute(select(Job).where(Job.id == job_id, VISIBLE))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    match = await _get_or_create_match(db, job, user)
    return _serialize_job(job, match)


@router.post("/{job_id}/ai-analyze")
async def ai_analyze_job(
    job_id: str,
    refresh: bool = Query(False, description="Bypass the cached analysis"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """AI Career Coach analysis — one Groq call covering every Job Detail section.
    Cached per-viewer on UserJobMatch.ai_analysis so each job costs at most one AI call per user."""
    job = (await db.execute(select(Job).where(Job.id == job_id, VISIBLE))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    match = await _get_or_create_match(db, job, user)

    # ── Cache hit ─────────────────────────────────────────────────────────────
    if match.ai_analysis and not refresh:
        try:
            cached = json.loads(match.ai_analysis)
            cached["cached"] = True
            return cached
        except Exception:
            pass  # corrupt cache → regenerate

    from app.services.ai_service import _get_client
    from app.config import settings

    candidate_skills = ", ".join(user.skills or []) or "Not specified"
    matched = ", ".join(match.matched_skills or []) or "None"
    missing = ", ".join(match.missing_skills or []) or "None"
    exp_years = f"{user.years_experience or 0} years"

    prompt = f"""You are an elite AI Career Coach. Produce a COMPLETE analysis of this job for this candidate.

JOB:
Title: {job.title} | Company: {job.company}
Location: {job.location} ({job.location_type}) | Experience: {job.experience_min}-{job.experience_max} yrs
Salary: {job.salary or 'Not mentioned'} | Type: {job.employment_type or 'Full Time'}
Skills required: {", ".join(job.skills or [])}
Description: {(job.description or '')[:500]}

CANDIDATE:
Experience: {exp_years} | Current role: {user.current_role or 'developer'}
Skills: {candidate_skills}
Matched: {matched} | Missing: {missing} | Engine match score: {round(match.match_score or 0)}%

Ground every claim in the data above. Be honest — if it's a weak fit, say so.
Respond ONLY with valid JSON, no markdown:
{{
  "summary": "5-6 sentence plain-English overview of the role and what to expect",
  "why_match": ["3-5 specific reasons this job fits the candidate"],
  "why_not": ["1-3 honest gaps or concerns (empty array if none)"],
  "experience_analysis": "2 sentences comparing candidate experience vs the required range",
  "apply_recommendation": "Strong Fit" | "Moderate Fit" | "Weak Fit" | "Avoid",
  "apply_reason": "One sentence justifying the recommendation",
  "should_apply": true or false,
  "career_advice": "2-3 sentence honest advice",
  "probabilities": {{
    "shortlist": <0-100>, "interview": <0-100>, "recruiter_reply": <0-100>, "offer": <0-100>
  }},
  "recruiter_interest": <0-100 — how attractive this profile looks for this exact role>,
  "competition_level": {{"level": "Low" | "Medium" | "High", "reason": "one sentence"}},
  "company_overview": "2-3 sentences about {job.company}: what they do, scale, culture (say 'Limited public info' if unknown)",
  "company_tech_stack": ["likely technologies this team uses"],
  "role_growth": "2 sentences: where this role leads in 2-3 years",
  "future_opportunities": ["2-3 next career steps this role unlocks"],
  "salary_analysis": {{"market": "typical market range for this role+exp", "offered": "{job.salary or 'not disclosed'}", "verdict": "one sentence comparison + negotiation tip"}},
  "learning_path": [{{"skill": "missing skill", "time": "e.g. 2 weeks", "how": "one concrete resource/project"}}],
  "action_plan": [
    {{"step": 1, "title": "Improve Resume", "detail": "specific keywords/sections to add", "eta": "e.g. 1 day"}},
    {{"step": 2, "title": "Close Skill Gaps", "detail": "which skills first and why", "eta": "..."}},
    {{"step": 3, "title": "Send Application", "detail": "how to apply + what to emphasize", "eta": "..."}},
    {{"step": 4, "title": "Expected Response", "detail": "realistic timeline + follow-up advice", "eta": "..."}}
  ],
  "cover_letter": "Professional 3-paragraph cover letter addressed to the hiring team at {job.company}",
  "interview_questions": ["Top 6 role-specific technical + HR questions"],
  "resume_tips": ["3-4 keywords/skills to add to the resume"],
  "salary_guidance": "One sentence on expected salary and negotiation"
}}"""

    try:
        client = _get_client()
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.35,
            max_tokens=2600,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
        data = json.loads(raw)
        data["generated_at"] = datetime.now(timezone.utc).isoformat()

        match.ai_analysis = json.dumps(data)  # cache — next call is free
        db.add(ActivityLog(
            user_id=user.id,
            action="AI Job Analysis",
            description=f"Generated AI career-coach analysis for {job.title} at {job.company}",
        ))
        await db.commit()
        data["cached"] = False
        return data
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"AI returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {str(e)}")


@router.patch("/{job_id}")
async def update_job(
    job_id: str,
    body: JobUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = (await db.execute(select(Job).where(Job.id == job_id, VISIBLE))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    match = await _get_or_create_match(db, job, user)

    for key, val in body.model_dump(exclude_none=True).items():
        setattr(match, key, val)

    if body.status == "archived" and body.archive_reason:
        log = ActivityLog(
            user_id=user.id,
            action="Job Archived",
            description=f"{job.title} at {job.company} archived: {body.archive_reason}",
        )
        db.add(log)

    await db.commit()
    await db.refresh(match)
    return _serialize_job(job, match)


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    """Admin-only — permanently removes a job from the global pool (and every user's match row) for everyone."""
    job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Delete all associated UserJobMatch rows
    await db.execute(
        delete(UserJobMatch).where(UserJobMatch.job_id == job_id)
    )
    
    # Delete the job
    await db.execute(
        delete(Job).where(Job.id == job_id)
    )
    
    db.add(ActivityLog(
        user_id=user.id,
        action="Job Deleted",
        description=f"Permanently deleted job: {job.title} at {job.company}",
    ))
    await db.commit()
    return None


# ── Admin Review Queue Endpoints ─────────────────────────────────────────────

class JobReviewUpdate(BaseModel):
    review_status: str  # approved | rejected
    admin_notes: Optional[str] = None
    # Optional: allow admin to correct fields
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    skills: Optional[list[str]] = None
    salary: Optional[str] = None


@router.get("/admin/review-queue")
async def get_review_queue(
    status: str = Query("pending_review", description="Filter by review status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — get jobs in the review queue with confidence reasons."""
    result = await db.execute(
        select(Job)
        .where(Job.review_status == status)
        .order_by(Job.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    jobs = result.scalars().all()
    
    return {
        "jobs": [
            {
                "id": job.id,
                "title": job.title,
                "company": job.company,
                "location": job.location,
                "location_type": job.location_type,
                "experience_min": job.experience_min,
                "experience_max": job.experience_max,
                "experience_display": format_experience_range(job.experience_min, job.experience_max),
                "skills": job.skills or [],
                "salary": job.salary,
                "contact_email": job.contact_email,
                "contact_phone": job.contact_phone,
                "apply_link": job.apply_link,
                "application_type": job.application_type,
                "confidence_score": job.confidence_score,
                "source": job.source,
                "review_status": job.review_status,
                "created_at": job.created_at,
                "validation_reason": job.duplicate_reason,  # Stored in duplicate_reason for now
            }
            for job in jobs
        ],
        "count": len(jobs),
        "status": status,
    }


@router.patch("/admin/{job_id}/review")
async def review_job(
    job_id: str,
    body: JobReviewUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — approve or reject a job with optional corrections."""
    job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if body.review_status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid review status")
    
    # Apply admin corrections if provided
    if body.title:
        job.title = body.title
    if body.company:
        job.company = body.company
    if body.location is not None:
        job.location = body.location
    if body.skills is not None:
        job.skills = body.skills
    if body.salary is not None:
        job.salary = body.salary
    
    # Update review status
    job.review_status = body.review_status
    
    # Store admin notes in duplicate_reason field (temporary storage)
    if body.admin_notes:
        job.duplicate_reason = body.admin_notes
    
    db.add(ActivityLog(
        user_id=user.id,
        action=f"Job {body.review_status.title()}",
        description=f"Admin {body.review_status} job: {job.title} at {job.company}" + 
                     (f" - Notes: {body.admin_notes}" if body.admin_notes else ""),
    ))
    await db.commit()
    await db.refresh(job)
    
    return {
        "id": job.id,
        "title": job.title,
        "company": job.company,
        "review_status": job.review_status,
        "message": f"Job {body.review_status} successfully",
    }


@router.post("/admin/bulk-review")
async def bulk_review_jobs(
    job_ids: list[str],
    review_status: str = Query(..., description="approved | rejected"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — bulk approve or reject multiple jobs at once."""
    if review_status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid review status")
    
    result = await db.execute(
        select(Job).where(Job.id.in_(job_ids))
    )
    jobs = result.scalars().all()
    
    updated_count = 0
    for job in jobs:
        job.review_status = review_status
        updated_count += 1
    
    db.add(ActivityLog(
        user_id=user.id,
        action=f"Bulk Job {review_status.title()}",
        description=f"Admin {review_status} {updated_count} jobs in bulk",
    ))
    await db.commit()
    
    return {
        "updated": updated_count,
        "review_status": review_status,
        "message": f"Successfully {review_status} {updated_count} jobs",
    }


# ── Lifecycle Management Endpoints ─────────────────────────────────────────────

@router.post("/admin/lifecycle/cleanup")
async def trigger_lifecycle_cleanup(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — trigger the automatic job lifecycle cleanup (expire → archive → delete)."""
    result = await run_lifecycle_cleanup(db)
    
    db.add(ActivityLog(
        user_id=user.id,
        action="Lifecycle Cleanup",
        description=f"Ran job lifecycle cleanup: {result['total_processed']} jobs processed",
    ))
    await db.commit()
    
    return result


@router.get("/admin/lifecycle/stats")
async def get_lifecycle_statistics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — get statistics about jobs in each lifecycle stage."""
    stats = await get_lifecycle_stats(db)
    return stats


# ── Custom Job Management Endpoints ─────────────────────────────────────────────

@router.post("/admin/custom-jobs")
async def create_custom_job(
    body: CustomJobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — create a custom job manually (not from AI import)."""
    job = Job(
        user_id=user.id,
        title=body.title,
        company=body.company,
        company_logo=body.company_logo,
        company_website=body.company_website,
        company_type=body.company_type,
        industry=body.industry,
        hiring_manager=body.hiring_manager,
        recruiter_linkedin=body.recruiter_linkedin,
        location=body.location,
        location_type=body.location_type,
        job_category=body.job_category,
        department=body.department,
        experience_min=body.experience_min,
        experience_max=body.experience_max,
        skills=body.skills,
        description=body.description,
        requirements=body.requirements,
        responsibilities=body.responsibilities,
        benefits=body.benefits,
        contact_email=body.contact_email,
        contact_phone=body.contact_phone,
        apply_link=body.apply_link,
        contact_linkedin=body.contact_linkedin,
        salary=body.salary,
        employment_type=body.employment_type,
        source="custom",
        review_status="approved",  # Custom jobs are auto-approved
        publication_status=body.publication_status,
        scheduled_at=datetime.fromisoformat(body.scheduled_at) if body.scheduled_at else None,
        lifecycle_status="active",
    )
    
    # Update application method flags based on provided contact info
    update_application_method_flags(job)
    
    db.add(job)
    await db.commit()
    await db.refresh(job)
    
    db.add(ActivityLog(
        user_id=user.id,
        action="Custom Job Created",
        description=f"Created custom job: {job.title} at {job.company}",
    ))
    await db.commit()
    
    # Create match for the admin user
    match = await _get_or_create_match(db, job, user)
    
    return _serialize_job(job, match)


@router.get("/admin/custom-jobs")
async def list_custom_jobs(
    publication_status: Optional[str] = Query(None, description="Filter by publication status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — list custom jobs with optional filtering."""
    query = select(Job).where(Job.source == "custom")
    
    if publication_status:
        query = query.where(Job.publication_status == publication_status)
    
    query = query.order_by(Job.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    jobs = result.scalars().all()
    
    # Serialize with admin's match
    serialized = []
    for job in jobs:
        match = await _get_or_create_match(db, job, user)
        serialized.append(_serialize_job(job, match))
    
    return {
        "jobs": serialized,
        "count": len(jobs),
        "publication_status": publication_status,
    }


@router.get("/admin/custom-jobs/{job_id}")
async def get_custom_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — get a specific custom job."""
    job = (await db.execute(
        select(Job).where(Job.id == job_id, Job.source == "custom")
    )).scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Custom job not found")
    
    match = await _get_or_create_match(db, job, user)
    return _serialize_job(job, match)


@router.patch("/admin/custom-jobs/{job_id}")
async def update_custom_job(
    job_id: str,
    body: CustomJobUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — update a custom job."""
    job = (await db.execute(
        select(Job).where(Job.id == job_id, Job.source == "custom")
    )).scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Custom job not found")
    
    # Update provided fields
    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        if field == "scheduled_at" and value:
            value = datetime.fromisoformat(value)
        setattr(job, field, value)
    
    # Re-calculate application method flags if contact fields changed
    contact_fields = ["contact_email", "contact_phone", "apply_link", "contact_linkedin"]
    if any(field in update_data for field in contact_fields):
        update_application_method_flags(job)
    
    db.add(ActivityLog(
        user_id=user.id,
        action="Custom Job Updated",
        description=f"Updated custom job: {job.title} at {job.company}",
    ))
    await db.commit()
    await db.refresh(job)
    
    match = await _get_or_create_match(db, job, user)
    return _serialize_job(job, match)


@router.delete("/admin/custom-jobs/{job_id}", status_code=204)
async def delete_custom_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — delete a custom job."""
    job = (await db.execute(
        select(Job).where(Job.id == job_id, Job.source == "custom")
    )).scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Custom job not found")
    
    # Delete all associated UserJobMatch rows
    await db.execute(
        delete(UserJobMatch).where(UserJobMatch.job_id == job_id)
    )
    
    # Delete the job
    await db.execute(
        delete(Job).where(Job.id == job_id)
    )
    
    db.add(ActivityLog(
        user_id=user.id,
        action="Custom Job Deleted",
        description=f"Deleted custom job: {job.title} at {job.company}",
    ))
    await db.commit()
    
    return None


# ── Skills Management Endpoints ─────────────────────────────────────────────────

class SkillCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    category: Optional[str] = None
    synonyms: Optional[str] = None
    is_popular: bool = False
    description: Optional[str] = None


class SkillUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    category: Optional[str] = None
    synonyms: Optional[str] = None
    is_popular: Optional[bool] = None
    description: Optional[str] = None


@router.post("/admin/skills")
async def create_skill(
    body: SkillCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — create a new skill for the taxonomy."""
    # Check if skill already exists
    existing = (await db.execute(
        select(Skill).where(Skill.name == body.name)
    )).scalar_one_or_none()
    
    if existing:
        raise HTTPException(status_code=400, detail="Skill with this name already exists")
    
    skill = Skill(
        name=body.name,
        category=body.category,
        synonyms=body.synonyms,
        is_popular=body.is_popular,
        description=body.description,
    )
    
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    
    db.add(ActivityLog(
        user_id=user.id,
        action="Skill Created",
        description=f"Created new skill: {skill.name}",
    ))
    await db.commit()
    
    return {
        "id": skill.id,
        "name": skill.name,
        "category": skill.category,
        "synonyms": skill.synonyms,
        "is_popular": skill.is_popular,
        "description": skill.description,
    }


@router.get("/admin/skills")
async def list_skills(
    category: Optional[str] = Query(None, description="Filter by category"),
    is_popular: Optional[bool] = Query(None, description="Filter by popularity"),
    search: Optional[str] = Query(None, description="Search by name"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — list skills with optional filtering."""
    query = select(Skill)
    
    if category:
        query = query.where(Skill.category == category)
    if is_popular is not None:
        query = query.where(Skill.is_popular == is_popular)
    if search:
        query = query.where(Skill.name.ilike(f"%{search}%"))
    
    query = query.order_by(Skill.name).limit(limit).offset(offset)
    result = await db.execute(query)
    skills = result.scalars().all()
    
    return {
        "skills": [
            {
                "id": s.id,
                "name": s.name,
                "category": s.category,
                "synonyms": s.synonyms,
                "is_popular": s.is_popular,
                "description": s.description,
            }
            for s in skills
        ],
        "count": len(skills),
    }


@router.get("/admin/skills/categories")
async def get_skill_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — get all unique skill categories."""
    result = await db.execute(
        select(Skill.category).where(Skill.category.isnot(None)).distinct()
    )
    categories = [c[0] for c in result.all() if c[0]]
    
    return {"categories": sorted(categories)}


@router.patch("/admin/skills/{skill_id}")
async def update_skill(
    skill_id: str,
    body: SkillUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — update a skill."""
    skill = (await db.execute(
        select(Skill).where(Skill.id == skill_id)
    )).scalar_one_or_none()
    
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    
    # Check name uniqueness if updating name
    if body.name and body.name != skill.name:
        existing = (await db.execute(
            select(Skill).where(Skill.name == body.name)
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="Skill with this name already exists")
    
    # Update provided fields
    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(skill, field, value)
    
    db.add(ActivityLog(
        user_id=user.id,
        action="Skill Updated",
        description=f"Updated skill: {skill.name}",
    ))
    await db.commit()
    await db.refresh(skill)
    
    return {
        "id": skill.id,
        "name": skill.name,
        "category": skill.category,
        "synonyms": skill.synonyms,
        "is_popular": skill.is_popular,
        "description": skill.description,
    }


@router.delete("/admin/skills/{skill_id}", status_code=204)
async def delete_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — delete a skill."""
    skill = (await db.execute(
        select(Skill).where(Skill.id == skill_id)
    )).scalar_one_or_none()
    
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    
    await db.delete(skill)
    
    db.add(ActivityLog(
        user_id=user.id,
        action="Skill Deleted",
        description=f"Deleted skill: {skill.name}",
    ))
    await db.commit()
    
    return None


@router.get("/skills/search")
async def search_skills(
    query: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search skills by name or synonyms (for custom job form autocomplete)."""
    search_pattern = f"%{query}%"
    
    result = await db.execute(
        select(Skill).where(
            or_(
                Skill.name.ilike(search_pattern),
                Skill.synonyms.ilike(search_pattern)
            )
        ).order_by(Skill.is_popular.desc(), Skill.name).limit(limit)
    )
    skills = result.scalars().all()
    
    return {
        "skills": [
            {
                "id": s.id,
                "name": s.name,
                "category": s.category,
            }
            for s in skills
        ],
        "count": len(skills),
    }


# ── Location Data Endpoints ─────────────────────────────────────────────────────

@router.get("/locations/states")
async def get_india_states(
    user: User = Depends(get_current_user),
):
    """Get list of all Indian states and union territories for custom job form."""
    return {"states": get_states()}


@router.get("/locations/cities")
async def get_india_cities(
    state: str = Query(..., description="State name"),
    user: User = Depends(get_current_user),
):
    """Get list of cities for a given Indian state."""
    cities = get_cities(state)
    return {
        "state": state,
        "cities": cities,
        "count": len(cities),
    }


@router.get("/locations/all")
async def get_all_india_locations(
    user: User = Depends(get_current_user),
):
    """Get complete state-to-cities mapping for India."""
    return get_all_locations()


# ── Custom Job Analytics Endpoints ────────────────────────────────────────────

@router.get("/admin/analytics/custom-jobs")
async def get_custom_job_analytics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — get analytics for custom jobs vs imported jobs."""
    
    # Count jobs by source
    total_jobs = (await db.execute(select(func.count(Job.id)))).scalar() or 0
    custom_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.source == "custom")
    )).scalar() or 0
    imported_jobs = total_jobs - custom_jobs
    
    # Count custom jobs by publication status
    custom_published = (await db.execute(
        select(func.count(Job.id)).where(Job.source == "custom", Job.publication_status == "published")
    )).scalar() or 0
    custom_draft = (await db.execute(
        select(func.count(Job.id)).where(Job.source == "custom", Job.publication_status == "draft")
    )).scalar() or 0
    custom_scheduled = (await db.execute(
        select(func.count(Job.id)).where(Job.source == "custom", Job.publication_status == "scheduled")
    )).scalar() or 0
    
    # Count applications by method (from UserJobMatch)
    email_applied = (await db.execute(
        select(func.count(UserJobMatch.id)).where(UserJobMatch.application_method == "email")
    )).scalar() or 0
    google_form_applied = (await db.execute(
        select(func.count(UserJobMatch.id)).where(UserJobMatch.application_method == "google_form")
    )).scalar() or 0
    portal_applied = (await db.execute(
        select(func.count(UserJobMatch.id)).where(UserJobMatch.application_method == "portal")
    )).scalar() or 0
    linkedin_applied = (await db.execute(
        select(func.count(UserJobMatch.id)).where(UserJobMatch.application_method == "linkedin")
    )).scalar() or 0
    phone_applied = (await db.execute(
        select(func.count(UserJobMatch.id)).where(UserJobMatch.application_method == "phone")
    )).scalar() or 0
    manual_applied = (await db.execute(
        select(func.count(UserJobMatch.id)).where(UserJobMatch.application_method == "manual")
    )).scalar() or 0
    
    return {
        "job_sources": {
            "total_jobs": total_jobs,
            "custom_jobs": custom_jobs,
            "imported_jobs": imported_jobs,
            "custom_percentage": round((custom_jobs / total_jobs * 100) if total_jobs > 0 else 0, 1),
        },
        "custom_job_publication": {
            "published": custom_published,
            "draft": custom_draft,
            "scheduled": custom_scheduled,
        },
        "applications_by_method": {
            "email": email_applied,
            "google_form": google_form_applied,
            "portal": portal_applied,
            "linkedin": linkedin_applied,
            "phone": phone_applied,
            "manual": manual_applied,
        },
    }


@router.get("/admin/analytics/dashboard")
async def get_admin_dashboard_analytics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin-only — comprehensive dashboard analytics."""
    
    # Job counts by status
    total_jobs = (await db.execute(select(func.count(Job.id)))).scalar() or 0
    pending_review = (await db.execute(
        select(func.count(Job.id)).where(Job.review_status == "pending_review")
    )).scalar() or 0
    approved_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.review_status == "approved")
    )).scalar() or 0
    rejected_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.review_status == "rejected")
    )).scalar() or 0
    
    # Lifecycle counts
    active_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.lifecycle_status == "active")
    )).scalar() or 0
    expired_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.lifecycle_status == "expired")
    )).scalar() or 0
    archived_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.lifecycle_status == "archived")
    )).scalar() or 0
    
    # Source breakdown
    custom_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.source == "custom")
    )).scalar() or 0
    imported_jobs = total_jobs - custom_jobs
    
    # Application method breakdown
    email_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.primary_application_method == "email")
    )).scalar() or 0
    google_form_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.primary_application_method == "google_form")
    )).scalar() or 0
    portal_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.primary_application_method == "portal")
    )).scalar() or 0
    linkedin_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.primary_application_method == "linkedin")
    )).scalar() or 0
    phone_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.primary_application_method == "phone")
    )).scalar() or 0
    no_contact_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.primary_application_method == "no_contact")
    )).scalar() or 0
    
    return {
        "job_review_status": {
            "total": total_jobs,
            "pending_review": pending_review,
            "approved": approved_jobs,
            "rejected": rejected_jobs,
        },
        "job_lifecycle": {
            "active": active_jobs,
            "expired": expired_jobs,
            "archived": archived_jobs,
        },
        "job_sources": {
            "custom": custom_jobs,
            "imported": imported_jobs,
        },
        "application_methods": {
            "email": email_jobs,
            "google_form": google_form_jobs,
            "portal": portal_jobs,
            "linkedin": linkedin_jobs,
            "phone": phone_jobs,
            "no_contact": no_contact_jobs,
        },
    }


@router.get("/stats/dashboard")
async def dashboard_stats(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(
        select(Job, UserJobMatch)
        .join(UserJobMatch, UserJobMatch.job_id == Job.id)
        .where(UserJobMatch.user_id == user.id)
    )).all()

    total = len(rows)
    matched = sum(1 for j, m in rows if m.match_score >= 70)
    archived = sum(1 for j, m in rows if m.status == "archived")
    emails_total = sum(m.emails_generated for j, m in rows)

    all_skills: dict[str, int] = {}
    for j, m in rows:
        for s in (j.skills or []):
            all_skills[s] = all_skills.get(s, 0) + 1

    return {
        "jobs_imported": total,
        "matched_jobs": matched,
        "archived": archived,
        "emails_generated": emails_total,
        "match_distribution": [
            {"range": "90-100%", "count": sum(1 for j, m in rows if m.match_score >= 90)},
            {"range": "80-90%", "count": sum(1 for j, m in rows if 80 <= m.match_score < 90)},
            {"range": "70-80%", "count": sum(1 for j, m in rows if 70 <= m.match_score < 80)},
            {"range": "Below 70%", "count": sum(1 for j, m in rows if m.match_score < 70)},
        ],
        "skills_demand": sorted(
            [{"skill": k, "count": v} for k, v in all_skills.items()],
            key=lambda x: -x["count"]
        )[:8],
    }
