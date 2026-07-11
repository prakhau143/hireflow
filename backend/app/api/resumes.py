from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.resume import Resume
from app.models.activity_log import ActivityLog
from app.utils.auth import get_current_user
from app.services.ai_service import analyze_resume, generate_job_recommendations, analyze_resume_for_job
import io

router = APIRouter(prefix="/resumes", tags=["resumes"])


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
