"""Add per-user Docs authorization and durable document generation records.

Revision ID: 0031
Revises: 0030
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = '0031'
down_revision = '0030'
branch_labels = None
depends_on = None


def uid(name, *args, **kwargs):
    return sa.Column(name, UUID(as_uuid=True), *args, **kwargs)


def upgrade():
    op.create_table('agent_google_docs_connections',
        uid('user_id', sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('refresh_token_enc', sa.LargeBinary(), nullable=False),
        sa.Column('scope', sa.Text(), nullable=False),
        sa.Column('email', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')))
    op.create_table('agent_docs_oauth_attempts',
        uid('id', primary_key=True, server_default=sa.text('gen_random_uuid()')),
        uid('user_id', sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        uid('workspace_id', sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True)))
    op.create_table('agent_documents',
        uid('id', primary_key=True, server_default=sa.text('gen_random_uuid()')),
        uid('workspace_id', sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
        uid('created_by', sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        uid('agent_version_id', sa.ForeignKey('agent_configuration_versions.id', ondelete='SET NULL')),
        uid('message_id', sa.ForeignKey('workspace_chat_messages.id', ondelete='CASCADE')),
        uid('run_id', sa.ForeignKey('workspace_workflow_runs.id', ondelete='CASCADE')),
        sa.Column('revision', sa.Text(), nullable=False), sa.Column('workflow_role', sa.Text()),
        sa.Column('request_key', sa.Text(), nullable=False), sa.Column('title', sa.Text(), nullable=False),
        sa.Column('payload', JSONB, nullable=False), sa.Column('sources', JSONB, nullable=False),
        sa.Column('status', sa.Text(), nullable=False), sa.Column('google_document_id', sa.Text()),
        sa.Column('google_account_id', sa.Text()), sa.Column('error_code', sa.Text()),
        sa.Column('lease_until', sa.DateTime(timezone=True)), uid('lease_id'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('workspace_id', 'created_by', 'request_key', name='uq_agent_document_request'))
    op.create_index('ix_agent_document_message', 'agent_documents', ['message_id'])
    op.create_index('ix_agent_document_run', 'agent_documents', ['run_id'])
    # Backend/migration owner bypasses RLS. Direct public Data API roles get no
    # policies: credentials and generated-report records are server-only.
    for table in ('agent_google_docs_connections', 'agent_docs_oauth_attempts', 'agent_documents'):
        op.execute(f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY')


def downgrade():
    op.drop_table('agent_documents')
    op.drop_table('agent_docs_oauth_attempts')
    op.drop_table('agent_google_docs_connections')
