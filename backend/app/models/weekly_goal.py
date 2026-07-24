from sqlalchemy import String, Integer, Boolean, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, date, timezone
from typing import Optional
from app.database import Base
import uuid


class WeeklyGoal(Base):
    """A self-set weekly career goal — progress is computed from real data
    (applications sent, ATS history, skills learned), not tracked manually."""
    __tablename__ = "weekly_goals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)

    goal_type: Mapped[str] = mapped_column(String(20))  # apply_jobs | learn_skill | improve_ats | custom
    label: Mapped[str] = mapped_column(String(200))
    target: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)   # e.g. 20 for "apply to 20 jobs"
    skill: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # for learn_skill goals
    week_start: Mapped[date] = mapped_column(Date, index=True)  # Monday of the ISO week this goal belongs to
    completed: Mapped[bool] = mapped_column(Boolean, default=False)  # manual override for custom goals

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
