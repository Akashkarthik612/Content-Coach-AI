"""Add workspaces, explicit source sharing, versioned agents, chat and reviewable workflows.

Revision ID: 0030
Revises: 0029
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def uid(name, *args, **kwargs):
    return sa.Column(name, UUID(as_uuid=True), *args, **kwargs)


def pk():
    return uid("id", primary_key=True, server_default=sa.text("gen_random_uuid()"))


def stamp(name="created_at", nullable=False):
    return sa.Column(
        name,
        sa.DateTime(timezone=True),
        nullable=nullable,
        server_default=None if nullable else sa.text("now()"),
    )


def data(name, default="{}"):
    return sa.Column(name, JSONB(), nullable=False, server_default=default)


def upgrade():
    op.create_table(
        "workspaces",
        pk(),
        sa.Column("name", sa.Text(), nullable=False),
        uid("created_by", sa.ForeignKey("users.id", ondelete="SET NULL")),
        stamp(),
    )
    op.create_table(
        "workspace_members",
        uid("workspace_id", sa.ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True),
        uid("user_id", sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role", sa.Text(), nullable=False),
        stamp("joined_at"),
        sa.CheckConstraint("role IN ('admin', 'member')", name="ck_workspace_member_role"),
    )
    op.create_table(
        "workspace_knowledge_sources",
        uid("workspace_id", sa.ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True),
        uid("source_id", primary_key=True),
        uid("owner_id", nullable=False),
        sa.Column("document_ids", JSONB(none_as_null=True), nullable=True),
        uid("shared_by", sa.ForeignKey("users.id", ondelete="SET NULL")),
        stamp(),
        sa.ForeignKeyConstraint(
            ["source_id", "owner_id"],
            ["knowledge_sources.id", "knowledge_sources.user_id"],
            name="fk_workspace_source_owner",
            ondelete="CASCADE",
        ),
    )

    op.add_column(
        "agent_configurations", uid("workspace_id", sa.ForeignKey("workspaces.id", ondelete="CASCADE"))
    )
    op.alter_column("agent_configurations", "user_id", existing_type=UUID(as_uuid=True), nullable=True)
    op.create_check_constraint(
        "ck_agent_configuration_owner",
        "agent_configurations",
        "workspace_id IS NOT NULL OR user_id IS NOT NULL",
    )
    for name in ("name", "description", "responsibility"):
        op.add_column("agent_configurations", sa.Column(name, sa.Text(), nullable=False, server_default=""))
    op.add_column(
        "agent_configurations", sa.Column("workflow_role", sa.Text(), nullable=False, server_default="custom")
    )
    for name in ("source_ids", "document_ids", "enabled_tools"):
        op.add_column("agent_configurations", data(name, "[]"))
    op.add_column(
        "agent_configurations", sa.Column("version", sa.Integer(), nullable=False, server_default="1")
    )
    op.drop_index("uq_agent_configurations_user_handle_active", table_name="agent_configurations")
    op.create_index(
        "uq_agent_configurations_user_handle_active",
        "agent_configurations",
        ["user_id", "handle"],
        unique=True,
        postgresql_where=sa.text("archived_at IS NULL AND workspace_id IS NULL"),
    )
    op.create_index(
        "uq_agent_configurations_workspace_handle_active",
        "agent_configurations",
        ["workspace_id", "handle"],
        unique=True,
        postgresql_where=sa.text("archived_at IS NULL AND workspace_id IS NOT NULL"),
    )
    op.create_table(
        "agent_configuration_versions",
        pk(),
        uid("agent_id", sa.ForeignKey("agent_configurations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        data("configuration"),
        uid("created_by", sa.ForeignKey("users.id", ondelete="SET NULL")),
        stamp(),
        sa.UniqueConstraint("agent_id", "version", name="uq_agent_version"),
    )

    op.create_table(
        "workspace_conversations",
        pk(),
        uid("workspace_id", sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        uid("created_by", sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("next_seq", sa.Integer(), nullable=False, server_default="1"),
        stamp(),
        stamp("updated_at"),
    )
    op.create_index("ix_workspace_conversations_workspace_id", "workspace_conversations", ["workspace_id"])
    op.create_table(
        "workspace_chat_messages",
        pk(),
        uid(
            "conversation_id", sa.ForeignKey("workspace_conversations.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        uid("employee_id", sa.ForeignKey("users.id", ondelete="SET NULL")),
        uid("agent_id", sa.ForeignKey("agent_configurations.id", ondelete="SET NULL")),
        uid("agent_version_id", sa.ForeignKey("agent_configuration_versions.id", ondelete="SET NULL")),
        sa.Column("agent_handle", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default="ok"),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        data("sources", "[]"),
        data("steps", "[]"),
        data("usage"),
        sa.Column("error_code", sa.Text()),
        uid("attempt_id"),
        stamp("started_at", True),
        stamp("finished_at", True),
        stamp(),
        sa.UniqueConstraint("conversation_id", "seq", name="uq_workspace_message_seq"),
        sa.CheckConstraint("role IN ('user', 'assistant')", name="ck_workspace_message_role"),
        sa.CheckConstraint("status IN ('running', 'ok', 'failed')", name="ck_workspace_message_status"),
    )
    op.create_index(
        "uq_workspace_chat_running",
        "workspace_chat_messages",
        ["conversation_id"],
        unique=True,
        postgresql_where=sa.text("status = 'running'"),
    )
    op.create_table(
        "workspace_workflow_runs",
        pk(),
        uid("workspace_id", sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        uid("initiated_by", sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("request", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="queued"),
        data("agents"),
        data("state"),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
        uid("attempt_id"),
        sa.Column("error_code", sa.Text()),
        stamp(),
        stamp("started_at", True),
        stamp("finished_at", True),
        stamp("heartbeat_at"),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'awaiting_review', 'approved', 'rejected', 'failed')",
            name="ck_workspace_workflow_status",
        ),
    )
    op.create_index("ix_workspace_workflow_runs_workspace_id", "workspace_workflow_runs", ["workspace_id"])
    op.create_table(
        "workspace_workflow_steps",
        pk(),
        uid("run_id", sa.ForeignKey("workspace_workflow_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("event", sa.Text(), nullable=False),
        uid("agent_id"),
        sa.Column("agent_version", sa.Integer()),
        sa.Column("tool_name", sa.Text()),
        data("details"),
        stamp(),
    )
    op.create_index("ix_workspace_workflow_steps_run_id", "workspace_workflow_steps", ["run_id"])
    op.create_table(
        "workspace_workflow_reviews",
        pk(),
        uid("run_id", sa.ForeignKey("workspace_workflow_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        uid("reviewed_by", sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("feedback", sa.Text(), nullable=False, server_default=""),
        stamp(),
        sa.CheckConstraint(
            "action IN ('approve', 'request_changes', 'reject')", name="ck_workspace_review_action"
        ),
        sa.UniqueConstraint("run_id", "revision", name="uq_workspace_review_revision"),
    )
    # These are backend-owned tables. Direct Supabase anon/authenticated REST access
    # receives no policies. The migration/table owner (or backend BYPASSRLS role)
    # uses the API's explicit employee-membership checks.
    for table in (
        "workspaces",
        "workspace_members",
        "workspace_knowledge_sources",
        "agent_configuration_versions",
        "workspace_conversations",
        "workspace_chat_messages",
        "workspace_workflow_runs",
        "workspace_workflow_steps",
        "workspace_workflow_reviews",
    ):
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')


def downgrade():
    # Workspace records are removed only on explicit downgrade. Personal data is preserved.
    for table in (
        "workspace_workflow_reviews",
        "workspace_workflow_steps",
        "workspace_workflow_runs",
        "workspace_chat_messages",
        "workspace_conversations",
        "agent_configuration_versions",
    ):
        op.drop_table(table)
    # Shared agents cannot be converted into personal agents without handle/ownership ambiguity.
    op.execute("DELETE FROM agent_configurations WHERE workspace_id IS NOT NULL")
    op.drop_index("uq_agent_configurations_workspace_handle_active", table_name="agent_configurations")
    op.drop_index("uq_agent_configurations_user_handle_active", table_name="agent_configurations")
    op.drop_constraint("ck_agent_configuration_owner", "agent_configurations", type_="check")
    for name in (
        "version",
        "enabled_tools",
        "document_ids",
        "source_ids",
        "workflow_role",
        "responsibility",
        "description",
        "name",
        "workspace_id",
    ):
        op.drop_column("agent_configurations", name)
    op.alter_column("agent_configurations", "user_id", existing_type=UUID(as_uuid=True), nullable=False)
    op.create_index(
        "uq_agent_configurations_user_handle_active",
        "agent_configurations",
        ["user_id", "handle"],
        unique=True,
        postgresql_where=sa.text("archived_at IS NULL"),
    )
    op.drop_table("workspace_knowledge_sources")
    op.drop_table("workspace_members")
    op.drop_table("workspaces")
