"""Add comments column to post_analytics

Revision ID: 0021
Revises: 0020
Create Date: 2026-08-04

Changes:
  - post_analytics.comments INT NOT NULL DEFAULT 0 — third engagement metric
    (alongside impressions/reactions) needed by the Analytics feature's
    engagement_rate calculation.
"""
import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "post_analytics",
        sa.Column("comments", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("post_analytics", "comments")
