from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "HireFlow AI"
    DEBUG: bool = True
    SECRET_KEY: str = "changeme-use-a-long-random-secret-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    # SQLite by default; override with PostgreSQL URL on Render
    DATABASE_URL: str = "sqlite+aiosqlite:///./hireflow.db"

    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_S3_BUCKET: str = "hireflow-resumes"
    AWS_REGION: str = "ap-south-1"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://*.vercel.app",
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
