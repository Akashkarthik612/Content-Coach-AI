"""Add knowledge_documents.body: the whole normalized document text

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-13

read_document (Day_7.md D7-D1) needs a document's full text, and only chunks
were stored. body holds it in one piece, written in the same transaction as
content_hash so both describe the same version. It is never embedded.

Nullable: documents synced before this migration get their body on the next
sync, which downloads them once more but embeds nothing.
"""
import sqlalchemy as sa
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("knowledge_documents", sa.Column("body", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("knowledge_documents", "body")
