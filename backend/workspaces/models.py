"""Additive workspace storage. Knowledge retains its original composite owner keys."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from backend.core.database import Base


def now():
    return datetime.now(UTC)


def identifier():
    return Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )


def timestamp():
    return Column(DateTime(timezone=True), nullable=False, default=now, server_default=text("now()"))


class Workspace(Base):
    __tablename__ = "workspaces"
    id = identifier()
    name = Column(Text, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = timestamp()


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (CheckConstraint("role IN ('admin', 'member')", name="ck_workspace_member_role"),)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role = Column(Text, nullable=False, default="member")
    joined_at = timestamp()


class WorkspaceSource(Base):
    __tablename__ = "workspace_knowledge_sources"
    __table_args__ = (
        ForeignKeyConstraint(
            ["source_id", "owner_id"],
            ["knowledge_sources.id", "knowledge_sources.user_id"],
            ondelete="CASCADE",
            name="fk_workspace_source_owner",
        ),
    )
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    source_id = Column(UUID(as_uuid=True), primary_key=True)
    owner_id = Column(UUID(as_uuid=True), nullable=False)
    # NULL explicitly shares the entire source (including future syncs); [] shares nothing.
    document_ids = Column(JSONB(none_as_null=True), nullable=True)
    shared_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = timestamp()


class AgentVersion(Base):
    __tablename__ = "agent_configuration_versions"
    __table_args__ = (UniqueConstraint("agent_id", "version", name="uq_agent_version"),)
    id = identifier()
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agent_configurations.id", ondelete="CASCADE"), nullable=False
    )
    version = Column(Integer, nullable=False)
    # Immutable config snapshot. Never sent to logging/tracing.
    configuration = Column(JSONB, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = timestamp()


class Conversation(Base):
    __tablename__ = "workspace_conversations"
    id = identifier()
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(Text, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    next_seq = Column(Integer, nullable=False, default=1, server_default="1")
    created_at = timestamp()
    updated_at = timestamp()


class ChatMessage(Base):
    __tablename__ = "workspace_chat_messages"
    __table_args__ = (
        UniqueConstraint("conversation_id", "seq", name="uq_workspace_message_seq"),
        CheckConstraint("role IN ('user', 'assistant')", name="ck_workspace_message_role"),
        CheckConstraint("status IN ('running', 'ok', 'failed')", name="ck_workspace_message_status"),
        Index(
            "uq_workspace_chat_running",
            "conversation_id",
            unique=True,
            postgresql_where=text("status = 'running'"),
        ),
    )
    id = identifier()
    conversation_id = Column(
        UUID(as_uuid=True), ForeignKey("workspace_conversations.id", ondelete="CASCADE"), nullable=False
    )
    seq = Column(Integer, nullable=False)
    role = Column(Text, nullable=False)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agent_configurations.id", ondelete="SET NULL"))
    agent_version_id = Column(
        UUID(as_uuid=True), ForeignKey("agent_configuration_versions.id", ondelete="SET NULL")
    )
    agent_handle = Column(Text)
    status = Column(Text, nullable=False, default="ok", server_default="ok")
    content = Column(Text, nullable=False, default="", server_default="")
    sources = Column(JSONB, nullable=False, default=list, server_default="[]")
    steps = Column(JSONB, nullable=False, default=list, server_default="[]")
    usage = Column(JSONB, nullable=False, default=dict, server_default="{}")
    error_code = Column(Text)
    attempt_id = Column(UUID(as_uuid=True), nullable=True)
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))
    created_at = timestamp()


class WorkflowRun(Base):
    __tablename__ = "workspace_workflow_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'awaiting_review', 'approved', 'rejected', 'failed')",
            name="ck_workspace_workflow_status",
        ),
    )
    id = identifier()
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    initiated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    request = Column(Text, nullable=False)
    status = Column(Text, nullable=False, default="queued", server_default="queued")
    # Stable identity + immutable version IDs pinned when the request is accepted.
    agents = Column(JSONB, nullable=False)
    state = Column(JSONB, nullable=False, default=dict, server_default="{}")
    revision = Column(Integer, nullable=False, default=0, server_default="0")
    attempt_id = Column(UUID(as_uuid=True))
    error_code = Column(Text)
    created_at = timestamp()
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))
    heartbeat_at = timestamp()


class WorkflowStep(Base):
    __tablename__ = "workspace_workflow_steps"
    id = identifier()
    run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspace_workflow_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    revision = Column(Integer, nullable=False, default=0)
    event = Column(Text, nullable=False)
    agent_id = Column(UUID(as_uuid=True))
    agent_version = Column(Integer)
    tool_name = Column(Text)
    # Metadata only: counts, durations, source refs, usage and error codes.
    details = Column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at = timestamp()


class WorkflowReview(Base):
    __tablename__ = "workspace_workflow_reviews"
    __table_args__ = (
        CheckConstraint(
            "action IN ('approve', 'request_changes', 'reject')", name="ck_workspace_review_action"
        ),
        UniqueConstraint("run_id", "revision", name="uq_workspace_review_revision"),
    )
    id = identifier()
    run_id = Column(
        UUID(as_uuid=True), ForeignKey("workspace_workflow_runs.id", ondelete="CASCADE"), nullable=False
    )
    revision = Column(Integer, nullable=False)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    action = Column(Text, nullable=False)
    feedback = Column(Text, nullable=False, default="", server_default="")
    created_at = timestamp()
