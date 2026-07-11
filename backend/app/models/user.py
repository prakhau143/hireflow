from sqlalchemy import String, Boolean, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional, List
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
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
