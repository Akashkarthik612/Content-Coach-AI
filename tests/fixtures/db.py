"""DB fixtures for integration and smoke tests, loaded repo-wide through
`pytest_plugins` in the root conftest.py. Backend modules are imported inside
the fixtures, never at module level: the root conftest must set DATABASE_URL
first."""

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[2]
TEST_DATABASE_NAME = "honne_test"


class NotTheTestDatabaseError(RuntimeError):
    """The session is connected to a database other than honne_test."""


def assert_test_database(session: Session) -> None:
    """Last guard before a TRUNCATE: whatever the URL said, the server must
    report that this is the throwaway test database."""
    name = session.execute(text("SELECT current_database()")).scalar_one()
    if name != TEST_DATABASE_NAME:
        raise NotTheTestDatabaseError(
            f"refusing to truncate database {name!r}; tests only run against {TEST_DATABASE_NAME!r}"
        )


@pytest.fixture(scope="session")
def migrated_db():
    """Bring the test database to Alembic head, exactly as the Docker CMD does
    in production. On a fresh database this also proves 0001 → head applies."""
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=ROOT,
        env={**os.environ, "DATABASE_URL": os.environ["TEST_DATABASE_URL"]},
        check=True,
    )


@pytest.fixture
def db(migrated_db):
    """A clean database and a SQLAlchemy session on it. Truncating users
    cascades to every user-owned table; checkpoint tables only exist once the
    checkpointer's setup() has run."""
    from backend.core.database import SessionLocal

    session = SessionLocal()
    assert_test_database(session)
    session.execute(text("TRUNCATE users CASCADE"))
    session.execute(
        text(
            "DO $$ BEGIN IF to_regclass('checkpoints') IS NOT NULL THEN "
            "TRUNCATE checkpoints, checkpoint_blobs, checkpoint_writes; END IF; END $$"
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def make_user(db):
    """Insert a users row; returns its id."""
    from backend.auth.models import User

    def _make(email: str | None = None) -> uuid.UUID:
        user_id = uuid.uuid4()
        db.add(User(id=user_id, email=email or f"{user_id}@test.local"))
        db.commit()
        return user_id

    return _make
