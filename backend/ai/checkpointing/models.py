import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID

from backend.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ThreadRegistry(Base):
    """Ownership + status index for LangGraph thread_ids. Stores no conversation
    content — only who owns a thread and whether it's still open — so a
    /resume call can be scoped to its owner without deserializing checkpoint
    state, and stale threads can be found for pruning later."""

    __tablename__ = "thread_registry"

    thread_id = Column(UUID(as_uuid=True), primary_key=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Groups multiple thread_ids into one frontend "chat" — nullable since
    # every thread created before this column existed has none, and a thread
    # can still be created without one (defensive fallback in ThreadSessionService).
    session_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    status = Column(Text, nullable=False, default="active", server_default="active")
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()"
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        server_default="now()",
    )
