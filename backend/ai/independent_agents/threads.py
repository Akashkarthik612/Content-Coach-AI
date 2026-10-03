"""Chat-thread registry for the independent agents (agent_threads table).

The LangGraph checkpointer stores a thread's conversation keyed only by
thread_id. This service owns everything else about a thread: who owns it,
which agent it belongs to, the turn cap, the one-turn-at-a-time lease and the
retention sweep. Every lookup matches id AND user_id AND agent, so another
user's thread — or a Reddit thread sent to the LinkedIn endpoint — is simply
not found.
"""

import asyncio
import logging
import uuid
from datetime import timedelta
from uuid import UUID

from langgraph.checkpoint.base import BaseCheckpointSaver
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from backend.ai.independent_agents.limits import LEASE
from backend.ai.independent_agents.models import AgentThread
from backend.core.config import settings
from backend.core.database import SessionLocal

logger = logging.getLogger(__name__)

# LEASE (limits.py) is how long a running turn holds the thread: derived from
# the Gemini attempts x timeout so it always outlasts the slowest turn. If the
# process dies mid-turn the lease simply expires.
TITLE_MAX_CHARS = 60
PURGE_BATCH_SIZE = 200


class ThreadNotFoundError(Exception):
    """No active thread with this id for this user and agent."""


class ThreadBusyError(Exception):
    """Another turn is still running on this thread."""


class ThreadLimitReachedError(Exception):
    """The thread hit THREAD_TURN_LIMIT; the user must start a new chat."""


def _title(message: str) -> str:
    text = " ".join(message.split())
    return text if len(text) <= TITLE_MAX_CHARS else text[: TITLE_MAX_CHARS - 1] + "…"


def _active():
    """Threads idle longer than the retention window are invisible immediately,
    even before the purge sweep deletes them."""
    return AgentThread.last_message_at >= func.now() - timedelta(days=settings.THREAD_RETENTION_DAYS)


def _lease_free():
    return or_(AgentThread.busy_until.is_(None), AgentThread.busy_until < func.now())


def _owned(thread_id: UUID, user_id: UUID, agent: str):
    return (
        AgentThread.id == thread_id,
        AgentThread.user_id == user_id,
        AgentThread.agent == agent,
    )


class AgentThreadService:
    @staticmethod
    def create(db: Session, user_id: UUID, agent: str, first_message: str) -> UUID:
        """New chat: insert the thread already leased for its first turn. The id
        is generated here so reading it back after commit costs no query."""
        thread_id = uuid.uuid4()
        db.execute(
            AgentThread.__table__.insert().values(
                id=thread_id,
                user_id=user_id,
                agent=agent,
                title=_title(first_message),
                busy_until=func.now() + LEASE,
            )
        )
        db.commit()
        return thread_id

    @staticmethod
    def acquire(db: Session, thread_id: UUID, user_id: UUID, agent: str) -> None:
        """Ownership check + turn cap + lease in one statement. Raises
        ThreadNotFoundError / ThreadLimitReachedError / ThreadBusyError."""
        acquired = db.execute(
            update(AgentThread)
            .where(
                *_owned(thread_id, user_id, agent),
                _active(),
                AgentThread.turn_count < settings.THREAD_TURN_LIMIT,
                _lease_free(),
            )
            .values(busy_until=func.now() + LEASE)
            .returning(AgentThread.id)
            .execution_options(synchronize_session=False)
        ).scalar_one_or_none()
        db.commit()
        if acquired is not None:
            return

        # Failure path only: one more read to say *why*.
        row = db.execute(
            select(AgentThread.turn_count).where(*_owned(thread_id, user_id, agent), _active())
        ).one_or_none()
        if row is None:
            raise ThreadNotFoundError
        if row.turn_count >= settings.THREAD_TURN_LIMIT:
            raise ThreadLimitReachedError
        raise ThreadBusyError

    @staticmethod
    def finish(db: Session, thread_id: UUID) -> int:
        """Turn completed: count it, bump recency, release the lease. Raises
        ThreadNotFoundError if the thread was deleted while the turn ran."""
        turn_count = db.execute(
            update(AgentThread)
            .where(AgentThread.id == thread_id)
            .values(
                turn_count=AgentThread.turn_count + 1,
                last_message_at=func.now(),
                busy_until=None,
            )
            .returning(AgentThread.turn_count)
            .execution_options(synchronize_session=False)
        ).scalar_one_or_none()
        db.commit()
        if turn_count is None:
            raise ThreadNotFoundError
        return turn_count

    @staticmethod
    def release(db: Session, thread_id: UUID) -> None:
        """Turn failed on an existing thread: free it so the user can resend."""
        db.execute(
            update(AgentThread)
            .where(AgentThread.id == thread_id)
            .values(busy_until=None)
            .execution_options(synchronize_session=False)
        )
        db.commit()

    @staticmethod
    def list_threads(db: Session, user_id: UUID, agent: str, limit: int = 50) -> list[AgentThread]:
        return list(
            db.scalars(
                select(AgentThread)
                .where(AgentThread.user_id == user_id, AgentThread.agent == agent, _active())
                .order_by(AgentThread.last_message_at.desc())
                .limit(limit)
            )
        )

    @staticmethod
    def get(db: Session, thread_id: UUID, user_id: UUID, agent: str) -> AgentThread | None:
        return db.scalars(
            select(AgentThread).where(*_owned(thread_id, user_id, agent), _active())
        ).one_or_none()

    @staticmethod
    def lock_for_delete(db: Session, thread_id: UUID, user_id: UUID, agent: str) -> None:
        """Lease the thread so no turn can write a checkpoint while it's being
        deleted. Raises ThreadNotFoundError / ThreadBusyError."""
        locked = db.execute(
            update(AgentThread)
            .where(*_owned(thread_id, user_id, agent), _lease_free())
            .values(busy_until=func.now() + LEASE)
            .returning(AgentThread.id)
            .execution_options(synchronize_session=False)
        ).scalar_one_or_none()
        db.commit()
        if locked is not None:
            return
        exists = db.execute(select(AgentThread.id).where(*_owned(thread_id, user_id, agent))).one_or_none()
        raise ThreadBusyError if exists else ThreadNotFoundError

    @staticmethod
    def expired_ids(db: Session) -> list[UUID]:
        return list(
            db.scalars(select(AgentThread.id).where(~_active(), _lease_free()).limit(PURGE_BATCH_SIZE))
        )

    @staticmethod
    async def purge_expired(checkpointer: BaseCheckpointSaver) -> int:
        """Retention sweep: delete each expired thread's checkpoints, then its
        registry row. Checkpoints go first so a crash in between leaves the
        row behind and the next sweep retries — never an unreachable orphan."""
        purged = 0
        while True:
            with SessionLocal() as db:
                ids = await asyncio.to_thread(AgentThreadService.expired_ids, db)
            if not ids:
                return purged
            for thread_id in ids:
                await checkpointer.adelete_thread(str(thread_id))
            with SessionLocal() as db:
                await asyncio.to_thread(AgentThreadService._delete_rows, db, ids)
            purged += len(ids)
            if len(ids) < PURGE_BATCH_SIZE:
                return purged

    @staticmethod
    def delete_row(db: Session, thread_id: UUID) -> None:
        """Used after a thread's checkpoints are deleted, and when the first
        turn of a new chat fails (so no empty thread is left behind)."""
        db.execute(delete(AgentThread).where(AgentThread.id == thread_id))
        db.commit()

    @staticmethod
    def _delete_rows(db: Session, ids: list[UUID]) -> None:
        db.execute(delete(AgentThread).where(AgentThread.id.in_(ids)))
        db.commit()
