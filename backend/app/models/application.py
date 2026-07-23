from sqlalchemy import String, Text, Integer, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional
from app.database import Base
import uuid


class Application(Base):
    """One outbound job application email — powers the queue, history and analytics."""
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    template_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    resume_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    to_email: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
    follow_up_draft: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # queued → sending → sent → failed  (opened/replied updated manually or later)
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retries: Mapped[int] = mapped_column(Integer, default=0)

    reply_probability: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reply_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    scheduled_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
