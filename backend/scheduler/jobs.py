import logging
from typing import Callable, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.core.cache import sync_invalidate_user_analytics_cache
from backend.core.config import settings
from backend.linkedin.service import LinkedInConnectService
from backend.vault.models import Post, PostStatus, PostVersion, _utcnow
from backend.vault.schemas import PostStatusUpdate
from backend.vault.service import update_post_status

logger = logging.getLogger(__name__)


class ScheduledPublishJob:
    """Static-method job body for the background scheduler — mirrors
    LinkedInConnectService's style (backend/linkedin/service.py). No
    per-instance state to justify anything else."""

    @staticmethod
    def due_post_ids(db: Session, limit: Optional[int] = None) -> list[UUID]:
        """A lightweight, lock-free snapshot of due post ids for this tick —
        taken once per tick so a post that fails and stays 'scheduled' isn't
        re-attempted again within the SAME tick (that would burn through all
        of SCHEDULER_MAX_ATTEMPTS instantly instead of spacing retries one
        per SCHEDULER_POLL_INTERVAL_SECONDS)."""
        rows = (
            db.query(Post.id)
            .filter(Post.status == PostStatus.scheduled, Post.scheduled_at <= _utcnow())
            .order_by(Post.scheduled_at)
            .limit(limit or settings.SCHEDULER_BATCH_SIZE)
            .all()
        )
        return [row[0] for row in rows]

    @staticmethod
    def claim_post(db: Session, post_id: UUID) -> Optional[Post]:
        """Locks and returns the post if it's still due, or None (already
        claimed by another concurrent process, or no longer eligible).
        `FOR UPDATE SKIP LOCKED` is Postgres-native row locking: if multiple
        app processes each run their own scheduler tick at once, every
        process skips rows already claimed elsewhere — no separate
        coordination table needed. Re-checks status/scheduled_at (not just
        id) since time has passed since `due_post_ids`' snapshot."""
        return (
            db.query(Post)
            .filter(Post.id == post_id, Post.status == PostStatus.scheduled, Post.scheduled_at <= _utcnow())
            .with_for_update(skip_locked=True)
            .one_or_none()
        )

    @staticmethod
    def publish_one(db: Session, post: Post) -> None:
        """Publishes a single claimed post via the existing, already-verified
        LinkedIn flow (LinkedInConnectService.publish_or_auth + the same
        update_post_status call the manual publish endpoint makes). Never
        raises — every failure is recorded on the post itself so one bad
        post can't take down the whole tick or affect other users' posts."""
        try:
            latest = (
                db.query(PostVersion)
                .filter(PostVersion.post_id == post.id)
                .order_by(PostVersion.version_number.desc())
                .first()
            )
            if not latest:
                ScheduledPublishJob._record_failure(db, post, "Post has no saved versions to publish")
                return

            result = LinkedInConnectService.publish_or_auth(
                db=db,
                user_id=post.user_id,
                post_id=post.id,
                version_id=latest.id,
                content=latest.content,
            )
            if result.published and not result.needs_auth and not result.duplicate:
                update_post_status(db, post.user_id, post.id, PostStatusUpdate(status=PostStatus.published))
                sync_invalidate_user_analytics_cache(str(post.user_id))
                return

            reason = {
                "not_connected": "LinkedIn not connected — reconnect to publish this post.",
                "token_expired": "LinkedIn connection expired — reconnect to publish this post.",
                "token_revoked": "LinkedIn access was revoked — reconnect to publish this post.",
            }.get(result.reason, result.reason or "LinkedIn publish failed")
            ScheduledPublishJob._record_failure(db, post, reason)
        except HTTPException as exc:
            ScheduledPublishJob._record_failure(db, post, str(exc.detail))
        except Exception as exc:
            logger.exception("Scheduled publish failed for post_id=%s", post.id)
            ScheduledPublishJob._record_failure(db, post, str(exc))

    @staticmethod
    def _record_failure(db: Session, post: Post, reason: str) -> None:
        post.schedule_attempts += 1
        post.last_schedule_error = reason
        if post.schedule_attempts >= settings.SCHEDULER_MAX_ATTEMPTS:
            post.status = PostStatus.failed
        post.updated_at = _utcnow()
        db.commit()

    @staticmethod
    def run_tick(session_factory: Callable[[], Session]) -> None:
        """The function APScheduler calls on its timer: opens one Session,
        snapshots this tick's due post ids once, then claims and attempts
        each exactly once (never re-attempting the same post twice within
        one tick), closes the session. A post that fails gets its next real
        attempt on the NEXT tick, SCHEDULER_POLL_INTERVAL_SECONDS later —
        not immediately, and not more than SCHEDULER_MAX_ATTEMPTS times
        total across however many ticks that takes."""
        db = session_factory()
        try:
            for post_id in ScheduledPublishJob.due_post_ids(db):
                post = ScheduledPublishJob.claim_post(db, post_id)
                if post is None:
                    continue
                ScheduledPublishJob.publish_one(db, post)
        finally:
            db.close()
