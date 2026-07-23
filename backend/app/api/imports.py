"""Background import sessions: start, live status, history, cancel, retry, publish."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.job import Job
from app.models.import_session import ImportSession, STAGES
from app.utils.auth import require_admin
from app.services.import_service import spawn_import

router = APIRouter(prefix="/imports", tags=["imports"])

STAGE_ORDER = [s[0] for s in STAGES]
STAGE_LABELS = dict(STAGES)


class StartRequest(BaseModel):
    text: str


def _serialize(s: ImportSession) -> dict:
    # Real percent from real counters: fixed weight for pre-stages, extraction dominates
    pre = {"queued": 0, "preprocessing": 4, "noise_removal": 8, "block_detection": 12}
    if s.status in pre:
        pct = pre[s.status]
    elif s.status == "ai_extraction":
        frac = (s.processed_blocks / s.total_blocks) if s.total_blocks else 0
        pct = 12 + round(frac * 78)
    elif s.status == "deduplication":
        pct = 92
    elif s.status == "saving":
        pct = 96
    elif s.status == "completed":
        pct = 100
    else:  # failed / cancelled
        pct = 100
    return {
        "id": s.id,
        "status": s.status,
        "stage_label": STAGE_LABELS.get(s.status, s.status.title()),
        "stages": STAGE_ORDER,
        "percent": pct,
        "total_blocks": s.total_blocks,
        "processed_blocks": s.processed_blocks,
        "stats": s.stats or {},
        "error": s.error,
        "source": s.source,
        "created_at": s.created_at,
        "started_at": s.started_at,
        "finished_at": s.finished_at,
    }


@router.post("/start")
async def start_import(body: StartRequest, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    if not body.text.strip():
        raise HTTPException(400, "No text provided")
    running = (await db.execute(
        select(func.count(ImportSession.id)).where(
            ImportSession.user_id == user.id,
            ImportSession.status.notin_(("completed", "failed", "cancelled")),
        )
    )).scalar() or 0
    if running >= 2:
        raise HTTPException(429, "Two imports already running — wait for one to finish")
    s = ImportSession(user_id=user.id, raw_text=body.text, status="queued")
    db.add(s)
    await db.commit()
    await db.refresh(s)
    spawn_import(s.id)
    return {"import_id": s.id, "status": "queued"}


@router.get("/")
async def history(db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    rows = (await db.execute(
        select(ImportSession).where(ImportSession.user_id == user.id)
        .order_by(ImportSession.created_at.desc()).limit(25)
    )).scalars().all()
    return [_serialize(s) for s in rows]


@router.get("/{sid}/status")
async def status(sid: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    s = (await db.execute(select(ImportSession).where(
        ImportSession.id == sid, ImportSession.user_id == user.id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Import session not found")
    return _serialize(s)


@router.post("/{sid}/cancel")
async def cancel(sid: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    s = (await db.execute(select(ImportSession).where(
        ImportSession.id == sid, ImportSession.user_id == user.id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Import session not found")
    if s.status in ("completed", "failed", "cancelled"):
        raise HTTPException(400, f"Already {s.status}")
    s.cancel_requested = True
    await db.commit()
    return {"status": "cancel_requested"}


@router.post("/{sid}/retry")
async def retry(sid: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    s = (await db.execute(select(ImportSession).where(
        ImportSession.id == sid, ImportSession.user_id == user.id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Import session not found")
    if s.status not in ("failed", "cancelled"):
        raise HTTPException(400, "Only failed/cancelled imports can be retried")
    s.status = "queued"
    s.error = None
    s.cancel_requested = False
    s.processed_blocks = 0
    s.total_blocks = 0
    s.stats = None
    s.finished_at = None
    await db.commit()
    spawn_import(s.id)
    return {"import_id": s.id, "status": "queued"}


@router.get("/{sid}/jobs")
async def session_jobs(sid: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    rows = (await db.execute(select(Job).where(
        Job.user_id == user.id, Job.import_session_id == sid))).scalars().all()
    return rows


class ReviewRequest(BaseModel):
    decision: str  # approved | rejected
    job_ids: list[str] | None = None  # None = whole session


@router.post("/{sid}/review")
async def review(sid: str, body: ReviewRequest, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    """Publish (or reject) pending jobs from a session — jobs go live only here."""
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be approved|rejected")
    conditions = [Job.user_id == user.id, Job.import_session_id == sid, Job.review_status == "pending_review"]
    if body.job_ids:
        conditions.append(Job.id.in_(body.job_ids))
    rows = (await db.execute(select(Job).where(*conditions))).scalars().all()
    for j in rows:
        j.review_status = body.decision
    await db.commit()
    return {"updated": len(rows), "decision": body.decision}
