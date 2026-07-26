from sqlalchemy import String, Integer, Float, Boolean, Text, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional, List
from app.database import Base
import uuid


class UserJobMatch(Base):
    """One user's personalized view of one global job: their match score, status,
    and AI analysis for it. Job itself only holds posting facts — everything that
    differs per viewer lives here, since two users can't share one 'applied' status
    or one match score on the same globally-visible job."""
    __tablename__ = "user_job_matches"
    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_user_job"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id", ondelete="CASCADE"), index=True)

    # 100-point matching engine outputs (see matching_service.compute_match)
    match_score: Mapped[float] = mapped_column(Float, default=0.0)
    matched_skills: Mapped[List[str]] = mapped_column(JSON, default=list)
    missing_skills: Mapped[List[str]] = mapped_column(JSON, default=list)
    match_tier: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    experience_badge: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    match_breakdown: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)
    score_suggestions: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)
    is_recommended: Mapped[bool] = mapped_column(Boolean, default=False)

    # Per-user AI job-detail analysis (why_match, cover_letter, interview_questions, ...)
    ai_analysis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # new|applied|archived|shortlisted — this user's relationship to the job
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)
    archive_reason: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # low_match|missing_experience|missing_skills|expired
    emails_generated: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
