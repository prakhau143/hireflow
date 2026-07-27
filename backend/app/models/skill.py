from sqlalchemy import String, Integer, Boolean, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional
from app.database import Base
import uuid


class Skill(Base):
    """Skills taxonomy for job matching and custom job creation."""
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # frontend|backend|devops|design|soft_skills
    synonyms: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Comma-separated synonyms
    is_popular: Mapped[bool] = mapped_column(Boolean, default=False)  # Show in quick select
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
