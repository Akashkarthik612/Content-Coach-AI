"""Custom agents table (migration 0029, Day_8.md D8-D1).

An agent is a row: handle, model, system prompt, guardrails. One shared loop
(runner.py) runs every row, as in Dust's agent_configuration. Delete is an
archive (archived_at set), so the handle is freed by the partial unique index
and nothing else has to be cleaned up.
"""

import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from backend.core.database import Base

HANDLE_PATTERN = r"^[a-z0-9][a-z0-9-]{1,29}$"


class AgentModel(StrEnum):
    """Models a custom agent may run on. A new model is a new member plus a
    change to ck_agent_configurations_model (new migration)."""

    GEMINI_FLASH = "gemini-3.5-flash"


def _utcnow() -> datetime:
    return datetime.now(UTC)


class AgentConfiguration(Base):
    __tablename__ = "agent_configurations"
    __table_args__ = (
        CheckConstraint(f"handle ~ '{HANDLE_PATTERN}'", name="ck_agent_configurations_handle"),
        CheckConstraint("model IN ('gemini-3.5-flash')", name="ck_agent_configurations_model"),
        CheckConstraint(
            "workspace_id IS NOT NULL OR user_id IS NOT NULL", name="ck_agent_configuration_owner"
        ),
        # One active agent per handle per user; archived rows free the handle.
        # Also the index for "this user's active agents".
        Index(
            "uq_agent_configurations_user_handle_active",
            "user_id",
            "handle",
            unique=True,
            postgresql_where=text("archived_at IS NULL AND workspace_id IS NULL"),
        ),
        Index(
            "uq_agent_configurations_workspace_handle_active",
            "workspace_id",
            "handle",
            unique=True,
            postgresql_where=text("archived_at IS NULL AND workspace_id IS NOT NULL"),
        ),
    )

    id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    # Personal agents retain their owner. Company agents are owned by workspace_id;
    # their creator is recorded on immutable version rows instead.
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True)
    name = Column(Text, nullable=False, default="", server_default="")
    description = Column(Text, nullable=False, default="", server_default="")
    responsibility = Column(Text, nullable=False, default="", server_default="")
    workflow_role = Column(Text, nullable=False, default="custom", server_default="custom")
    source_ids = Column(JSONB, nullable=False, default=list, server_default="[]")
    document_ids = Column(JSONB, nullable=False, default=list, server_default="[]")
    enabled_tools = Column(JSONB, nullable=False, default=list, server_default="[]")
    version = Column(Integer, nullable=False, default=1, server_default="1")
    handle = Column(Text, nullable=False)
    model = Column(Text, nullable=False)
    system_prompt = Column(Text, nullable=False)
    guardrails = Column(Text, nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default=text("now()")
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default=text("now()")
    )
