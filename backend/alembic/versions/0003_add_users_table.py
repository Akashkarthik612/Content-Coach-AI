"""add users table

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-21

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

_STUB_USER_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )

    # Seed the stub dev user so existing folder rows (which reference this UUID
    # as user_id) satisfy the FK constraint added in the next migration.
    op.execute(
        f"INSERT INTO users (id, username, password_hash) "
        f"VALUES ('{_STUB_USER_ID}', 'dev_user', 'stub')"
    )


def downgrade() -> None:
    op.drop_table("users")
