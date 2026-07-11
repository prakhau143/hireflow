from pydantic_settings import BaseSettings
from dotenv import load_dotenv
import os

# Load .env explicitly
load_dotenv()


class Settings(BaseSettings):
    APP_NAME: str = "HireFlow AI"
    DEBUG: bool = True
    SECRET_KEY: str = "changeme-use-a-long-random-secret-in-production"
    ENCRYPTION_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    # SQLite by default; override with PostgreSQL URL on Render
    DATABASE_URL: str = "sqlite+aiosqlite:///./hireflow.db"

    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # System SMTP — used for password-reset OTP emails
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_ENCRYPTION: str = "TLS"   # TLS | SSL | NONE
    SMTP_USER: str = ""            # your Gmail address
    SMTP_PASS: str = ""            # Gmail App Password
    SMTP_FROM_NAME: str = "HireFlow AI"
    SMTP_FROM_EMAIL: str = ""      # same as SMTP_USER usually

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_S3_BUCKET: str = "hireflow-resumes"
    AWS_REGION: str = "ap-south-1"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# Debug print to verify loading
if not settings.GROQ_API_KEY:
    print("⚠ WARNING: GROQ_API_KEY is empty! Check .env file.")
else:
    print(f"✓ GROQ_API_KEY loaded successfully (length: {len(settings.GROQ_API_KEY)})")
