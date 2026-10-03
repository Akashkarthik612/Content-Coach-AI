"""Shared test setup: which database tests may touch, and the DB fixtures.

Three levels live under tests/:
- unit/         fakes only; runs anywhere, never opens a DB connection.
- integration/  real Postgres (migrated with Alembic), real SQL and the real
                AsyncPostgresSaver; the LLM is faked.
- smoke/        the whole stack over HTTP; only Gemini and Supabase's JWKS
                are faked (tests/smoke/fake_upstream.py).

integration/ and smoke/ need TEST_DATABASE_URL pointing at a throwaway local
Postgres with pgvector (CI uses the pgvector/pgvector:pg17 service). Without
it they are skipped. They truncate tables, so any non-local host is refused.

Everything here runs at import time, before any `backend.*` module is
imported: backend/core/database.py builds its engine from DATABASE_URL then.
"""

import asyncio
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

import pytest

ROOT = Path(__file__).resolve().parent.parent
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "")
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
_DB_LEVELS = ("integration", "smoke")

if os.getenv("CI") and not TEST_DATABASE_URL:
    raise pytest.UsageError("CI must set TEST_DATABASE_URL; integration and smoke tests would be skipped")
if TEST_DATABASE_URL:
    if urlparse(TEST_DATABASE_URL).hostname not in _LOCAL_HOSTS:
        raise pytest.UsageError(
            f"TEST_DATABASE_URL must point at a local throwaway database, got host "
            f"{urlparse(TEST_DATABASE_URL).hostname!r}. The tests truncate tables."
        )
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
else:
    # Unit tests never connect; this keeps the real .env DATABASE_URL out of reach.
    os.environ["DATABASE_URL"] = "postgresql://unused:unused@127.0.0.1:1/unused"
# Not "production": get_settings() would try to load secrets from AWS.
os.environ["ENV"] = "test"
os.environ.pop("RENDER", None)
# CORS origins are read when backend.main is imported; stands in for the Vercel URL.
SMOKE_ORIGIN = "https://honne-smoke.vercel.app"
os.environ["EXTRA_ALLOWED_ORIGINS"] = SMOKE_ORIGIN

if sys.platform == "win32":
    # psycopg's async mode can't run on the default Proactor loop.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def pytest_collection_modifyitems(config, items):
    skip = pytest.mark.skip(reason="needs TEST_DATABASE_URL (a local Postgres with pgvector)")
    for item in items:
        parts = Path(str(item.fspath)).relative_to(ROOT / "tests").parts
        for level in _DB_LEVELS:
            if parts[0] == level:
                item.add_marker(getattr(pytest.mark, level))
                if not TEST_DATABASE_URL:
                    item.add_marker(skip)


# ── DB fixtures (integration + smoke only) ────────────────────────────────────


@pytest.fixture(scope="session")
def migrated_db():
    """Bring the test database to Alembic head, exactly as the Docker CMD does
    in production. On a fresh database this also proves 0001 → head applies."""
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=ROOT,
        env={**os.environ, "DATABASE_URL": TEST_DATABASE_URL},
        check=True,
    )


@pytest.fixture
def db(migrated_db):
    """A clean database and a SQLAlchemy session on it. Truncating users
    cascades to every user-owned table; checkpoint tables only exist once the
    checkpointer's setup() has run."""
    from sqlalchemy import text

    from backend.core.database import SessionLocal

    session = SessionLocal()
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
    import uuid

    from backend.auth.models import User

    def _make(email: str | None = None) -> uuid.UUID:
        user_id = uuid.uuid4()
        db.add(User(id=user_id, email=email or f"{user_id}@test.local"))
        db.commit()
        return user_id

    return _make
