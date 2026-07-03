from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.models.user import User
from app.utils.auth import get_current_user
from app.services.ai_service import summarize_job, improve_resume, generate_email, generate_learning_path

router = APIRouter(prefix="/ai", tags=["ai"])


class SummarizeRequest(BaseModel):
    description: str


class ImproveResumeRequest(BaseModel):
    resume_text: str
    target_job: str = ""


class GenerateEmailRequest(BaseModel):
    job_title: str
    company: str
    resume_text: str
    template: str = ""


class LearningPathRequest(BaseModel):
    missing_skills: list[str]


@router.post("/summarize")
async def summarize(body: SummarizeRequest, user: User = Depends(get_current_user)):
    try:
        return await summarize_job(body.description)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/improve-resume")
async def improve(body: ImproveResumeRequest, user: User = Depends(get_current_user)):
    try:
        return await improve_resume(body.resume_text, body.target_job)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-email")
async def gen_email(body: GenerateEmailRequest, user: User = Depends(get_current_user)):
    try:
        return await generate_email(body.job_title, body.company, body.resume_text, body.template)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/learning-path")
async def learning_path(body: LearningPathRequest, user: User = Depends(get_current_user)):
    try:
        return await generate_learning_path(body.missing_skills)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
