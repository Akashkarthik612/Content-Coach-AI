"""Migrations 0025-0028 are reversible. No `db` fixture here: an open
session would block DROP TABLE."""

import os
import subprocess
import sys
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from tests.fixtures.db import ROOT

pytestmark = pytest.mark.integration

TABLES_0025 = ("knowledge_sources", "knowledge_documents", "knowledge_chunks")
TABLES = (*TABLES_0025, "knowledge_source_credentials")
LEASE_COLUMNS = {"sync_lease_until", "sync_lease_owner"}


def _alembic(*args: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=ROOT,
        env={**os.environ, "DATABASE_URL": os.environ["TEST_DATABASE_URL"]},
        check=True,
    )


def _query(fn):
    engine = create_engine(os.environ["TEST_DATABASE_URL"], poolclass=NullPool)
    try:
        with engine.connect() as conn:
            return fn(conn)
    finally:
        engine.dispose()


def _existing_tables() -> set[str]:
    return _query(
        lambda conn: {t for t in TABLES if conn.execute(text("SELECT to_regclass(:t)"), {"t": t}).scalar()}
    )


def _lease_columns() -> set[str]:
    return _query(
        lambda conn: set(
            conn.scalars(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'knowledge_sources' AND column_name LIKE 'sync_lease_%'"
                )
            )
        )
    )


def test_upgrade_downgrade_upgrade(migrated_db):
    try:
        assert _existing_tables() == set(TABLES)
        assert _lease_columns() == LEASE_COLUMNS
        _alembic("downgrade", "0025")
        assert _existing_tables() == set(TABLES_0025)
        assert _lease_columns() == set()
        _alembic("downgrade", "0024")
        assert _existing_tables() == set()
        _alembic("upgrade", "head")
        assert _existing_tables() == set(TABLES)
        assert _lease_columns() == LEASE_COLUMNS
    finally:
        _alembic("upgrade", "head")  # never leave later tests without the tables


def _due_index_exists() -> bool:
    return _query(lambda conn: bool(conn.execute(text("SELECT to_regclass('ix_knowledge_sources_due')")).scalar()))


def test_0027_needs_reauth_round_trip(migrated_db):
    """Downgrading turns needs_reauth back into error (the old CHECK allows
    nothing else) and drops the due index; upgrading restores both."""
    user_id, source_id = uuid.uuid4(), uuid.uuid4()

    def insert(conn):
        conn.execute(text("INSERT INTO users (id, email) VALUES (:u, :e)"), {"u": user_id, "e": f"{user_id}@t.local"})
        conn.execute(
            text(
                "INSERT INTO knowledge_sources (id, user_id, provider, account_ref, display_name, status) "
                "VALUES (:s, :u, 'gdrive', 'perm', 'a@x.com', 'needs_reauth')"
            ),
            {"s": source_id, "u": user_id},
        )
        conn.commit()

    def status(conn):
        return conn.execute(text("SELECT status FROM knowledge_sources WHERE id = :s"), {"s": source_id}).scalar()

    try:
        assert _due_index_exists()
        _query(insert)
        _alembic("downgrade", "0026")
        assert _query(status) == "error"
        assert not _due_index_exists()
        _alembic("upgrade", "head")
        assert _due_index_exists()
    finally:
        _alembic("upgrade", "head")
        _query(lambda conn: (conn.execute(text("DELETE FROM users WHERE id = :u"), {"u": user_id}), conn.commit()))


def _document_columns() -> set[str]:
    return _query(
        lambda conn: set(
            conn.execute(
                text("SELECT column_name FROM information_schema.columns WHERE table_name = 'knowledge_documents'")
            ).scalars()
        )
    )


def test_0028_body_column_round_trip(migrated_db):
    """body is added nullable (old documents are backfilled by sync) and dropped on downgrade."""
    try:
        assert "body" in _document_columns()
        _alembic("downgrade", "0027")
        assert "body" not in _document_columns()
        _alembic("upgrade", "head")
        assert "body" in _document_columns()
    finally:
        _alembic("upgrade", "head")
