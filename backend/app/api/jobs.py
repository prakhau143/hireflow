from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.job import Job
from app.models.activity_log import ActivityLog
from app.utils.auth import get_current_user, require_admin
from app.services.ai_service import parse_linkedin_posts
from datetime import datetime, timezone
import json
import re

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
    # Review gate: pending/rejected background-import jobs are not publicly listed
    # (NULL = legacy/manually saved rows, treated as approved)
    conditions.append(or_(Job.review_status.is_(None), Job.review_status == "approved"))
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
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Enterprise hybrid pipeline — every user imports jobs into their own private pool. Returns jobs + detailed pipeline stats."""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    # Latest resume feeds the Projects/Resume components of the 100-pt matcher
    from app.models.resume import Resume
    resume = (await db.execute(
        select(Resume).where(Resume.user_id == user.id).order_by(Resume.created_at.desc()).limit(1)
    )).scalar_one_or_none()

    try:
        results, stats = await parse_linkedin_posts(body.text, user, resume)
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
    user: User = Depends(get_current_user),
):
    """Save validated jobs to DB. Fuzzy-deduplicates, archives low-match jobs, returns full stats."""
    from app.services.ai_service import _parse_experience
    from difflib import SequenceMatcher

    saved_count = 0
    duplicates = 0
    archived = 0
    failed = 0

    # Fingerprint dedupe: title + company + location + email
    existing_rows = (await db.execute(
        select(Job.title, Job.company, Job.location, Job.contact_email).where(Job.user_id == user.id)
    )).all()
    def _key(t: str, c: str, l: str = "", e: str = "") -> str:
        import re as _re
        return _re.sub(r"[^a-z0-9 @]", "", " | ".join((x or "").lower().strip() for x in (t, c, l, e)))
    existing_keys = [_key(t, c, l, e) for t, c, l, e in existing_rows]

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

            # Fuzzy duplicate check (≥90% similar fingerprint) against DB + this batch
            new_key = _key(title, company, job_data.get("location") or "", contact_email or "")
            if any(SequenceMatcher(None, new_key, k).ratio() >= 0.9 for k in existing_keys):
                duplicates += 1
                continue
            existing_keys.append(new_key)

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
                match_tier=job_data.get("match_tier"),
                application_type=job_data.get("application_type"),
                is_recommended=bool(job_data.get("is_recommended")),
                experience_badge=job_data.get("experience_badge"),
                match_breakdown=job_data.get("match_breakdown"),
                score_suggestions=job_data.get("score_suggestions"),
                hiring_manager=job_data.get("recruiter"),
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


@router.post("/{job_id}/ai-analyze")
async def ai_analyze_job(
    job_id: str,
    refresh: bool = Query(False, description="Bypass the cached analysis"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """AI Career Coach analysis — one Groq call covering every Job Detail section.
    Cached in job.ai_analysis so each job costs at most one AI call."""
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # ── Cache hit ─────────────────────────────────────────────────────────────
    if job.ai_analysis and not refresh:
        try:
            cached = json.loads(job.ai_analysis)
            cached["cached"] = True
            return cached
        except Exception:
            pass  # corrupt cache → regenerate

    from app.services.ai_service import _get_client
    from app.config import settings

    candidate_skills = ", ".join(user.skills or []) or "Not specified"
    matched = ", ".join(job.matched_skills or []) or "None"
    missing = ", ".join(job.missing_skills or []) or "None"
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
Matched: {matched} | Missing: {missing} | Engine match score: {round(job.match_score or 0)}%

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

        job.ai_analysis = json.dumps(data)  # cache — next call is free
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
