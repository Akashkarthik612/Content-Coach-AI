"""add email to users

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-21

"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable so the existing stub dev user row is unaffected.
    # NULL values do not conflict with the unique constraint in PostgreSQL.
    op.add_column("users", sa.Column("email", sa.Text(), nullable=True))
    op.create_unique_constraint("uq_users_email", "users", ["email"])


def downgrade() -> None:
    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.drop_column("users", "email")
