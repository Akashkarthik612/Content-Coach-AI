"""Add knowledge_source_credentials and the sync lease on knowledge_sources

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-09

Credentials live 1:1 with a source in their own table, so ordinary source
queries never load secrets. Tokens are Fernet-encrypted by the app
(KNOWLEDGE_TOKEN_KEY); the database only ever sees ciphertext.

sync_lease_until / sync_lease_owner give one sync run per source at a time.
A run takes the lease with an atomic UPDATE, renews and releases it only
while it still owns it, and a crashed run's lease simply expires. Unlike a
session advisory lock, this works behind either Supabase pooler.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "knowledge_source_credentials",
        sa.Column("source_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("refresh_token_enc", sa.LargeBinary(), nullable=False),
        sa.Column("access_token_enc", sa.LargeBinary(), nullable=True),
        sa.Column("access_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["source_id", "user_id"],
            ["knowledge_sources.id", "knowledge_sources.user_id"],
            name="fk_knowledge_source_credentials_source",
            ondelete="CASCADE",
        ),
    )
    op.add_column(
        "knowledge_sources", sa.Column("sync_lease_until", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "knowledge_sources", sa.Column("sync_lease_owner", postgresql.UUID(as_uuid=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("knowledge_sources", "sync_lease_owner")
    op.drop_column("knowledge_sources", "sync_lease_until")
    op.drop_table("knowledge_source_credentials")
