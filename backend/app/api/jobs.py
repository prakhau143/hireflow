from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.job import Job
from app.models.user_job_match import UserJobMatch
from app.models.activity_log import ActivityLog
from app.utils.auth import get_current_user, require_admin
from app.services.ai_service import parse_linkedin_posts
from app.services.matching_service import sync_user_job_match
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


# ── Job + UserJobMatch merge helpers ─────────────────────────────────────────

def _serialize_job(job: Job, match: UserJobMatch) -> dict:
    """Merge global Job facts with this viewer's personalized match into the
    flat shape the frontend has always read (JobCard/JobDetail need no changes)."""
    return {
        "id": job.id,
        "title": job.title,
        "company": job.company,
        "hiring_manager": job.hiring_manager,
        "location": job.location,
        "location_type": job.location_type,
        "experience_min": job.experience_min,
        "experience_max": job.experience_max,
        "skills": job.skills or [],
        "description": job.description,
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
        "apply_link": job.apply_link,
        "application_type": job.application_type,
        "review_status": job.review_status,
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
    review before saving them into the shared global pool."""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        results, stats = await parse_linkedin_posts(body.text, user, None)
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
    since there's now a single shared pool instead of one per importer."""
    from app.services.ai_service import _parse_experience
    from difflib import SequenceMatcher

    saved_count = 0
    duplicates = 0
    failed = 0

    existing_rows = (await db.execute(
        select(Job.title, Job.company, Job.location, Job.contact_email)
    )).all()

    def _key(t: str, c: str, l: str = "", e: str = "") -> str:
        import re as _re
        return _re.sub(r"[^a-z0-9 @]", "", " | ".join((x or "").lower().strip() for x in (t, c, l, e)))
    existing_keys = [_key(t, c, l, e) for t, c, l, e in existing_rows]

    for job_data in body.jobs:
        try:
            title = (job_data.get("role") or job_data.get("title") or "").strip() or "Unknown Role"
            company = (job_data.get("company") or "").strip() or "Unknown Company"
            contact_email = job_data.get("email") or job_data.get("contact_email")
            contact_phone = job_data.get("phone") or job_data.get("contact_phone")
            work_mode = (job_data.get("work_mode") or job_data.get("location_type") or "onsite").lower()
            source_tag = job_data.get("_source") or "text"

            exp_min, exp_max = _parse_experience(job_data.get("experience"))

            new_key = _key(title, company, job_data.get("location") or "", contact_email or "")
            if any(SequenceMatcher(None, new_key, k).ratio() >= 0.9 for k in existing_keys):
                duplicates += 1
                continue
            existing_keys.append(new_key)

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
                smart_tags=job_data.get("smart_tags") or [],
                is_duplicate=False,
                freshness_score=0,
                review_status="pending_review",
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
            f"Imported {saved_count} jobs for review — "
            f"{duplicates} duplicates skipped, {failed} failed"
        ),
    )
    db.add(log)
    await db.commit()

    return {
        "saved": saved_count,
        "archived": 0,
        "duplicates": duplicates,
        "failed": failed,
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
    await db.delete(job)
    await db.commit()


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
