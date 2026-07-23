from sqlalchemy import String, Text, ForeignKey, Boolean, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional, Dict
from app.database import Base
import uuid


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)

    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(100))
    subject: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)

    is_default: Mapped[bool] = mapped_column(Boolean, default=False)          # seeded library template
    ai_personalization: Mapped[bool] = mapped_column(Boolean, default=True)   # AI rewrites body per job
    attachments: Mapped[Optional[Dict]] = mapped_column(JSON, nullable=True)  # {resume,portfolio,github,linkedin,cover_letter}
    times_used: Mapped[int] = mapped_column(Integer, default=0)
    success_count: Mapped[int] = mapped_column(Integer, default=0)            # replies/interviews attributed

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )
