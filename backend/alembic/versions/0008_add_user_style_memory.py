"""Add user_style_memory table for compressed style JSON memories

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-08

Changes:
  - New table user_style_memory (one row per user).
  - Stores two JSONB columns: long_term and short_term style memories.
  - Tracks post_count at last analysis so the window trigger logic can cheaply
    determine when to re-run the Style Analyzer without scanning post history.
"""
import sqlalchemy as sa
from alembic import op

revision      = "0008"
down_revision = "0007"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "user_style_memory",
        sa.Column("id",                    sa.dialects.postgresql.UUID(as_uuid=True),
                  server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id",               sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("long_term",             sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("long_term_post_count",  sa.Integer(), server_default="0", nullable=False),
        sa.Column("long_term_updated_at",  sa.DateTime(timezone=True), nullable=True),
        sa.Column("short_term",            sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("short_term_post_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("short_term_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("idx_user_style_memory_user_id", "user_style_memory", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_user_style_memory_user_id", table_name="user_style_memory")
    op.drop_table("user_style_memory")
