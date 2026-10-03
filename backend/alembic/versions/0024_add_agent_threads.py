"""Add agent_threads — chat-thread registry for the independent agents

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-02

One row per LinkedIn/Reddit/X agent chat. `id` is the LangGraph thread_id;
the conversation itself lives in the checkpointer's own tables, which
AsyncPostgresSaver.setup() creates at app startup (not managed here).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_threads",
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
        ),
        sa.Column("agent", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("turn_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("busy_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "last_message_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("agent IN ('linkedin', 'reddit', 'x')", name="ck_agent_threads_agent"),
    )
    op.create_index(
        "ix_agent_threads_user_agent_recent",
        "agent_threads",
        ["user_id", "agent", "last_message_at"],  # scanned backwards for newest-first
    )


def downgrade() -> None:
    op.drop_index("ix_agent_threads_user_agent_recent", table_name="agent_threads")
    op.drop_table("agent_threads")
