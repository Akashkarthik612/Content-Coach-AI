import logging
from datetime import datetime, time, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException

logger = logging.getLogger(__name__)
from sqlalchemy import func, or_, case, null
from sqlalchemy.orm import Session

from sqlalchemy.dialects.postgresql import insert as pg_insert

from backend.analytics.schemas import ExternalPostLogCreate
from backend.vault.models import Folder, Post, PostAnalytics, PostPublishLog, PostVersion, _utcnow
from backend.vault.models import PostStatus
from backend.vault.schemas import (
    CalendarPostItem,
    FolderCreate,
    FolderRename,
    PostCreate,
    PostRename,
    PostStatusUpdate,
    SearchResult,
    VersionRename,
    VersionSave,
    WeeklyHistoryPoint,
)


def _own_folder(db: Session, user_id: UUID, folder_id: UUID) -> Folder:
    folder = db.get(Folder, folder_id)
    if not folder:
        logger.debug("Folder not found: folder_id=%s", folder_id)
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder.user_id != user_id:
        logger.warning("Forbidden: user_id=%s does not own folder_id=%s", user_id, folder_id)
        raise HTTPException(status_code=403, detail="Forbidden")
    return folder


def _own_post(db: Session, user_id: UUID, post_id: UUID) -> Post:
    post = db.get(Post, post_id)
    if not post:
        logger.debug("Post not found: post_id=%s", post_id)
        raise HTTPException(status_code=404, detail="Post not found")
    if post.user_id != user_id:
        logger.warning("Forbidden: user_id=%s does not own post_id=%s", user_id, post_id)
        raise HTTPException(status_code=403, detail="Forbidden")
    return post


def _own_version(db: Session, user_id: UUID, version_id: UUID) -> PostVersion:
    version = db.get(PostVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    _own_post(db, user_id, version.post_id)
    return version


# ── Folder ────────────────────────────────────────────────────────────────────

def create_folder(db: Session, user_id: UUID, data: FolderCreate) -> Folder:
    logger.info("Creating folder: user_id=%s name=%s", user_id, data.name)
    folder = Folder(user_id=user_id, name=data.name, description=data.description)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def list_folders(db: Session, user_id: UUID) -> list[Folder]:
    return db.query(Folder).filter(Folder.user_id == user_id).all()


def rename_folder(db: Session, user_id: UUID, folder_id: UUID, data: FolderRename) -> Folder:
    folder = _own_folder(db, user_id, folder_id)
    folder.name = data.name
    db.commit()
    db.refresh(folder)
    return folder


def delete_folder(db: Session, user_id: UUID, folder_id: UUID) -> None:
    folder = _own_folder(db, user_id, folder_id)
    db.delete(folder)
    db.commit()


# ── Post ──────────────────────────────────────────────────────────────────────

def create_post(db: Session, user_id: UUID, folder_id: UUID, data: PostCreate) -> Post:
    logger.info("Creating post: user_id=%s folder_id=%s title=%s", user_id, folder_id, data.title)
    _own_folder(db, user_id, folder_id)
    post = Post(user_id=user_id, title=data.title, folder_id=folder_id)
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def _attach_preview(post: Post) -> Post:
    """Derive a flattened preview + word count from the latest version's content.
    Attached as plain instance attributes (not mapped columns) so PostListResponse's
    from_attributes validation can read them like any other field."""
    latest = max(post.versions, key=lambda v: v.version_number, default=None)
    flat = " ".join((latest.content if latest else "").split())
    post.preview = flat[:220]
    post.word_count = len(flat.split()) if flat else 0
    return post


def list_posts(db: Session, user_id: UUID, folder_id: UUID) -> list[Post]:
    _own_folder(db, user_id, folder_id)
    posts = db.query(Post).filter(Post.folder_id == folder_id, Post.user_id == user_id).all()
    return [_attach_preview(p) for p in posts]


def get_post(db: Session, user_id: UUID, post_id: UUID) -> Post:
    return _own_post(db, user_id, post_id)


def rename_post(db: Session, user_id: UUID, post_id: UUID, data: PostRename) -> Post:
    post = _own_post(db, user_id, post_id)
    post.title = data.title
    post.updated_at = _utcnow()
    db.commit()
    db.refresh(post)
    return post


def update_post_status(
    db: Session,
    user_id: UUID,
    post_id: UUID,
    data: PostStatusUpdate,
) -> Post:
    post = _own_post(db, user_id, post_id)
    post.status = data.status
    if data.status == PostStatus.scheduled:
        post.scheduled_at = data.scheduled_at
        # A (re)schedule is a fresh attempt — clear any prior failure state,
        # otherwise a post rescheduled after a failed auto-publish would
        # immediately re-count toward SCHEDULER_MAX_ATTEMPTS.
        post.schedule_attempts = 0
        post.last_schedule_error = None
    elif data.status == PostStatus.published:
        post.scheduled_at = None
    post.updated_at = _utcnow()
    db.commit()
    db.refresh(post)
    return post


def delete_post(db: Session, user_id: UUID, post_id: UUID) -> None:
    post = _own_post(db, user_id, post_id)
    db.delete(post)
    db.commit()


def pin_post(db: Session, user_id: UUID, post_id: UUID, pinned: bool) -> Post:
    post = _own_post(db, user_id, post_id)
    post.is_pinned = pinned
    post.updated_at = _utcnow()
    db.commit()
    db.refresh(post)
    return post


def move_post(db: Session, user_id: UUID, post_id: UUID, folder_id: UUID) -> Post:
    post = _own_post(db, user_id, post_id)
    _own_folder(db, user_id, folder_id)
    post.folder_id = folder_id
    post.updated_at = _utcnow()
    db.commit()
    db.refresh(post)
    return post


# ── Version ───────────────────────────────────────────────────────────────────

def save_version(db: Session, user_id: UUID, post_id: UUID, data: VersionSave) -> PostVersion:
    post = _own_post(db, user_id, post_id)

    max_num = (
        db.query(func.max(PostVersion.version_number))
        .filter(PostVersion.post_id == post_id)
        .scalar()
    )
    next_number = (max_num or 0) + 1

    logger.info("Saving version: post_id=%s version_number=%d char_count=%d",
                post_id, next_number, len(data.content))
    try:
        version = PostVersion(
            post_id=post_id,
            version_number=next_number,
            content=data.content,
            source=data.source,
            change_summary=data.version_label,
            char_count=len(data.content),
        )
        db.add(version)
        db.flush()

        post.current_version = next_number
        post.updated_at = _utcnow()

        db.commit()
        db.refresh(version)
    except Exception:
        logger.exception("save_version failed: post_id=%s", post_id)
        db.rollback()
        raise

    return version


def list_versions(db: Session, user_id: UUID, post_id: UUID) -> list[PostVersion]:
    _own_post(db, user_id, post_id)
    return (
        db.query(PostVersion)
        .filter(PostVersion.post_id == post_id)
        .order_by(PostVersion.version_number)
        .all()
    )


def get_version(db: Session, user_id: UUID, version_id: UUID) -> PostVersion:
    return _own_version(db, user_id, version_id)


def rename_version(db: Session, user_id: UUID, version_id: UUID, data: VersionRename) -> PostVersion:
    version = _own_version(db, user_id, version_id)
    version.change_summary = data.version_label
    db.commit()
    db.refresh(version)
    return version


def delete_version(db: Session, user_id: UUID, version_id: UUID) -> None:
    version = _own_version(db, user_id, version_id)
    post = db.get(Post, version.post_id)
    db.delete(version)
    db.flush()
    max_num = (
        db.query(func.max(PostVersion.version_number))
        .filter(PostVersion.post_id == post.id)
        .scalar()
    )
    post.current_version = max_num or 0
    db.commit()


# ── Post Analytics ────────────────────────────────────────────────────────────

def upsert_post_analytics(
    db: Session, post_id: UUID, user_id: UUID, impressions: int, reactions: int, comments: int = 0
) -> PostAnalytics:
    _own_post(db, user_id, post_id)
    stmt = (
        pg_insert(PostAnalytics)
        .values(
            post_id=post_id,
            user_id=user_id,
            impressions=impressions,
            reactions=reactions,
            comments=comments,
            updated_at=_utcnow(),
        )
        .on_conflict_do_update(
            constraint="uq_post_analytics_post_id",
            set_=dict(impressions=impressions, reactions=reactions, comments=comments, updated_at=_utcnow()),
        )
    )
    db.execute(stmt)
    db.commit()
    return db.query(PostAnalytics).filter(PostAnalytics.post_id == post_id).one()


def create_external_post(db: Session, user_id: UUID, data: ExternalPostLogCreate) -> Post:
    """Log metrics for a post with no publish history in Honne yet.

    data.post_id is None -> "Published outside Honne": creates a brand-new
    synthetic Post (empty content — no real text was provided) + PostVersion
    + PostPublishLog + PostAnalytics.

    data.post_id is set -> backfill: the post already exists in the vault
    (e.g. pasted in as a draft); attaches a PostPublishLog (using the
    platform/published_at entered on the form) + PostAnalytics to that
    EXISTING post instead of creating a duplicate. Its title/content are
    left untouched.

    The form's "Type" (original/repost) field has no backing column
    anywhere and is intentionally not accepted here."""
    if data.post_id is not None:
        post = _own_post(db, user_id, data.post_id)
    else:
        post = Post(user_id=user_id, title=data.title or "Untitled Post", status=PostStatus.published)
        db.add(post)
        db.flush()
        version = PostVersion(post_id=post.id, version_number=1, content="", source="external")
        db.add(version)
        post.current_version = 1

    if post.status != PostStatus.published:
        post.status = PostStatus.published
        post.updated_at = _utcnow()

    publish_log = PostPublishLog(
        post_id=post.id, version_id=_latest_version_id(db, post.id),
        platform=data.platform, published_at=data.published_at,
    )
    db.add(publish_log)

    upsert_stmt = (
        pg_insert(PostAnalytics)
        .values(
            post_id=post.id, user_id=user_id,
            impressions=data.impressions, reactions=data.reactions, comments=data.comments,
            updated_at=_utcnow(),
        )
        .on_conflict_do_update(
            constraint="uq_post_analytics_post_id",
            set_=dict(
                impressions=data.impressions, reactions=data.reactions, comments=data.comments,
                updated_at=_utcnow(),
            ),
        )
    )
    db.execute(upsert_stmt)
    db.commit()
    db.refresh(post)
    return post


def _latest_version_id(db: Session, post_id: UUID) -> UUID:
    version = (
        db.query(PostVersion)
        .filter(PostVersion.post_id == post_id)
        .order_by(PostVersion.version_number.desc())
        .first()
    )
    return version.id


# ── Analytics Summary ─────────────────────────────────────────────────────────

def get_analytics_summary(db: Session, user_id: UUID) -> dict:
    agg = (
        db.query(
            func.coalesce(func.sum(PostAnalytics.impressions), 0).label("total_impressions"),
            func.coalesce(func.avg(PostAnalytics.reactions), 0.0).label("avg_reactions"),
            func.count(PostAnalytics.id).label("post_count"),
        )
        .filter(PostAnalytics.user_id == user_id)
        .one()
    )

    top_row = (
        db.query(PostPublishLog.platform, func.count(PostPublishLog.id).label("cnt"))
        .join(Post, Post.id == PostPublishLog.post_id)
        .filter(Post.user_id == user_id)
        .group_by(PostPublishLog.platform)
        .order_by(func.count(PostPublishLog.id).desc())
        .first()
    )

    cutoff   = _utcnow() - timedelta(days=180)
    trunc    = func.date_trunc("month", PostAnalytics.updated_at)
    trend_rows = (
        db.query(
            func.to_char(PostAnalytics.updated_at, "Mon").label("month"),
            func.sum(PostAnalytics.impressions).label("impressions"),
            func.sum(PostAnalytics.reactions).label("reactions"),
        )
        .filter(PostAnalytics.user_id == user_id, PostAnalytics.updated_at >= cutoff)
        .group_by(trunc, func.to_char(PostAnalytics.updated_at, "Mon"))
        .order_by(trunc)
        .all()
    )

    return {
        "total_impressions": int(agg.total_impressions),
        "avg_reactions":     float(agg.avg_reactions),
        "post_count":        int(agg.post_count),
        "top_platform":      top_row.platform if top_row else None,
        "monthly_trend": [
            {"month": r.month, "impressions": int(r.impressions), "reactions": int(r.reactions or 0)}
            for r in trend_rows
        ],
    }


def get_recent_posts(db: Session, user_id: UUID, limit: int = 3) -> list[Post]:
    posts = (
        db.query(Post)
        .filter(Post.user_id == user_id)
        .order_by(Post.updated_at.desc())
        .limit(limit)
        .all()
    )
    return [_attach_preview(p) for p in posts]


# ── Calendar (Schedule page) ──────────────────────────────────────────────────

class CalendarService:
    """Read-only calendar queries over the vault posts table. Static methods
    only — mirrors LinkedInConnectService's style (backend/linkedin/service.py);
    no per-instance state to justify anything else."""

    @staticmethod
    def get_calendar_posts(
        db: Session, user_id: UUID, start: datetime, end: datetime
    ) -> list[CalendarPostItem]:
        """All of this user's posts landing on a calendar day within [start, end]:
        scheduled/failed posts keyed off scheduled_at, plus one entry per
        PostPublishLog row keyed off its own published_at (a post published
        more than once appears on every real day it happened, not deduped)."""
        scheduled_posts = (
            db.query(Post)
            .filter(
                Post.user_id == user_id,
                Post.status.in_([PostStatus.scheduled, PostStatus.failed]),
                Post.scheduled_at.isnot(None),
                Post.scheduled_at >= start,
                Post.scheduled_at <= end,
            )
            .all()
        )
        published_rows = (
            db.query(PostPublishLog, Post)
            .join(Post, Post.id == PostPublishLog.post_id)
            .filter(
                Post.user_id == user_id,
                PostPublishLog.published_at >= start,
                PostPublishLog.published_at <= end,
            )
            .all()
        )

        items = [
            CalendarPostItem(
                id=post.id,
                title=post.title,
                status=post.status,
                folder_id=post.folder_id,
                platform="linkedin",
                effective_at=post.scheduled_at,
            )
            for post in scheduled_posts
        ]
        items += [
            CalendarPostItem(
                id=post.id,
                title=post.title,
                status=PostStatus.published,
                folder_id=post.folder_id,
                platform=log.platform,
                effective_at=log.published_at,
            )
            for log, post in published_rows
        ]
        return items

    @staticmethod
    def get_weekly_history(db: Session, user_id: UUID, weeks: int = 12) -> list[WeeklyHistoryPoint]:
        """One point per week, oldest first, last = the current week. Past
        (fully elapsed) weeks count only actually-PUBLISHED days (real
        outcome); the current week additionally counts scheduled/failed days
        still ahead — matching progressDone's own scheduled-counts-too
        semantics already used elsewhere on the Schedule page."""
        today = datetime.now(timezone.utc).date()
        monday_this_week = today - timedelta(days=today.weekday())

        points = []
        for i in range(weeks):
            is_current = i == weeks - 1
            week_start = monday_this_week - timedelta(weeks=(weeks - 1 - i))
            week_start_dt = datetime.combine(week_start, time.min, tzinfo=timezone.utc)
            week_end_dt = datetime.combine(week_start + timedelta(days=4), time.max, tzinfo=timezone.utc)

            published_days = {
                row.published_at.date()
                for row in db.query(PostPublishLog.published_at)
                .join(Post, Post.id == PostPublishLog.post_id)
                .filter(
                    Post.user_id == user_id,
                    PostPublishLog.published_at >= week_start_dt,
                    PostPublishLog.published_at <= week_end_dt,
                )
                .all()
            }
            matched_days = published_days

            if is_current:
                scheduled_days = {
                    row.scheduled_at.date()
                    for row in db.query(Post.scheduled_at)
                    .filter(
                        Post.user_id == user_id,
                        Post.status.in_([PostStatus.scheduled, PostStatus.failed]),
                        Post.scheduled_at.isnot(None),
                        Post.scheduled_at >= week_start_dt,
                        Post.scheduled_at <= week_end_dt,
                    )
                    .all()
                }
                matched_days = published_days | scheduled_days

            points.append(WeeklyHistoryPoint(week_start=week_start, days_with_post=len(matched_days), is_current=is_current))
        return points


# ── Search ────────────────────────────────────────────────────────────────────

def search_posts(db: Session, user_id: UUID, query: str) -> list[SearchResult]:
    like = f"%{query}%"

    # Title matches take priority: when the post title satisfies the pattern,
    # matched_version_id is NULL. When only a version's content satisfies it,
    # matched_version_id carries that version's id.
    matched_version_id_expr = case(
        (Post.title.ilike(like), null()),
        else_=PostVersion.id,
    ).label("matched_version_id")

    rows = (
        db.query(Post, matched_version_id_expr)
        .outerjoin(PostVersion, PostVersion.post_id == Post.id)
        .filter(
            Post.user_id == user_id,
            or_(Post.title.ilike(like), PostVersion.content.ilike(like)),
        )
        # DISTINCT ON (Post.id) — deduplication happens in PostgreSQL, not Python.
        # ORDER BY must lead with Post.id to satisfy DISTINCT ON semantics; the
        # secondary sort on version_number ensures we pick the earliest matching
        # version for content-only hits.
        .distinct(Post.id)
        .order_by(Post.id, PostVersion.version_number)
        .all()
    )

    return [
        SearchResult(
            post_id=row.Post.id,
            title=row.Post.title,
            folder_id=row.Post.folder_id,
            matched_version_id=row.matched_version_id,
            updated_at=row.Post.updated_at,
        )
        for row in rows
    ]
