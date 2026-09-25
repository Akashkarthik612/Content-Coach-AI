"""Rebuild phase 1: cut the schema down to the tables the new design needs

Revision ID: 0022
Revises: 0021
Create Date: 2026-09-24

Changes:
  - posts.content TEXT NOT NULL — backfilled from each post's current
    post_versions row; replaces the post_versions table.
  - Drops posts.folder_id, posts.current_version, post_publish_log.version_id.
  - Drops tables post_embeddings, post_tags, post_versions, folders,
    thread_registry (their indexes go with them).

Irreversible: the dropped tables' data is gone, so downgrade() raises.
"""
import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("content", sa.Text(), nullable=True))
    op.execute(
        """
        UPDATE posts p
           SET content = pv.content
          FROM post_versions pv
         WHERE pv.post_id = p.id
           AND pv.version_number = p.current_version
        """
    )
    op.execute("UPDATE posts SET content = '' WHERE content IS NULL")
    op.alter_column("posts", "content", nullable=False, server_default="")

    # Dropping a column drops the FK constraint defined on it.
    op.drop_column("post_publish_log", "version_id")
    op.drop_column("posts", "folder_id")
    op.drop_column("posts", "current_version")

    op.drop_table("post_embeddings")
    op.drop_table("post_tags")
    op.drop_table("post_versions")
    op.drop_table("folders")
    op.drop_table("thread_registry")


def downgrade() -> None:
    raise NotImplementedError(
        "0022 drops tables and their data; restore from a backup instead of downgrading."
    )
