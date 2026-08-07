from collections import defaultdict
from typing import Optional

from backend.analytics.schemas import PostPerformanceRecord, PostRankingRecord

_WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


class AnalyticsCalculator:
    """Pure KPI math over PostPerformanceRecord lists — no DB access, no I/O."""

    @staticmethod
    def avg_impressions(records: list[PostPerformanceRecord]) -> float:
        if not records:
            return 0.0
        return sum(r.impressions for r in records) / len(records)

    @staticmethod
    def avg_reactions(records: list[PostPerformanceRecord]) -> float:
        if not records:
            return 0.0
        return sum(r.reactions for r in records) / len(records)

    @staticmethod
    def avg_comments(records: list[PostPerformanceRecord]) -> float:
        if not records:
            return 0.0
        return sum(r.comments for r in records) / len(records)

    @staticmethod
    def total_posts(records: list[PostPerformanceRecord]) -> int:
        return len(records)

    @staticmethod
    def posting_cadence(records: list[PostPerformanceRecord], period_weeks: int) -> float:
        if period_weeks == 0:
            return 0.0
        return len(records) / period_weeks

    @staticmethod
    def engagement_rate(records: list[PostPerformanceRecord]) -> float:
        total_impressions = sum(r.impressions for r in records)
        if total_impressions == 0:
            return 0.0
        total_engagement = sum(r.reactions for r in records) + sum(r.comments for r in records)
        return total_engagement / total_impressions * 100

    @staticmethod
    def post_engagement_rate(record: PostPerformanceRecord) -> float:
        if record.impressions == 0:
            return 0.0
        return (record.reactions + record.comments) / record.impressions * 100

    @staticmethod
    def rank_posts(
        records: list[PostRankingRecord], descending: bool, limit: int
    ) -> list[PostRankingRecord]:
        """Sort by per-post engagement rate. descending=True -> top performers,
        descending=False -> bottom performers."""
        return sorted(
            records,
            key=AnalyticsCalculator.post_engagement_rate,
            reverse=descending,
        )[:limit]

    @staticmethod
    def best_posting_day(records: list[PostRankingRecord]) -> Optional[str]:
        """Buckets by published_at.weekday() (UTC — no per-user timezone
        exists yet), returns the weekday name with the highest mean
        post_engagement_rate. None on empty input."""
        if not records:
            return None
        buckets: dict[int, list[float]] = defaultdict(list)
        for r in records:
            buckets[r.published_at.weekday()].append(AnalyticsCalculator.post_engagement_rate(r))
        best_day = max(buckets, key=lambda day: sum(buckets[day]) / len(buckets[day]))
        return _WEEKDAY_NAMES[best_day]

    @staticmethod
    def best_posting_hour(records: list[PostRankingRecord]) -> Optional[int]:
        """Same bucketing by published_at.hour (0-23, UTC). None on empty input."""
        if not records:
            return None
        buckets: dict[int, list[float]] = defaultdict(list)
        for r in records:
            buckets[r.published_at.hour].append(AnalyticsCalculator.post_engagement_rate(r))
        return max(buckets, key=lambda hour: sum(buckets[hour]) / len(buckets[hour]))
