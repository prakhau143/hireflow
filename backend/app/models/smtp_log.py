from sqlalchemy import String, Integer, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional
from app.database import Base
import uuid


class SmtpLog(Base):
    __tablename__ = "smtp_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    smtp_id: Mapped[str] = mapped_column(String, ForeignKey("smtp_configs.id", ondelete="CASCADE"), index=True)

    action: Mapped[str] = mapped_column(String(50))  # connected, verified, test_sent, config_updated, email_sent, email_failed
    status: Mapped[str] = mapped_column(String(20))  # success, failed
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string for additional details

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
