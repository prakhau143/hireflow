from sqlalchemy import String, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from app.database import Base
import uuid


class SmtpConfig(Base):
    __tablename__ = "smtp_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)

    host: Mapped[str] = mapped_column(String(255))
    port: Mapped[int] = mapped_column(Integer, default=587)
    username: Mapped[str] = mapped_column(String(255))
    password_encrypted: Mapped[str] = mapped_column(String(500))
    from_name: Mapped[str] = mapped_column(String(100))
    from_email: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_tested: Mapped[str | None] = mapped_column(String(50), nullable=True)
    test_status: Mapped[str | None] = mapped_column(String(20), nullable=True)  # success|failed

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
