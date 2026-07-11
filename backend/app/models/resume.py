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

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
