import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import UUID

from backend.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AgentThread(Base):
    """Registry of independent-agent chat threads.

    `id` is the thread_id handed to the LangGraph checkpointer — the
    checkpoint tables only know thread_id, so ownership (user + agent), the
    turn cap and retention all live here.
    """

    __tablename__ = "agent_threads"
    __table_args__ = (
        CheckConstraint("agent IN ('linkedin', 'reddit', 'x')", name="ck_agent_threads_agent"),
        Index("ix_agent_threads_user_agent_recent", "user_id", "agent", "last_message_at"),
    )

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    agent = Column(Text, nullable=False)
    # First user message, truncated — no LLM call to name a thread.
    title = Column(Text, nullable=True)
    # Completed turns; the thread ends at settings.THREAD_TURN_LIMIT.
    turn_count = Column(Integer, nullable=False, default=0, server_default="0")
    # Turn lease: set while a turn is running so two tabs can't write one
    # thread at once. Expires on its own if the process dies mid-turn.
    busy_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()")
    last_message_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()")
