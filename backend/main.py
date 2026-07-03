from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
from app.config import settings
from app.database import create_tables
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.jobs import router as jobs_router
from app.api.ai import router as ai_router
from app.api.smtp import router as smtp_router
from app.api.resumes import router as resumes_router
from app.api.templates import router as templates_router
from app.api.logs import router as logs_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs("uploads/resumes", exist_ok=True)
    await create_tables()
    yield


app = FastAPI(
    title="HireFlow AI API",
    description="AI-powered job hunting automation platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
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


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "HireFlow AI", "version": "1.0.0"}
