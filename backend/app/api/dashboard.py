from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.utils.auth import get_current_user, require_admin
from app.services import analytics_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """KPI numbers aggregated from real database rows."""
    return await analytics_service.dashboard_stats(db, user)


@router.get("/charts")
async def get_charts(
    days: int = Query(180, ge=1, le=730, description="Date range filter in days"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Chart datasets (match/experience distribution, skills, funnel, growth, trends...)."""
    return await analytics_service.dashboard_charts(db, user, days)


@router.get("/activity")
async def get_activity(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Paginated activity feed."""
    return await analytics_service.dashboard_activity(db, user, limit, offset)


@router.get("/insights")
async def get_insights(
    refresh: bool = Query(False, description="Bypass the 15-minute cache"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """AI-narrated hiring insights with deterministic rule-based fallback."""
    return await analytics_service.dashboard_insights(db, user, refresh)


@router.get("/admin")
async def get_admin_analytics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Platform-wide analytics for the admin user management dashboard."""
    return await analytics_service.admin_analytics(db)
