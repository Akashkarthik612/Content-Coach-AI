"""Placeholder for the deleted chat_sessions/chat_messages migration

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-19

The original "0013" migration (chat_sessions + chat_messages tables, part of
the AsyncPostgresSaver + persistent chat history experiment) was deleted from
this repo when that feature was reverted — see CLAUDE.md's "Design Decisions"
entry. Some real databases (including this project's dev DB) were already
stamped at revision "0013" before the file was deleted, and still physically
have the chat_sessions/chat_messages tables — dropping them is a deliberate,
separate operation this placeholder does not perform.

This file exists only so revision "0013" resolves in the migration graph
again, letting later migrations (0014+) chain off it. It makes no schema
changes.
"""

revision      = "0013"
down_revision = "0012"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
