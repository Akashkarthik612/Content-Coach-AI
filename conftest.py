"""Repo-wide test setup: which database tests may touch.

Lives at the repo root so it loads for every test path — tests/ and the
colocated backend/**/tests/ alike. If it lived under tests/, running
`pytest backend/knowledge/tests` alone would skip it, the backend would build
its engine from the real .env (Supabase), and the db fixture would truncate it.

Layered guards, all before any `backend.*` import (backend/core/database.py
builds its engine from DATABASE_URL at import time):
1. DATABASE_URL is forced to TEST_DATABASE_URL, or to an unreachable dummy.
2. TEST_DATABASE_URL must point at localhost.
3. The db fixture refuses to truncate unless the database is `honne_test`
   (tests/fixtures/db.py).
4. Without TEST_DATABASE_URL, DB tests skip locally and fail in CI.

Test levels:
- tests/unit/         fakes only; never opens a DB connection.
- tests/integration/  and modules marked `integration` (backend/**/tests/):
                      real Postgres migrated with Alembic; the LLM is faked.
- tests/smoke/        the whole stack over HTTP; only Gemini and Supabase's
                      JWKS are faked (tests/smoke/fake_upstream.py).
CI uses the pgvector/pgvector:pg17 service.
"""

import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import pytest

from tests.conftest import SMOKE_ORIGIN

ROOT = Path(__file__).resolve().parent
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
# The background knowledge poller must never run inside tests (CE5).
os.environ["KNOWLEDGE_SYNC_ENABLED"] = "false"
# CORS origins are read when backend.main is imported; stands in for the Vercel URL.
os.environ["EXTRA_ALLOWED_ORIGINS"] = SMOKE_ORIGIN

if sys.platform == "win32":
    # psycopg's async mode can't run on the default Proactor loop.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

pytest_plugins = ["tests.fixtures.db"]


def _level(item: pytest.Item) -> str | None:
    """A DB level from the path (tests/integration/..., tests/smoke/...) or
    from a marker the module sets itself (colocated backend/**/tests/)."""
    path = Path(str(item.fspath))
    if path.is_relative_to(ROOT / "tests"):
        first = path.relative_to(ROOT / "tests").parts[0]
        if first in _DB_LEVELS:
            return first
    for level in _DB_LEVELS:
        if item.get_closest_marker(level):
            return level
    return None


def pytest_collection_modifyitems(config, items):
    skip = pytest.mark.skip(reason="needs TEST_DATABASE_URL (a local Postgres with pgvector)")
    for item in items:
        level = _level(item)
        if level is None:
            continue
        item.add_marker(getattr(pytest.mark, level))
        if not TEST_DATABASE_URL:
            item.add_marker(skip)
