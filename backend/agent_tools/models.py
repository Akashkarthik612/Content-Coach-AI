from sqlalchemy import Column, DateTime, ForeignKey, Index, LargeBinary, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID

from backend.core.database import Base
from backend.workspaces.models import identifier, timestamp


class GoogleDocsConnection(Base):
    __tablename__ = "agent_google_docs_connections"
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    refresh_token_enc = Column(LargeBinary, nullable=False)
    scope = Column(Text, nullable=False)
    email = Column(Text, nullable=False, default="")
    status = Column(Text, nullable=False, default="connected")
    updated_at = timestamp()


class DocsOAuthAttempt(Base):
    __tablename__ = "agent_docs_oauth_attempts"
    id = identifier()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True))


class AgentDocument(Base):
    __tablename__ = "agent_documents"
    __table_args__ = (
        UniqueConstraint("workspace_id", "created_by", "request_key", name="uq_agent_document_request"),
        Index("ix_agent_document_message", "message_id"),
        Index("ix_agent_document_run", "run_id"),
    )
    id = identifier()
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    agent_version_id = Column(
        UUID(as_uuid=True), ForeignKey("agent_configuration_versions.id", ondelete="SET NULL")
    )
    message_id = Column(UUID(as_uuid=True), ForeignKey("workspace_chat_messages.id", ondelete="CASCADE"))
    run_id = Column(UUID(as_uuid=True), ForeignKey("workspace_workflow_runs.id", ondelete="CASCADE"))
    revision = Column(Text, nullable=False, default="0")
    workflow_role = Column(Text)
    request_key = Column(Text, nullable=False)
    title = Column(Text, nullable=False)
    payload = Column(JSONB, nullable=False)
    sources = Column(JSONB, nullable=False, default=list)
    status = Column(Text, nullable=False, default="draft")
    google_document_id = Column(Text)
    google_account_id = Column(Text)
    error_code = Column(Text)
    lease_until = Column(DateTime(timezone=True))
    lease_id = Column(UUID(as_uuid=True))
    created_at = timestamp()
    updated_at = timestamp()
