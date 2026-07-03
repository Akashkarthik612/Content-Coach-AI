"""Add linkedin_auth table for per-user OAuth tokens

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-30
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision      = "0011"
down_revision = "0010"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "linkedin_auth",
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
        sa.Column("linkedin_id", sa.Text, nullable=False),
        sa.Column("linkedin_urn", sa.Text, nullable=False),
        sa.Column("access_token", sa.Text, nullable=False),
        sa.Column("token_type", sa.String(32), nullable=False, server_default="'Bearer'"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scope", sa.Text, nullable=False),
        sa.Column("display_name", sa.Text, nullable=False),
        sa.Column("email", sa.Text, nullable=True),
        sa.Column("profile_image_url", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_linkedin_auth_user_id", "linkedin_auth", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_linkedin_auth_user_id", table_name="linkedin_auth")
    op.drop_table("linkedin_auth")
