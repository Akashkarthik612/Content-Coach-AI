from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.analytics.schemas import LoggablePostOption, PostPerformanceRecord, PostRankingRecord
from backend.vault.models import Post, PostAnalytics, PostPublishLog


class AnalyticsRepository:
    """The only place SQL happens for the analytics feature."""

    async def get_records(
        self,
        db: AsyncSession,
        user_id: UUID,
        start_date: datetime,
        end_date: datetime,
    ) -> list[PostPerformanceRecord]:
        stmt = (
            select(
                PostAnalytics.post_id,
                PostPublishLog.published_at,
                PostPublishLog.platform,
                PostAnalytics.impressions,
                PostAnalytics.reactions,
                PostAnalytics.comments,
            )
            .join(PostPublishLog, PostPublishLog.post_id == PostAnalytics.post_id)
            .where(
                PostAnalytics.user_id == user_id,
                PostPublishLog.published_at.between(start_date, end_date),
            )
        )
        result = await db.execute(stmt)
        return [
            PostPerformanceRecord(
                post_id=row.post_id,
                published_at=row.published_at,
                platform=row.platform,
                impressions=row.impressions,
                reactions=row.reactions,
                comments=row.comments,
            )
            for row in result.all()
        ]

    async def get_post_rankings(
        self,
        db: AsyncSession,
        user_id: UUID,
        start_date: datetime,
        end_date: datetime,
    ) -> list[PostRankingRecord]:
        """One row per post — DISTINCT ON (post_id), keeping the most recent
        publish_log row in the window. Unlike get_records(), a republished
        post must not occupy two ranking slots."""
        stmt = (
            select(
                PostAnalytics.post_id,
                Post.title,
                PostPublishLog.published_at,
                PostPublishLog.platform,
                PostAnalytics.impressions,
                PostAnalytics.reactions,
                PostAnalytics.comments,
            )
            .distinct(PostAnalytics.post_id)
            .join(PostPublishLog, PostPublishLog.post_id == PostAnalytics.post_id)
            .join(Post, Post.id == PostAnalytics.post_id)
            .where(
                PostAnalytics.user_id == user_id,
                PostPublishLog.published_at.between(start_date, end_date),
            )
            .order_by(PostAnalytics.post_id, PostPublishLog.published_at.desc())
        )
        result = await db.execute(stmt)
        return [
            PostRankingRecord(
                post_id=row.post_id,
                title=row.title,
                published_at=row.published_at,
                platform=row.platform,
                impressions=row.impressions,
                reactions=row.reactions,
                comments=row.comments,
            )
            for row in result.all()
        ]

    async def get_loggable_posts(
        self, db: AsyncSession, user_id: UUID, limit: int = 50
    ) -> list[LoggablePostOption]:
        """Every one of the user's vault posts (not just already-published
        ones) — the Log-metrics dropdown needs drafts too, so a post pasted
        into the vault but never published through Honne can be backfilled
        (see ExternalPostLogCreate.post_id). published_at is the most recent
        publish_log row if one exists, else None. Ordered by whichever is
        more recent: last publish, or last edit (so freshly-pasted drafts
        show up near the top too, not just already-tracked posts)."""
        latest_publish = (
            select(
                PostPublishLog.post_id,
                func.max(PostPublishLog.published_at).label("published_at"),
            )
            .group_by(PostPublishLog.post_id)
            .subquery()
        )
        stmt = (
            select(Post.id, Post.title, latest_publish.c.published_at)
            .outerjoin(latest_publish, latest_publish.c.post_id == Post.id)
            .where(Post.user_id == user_id)
            .order_by(func.coalesce(latest_publish.c.published_at, Post.updated_at).desc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        return [
            LoggablePostOption(post_id=row.id, title=row.title, published_at=row.published_at)
            for row in result.all()
        ]
