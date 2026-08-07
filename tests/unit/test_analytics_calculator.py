"""Unit tests for analytics/calculator.py — pure math, no DB, no fixtures, no mocking."""

import uuid
from datetime import datetime, timezone

from backend.analytics.calculator import AnalyticsCalculator
from backend.analytics.schemas import PostPerformanceRecord, PostRankingRecord


def _record(impressions: int = 0, reactions: int = 0, comments: int = 0) -> PostPerformanceRecord:
    return PostPerformanceRecord(
        post_id=uuid.uuid4(),
        published_at=datetime.now(timezone.utc),
        platform="linkedin",
        impressions=impressions,
        reactions=reactions,
        comments=comments,
    )


def _ranking_record(
    title: str,
    impressions: int = 0,
    reactions: int = 0,
    comments: int = 0,
    published_at: datetime | None = None,
) -> PostRankingRecord:
    return PostRankingRecord(
        post_id=uuid.uuid4(),
        title=title,
        published_at=published_at or datetime.now(timezone.utc),
        platform="linkedin",
        impressions=impressions,
        reactions=reactions,
        comments=comments,
    )


class TestAvgImpressions:
    def test_averages_across_records(self):
        records = [_record(impressions=100), _record(impressions=200), _record(impressions=300)]
        assert AnalyticsCalculator.avg_impressions(records) == 200.0

    def test_empty_list_returns_zero(self):
        assert AnalyticsCalculator.avg_impressions([]) == 0.0


class TestAvgReactions:
    def test_averages_across_records(self):
        records = [_record(reactions=10), _record(reactions=20)]
        assert AnalyticsCalculator.avg_reactions(records) == 15.0

    def test_empty_list_returns_zero(self):
        assert AnalyticsCalculator.avg_reactions([]) == 0.0


class TestAvgComments:
    def test_averages_across_records(self):
        records = [_record(comments=4), _record(comments=6)]
        assert AnalyticsCalculator.avg_comments(records) == 5.0

    def test_empty_list_returns_zero(self):
        assert AnalyticsCalculator.avg_comments([]) == 0.0


class TestTotalPosts:
    def test_counts_records(self):
        records = [_record(), _record(), _record()]
        assert AnalyticsCalculator.total_posts(records) == 3

    def test_empty_list_returns_zero(self):
        assert AnalyticsCalculator.total_posts([]) == 0


class TestPostingCadence:
    def test_divides_by_period_weeks(self):
        records = [_record(), _record(), _record(), _record()]
        assert AnalyticsCalculator.posting_cadence(records, period_weeks=4) == 1.0

    def test_zero_period_weeks_returns_zero(self):
        records = [_record()]
        assert AnalyticsCalculator.posting_cadence(records, period_weeks=0) == 0.0

    def test_empty_records_returns_zero(self):
        assert AnalyticsCalculator.posting_cadence([], period_weeks=4) == 0.0


class TestEngagementRate:
    def test_computes_percentage(self):
        records = [_record(impressions=100, reactions=5, comments=5)]
        assert AnalyticsCalculator.engagement_rate(records) == 10.0

    def test_averages_across_multiple_records(self):
        records = [
            _record(impressions=100, reactions=5, comments=5),
            _record(impressions=100, reactions=10, comments=10),
        ]
        assert AnalyticsCalculator.engagement_rate(records) == 15.0

    def test_zero_impressions_returns_zero(self):
        records = [_record(impressions=0, reactions=5, comments=5)]
        assert AnalyticsCalculator.engagement_rate(records) == 0.0

    def test_empty_records_returns_zero(self):
        assert AnalyticsCalculator.engagement_rate([]) == 0.0


class TestPostEngagementRate:
    def test_computes_percentage(self):
        record = _record(impressions=200, reactions=10, comments=10)
        assert AnalyticsCalculator.post_engagement_rate(record) == 10.0

    def test_zero_impressions_returns_zero(self):
        record = _record(impressions=0, reactions=1, comments=1)
        assert AnalyticsCalculator.post_engagement_rate(record) == 0.0


class TestRankPosts:
    def test_descending_ranks_highest_engagement_first(self):
        low = _ranking_record("Low", impressions=1000, reactions=10, comments=0)
        high = _ranking_record("High", impressions=1000, reactions=100, comments=50)
        mid = _ranking_record("Mid", impressions=1000, reactions=50, comments=0)

        ranked = AnalyticsCalculator.rank_posts([low, high, mid], descending=True, limit=10)

        assert [r.title for r in ranked] == ["High", "Mid", "Low"]

    def test_ascending_ranks_lowest_engagement_first(self):
        low = _ranking_record("Low", impressions=1000, reactions=10, comments=0)
        high = _ranking_record("High", impressions=1000, reactions=100, comments=50)
        mid = _ranking_record("Mid", impressions=1000, reactions=50, comments=0)

        ranked = AnalyticsCalculator.rank_posts([low, high, mid], descending=False, limit=10)

        assert [r.title for r in ranked] == ["Low", "Mid", "High"]

    def test_limit_truncates_results(self):
        records = [_ranking_record(f"Post {i}", impressions=100, reactions=i) for i in range(15)]

        ranked = AnalyticsCalculator.rank_posts(records, descending=True, limit=10)

        assert len(ranked) == 10

    def test_empty_records_returns_empty_list(self):
        assert AnalyticsCalculator.rank_posts([], descending=True, limit=10) == []


class TestBestPostingDay:
    def test_picks_weekday_with_highest_mean_engagement(self):
        # 2026-08-03 is a Monday, 2026-08-04 is a Tuesday
        monday = datetime(2026, 8, 3, 9, 0, tzinfo=timezone.utc)
        tuesday = datetime(2026, 8, 4, 9, 0, tzinfo=timezone.utc)
        records = [
            _ranking_record("Mon low", impressions=1000, reactions=10, published_at=monday),
            _ranking_record("Tue high", impressions=1000, reactions=100, published_at=tuesday),
        ]
        assert AnalyticsCalculator.best_posting_day(records) == "Tuesday"

    def test_empty_records_returns_none(self):
        assert AnalyticsCalculator.best_posting_day([]) is None


class TestBestPostingHour:
    def test_picks_hour_with_highest_mean_engagement(self):
        morning = datetime(2026, 8, 3, 9, 0, tzinfo=timezone.utc)
        evening = datetime(2026, 8, 3, 20, 0, tzinfo=timezone.utc)
        records = [
            _ranking_record("Morning low", impressions=1000, reactions=10, published_at=morning),
            _ranking_record("Evening high", impressions=1000, reactions=100, published_at=evening),
        ]
        assert AnalyticsCalculator.best_posting_hour(records) == 20

    def test_empty_records_returns_none(self):
        assert AnalyticsCalculator.best_posting_hour([]) is None
