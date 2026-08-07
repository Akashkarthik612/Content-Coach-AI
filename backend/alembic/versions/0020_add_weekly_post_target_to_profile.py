"""add weekly_post_target to user_profile (Schedule page's momentum target)

Revision ID: 0020
Revises: 0019
Create Date: 2026-08-03

"""
import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_profile", sa.Column("weekly_post_target", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_profile", "weekly_post_target")
