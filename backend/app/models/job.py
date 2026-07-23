from sqlalchemy import String, Integer, Float, Boolean, Text, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional, List
from app.database import Base
import uuid


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)

    title: Mapped[str] = mapped_column(String(200))
    company: Mapped[str] = mapped_column(String(200))
    hiring_manager: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    location: Mapped[str] = mapped_column(String(200), default="")
    location_type: Mapped[str] = mapped_column(String(20), default="onsite")  # remote|hybrid|onsite
    experience_min: Mapped[int] = mapped_column(Integer, default=0)
    experience_max: Mapped[int] = mapped_column(Integer, default=5)

    skills: Mapped[List[str]] = mapped_column(JSON, default=list)
    description: Mapped[str] = mapped_column(Text, default="")
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_linkedin: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    posted_date: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    source: Mapped[str] = mapped_column(String(100), default="LinkedIn")

    # AI fields
    match_score: Mapped[float] = mapped_column(Float, default=0.0)
    matched_skills: Mapped[List[str]] = mapped_column(JSON, default=list)
    missing_skills: Mapped[List[str]] = mapped_column(JSON, default=list)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_analysis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    smart_tags: Mapped[List[str]] = mapped_column(JSON, default=list)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    freshness_score: Mapped[int] = mapped_column(Integer, default=0)

    salary: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    employment_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # Full Time|Internship|Contract|Part Time
    confidence_score: Mapped[int] = mapped_column(Integer, default=0)
    apply_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # email | google_form | linkedin | portal | phone | none — drives Apply All routing
    application_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Review gate: background-imported jobs stay pending until an admin approves.
    # NULL = legacy/manual rows (treated as approved).
    review_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)  # pending_review|approved|rejected
    import_session_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    duplicate_reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    validation_warnings: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)

    # 100-point matching engine outputs
    is_recommended: Mapped[bool] = mapped_column(Boolean, default=False)                # exp>75 & skills>65 & overall>80
    experience_badge: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)  # Perfect Experience Match | ...
    match_tier: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)        # Perfect Fit | Strong Fit | ...
    match_breakdown: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)        # [{key,label,score,max,available}]
    score_suggestions: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)      # [{skill,projected,gain}]

    status: Mapped[str] = mapped_column(String(20), default="new")  # new|applied|archived|shortlisted
    archive_reason: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # low_match|missing_experience|missing_skills|expired

    emails_generated: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
