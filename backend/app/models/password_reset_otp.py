from sqlalchemy import String, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional
from app.database import Base
import uuid


class PasswordResetOTP(Base):
    """Hashed, rate-limited, attempt-limited OTP for forgot-password — always sent
    via System SMTP (settings.SMTP_USER/PASS), never the user's own SMTP config."""
    __tablename__ = "password_reset_otps"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)

    otp_hash: Mapped[str] = mapped_column(String(255))  # bcrypt — the plain code is never stored
    expires_at: Mapped[datetime] = mapped_column()
    used: Mapped[bool] = mapped_column(Boolean, default=False)       # consumed (verified or burned)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)   # correct code was entered
    attempts: Mapped[int] = mapped_column(Integer, default=0)        # failed verify attempts
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
