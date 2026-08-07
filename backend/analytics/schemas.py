from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class PeriodEnum(str, Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class PostPerformanceRecord(BaseModel):
    post_id: UUID
    published_at: datetime
    platform: str
    impressions: int
    reactions: int
    comments: int


class KPIResponse(BaseModel):
    avg_impressions: float
    avg_reactions: float
    avg_comments: float
    engagement_rate: float
    total_posts: int
    posting_cadence: float


class PostRankingRecord(PostPerformanceRecord):
    """One row per post (deduped — see AnalyticsRepository.get_post_rankings),
    with the title needed to display it. Separate from PostPerformanceRecord
    so the KPI query/schema stays untouched."""
    title: str


class PostRankingResponse(BaseModel):
    post_id: UUID
    title: str
    published_at: datetime
    platform: str
    impressions: int
    reactions: int
    comments: int
    engagement_rate: float


class LoggablePostOption(BaseModel):
    """One of the user's vault posts, offered in the Log-metrics dropdown.
    published_at is None for a post that has never been backfilled/published
    through Honne (no post_publish_log row yet) — the frontend shows the
    date/platform fields for those and submits through POST /external-posts
    with post_id set (backfill branch), instead of the plain metrics-only
    PATCH used for posts that already have publish history."""
    post_id: UUID
    title: str
    published_at: Optional[datetime] = None


class AnalyticsRankingsResponse(BaseModel):
    top: list[PostRankingResponse]
    bottom: list[PostRankingResponse]
    best_day: Optional[str] = None
    best_hour: Optional[int] = None


class ExternalPostLogCreate(BaseModel):
    """Log metrics for a post with no publish history in Honne yet.

    post_id is None -> 'Published outside Honne': creates a brand-new
    synthetic Post/PostVersion/PostPublishLog/PostAnalytics.
    post_id is set -> backfill: the user already pasted/drafted this post in
    the vault; this attaches a PostPublishLog (using platform/published_at
    entered here) + PostAnalytics to that EXISTING post instead of creating
    a duplicate.

    The form's Type (original/repost) field has no backing column anywhere
    and is intentionally not accepted here."""
    post_id: Optional[UUID] = None
    title: str = ""
    platform: str = "linkedin"
    published_at: datetime
    impressions: int
    reactions: int
    comments: int


class ExternalPostLogResponse(BaseModel):
    post_id: UUID
    title: str
