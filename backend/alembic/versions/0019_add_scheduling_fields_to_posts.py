"""add failed post_status value + schedule_attempts/last_schedule_error to posts

Revision ID: 0019
Revises: 0018
Create Date: 2026-08-03

"""
import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Terminal state for a scheduled post whose auto-publish attempt exhausted
    # retries — without it the scheduler's due-post query would retry a
    # permanently-broken post (e.g. expired LinkedIn token) forever.
    op.execute("ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'failed'")
    op.add_column(
        "posts",
        sa.Column("schedule_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("posts", sa.Column("last_schedule_error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("posts", "last_schedule_error")
    op.drop_column("posts", "schedule_attempts")
    # Postgres has no ALTER TYPE ... DROP VALUE — leaving 'failed' in the enum
    # on downgrade is intentional; no row will have that status once the
    # scheduler feature is rolled back.
