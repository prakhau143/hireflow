from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.resume import Resume
from app.models.activity_log import ActivityLog
from app.utils.auth import get_current_user
from app.services.ai_service import analyze_resume, generate_job_recommendations, analyze_resume_for_job
from datetime import datetime, timezone
import io

router = APIRouter(prefix="/resumes", tags=["resumes"])

SECTION_KEYS = [
    ("keyword_density", "Keyword Density"),
    ("experience_quality", "Experience Quality"),
    ("achievement_score", "Achievements"),
    ("project_score", "Projects"),
    ("certification_score", "Certifications"),
    ("formatting", "Formatting"),
    ("readability", "Readability"),
]


@router.get("/intelligence")
async def resume_intelligence(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Resume Intelligence dashboard: versions, trend, heatmap, gaps, roles, matching jobs."""
    from app.models.job import Job
    from sqlalchemy import or_, and_

    resumes = (await db.execute(
        select(Resume).where(Resume.user_id == user.id).order_by(Resume.created_at.asc())
    )).scalars().all()

    versions = []
    for r in resumes:
        versions.append({
            "id": r.id, "name": r.name, "ats_score": r.ats_score,
            "section_scores": r.section_scores,
            "strong_skills": r.strong_skills or [],
            "created_at": r.created_at, "updated_at": r.updated_at,
            "has_sections": bool(r.section_scores),
        })

    best = max(resumes, key=lambda r: r.ats_score or 0) if resumes else None

    # ATS trend: merged history points across versions
    trend = []
    for r in resumes:
        points = r.ats_history or [{"date": r.created_at.isoformat() if r.created_at else "", "score": r.ats_score}]
        for p in points:
            trend.append({"date": (p.get("date") or "")[:10], "score": p.get("score", 0), "resume": r.name})
    trend.sort(key=lambda x: x["date"])

    # Heatmap: resumes × sections
    heatmap = {
        "sections": [label for _, label in SECTION_KEYS],
        "rows": [
            {"resume": r.name,
             "scores": [(r.section_scores or {}).get(key) for key, _ in SECTION_KEYS]}
            for r in resumes
        ],
    } if any(r.section_scores for r in resumes) else None

    # Aggregate skill gaps (dedupe by skill, keep highest importance)
    gap_map: dict[str, dict] = {}
    for r in resumes:
        for g in (r.skill_gaps or []):
            if isinstance(g, dict) and g.get("skill"):
                key = g["skill"].lower()
                if key not in gap_map or g.get("importance") == "high":
                    gap_map[key] = g
            elif isinstance(g, str):
                gap_map.setdefault(g.lower(), {"skill": g, "importance": "medium", "reason": ""})
    skill_gaps = sorted(gap_map.values(), key=lambda g: 0 if g.get("importance") == "high" else 1)[:10]

    # Top matching approved jobs (best-resume relevance = the platform match score)
    jobs = (await db.execute(
        select(Job).where(
            Job.user_id == user.id,
            Job.status.notin_(("archived",)),
            or_(Job.review_status.is_(None), Job.review_status == "approved"),
        ).order_by(Job.match_score.desc()).limit(5)
    )).scalars().all()
    top_jobs = [{
        "id": j.id, "title": j.title, "company": j.company,
        "match_score": round(j.match_score or 0), "match_tier": j.match_tier,
    } for j in jobs]

    return {
        "versions": versions,
        "best_resume_id": best.id if best else None,
        "avg_ats": round(sum((r.ats_score or 0) for r in resumes) / len(resumes), 1) if resumes else 0,
        "trend": trend,
        "heatmap": heatmap,
        "skill_gaps": skill_gaps,
        "role_recommendations": (best.role_recommendations if best else None)
            or next((r.role_recommendations for r in reversed(resumes) if r.role_recommendations), []),
        "suggestions": (best.suggestions if best else None)
            or next((r.suggestions for r in reversed(resumes) if r.suggestions), []),
        "top_jobs": top_jobs,
    }


@router.get("/compare")
async def compare_resumes(
    a: str, b: str,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    """Side-by-side comparison of two resume versions."""
    rows = (await db.execute(
        select(Resume).where(Resume.user_id == user.id, Resume.id.in_((a, b)))
    )).scalars().all()
    if len(rows) != 2:
        raise HTTPException(status_code=404, detail="Both resumes must exist")
    ra = next(r for r in rows if r.id == a)
    rb = next(r for r in rows if r.id == b)

    skills_a = {s.lower(): s for s in (ra.strong_skills or [])}
    skills_b = {s.lower(): s for s in (rb.strong_skills or [])}
    shared = [skills_a[k] for k in skills_a if k in skills_b]
    only_a = [skills_a[k] for k in skills_a if k not in skills_b]
    only_b = [skills_b[k] for k in skills_b if k not in skills_a]

    sections = []
    for key, label in SECTION_KEYS:
        va = (ra.section_scores or {}).get(key)
        vb = (rb.section_scores or {}).get(key)
        sections.append({"label": label, "a": va, "b": vb})

    winner = ra if (ra.ats_score or 0) >= (rb.ats_score or 0) else rb
    return {
        "a": {"id": ra.id, "name": ra.name, "ats_score": ra.ats_score},
        "b": {"id": rb.id, "name": rb.name, "ats_score": rb.ats_score},
        "sections": sections,
        "shared_skills": shared,
        "only_a": only_a,
        "only_b": only_b,
        "verdict": f"'{winner.name}' is the stronger version (ATS {winner.ats_score} vs "
                   f"{(rb if winner is ra else ra).ats_score}). Use it as your default for applications.",
    }


@router.get("/")
async def list_resumes(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Resume).where(Resume.user_id == user.id).order_by(Resume.created_at.desc())
    )
    return result.scalars().all()


@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    name: str = Form(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        if not file.filename or not file.filename.endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files are supported")

        content = await file.read()

        # Extract text from PDF using PyMuPDF
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=content, filetype="pdf")
            raw_text = "\n".join(page.get_text() for page in doc)
            doc.close()
        except Exception as e:
            print(f"PDF parsing error: {e}")
            raw_text = ""

        # Store file locally (use S3 in production)
        import os
        os.makedirs("uploads/resumes", exist_ok=True)
        resume_name = name or file.filename
        safe_name = f"{user.id}_{resume_name.replace(' ', '_')}.pdf"
        file_path = f"uploads/resumes/{safe_name}"
        with open(file_path, "wb") as f:
            f.write(content)

        # AI analysis
        ai_data = {}
        if raw_text:
            try:
                ai_data = await analyze_resume(raw_text, user.skills or [])
            except Exception as e:
                print(f"AI analysis error: {e}")
                ai_data = {}

        # Use resume_name instead of name to ensure it's not None
        resume = Resume(
            user_id=user.id,
            name=resume_name,
            file_url=f"/uploads/resumes/{safe_name}",
            raw_text=raw_text,
            ats_score=ai_data.get("ats_score", 0),
            missing_keywords=ai_data.get("missing_keywords", []),
            strong_skills=ai_data.get("strong_skills", []),
            weak_sections=ai_data.get("weak_sections", []),
            missing_projects=ai_data.get("missing_projects", []),
            missing_certifications=ai_data.get("missing_certifications", []),
            skill_gaps=ai_data.get("skill_gaps", []),
            suggestions=ai_data.get("suggestions", []),
            section_scores=ai_data.get("section_scores"),
            role_recommendations=ai_data.get("role_recommendations"),
            ats_history=[{
                "date": datetime.now(timezone.utc).isoformat(),
                "score": ai_data.get("ats_score", 0),
            }] if ai_data else [],
        )
        db.add(resume)

        log = ActivityLog(
            user_id=user.id,
            action="Resume Uploaded",
            description=f"Resume '{resume_name}' uploaded — ATS Score: {resume.ats_score}/100",
        )
        db.add(log)
        await db.commit()
        await db.refresh(resume)
        return resume
    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to upload resume: {str(e)}")


@router.post("/{resume_id}/analyze")
async def re_analyze_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not resume.raw_text:
        raise HTTPException(status_code=400, detail="No text content to analyze")

    ai_data = await analyze_resume(resume.raw_text, user.skills or [])
    resume.ats_score = ai_data.get("ats_score", resume.ats_score)
    resume.missing_keywords = ai_data.get("missing_keywords", [])
    resume.strong_skills = ai_data.get("strong_skills", [])
    resume.weak_sections = ai_data.get("weak_sections", [])
    resume.missing_projects = ai_data.get("missing_projects", [])
    resume.missing_certifications = ai_data.get("missing_certifications", [])
    resume.skill_gaps = ai_data.get("skill_gaps", [])
    resume.suggestions = ai_data.get("suggestions", [])
    resume.section_scores = ai_data.get("section_scores") or resume.section_scores
    resume.role_recommendations = ai_data.get("role_recommendations") or resume.role_recommendations
    # Improvement timeline: every analysis appends a point
    history = list(resume.ats_history or [])
    history.append({"date": datetime.now(timezone.utc).isoformat(), "score": resume.ats_score})
    resume.ats_history = history[-30:]

    log = ActivityLog(
        user_id=user.id,
        action="Resume Re-analyzed",
        description=f"AI re-analyzed '{resume.name}' — new ATS: {resume.ats_score}/100",
    )
    db.add(log)
    await db.commit()
    await db.refresh(resume)
    return resume


@router.delete("/{resume_id}", status_code=204)
async def delete_resume(resume_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    await db.delete(resume)
    await db.commit()


@router.get("/{resume_id}/recommendations")
async def get_job_recommendations(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get AI-powered job recommendations based on resume."""
    result = await db.execute(select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    
    if not resume.raw_text:
        raise HTTPException(status_code=400, detail="Resume has no text content")
    
    try:
        recommendations = await generate_job_recommendations(resume.raw_text, user.skills or [])
        return {"recommendations": recommendations}
    except Exception as e:
        if "rate limit" in str(e).lower() or "429" in str(e):
            raise HTTPException(
                status_code=429,
                detail="AI service rate limit reached. Please try again in a few minutes or upgrade your Groq API plan."
            )
        raise HTTPException(status_code=500, detail=f"Failed to generate recommendations: {str(e)}")


@router.post("/{resume_id}/analyze-for-job")
async def analyze_resume_for_job_endpoint(
    resume_id: str,
    job_title: str = Form(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Analyze resume specifically for a target job role."""
    result = await db.execute(select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    
    if not resume.raw_text:
        raise HTTPException(status_code=400, detail="Resume has no text content")
    
    try:
        analysis = await analyze_resume_for_job(resume.raw_text, job_title, user.skills or [])
        return analysis
    except Exception as e:
        if "rate limit" in str(e).lower() or "429" in str(e):
            raise HTTPException(
                status_code=429,
                detail="AI service rate limit reached. Please try again in a few minutes or upgrade your Groq API plan."
            )
        raise HTTPException(status_code=500, detail=f"Failed to analyze resume: {str(e)}")
