from sqlalchemy import String, Boolean, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional, List, Dict
from app.database import Base
import uuid


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="user")  # admin | user
    theme: Mapped[str] = mapped_column(String(10), default="dark")  # dark | light

    # Onboarding fields
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    linkedin_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    github_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    portfolio_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    years_experience: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    current_role: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    current_location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    skills: Mapped[List[str]] = mapped_column(JSON, default=list)
    preferred_roles: Mapped[List[str]] = mapped_column(JSON, default=list)
    preferred_locations: Mapped[List[str]] = mapped_column(JSON, default=list)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False)

    google_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    # Bumped by "Logout All Devices" — any JWT issued before the bump is rejected
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    # DB-driven sidebar access: list of nav keys the user may see; NULL = all defaults
    permissions: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)

    # ── Professional identity (Profile page) ─────────────────────────────────
    headline: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # e.g. "Backend Engineer | AI Automation Developer"
    current_company: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    expected_salary: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notice_period: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    employment_type_pref: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # Full Time|Contract|...
    remote_preference: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)     # Remote|Hybrid|Onsite|Flexible
    timezone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Extra social profiles beyond linkedin/github/portfolio
    leetcode_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    hackerrank_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    medium_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Structured collections (whole-array replace on save, like `skills`)
    skill_proficiency: Mapped[Optional[Dict]] = mapped_column(JSON, nullable=True)   # {"Python": {"level": 5, "years": 2}}
    experience_timeline: Mapped[Optional[List]] = mapped_column(JSON, nullable=True) # [{title, company, start, end, current, description}]
    projects: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)            # [{name, description, tech, github, demo}]
    certifications: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)      # [{name, issuer, year}]
    education: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)           # [{degree, institution, start, end, grade}]

    # Career goals — feeds the recommendation engine
    dream_companies: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)
    preferred_domains: Mapped[Optional[List]] = mapped_column(JSON, nullable=True)
    target_salary: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # AI-generated, cached (never re-billed unless user clicks Regenerate)
    ai_career_insights: Mapped[Optional[Dict]] = mapped_column(JSON, nullable=True)

    # ── Settings ──────────────────────────────────────────────────────────────
    notification_prefs: Mapped[Optional[Dict]] = mapped_column(JSON, nullable=True)
    ai_preferences: Mapped[Optional[Dict]] = mapped_column(JSON, nullable=True)      # {provider, tone}
    apply_preferences: Mapped[Optional[Dict]] = mapped_column(JSON, nullable=True)   # {auto_apply, min_match_score, daily_limit, skip_*}
    appearance_prefs: Mapped[Optional[Dict]] = mapped_column(JSON, nullable=True)    # {accent, animations, compact_mode}
    locale_prefs: Mapped[Optional[Dict]] = mapped_column(JSON, nullable=True)        # {language, country, date_format}

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
