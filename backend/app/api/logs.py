from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.activity_log import ActivityLog
from app.utils.auth import get_current_user

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/")
async def list_logs(
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.user_id == user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()
