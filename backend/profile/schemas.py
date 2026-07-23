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
    profession: Optional[str] = None
    industry: Optional[str] = None
    role: Optional[str] = None
    target_audience: Optional[str] = None
    writing_style: Optional[str] = None
    goals: Optional[list[str]] = None
    topics: Optional[list[str]] = None
    formatting_prefs: Optional[dict] = None
    linkedin_headline: Optional[str] = None
    linkedin_about: Optional[str] = None


class OnboardingSubmit(BaseModel):
    """All fields optional — every onboarding question (including all of them)
    can be skipped, unlike ProfileCreate's strict required-field contract."""

    profession: Optional[str] = None
    industry: Optional[str] = None
    role: Optional[str] = None
    target_audience: Optional[str] = None
    writing_style: Optional[str] = None
    goals: Optional[list[str]] = None
    topics: Optional[list[str]] = None


class ProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    profession: Optional[str]
    industry: Optional[str]
    role: Optional[str]
    target_audience: Optional[str]
    writing_style: Optional[str]
    goals: list[str]
    topics: list[str]
    formatting_prefs: dict
    linkedin_headline: Optional[str]
    linkedin_about: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
