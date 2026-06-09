"""Add post_analytics table for user-logged post performance metrics

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-09

Changes:
  - New table post_analytics (one row per post, unique on post_id).
  - Stores impressions and reactions logged by the user after publishing.
  - Indexed on user_id for fast per-user analytics queries.
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision      = "0009"
down_revision = "0008"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "post_analytics",
        sa.Column("id",          UUID(as_uuid=True),
                  server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("post_id",     UUID(as_uuid=True), nullable=False),
        sa.Column("user_id",     UUID(as_uuid=True), nullable=False),
        sa.Column("impressions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reactions",   sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"],  ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"],  ondelete="CASCADE"),
        sa.UniqueConstraint("post_id", name="uq_post_analytics_post_id"),
    )
    op.create_index("idx_post_analytics_user_id", "post_analytics", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_post_analytics_user_id", table_name="post_analytics")
    op.drop_table("post_analytics")
