"""re-add password_hash to users, nullable (local-auth dev path)

Revision ID: 0018
Revises: 0017
Create Date: 2026-07-29

"""
import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable this time — Supabase-created rows never populate this column;
    # only rows created through backend/auth_local (AUTH_PROVIDER=local) do.
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_hash")
