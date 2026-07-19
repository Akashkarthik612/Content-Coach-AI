from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProfileCreate(BaseModel):
    industry: str
    role: str
    target_audience: str
    writing_style: str
    formatting_prefs: dict = Field(default_factory=dict)
    linkedin_headline: Optional[str] = None
    linkedin_about: Optional[str] = None


class ProfileUpdate(BaseModel):
    industry: Optional[str] = None
    role: Optional[str] = None
    target_audience: Optional[str] = None
    writing_style: Optional[str] = None
    formatting_prefs: Optional[dict] = None
    linkedin_headline: Optional[str] = None
    linkedin_about: Optional[str] = None


class ProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    industry: str
    role: str
    target_audience: str
    writing_style: str
    formatting_prefs: dict
    linkedin_headline: Optional[str]
    linkedin_about: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
