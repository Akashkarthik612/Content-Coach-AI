"""Extend user_profile for onboarding questionnaire data

Revision ID: 0015
Revises: 0014
Create Date: 2026-07-21

Adds profession/goals/topics (onboarding chip answers with no prior column)
and relaxes industry/role/target_audience/writing_style to nullable — the
onboarding questionnaire is skippable per-question and skippable entirely,
so a strict-required profile row could never be written for a user who skips.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision      = "0015"
down_revision = "0014"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column("user_profile", sa.Column("profession", sa.Text, nullable=True))
    op.add_column(
        "user_profile",
        sa.Column("goals", postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "user_profile",
        sa.Column("topics", postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    for column in ("industry", "role", "target_audience", "writing_style"):
        op.alter_column("user_profile", column, nullable=True)


def downgrade() -> None:
    for column in ("industry", "role", "target_audience", "writing_style"):
        op.alter_column("user_profile", column, nullable=False)
    op.drop_column("user_profile", "topics")
    op.drop_column("user_profile", "goals")
    op.drop_column("user_profile", "profession")
