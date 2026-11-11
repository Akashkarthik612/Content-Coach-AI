"""Add agent_configurations: one row per user-built agent

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-16

Day_8.md D8-D1. An agent is a config row (handle, model, system prompt,
guardrails) run by one shared loop. Delete sets archived_at; the partial
unique index allows one active agent per handle per user, so archiving frees
the handle. Thread memory for custom agents comes in a later migration.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_configurations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("handle", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("guardrails", sa.Text(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("handle ~ '^[a-z0-9][a-z0-9-]{1,29}$'", name="ck_agent_configurations_handle"),
        sa.CheckConstraint("model IN ('gemini-3.5-flash')", name="ck_agent_configurations_model"),
    )
    op.create_index(
        "uq_agent_configurations_user_handle_active",
        "agent_configurations",
        ["user_id", "handle"],
        unique=True,
        postgresql_where=sa.text("archived_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_agent_configurations_user_handle_active", table_name="agent_configurations")
    op.drop_table("agent_configurations")
