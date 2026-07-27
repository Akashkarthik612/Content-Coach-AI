"""drop password_hash from users, make username nullable (Supabase auth migration)

Revision ID: 0017
Revises: 0016
Create Date: 2026-07-26

"""
import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Supabase now owns credential validation entirely — password_hash is unused.
    op.drop_column("users", "password_hash")
    # username now comes from optional Supabase user_metadata, not a required signup field.
    op.alter_column("users", "username", existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    op.alter_column("users", "username", existing_type=sa.Text(), nullable=False)
    op.add_column(
        "users", sa.Column("password_hash", sa.Text(), nullable=False, server_default="")
    )
