"""Add ondelete=CASCADE to post_publish_log.post_id FK

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-28

Changes:
  - Drops the uncascaded FK from post_publish_log.post_id -> posts.id
  - Recreates it with ON DELETE CASCADE so that deleting a post also
    removes its publish-log entries, preventing FK violations.
"""
from alembic import op

revision      = "0010"
down_revision = "0009"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.drop_constraint(
        "post_publish_log_post_id_fkey",
        "post_publish_log",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "post_publish_log_post_id_fkey",
        "post_publish_log", "posts",
        ["post_id"], ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "post_publish_log_post_id_fkey",
        "post_publish_log",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "post_publish_log_post_id_fkey",
        "post_publish_log", "posts",
        ["post_id"], ["id"],
    )
