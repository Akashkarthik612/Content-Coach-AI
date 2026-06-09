"""Reduce embedding dims 3072→768, add HNSW index, drop unused LangChain tables

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-05

Changes:
  - Drop langchain_pg_embedding + langchain_pg_collection (written by notebook,
    never read by the API — confirmed empty of user-scoped data).
  - Recreate post_embeddings.embedding as vector(768) instead of vector(3072).
    Safe because post_embeddings has always been empty (no ingestion existed).
  - Add HNSW index for O(log n) cosine search (possible now at 768 dims;
    pgvector's 2000-dim index limit was the blocker at 3072).
"""
import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision      = "0007"
down_revision = "0006"
branch_labels = None
depends_on    = None

NEW_DIM = 768
OLD_DIM = 3072


def upgrade() -> None:
    # Drop LangChain-managed tables (populated by RAG.ipynb, never queried by API)
    op.execute("DROP TABLE IF EXISTS langchain_pg_embedding CASCADE")
    op.execute("DROP TABLE IF EXISTS langchain_pg_collection CASCADE")

    # Swap embedding column: vector(3072) → vector(768)
    # post_embeddings is empty (audit confirmed no ingestion code existed),
    # so drop+add is data-safe.
    op.drop_column("post_embeddings", "embedding")
    op.add_column(
        "post_embeddings",
        sa.Column("embedding", Vector(NEW_DIM), nullable=False),
    )

    # HNSW index for approximate cosine nearest-neighbour search.
    # vector_cosine_ops matches the <=> operator used in retrieval queries.
    op.execute(
        "CREATE INDEX idx_post_embeddings_hnsw "
        "ON post_embeddings USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_post_embeddings_hnsw")
    op.drop_column("post_embeddings", "embedding")
    op.add_column(
        "post_embeddings",
        sa.Column("embedding", Vector(OLD_DIM), nullable=False),
    )
    # LangChain tables are not restored — they were external to the migration system.
