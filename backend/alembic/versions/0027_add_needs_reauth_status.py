"""Add the needs_reauth source status and the poller's due index

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-09

A source whose Google grant was revoked used to become plain 'error', which
the background poller retries every interval forever. 'needs_reauth' takes it
out of the poller's due set until the user reconnects.

ix_knowledge_sources_due serves the poller's scan (status filter, ordered by
last_run_at).
"""
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_knowledge_sources_status", "knowledge_sources", type_="check")
    op.create_check_constraint(
        "ck_knowledge_sources_status",
        "knowledge_sources",
        "status IN ('active', 'paused', 'error', 'needs_reauth')",
    )
    op.create_index("ix_knowledge_sources_due", "knowledge_sources", ["status", "last_run_at"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_sources_due", table_name="knowledge_sources")
    op.execute("UPDATE knowledge_sources SET status = 'error' WHERE status = 'needs_reauth'")
    op.drop_constraint("ck_knowledge_sources_status", "knowledge_sources", type_="check")
    op.create_check_constraint(
        "ck_knowledge_sources_status",
        "knowledge_sources",
        "status IN ('active', 'paused', 'error')",
    )
