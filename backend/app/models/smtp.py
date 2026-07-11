from sqlalchemy import String, Integer, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional
from app.database import Base
import uuid


class SmtpConfig(Base):
    __tablename__ = "smtp_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)

    provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # gmail, outlook, yahoo, zoho, custom
    host: Mapped[str] = mapped_column(String(255))
    port: Mapped[int] = mapped_column(Integer, default=587)
    encryption: Mapped[str] = mapped_column(String(10), default="TLS")  # TLS, SSL, None
    username: Mapped[str] = mapped_column(String(255))
    password_encrypted: Mapped[str] = mapped_column(String(500))
    from_name: Mapped[str] = mapped_column(String(100))
    from_email: Mapped[str] = mapped_column(String(255))
    reply_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Connection health
    last_tested: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    test_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # success|failed
    connection_health: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0-100
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Email analytics
    emails_sent: Mapped[int] = mapped_column(Integer, default=0)
    emails_failed: Mapped[int] = mapped_column(Integer, default=0)
    last_sent: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
