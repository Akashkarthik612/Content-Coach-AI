"""Drop users.password_hash — Supabase now owns all credentials

Revision ID: 0023
Revises: 0022
Create Date: 2026-09-25

Auth is Supabase-only (no local/dev password provider), so this column has
been dead since password_hash was last populated. `backend/auth/models.py`
already stopped declaring it; this brings the schema back in sync.
"""
import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("users", "password_hash")


def downgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))
