import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.ai.checkpointing.models import ThreadRegistry
from backend.ai.checkpointing.session_memory_store import SessionMemoryService

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ThreadRegistryService:
    """Pure CRUD on thread_registry — no checkpointer/graph knowledge. Stores
    only ownership + status, never conversation content."""

    def __init__(self, db: Session):
        self.db = db

    def register(self, thread_id: str, user_id: str, session_id: str | None = None) -> None:
        self.db.add(ThreadRegistry(
            thread_id=uuid.UUID(thread_id),
            user_id=uuid.UUID(user_id),
            session_id=uuid.UUID(session_id) if session_id else None,
            status="active",
        ))
        self.db.commit()

    def is_owner(self, thread_id: str, user_id: str) -> bool:
        row = self.db.get(ThreadRegistry, uuid.UUID(thread_id))
        return row is not None and str(row.user_id) == str(user_id)

    def list_for_session(self, session_id: str, user_id: str) -> list[ThreadRegistry]:
        """All threads grouped under one frontend chat, oldest first. Scoping by
        user_id here IS the ownership check for this path — a mismatched
        session_id/user_id pair returns an empty list rather than leaking rows."""
        return (
            self.db.query(ThreadRegistry)
            .filter(
                ThreadRegistry.session_id == uuid.UUID(session_id),
                ThreadRegistry.user_id == uuid.UUID(user_id),
            )
            .order_by(ThreadRegistry.created_at.asc())
            .all()
        )

    def delete_for_session(self, session_id: str, user_id: str) -> list[str]:
        """Deletes every thread_registry row grouped under this session, scoped
        to user_id (same ownership-by-query-scope pattern as list_for_session —
        an unowned/unknown session_id deletes nothing and returns []). Returns
        the deleted thread_ids so the caller can also purge their checkpointer
        state, which this method has no knowledge of."""
        rows = self.list_for_session(session_id, user_id)
        thread_ids = [str(row.thread_id) for row in rows]
        for row in rows:
            self.db.delete(row)
        self.db.commit()
        return thread_ids

    def touch(self, thread_id: str) -> ThreadRegistry | None:
        row = self.db.get(ThreadRegistry, uuid.UUID(thread_id))
        if row:
            row.updated_at = _utcnow()
            self.db.commit()
        return row

    def mark_completed(self, thread_id: str) -> None:
        row = self.db.get(ThreadRegistry, uuid.UUID(thread_id))
        if row:
            row.status = "completed"
            row.updated_at = _utcnow()
            self.db.commit()


class ThreadSessionService:
    """Facade: router endpoints depend on this only — never the registry, the
    session-memory store, or a raw checkpointer config dict directly."""

    def __init__(self, registry: ThreadRegistryService, session_memory: SessionMemoryService):
        self._registry = registry
        self._session_memory = session_memory

    async def start(
        self, user_id: str, session_id: str | None = None, first_prompt: str = ""
    ) -> tuple[str, str, dict]:
        """Mint a new thread_id, register ownership under session_id (grouping
        key for the frontend's "chat" — minted here as a defensive fallback if
        the caller doesn't supply one), upsert the chat_sessions Store record
        (creates it on a brand-new session, or appends this thread_id + bumps
        last_active_at on an existing one — resets the 7-day TTL either way),
        return (thread_id, session_id, config)."""
        thread_id = str(uuid.uuid4())
        session_id = session_id or str(uuid.uuid4())
        self._registry.register(thread_id, user_id, session_id)
        await self._session_memory.start_or_touch(user_id, session_id, thread_id, first_prompt)
        return thread_id, session_id, {"configurable": {"thread_id": thread_id}}

    async def resume_config(self, thread_id: str, user_id: str) -> dict:
        """Verify ownership, touch last-active timestamp (both the thread_registry
        row and its parent chat_sessions Store record, resetting the 7-day TTL),
        return config for Command(resume=...). Raises PermissionError if
        user_id isn't the owner."""
        if not self._registry.is_owner(thread_id, user_id):
            logger.warning("resume denied: user_id=%s does not own thread_id=%s", user_id, thread_id)
            raise PermissionError(f"user_id={user_id} does not own thread_id={thread_id}")
        row = self._registry.touch(thread_id)
        if row and row.session_id:
            await self._session_memory.touch_existing(user_id, str(row.session_id))
        return {"configurable": {"thread_id": thread_id}}

    def complete(self, thread_id: str) -> None:
        """Mark the thread completed once the graph reaches a terminal state."""
        self._registry.mark_completed(thread_id)

    async def delete_session(self, session_id: str, user_id: str, checkpointer) -> list[str]:
        """Permanently deletes a chat: every thread's checkpoint data (via the
        checkpointer's own adelete_thread — wipes checkpoints/checkpoint_blobs/
        checkpoint_writes for that thread_id), the thread_registry rows grouping
        them, and the chat_sessions Store record itself. Scoped to user_id via
        ThreadRegistryService.delete_for_session() — deleting an unowned/unknown
        session_id is a silent no-op (returns []), same as list_for_session's
        ownership-by-query-scope pattern elsewhere in this facade."""
        thread_ids = self._registry.delete_for_session(session_id, user_id)
        for thread_id in thread_ids:
            await checkpointer.adelete_thread(thread_id)
        await self._session_memory.delete(user_id, session_id)
        return thread_ids
