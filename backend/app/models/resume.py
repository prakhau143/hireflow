from sqlalchemy import String, Integer, Text, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional, List
from app.database import Base
import uuid


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)

    name: Mapped[str] = mapped_column(String(200))
    file_url: Mapped[str] = mapped_column(String(1000))
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # AI Analysis
    ats_score: Mapped[int] = mapped_column(Integer, default=0)
    missing_keywords: Mapped[List[str]] = mapped_column(JSON, default=list)
    strong_skills: Mapped[List[str]] = mapped_column(JSON, default=list)
    weak_sections: Mapped[List[str]] = mapped_column(JSON, default=list)
    missing_projects: Mapped[List] = mapped_column(JSON, default=list)
    missing_certifications: Mapped[List[str]] = mapped_column(JSON, default=list)
    skill_gaps: Mapped[List[str]] = mapped_column(JSON, default=list)
    suggestions: Mapped[List[str]] = mapped_column(JSON, default=list)

    # Resume Intelligence V2
    section_scores: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)       # keyword_density, experience_quality, ...
    role_recommendations: Mapped[Optional[List]] = mapped_column(JSON, nullable=True) # [{role, match, reason}]
    ats_history: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)          # [{date, score}] — every analysis appends

    # Resume Intelligence Engine — deep structured extraction
    contact_info: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)          # {name, phone, email, location}
    education: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)             # [{college, degree, cgpa, year}]
    experience_entries: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)    # [{company, role, start, end, current, duration, responsibilities}]
    projects_extracted: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)    # [{name, description, tech, github, live}]
    certificates_extracted: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)  # [{name, issuer}]
    skill_intelligence: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)    # [{skill, category, years, confidence, last_used}]
    github_detected: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    linkedin_detected: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    portfolio_detected: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    total_experience_computed: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # e.g. "3 Years 4 Months" — pure date arithmetic, no AI
    achievements: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)     # quantified bullet points, extracted verbatim
    languages_spoken: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True) # e.g. ["English", "Hindi"]
    # Confidence-scored onboarding-relevant fields — {field: {"value": ..., "confidence": 0-100}}
    # so onboarding can auto-accept >=80% and prompt "Is this correct?" below that.
    onboarding_fields: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
