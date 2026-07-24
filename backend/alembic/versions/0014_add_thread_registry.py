"""Add thread_registry table for LangGraph thread ownership/status

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-19

NOTE: revision "0013" here refers to the phantom stamp left in alembic_version
by the now-deleted chat_sessions/chat_messages migration (see CLAUDE.md's
"Design Decisions" entry on the removed Postgres-checkpointer experiment).
That migration file no longer exists on disk, and its chat_sessions/
chat_messages tables were deliberately left in place rather than dropped —
this migration does not touch them.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision      = "0014"
down_revision = "0013"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "thread_registry",
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_thread_registry_user_id", "thread_registry", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_thread_registry_user_id", table_name="thread_registry")
    op.drop_table("thread_registry")
