"""Add the knowledge store — knowledge_sources, knowledge_documents, knowledge_chunks

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-08

user -> source (one connection, e.g. a user's Google Drive) -> document (one
file) -> chunk (text + 768-dim vector). Chunks and documents copy user_id and
source_id from their parent; composite foreign keys make the database reject
a copy that doesn't match. Deleting a user or a source cascades all the way
down. The vector extension itself comes from 0002 and is not touched here.
"""
import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None

EMBEDDING_DIM = 768


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
    )


def _ts(name: str, nullable: bool = False) -> sa.Column:
    if nullable:
        return sa.Column(name, sa.DateTime(timezone=True), nullable=True)
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))


def upgrade() -> None:
    op.create_table(
        "knowledge_sources",
        _uuid_pk(),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("account_ref", sa.Text(), nullable=False, server_default=""),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("cursor", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        _ts("last_run_at", nullable=True),
        _ts("last_success_at", nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        _ts("created_at"),
        _ts("updated_at"),
        sa.CheckConstraint("provider IN ('gdrive', 'upload')", name="ck_knowledge_sources_provider"),
        sa.CheckConstraint("status IN ('active', 'paused', 'error')", name="ck_knowledge_sources_status"),
        sa.UniqueConstraint(
            "user_id", "provider", "account_ref", name="uq_knowledge_sources_user_provider_account"
        ),
        sa.UniqueConstraint("id", "user_id", name="uq_knowledge_sources_id_user"),
    )
    op.create_index("ix_knowledge_sources_user", "knowledge_sources", ["user_id"])

    op.create_table(
        "knowledge_documents",
        _uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("external_id", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.Text(), nullable=False),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        _ts("source_modified_at", nullable=True),
        sa.Column("sync_status", sa.Text(), nullable=False, server_default="synced"),
        sa.Column("last_error", sa.Text(), nullable=True),
        _ts("created_at"),
        _ts("updated_at"),
        sa.CheckConstraint("sync_status IN ('synced', 'failed')", name="ck_knowledge_documents_sync_status"),
        sa.ForeignKeyConstraint(
            ["source_id", "user_id"],
            ["knowledge_sources.id", "knowledge_sources.user_id"],
            name="fk_knowledge_documents_source",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("source_id", "external_id", name="uq_knowledge_documents_source_ext"),
        sa.UniqueConstraint("id", "user_id", "source_id", name="uq_knowledge_documents_id_user_source"),
    )
    op.create_index("ix_knowledge_documents_user_source", "knowledge_documents", ["user_id", "source_id"])

    op.create_table(
        "knowledge_chunks",
        _uuid_pk(),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("heading", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("chunk_hash", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
        sa.Column("embedding_model", sa.Text(), nullable=False),
        _ts("created_at"),
        sa.ForeignKeyConstraint(
            ["document_id", "user_id", "source_id"],
            ["knowledge_documents.id", "knowledge_documents.user_id", "knowledge_documents.source_id"],
            name="fk_knowledge_chunks_document",
            ondelete="CASCADE",
        ),
        # Deferred: a re-sync reshuffles ordinals inside one transaction.
        sa.UniqueConstraint(
            "document_id",
            "ordinal",
            name="uq_knowledge_chunks_doc_ordinal",
            deferrable=True,
            initially="DEFERRED",
        ),
    )
    op.create_index("ix_knowledge_chunks_user_source", "knowledge_chunks", ["user_id", "source_id"])
    op.create_index("ix_knowledge_chunks_doc_hash", "knowledge_chunks", ["document_id", "chunk_hash"])
    # Defaults m=16, ef_construction=64. vector_cosine_ops matches the <=> operator.
    op.execute(
        "CREATE INDEX ix_knowledge_chunks_embedding_hnsw "
        "ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_knowledge_chunks_embedding_hnsw")
    op.drop_index("ix_knowledge_chunks_doc_hash", table_name="knowledge_chunks")
    op.drop_index("ix_knowledge_chunks_user_source", table_name="knowledge_chunks")
    op.drop_table("knowledge_chunks")
    op.drop_index("ix_knowledge_documents_user_source", table_name="knowledge_documents")
    op.drop_table("knowledge_documents")
    op.drop_index("ix_knowledge_sources_user", table_name="knowledge_sources")
    op.drop_table("knowledge_sources")
