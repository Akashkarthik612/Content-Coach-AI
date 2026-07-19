"""Add user_profile table for agent niche/context data

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-04
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision      = "0012"
down_revision = "0011"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "user_profile",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("industry", sa.Text, nullable=False),
        sa.Column("role", sa.Text, nullable=False),
        sa.Column("target_audience", sa.Text, nullable=False),
        sa.Column("writing_style", sa.Text, nullable=False),
        sa.Column("formatting_prefs", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("linkedin_headline", sa.Text, nullable=True),
        sa.Column("linkedin_about", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_user_profile_user_id", "user_profile", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_profile_user_id", table_name="user_profile")
    op.drop_table("user_profile")
