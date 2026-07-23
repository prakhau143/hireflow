from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
from app.config import settings
from app.database import create_tables
# Import all models to ensure they're registered with Base.metadata
from app.models.user import User
from app.models.job import Job
from app.models.resume import Resume
from app.models.smtp import SmtpConfig
from app.models.smtp_log import SmtpLog
from app.models.template import EmailTemplate
from app.models.activity_log import ActivityLog
from app.models.application import Application
from app.models.import_session import ImportSession
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.jobs import router as jobs_router
from app.api.ai import router as ai_router
from app.api.smtp import router as smtp_router
from app.api.resumes import router as resumes_router
from app.api.templates import router as templates_router
from app.api.logs import router as logs_router
from app.api.dashboard import router as dashboard_router
from app.api.applications import router as applications_router
from app.api.imports import router as imports_router
from app.api.review import router as review_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs("uploads/resumes", exist_ok=True)
    await create_tables()
    # Print masked Groq API key for debugging
    if settings.GROQ_API_KEY:
        masked_key = "*" * (len(settings.GROQ_API_KEY) - 4) + settings.GROQ_API_KEY[-4:]
        print(f"✓ Groq API Key loaded: {masked_key}")
    else:
        print("⚠ Groq API Key not found in environment")
    yield


app = FastAPI(
    title="HireFlow AI API",
    description="AI-powered job hunting automation platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Temporarily allow all for debugging
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(smtp_router, prefix="/api")
app.include_router(resumes_router, prefix="/api")
app.include_router(templates_router, prefix="/api")
app.include_router(logs_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(applications_router, prefix="/api")
app.include_router(imports_router, prefix="/api")
app.include_router(review_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "HireFlow AI", "version": "1.0.0"}
