import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.ai.checkpointing.models import ThreadRegistry

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

    def touch(self, thread_id: str) -> None:
        row = self.db.get(ThreadRegistry, uuid.UUID(thread_id))
        if row:
            row.updated_at = _utcnow()
            self.db.commit()

    def mark_completed(self, thread_id: str) -> None:
        row = self.db.get(ThreadRegistry, uuid.UUID(thread_id))
        if row:
            row.status = "completed"
            row.updated_at = _utcnow()
            self.db.commit()


class ThreadSessionService:
    """Facade: router endpoints depend on this only — never the registry or a
    raw checkpointer config dict directly."""

    def __init__(self, registry: ThreadRegistryService):
        self._registry = registry

    def start(self, user_id: str, session_id: str | None = None) -> tuple[str, str, dict]:
        """Mint a new thread_id, register ownership under session_id (grouping
        key for the frontend's "chat" — minted here as a defensive fallback if
        the caller doesn't supply one), return (thread_id, session_id, config)."""
        thread_id = str(uuid.uuid4())
        session_id = session_id or str(uuid.uuid4())
        self._registry.register(thread_id, user_id, session_id)
        return thread_id, session_id, {"configurable": {"thread_id": thread_id}}

    def resume_config(self, thread_id: str, user_id: str) -> dict:
        """Verify ownership, touch last-active timestamp, return config for
        Command(resume=...). Raises PermissionError if user_id isn't the owner."""
        if not self._registry.is_owner(thread_id, user_id):
            logger.warning("resume denied: user_id=%s does not own thread_id=%s", user_id, thread_id)
            raise PermissionError(f"user_id={user_id} does not own thread_id={thread_id}")
        self._registry.touch(thread_id)
        return {"configurable": {"thread_id": thread_id}}

    def complete(self, thread_id: str) -> None:
        """Mark the thread completed once the graph reaches a terminal state."""
        self._registry.mark_completed(thread_id)
