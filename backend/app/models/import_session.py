from sqlalchemy import String, Text, Integer, Boolean, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional, Dict
from app.database import Base
import uuid

# queued → preprocessing → noise_removal → block_detection → ai_extraction
# → deduplication → saving → completed | failed | cancelled
STAGES = [
    ("queued", "Queued"),
    ("preprocessing", "Preprocessing text"),
    ("noise_removal", "Removing noise"),
    ("block_detection", "Finding job blocks"),
    ("ai_extraction", "AI extraction & validation"),
    ("deduplication", "Duplicate check"),
    ("saving", "Saving jobs"),
    ("completed", "Completed"),
]


class ImportSession(Base):
    """One background import run — progress survives refresh/restart because it lives in DB."""
    __tablename__ = "import_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)

    raw_text: Mapped[str] = mapped_column(Text)                      # kept for retry
    source: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)

    # real progress counters — no fake percentages
    total_blocks: Mapped[int] = mapped_column(Integer, default=0)
    processed_blocks: Mapped[int] = mapped_column(Integer, default=0)
    stats: Mapped[Optional[Dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
