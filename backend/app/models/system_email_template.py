from sqlalchemy import String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from app.database import Base
import uuid


class SystemEmailTemplate(Base):
    """Platform-to-user notification emails (welcome, OTP, application status, ...).
    Global/admin-managed — distinct from the per-user outreach EmailTemplate model,
    which powers the job-application emails a user sends to companies."""
    __tablename__ = "system_email_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type: Mapped[str] = mapped_column(String(50), unique=True, index=True)  # welcome|password_reset_otp|...
    name: Mapped[str] = mapped_column(String(200))
    subject: Mapped[str] = mapped_column(String(500))
    html_body: Mapped[str] = mapped_column(Text)  # {{variable}} placeholders, substituted at send time
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
