from sqlalchemy import String, Integer, Float, Boolean, Text, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional, List
from app.database import Base
import uuid


class Job(Base):
    """A globally-visible job posting. Holds posting facts only — anything that
    differs per viewer (match score, applied/archived status, AI coach analysis)
    lives on UserJobMatch instead, since every approved job is shown to every user."""
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)  # imported by (admin)

    title: Mapped[str] = mapped_column(String(200))
    company: Mapped[str] = mapped_column(String(200))
    company_logo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    company_website: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    company_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # Startup|MNC|SME|Product|Service
    industry: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    hiring_manager: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    recruiter_linkedin: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    location: Mapped[str] = mapped_column(String(200), default="")
    location_type: Mapped[str] = mapped_column(String(20), default="onsite")  # remote|hybrid|onsite|wfa
    job_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Float, not Integer — month-based requirements ("6 Months") store as fractional
    # years (0.5). SQLite's type affinity already stores these correctly on the
    # existing on-disk column (verified empirically), so no migration is needed.
    experience_min: Mapped[float] = mapped_column(Float, default=0)
    experience_max: Mapped[float] = mapped_column(Float, default=5)

    skills: Mapped[List[str]] = mapped_column(JSON, default=list)
    description: Mapped[str] = mapped_column(Text, default="")
    requirements: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    responsibilities: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    benefits: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_linkedin: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    posted_date: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    source: Mapped[str] = mapped_column(String(100), default="LinkedIn")

    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # job-intrinsic blurb, same for every viewer
    smart_tags: Mapped[List[str]] = mapped_column(JSON, default=list)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    freshness_score: Mapped[int] = mapped_column(Integer, default=0)

    salary: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    employment_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # Full Time|Internship|Contract|Part Time
    confidence_score: Mapped[int] = mapped_column(Integer, default=0)
    apply_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Multiple application method flags - allows jobs to have multiple contact methods
    has_email: Mapped[bool] = mapped_column(Boolean, default=False)
    has_google_form: Mapped[bool] = mapped_column(Boolean, default=False)
    has_company_portal: Mapped[bool] = mapped_column(Boolean, default=False)
    has_linkedin: Mapped[bool] = mapped_column(Boolean, default=False)
    has_phone: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Primary application method - determines Apply All behavior (priority: EMAIL > GOOGLE_FORM > PORTAL > LINKEDIN > PHONE > NO_CONTACT)
    primary_application_method: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)  # email|google_form|portal|linkedin|phone|no_contact
    
    # Legacy field for backward compatibility - deprecated, use primary_application_method instead
    application_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Review gate: imports stay pending until an admin approves. NULL = legacy/manual rows (treated as approved).
    review_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)  # pending_review|approved|rejected
    import_session_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    duplicate_reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    validation_warnings: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)
    confidence_reasons: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)  # AI confidence scoring reasons

    # Lifecycle management: jobs expire → archive → delete automatically
    lifecycle_status: Mapped[str] = mapped_column(String(20), default="active", index=True)  # active|expired|archived|deleted
    expires_at: Mapped[Optional[datetime]] = mapped_column(nullable=True, index=True)
    archived_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    
    # Publication status for custom jobs
    publication_status: Mapped[str] = mapped_column(String(20), default="published", index=True)  # draft|published|scheduled|expired
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
