"""Knowledge store tables (migration 0025).

user -> KnowledgeSource (one connection) -> KnowledgeDocument (one file)
-> KnowledgeChunk (text + vector). Documents and chunks copy user_id and
source_id from their parent so search can filter without a join; the
composite foreign keys make the database reject a copy that doesn't match.
"""

import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    LargeBinary,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from backend.core.config import settings
from backend.core.database import Base

PROVIDERS = ("gdrive", "upload")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class KnowledgeSource(Base):
    """One connection: "Akash's Google Drive", "Akash's uploads". The sync
    cursor lives here, so there is no separate sync-state table."""

    __tablename__ = "knowledge_sources"
    __table_args__ = (
        CheckConstraint("provider IN ('gdrive', 'upload')", name="ck_knowledge_sources_provider"),
        # needs_reauth (0027): Google revoked access; the poller skips it until a reconnect.
        CheckConstraint(
            "status IN ('active', 'paused', 'error', 'needs_reauth')", name="ck_knowledge_sources_status"
        ),
        UniqueConstraint(
            "user_id", "provider", "account_ref", name="uq_knowledge_sources_user_provider_account"
        ),
        UniqueConstraint("id", "user_id", name="uq_knowledge_sources_id_user"),
        Index("ix_knowledge_sources_user", "user_id"),
        Index("ix_knowledge_sources_due", "status", "last_run_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default="gen_random_uuid()")
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider = Column(Text, nullable=False)
    # Which Google account; '' for uploads (one upload source per user).
    account_ref = Column(Text, nullable=False, default="", server_default="")
    display_name = Column(Text, nullable=False)
    # Selected folder/file IDs.
    config = Column(JSONB, nullable=False, default=dict, server_default="{}")
    # Opaque provider cursor (Drive changes page token). NULL = full listing next run.
    cursor = Column(Text, nullable=True)
    status = Column(Text, nullable=False, default="active", server_default="active")
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_success_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    # One sync run at a time (0026): the owner's run_id and when its lease ends.
    sync_lease_until = Column(DateTime(timezone=True), nullable=True)
    sync_lease_owner = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()")
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()")


class KnowledgeSourceCredential(Base):
    """OAuth tokens for one source (0026), Fernet-encrypted by the app. Kept
    apart from knowledge_sources so normal queries never load secrets."""

    __tablename__ = "knowledge_source_credentials"
    __table_args__ = (
        ForeignKeyConstraint(
            ["source_id", "user_id"],
            ["knowledge_sources.id", "knowledge_sources.user_id"],
            name="fk_knowledge_source_credentials_source",
            ondelete="CASCADE",
        ),
    )

    source_id = Column(UUID(as_uuid=True), primary_key=True)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    refresh_token_enc = Column(LargeBinary, nullable=False)
    access_token_enc = Column(LargeBinary, nullable=True)
    access_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    scope = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()")
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()")


class KnowledgeDocument(Base):
    """One synced file; the unit of upsert."""

    __tablename__ = "knowledge_documents"
    __table_args__ = (
        CheckConstraint("sync_status IN ('synced', 'failed')", name="ck_knowledge_documents_sync_status"),
        ForeignKeyConstraint(
            ["source_id", "user_id"],
            ["knowledge_sources.id", "knowledge_sources.user_id"],
            name="fk_knowledge_documents_source",
            ondelete="CASCADE",
        ),
        UniqueConstraint("source_id", "external_id", name="uq_knowledge_documents_source_ext"),
        UniqueConstraint("id", "user_id", "source_id", name="uq_knowledge_documents_id_user_source"),
        Index("ix_knowledge_documents_user_source", "user_id", "source_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default="gen_random_uuid()")
    user_id = Column(UUID(as_uuid=True), nullable=False)
    source_id = Column(UUID(as_uuid=True), nullable=False)
    # Drive file ID, or upload ID.
    external_id = Column(Text, nullable=False)
    title = Column(Text, nullable=False)
    mime_type = Column(Text, nullable=False)
    source_url = Column(Text, nullable=True)
    # sha256 hex of the normalized full text.
    content_hash = Column(Text, nullable=False)
    chunk_count = Column(Integer, nullable=False, default=0, server_default="0")
    # Drive modifiedTime: lets a sync skip the download when unchanged.
    source_modified_at = Column(DateTime(timezone=True), nullable=True)
    sync_status = Column(Text, nullable=False, default="synced", server_default="synced")
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()")
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()")


class KnowledgeChunk(Base):
    """One chunk of a document. user_id/source_id are copies, kept consistent
    by the composite FK. chunk_hash is indexed, not unique: a document may
    repeat a paragraph."""

    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        ForeignKeyConstraint(
            ["document_id", "user_id", "source_id"],
            ["knowledge_documents.id", "knowledge_documents.user_id", "knowledge_documents.source_id"],
            name="fk_knowledge_chunks_document",
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "document_id",
            "ordinal",
            name="uq_knowledge_chunks_doc_ordinal",
            deferrable=True,
            initially="DEFERRED",
        ),
        Index("ix_knowledge_chunks_user_source", "user_id", "source_id"),
        Index("ix_knowledge_chunks_doc_hash", "document_id", "chunk_hash"),
        Index(
            "ix_knowledge_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default="gen_random_uuid()")
    document_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    source_id = Column(UUID(as_uuid=True), nullable=False)
    # Position in the document.
    ordinal = Column(Integer, nullable=False)
    heading = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    chunk_hash = Column(Text, nullable=False)
    token_count = Column(Integer, nullable=False)
    embedding = Column(Vector(settings.EMBEDDING_DIM), nullable=False)
    # e.g. "gemini-embedding-2@768"; search only compares vectors with the current tag.
    embedding_model = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()")
