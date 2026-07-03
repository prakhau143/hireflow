from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class JobBase(BaseModel):
    title: str
    company: str
    location: str
    location_type: str = "onsite"
    experience_min: int = 0
    experience_max: int = 5
    skills: list[str] = []
    description: str = ""
    contact_email: Optional[str] = None
    contact_linkedin: Optional[str] = None
    contact_phone: Optional[str] = None
    source: str = "LinkedIn"
    source_url: Optional[str] = None


class JobCreate(JobBase):
    pass


class JobUpdate(BaseModel):
    status: Optional[str] = None
    archive_reason: Optional[str] = None


class JobOut(JobBase):
    id: str
    user_id: str
    match_score: float
    matched_skills: list[str]
    missing_skills: list[str]
    ai_summary: Optional[str]
    ai_analysis: Optional[str]
    smart_tags: list[str]
    is_duplicate: bool
    freshness_score: int
    status: str
    archive_reason: Optional[str]
    posted_date: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class JobFilter(BaseModel):
    search: Optional[str] = None
    search_by: Optional[str] = None
    experience: Optional[str] = None
    location_type: Optional[str] = None
    skills: Optional[list[str]] = None
    match_score: Optional[int] = None
    status: Optional[str] = None
