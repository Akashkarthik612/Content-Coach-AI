from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from backend.analytics.calculator import AnalyticsCalculator
from backend.analytics.repository import AnalyticsRepository
from backend.analytics.schemas import (
    AnalyticsRankingsResponse,
    KPIResponse,
    LoggablePostOption,
    PeriodEnum,
    PostRankingRecord,
    PostRankingResponse,
)
from backend.core.cache import (
    _ANALYTICS_TTL,
    analytics_kpi_key,
    analytics_rankings_key,
    async_get_json,
    async_set_json,
)

_DEFAULT_RANKING_LIMIT = 10

# Fixed lookback windows. Previous-period comparison and calendar-aligned
# (week/month/year-to-date) resolution are out of scope for this phase.
_PERIOD_DAYS: dict[PeriodEnum, int] = {
    PeriodEnum.WEEKLY: 7,
    PeriodEnum.MONTHLY: 30,
    PeriodEnum.YEARLY: 365,
}


class AnalyticsService:
    def __init__(self, repository: AnalyticsRepository):
        self.repository = repository

    async def get_kpis(self, db: AsyncSession, user_id: UUID, period: PeriodEnum) -> KPIResponse:
        cache_key = analytics_kpi_key(str(user_id), period.value)
        if (cached := await async_get_json(cache_key)) is not None:
            return KPIResponse(**cached)

        end_date = datetime.now(timezone.utc)
        period_days = _PERIOD_DAYS[period]
        start_date = end_date - timedelta(days=period_days)

        records = await self.repository.get_records(db, user_id, start_date, end_date)

        response = KPIResponse(
            avg_impressions=AnalyticsCalculator.avg_impressions(records),
            avg_reactions=AnalyticsCalculator.avg_reactions(records),
            avg_comments=AnalyticsCalculator.avg_comments(records),
            engagement_rate=AnalyticsCalculator.engagement_rate(records),
            total_posts=AnalyticsCalculator.total_posts(records),
            posting_cadence=AnalyticsCalculator.posting_cadence(records, round(period_days / 7)),
        )
        await async_set_json(cache_key, response.model_dump(mode="json"), ttl=_ANALYTICS_TTL)
        return response

    async def get_top_posts(
        self, db: AsyncSession, user_id: UUID, period: PeriodEnum, limit: int = _DEFAULT_RANKING_LIMIT
    ) -> list[PostRankingResponse]:
        return await self._get_rankings(db, user_id, period, limit, descending=True)

    async def get_bottom_posts(
        self, db: AsyncSession, user_id: UUID, period: PeriodEnum, limit: int = _DEFAULT_RANKING_LIMIT
    ) -> list[PostRankingResponse]:
        return await self._get_rankings(db, user_id, period, limit, descending=False)

    async def _get_rankings(
        self, db: AsyncSession, user_id: UUID, period: PeriodEnum, limit: int, descending: bool
    ) -> list[PostRankingResponse]:
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=_PERIOD_DAYS[period])

        records = await self.repository.get_post_rankings(db, user_id, start_date, end_date)
        ranked = AnalyticsCalculator.rank_posts(records, descending=descending, limit=limit)
        return [self._to_ranking_response(r) for r in ranked]

    async def get_rankings_dashboard(
        self, db: AsyncSession, user_id: UUID, period: PeriodEnum, limit: int = _DEFAULT_RANKING_LIMIT
    ) -> AnalyticsRankingsResponse:
        """Top-N, bottom-N, and best posting day/hour all derived from ONE
        get_post_rankings() fetch — avoids three near-identical queries for
        one page load."""
        cache_key = analytics_rankings_key(str(user_id), period.value)
        if (cached := await async_get_json(cache_key)) is not None:
            return AnalyticsRankingsResponse(**cached)

        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=_PERIOD_DAYS[period])
        records = await self.repository.get_post_rankings(db, user_id, start_date, end_date)

        top = AnalyticsCalculator.rank_posts(records, descending=True, limit=limit)
        bottom = AnalyticsCalculator.rank_posts(records, descending=False, limit=limit)

        response = AnalyticsRankingsResponse(
            top=[self._to_ranking_response(r) for r in top],
            bottom=[self._to_ranking_response(r) for r in bottom],
            best_day=AnalyticsCalculator.best_posting_day(records),
            best_hour=AnalyticsCalculator.best_posting_hour(records),
        )
        await async_set_json(cache_key, response.model_dump(mode="json"), ttl=_ANALYTICS_TTL)
        return response

    async def get_loggable_posts(self, db: AsyncSession, user_id: UUID) -> list[LoggablePostOption]:
        """Not cached — must reflect a just-created external/backfilled post
        immediately after save, and it's a cheap query."""
        return await self.repository.get_loggable_posts(db, user_id)

    @staticmethod
    def _to_ranking_response(record: PostRankingRecord) -> PostRankingResponse:
        return PostRankingResponse(
            post_id=record.post_id,
            title=record.title,
            published_at=record.published_at,
            platform=record.platform,
            impressions=record.impressions,
            reactions=record.reactions,
            comments=record.comments,
            engagement_rate=AnalyticsCalculator.post_engagement_rate(record),
        )
