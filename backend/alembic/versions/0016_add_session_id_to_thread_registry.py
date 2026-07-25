"""Add session_id to thread_registry

Revision ID: 0016
Revises: 0015
Create Date: 2026-07-25

Groups multiple thread_ids under one nullable session_id so a frontend "chat"
(which today mints a fresh LangGraph thread per message) can be reassembled
back into one scrollable conversation. Nullable and index-only — no new
table. An earlier, heavier version of this idea (chat_sessions/chat_messages,
migration 0013, since deleted) was already tried and fully reverted; this
stays deliberately minimal, storing only a grouping key on the existing
ownership-tracking table, never conversation content.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision      = "0016"
down_revision = "0015"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column("thread_registry", sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_thread_registry_session_id", "thread_registry", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_thread_registry_session_id", table_name="thread_registry")
    op.drop_column("thread_registry", "session_id")
