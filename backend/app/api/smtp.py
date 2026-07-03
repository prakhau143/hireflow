from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.user import User
from app.models.smtp import SmtpConfig
from app.utils.auth import get_current_user
from datetime import datetime, timezone
import smtplib

router = APIRouter(prefix="/smtp", tags=["smtp"])


class SmtpCreate(BaseModel):
    host: str
    port: int = 587
    username: str
    password: str
    from_name: str
    from_email: str


class SmtpOut(BaseModel):
    id: str
    host: str
    port: int
    username: str
    from_name: str
    from_email: str
    is_active: bool
    last_tested: datetime | None
    test_status: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[SmtpOut])
async def list_smtp(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(SmtpConfig).where(SmtpConfig.user_id == user.id))
    return result.scalars().all()


@router.post("/", response_model=SmtpOut, status_code=status.HTTP_201_CREATED)
async def create_smtp(body: SmtpCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    smtp = SmtpConfig(
        user_id=user.id,
        host=body.host,
        port=body.port,
        username=body.username,
        password_encrypted=body.password,  # encrypt in prod
        from_name=body.from_name,
        from_email=body.from_email,
    )
    db.add(smtp)
    await db.commit()
    await db.refresh(smtp)
    return smtp


@router.post("/{smtp_id}/test")
async def test_smtp(smtp_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(SmtpConfig).where(SmtpConfig.id == smtp_id, SmtpConfig.user_id == user.id))
    smtp = result.scalar_one_or_none()
    if not smtp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SMTP config not found")

    try:
        server = smtplib.SMTP(smtp.host, smtp.port, timeout=10)
        server.starttls()
        server.login(smtp.username, smtp.password_encrypted)
        server.quit()
        smtp.test_status = "success"
        smtp.last_tested = datetime.now(timezone.utc)
        await db.commit()
        return {"status": "success", "message": "SMTP connection successful"}
    except Exception as e:
        smtp.test_status = "failed"
        smtp.last_tested = datetime.now(timezone.utc)
        await db.commit()
        return {"status": "failed", "message": str(e)}
