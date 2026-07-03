from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.template import EmailTemplate
from app.utils.auth import get_current_user

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateCreate(BaseModel):
    name: str
    category: str
    subject: str
    body: str


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None


@router.get("/")
async def list_templates(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(EmailTemplate).where(EmailTemplate.user_id == user.id).order_by(EmailTemplate.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    t = EmailTemplate(user_id=user.id, **body.model_dump())
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@router.patch("/{tid}")
async def update_template(
    tid: str,
    body: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(EmailTemplate).where(EmailTemplate.id == tid, EmailTemplate.user_id == user.id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/{tid}", status_code=204)
async def delete_template(tid: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(EmailTemplate).where(EmailTemplate.id == tid, EmailTemplate.user_id == user.id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(t)
    await db.commit()
