"""add user_id to posts, FK on folders, indexes

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-21

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

_STUB_USER_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    # folders.user_id already exists — just add the FK constraint
    op.create_foreign_key(
        "fk_folders_user_id", "folders", "users", ["user_id"], ["id"]
    )
    op.create_index("idx_folders_user_id", "folders", ["user_id"])

    # Add user_id to posts (nullable → backfill → not null → FK)
    op.add_column("posts", sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute(
        "UPDATE posts SET user_id = f.user_id "
        "FROM folders f WHERE posts.folder_id = f.id"
    )
    op.execute(
        f"UPDATE posts SET user_id = '{_STUB_USER_ID}' WHERE user_id IS NULL"
    )
    op.alter_column("posts", "user_id", nullable=False)
    op.create_foreign_key(
        "fk_posts_user_id", "posts", "users", ["user_id"], ["id"]
    )
    op.create_index("idx_posts_user_id", "posts", ["user_id"])

    # Add user_id to post_embeddings if that table exists and has rows
    op.add_column("post_embeddings", sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute(
        "UPDATE post_embeddings SET user_id = p.user_id "
        "FROM posts p WHERE post_embeddings.post_id = p.id"
    )
    op.execute(
        f"UPDATE post_embeddings SET user_id = '{_STUB_USER_ID}' WHERE user_id IS NULL"
    )
    op.alter_column("post_embeddings", "user_id", nullable=False)
    op.create_foreign_key(
        "fk_post_embeddings_user_id", "post_embeddings", "users", ["user_id"], ["id"]
    )
    op.create_index("idx_post_embeddings_user_id", "post_embeddings", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_post_embeddings_user_id", table_name="post_embeddings")
    op.drop_constraint("fk_post_embeddings_user_id", "post_embeddings", type_="foreignkey")
    op.drop_column("post_embeddings", "user_id")

    op.drop_index("idx_posts_user_id", table_name="posts")
    op.drop_constraint("fk_posts_user_id", "posts", type_="foreignkey")
    op.drop_column("posts", "user_id")

    op.drop_index("idx_folders_user_id", table_name="folders")
    op.drop_constraint("fk_folders_user_id", "folders", type_="foreignkey")
