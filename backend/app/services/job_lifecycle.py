"""
Job Lifecycle Management Service

Handles automatic cleanup of imported jobs through a three-stage lifecycle:
1. Active → Expired (after JOB_EXPIRY_DAYS)
2. Expired → Archived (after EXPIRE_TO_ARCHIVE_DAYS)
3. Archived → Deleted (after ARCHIVE_TO_DELETE_DAYS)

This service should be called periodically (e.g., daily via cron or scheduled task).
"""
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.job import Job


# Configuration constants (can be moved to config.py if needed)
JOB_EXPIRY_DAYS = 30          # Jobs expire after 30 days
EXPIRE_TO_ARCHIVE_DAYS = 7    # Expired jobs are archived after 7 days
ARCHIVE_TO_DELETE_DAYS = 30   # Archived jobs are deleted after 30 days


async def expire_old_jobs(db: AsyncSession) -> dict:
    """
    Mark active jobs as expired if they're older than JOB_EXPIRY_DAYS.
    Sets expires_at to now and lifecycle_status to 'expired'.
    """
    expiry_threshold = datetime.now(timezone.utc) - timedelta(days=JOB_EXPIRY_DAYS)
    
    result = await db.execute(
        select(Job).where(
            Job.lifecycle_status == "active",
            Job.created_at < expiry_threshold
        )
    )
    jobs_to_expire = result.scalars().all()
    
    count = 0
    for job in jobs_to_expire:
        job.lifecycle_status = "expired"
        job.expires_at = datetime.now(timezone.utc)
        count += 1
    
    await db.commit()
    
    return {
        "action": "expire",
        "count": count,
        "threshold_days": JOB_EXPIRY_DAYS,
    }


async def archive_expired_jobs(db: AsyncSession) -> dict:
    """
    Archive expired jobs that have been expired for more than EXPIRE_TO_ARCHIVE_DAYS.
    Sets archived_at to now and lifecycle_status to 'archived'.
    """
    archive_threshold = datetime.now(timezone.utc) - timedelta(days=EXPIRE_TO_ARCHIVE_DAYS)
    
    result = await db.execute(
        select(Job).where(
            Job.lifecycle_status == "expired",
            Job.expires_at < archive_threshold
        )
    )
    jobs_to_archive = result.scalars().all()
    
    count = 0
    for job in jobs_to_archive:
        job.lifecycle_status = "archived"
        job.archived_at = datetime.now(timezone.utc)
        count += 1
    
    await db.commit()
    
    return {
        "action": "archive",
        "count": count,
        "threshold_days": EXPIRE_TO_ARCHIVE_DAYS,
    }


async def delete_archived_jobs(db: AsyncSession) -> dict:
    """
    Permanently delete archived jobs that have been archived for more than ARCHIVE_TO_DELETE_DAYS.
    This is irreversible.
    """
    delete_threshold = datetime.now(timezone.utc) - timedelta(days=ARCHIVE_TO_DELETE_DAYS)
    
    result = await db.execute(
        delete(Job).where(
            Job.lifecycle_status == "archived",
            Job.archived_at < delete_threshold
        )
    )
    
    count = result.rowcount
    await db.commit()
    
    return {
        "action": "delete",
        "count": count,
        "threshold_days": ARCHIVE_TO_DELETE_DAYS,
    }


async def run_lifecycle_cleanup(db: AsyncSession) -> dict:
    """
    Run the complete lifecycle cleanup pipeline:
    1. Expire old active jobs
    2. Archive expired jobs
    3. Delete archived jobs
    
    Returns a summary of all actions taken.
    """
    expire_result = await expire_old_jobs(db)
    archive_result = await archive_expired_jobs(db)
    delete_result = await delete_archived_jobs(db)
    
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actions": [expire_result, archive_result, delete_result],
        "total_processed": expire_result["count"] + archive_result["count"] + delete_result["count"],
    }


async def get_lifecycle_stats(db: AsyncSession) -> dict:
    """
    Get statistics about jobs in each lifecycle stage.
    Useful for monitoring and dashboards.
    """
    stats = {}
    
    for status in ["active", "expired", "archived"]:
        result = await db.execute(
            select(Job).where(Job.lifecycle_status == status)
        )
        count = len(result.scalars().all())
        stats[status] = count
    
    return stats
