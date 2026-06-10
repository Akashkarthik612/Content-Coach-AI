"""
Root conftest.py — sets environment variables and patches module-level LLM singletons
BEFORE any backend module is imported by Python's import machinery.

Execution order guaranteed by pytest:
  1. conftest.py is collected first
  2. os.environ patching + LLM patching fires at module import time (before test collection)
  3. Backend AI modules are imported by test files after patchers are started
"""

import os
import uuid
from unittest.mock import MagicMock, patch

# --- Environment must be set before any backend import ---
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/test_content_coach")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ.setdefault("LANGCHAIN_API_KEY_GEMINI", "test-key-not-real")
os.environ.setdefault("OPENAI_API_KEY", "test-key-not-real")

# --- Patch module-level LLM constructors before any backend.ai.* import fires ---
# supervisor.py, writer_node.py, analytics_node.py, embeddings.py all instantiate
# ChatGoogleGenerativeAI / GoogleGenerativeAIEmbeddings at module scope.
_llm_patcher   = patch("langchain_google_genai.ChatGoogleGenerativeAI", MagicMock())
_embed_patcher = patch("langchain_google_genai.GoogleGenerativeAIEmbeddings", MagicMock())
_llm_patcher.start()
_embed_patcher.start()

# --- Now it is safe to import backend modules ---
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from httpx import AsyncClient, ASGITransport

from alembic.config import Config as AlembicConfig
from alembic import command as alembic_command


# ---------------------------------------------------------------------------
# Session-scoped: run migrations once per test session against the test DB
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def test_engine():
    """Run alembic migrations once and return the SQLAlchemy engine."""
    cfg = AlembicConfig("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
    alembic_command.upgrade(cfg, "head")

    engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    yield engine
    engine.dispose()


# ---------------------------------------------------------------------------
# Function-scoped: each test gets its own transaction that is always rolled back.
# The begin_nested() + restart_savepoint pattern lets service code call
# db.commit() (which releases a SAVEPOINT) without touching the outer transaction.
# ---------------------------------------------------------------------------

@pytest.fixture
def db_session(test_engine):
    conn    = test_engine.connect()
    outer   = conn.begin()
    session = Session(bind=conn)
    session.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(s, tx):
        if tx.nested and not tx._parent.nested:
            s.begin_nested()

    yield session

    session.close()
    outer.rollback()
    conn.close()


# ---------------------------------------------------------------------------
# FastAPI test client with get_db and get_current_user overrides
# ---------------------------------------------------------------------------

@pytest.fixture
def test_client(db_session):
    from backend.main import app
    from backend.core.dependencies import get_db

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    client    = AsyncClient(transport=transport, base_url="http://test")

    yield client

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Domain object fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def test_user(db_session):
    import bcrypt
    from backend.auth.models import User

    user = User(
        id=uuid.uuid4(),
        username=f"testuser_{uuid.uuid4().hex[:6]}",
        email=f"test_{uuid.uuid4().hex[:6]}@example.com",
        password_hash=bcrypt.hashpw(b"testpass123", bcrypt.gensalt()).decode(),
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture
def test_folder(db_session, test_user):
    from backend.vault.models import Folder

    folder = Folder(
        id=uuid.uuid4(),
        user_id=test_user.id,
        name="Test Folder",
        description="Fixture folder",
    )
    db_session.add(folder)
    db_session.flush()
    return folder


@pytest.fixture
def test_post(db_session, test_user, test_folder):
    from backend.vault.models import Post, PostStatus

    post = Post(
        id=uuid.uuid4(),
        user_id=test_user.id,
        folder_id=test_folder.id,
        title="Test Post",
        status=PostStatus.draft,
        current_version=0,
    )
    db_session.add(post)
    db_session.flush()
    return post


@pytest.fixture
def test_version(db_session, test_post):
    from backend.vault.models import PostVersion

    version = PostVersion(
        id=uuid.uuid4(),
        post_id=test_post.id,
        version_number=1,
        content="This is version 1 content for testing purposes.",
        source="manual",
        char_count=47,
    )
    db_session.add(version)
    test_post.current_version = 1
    db_session.flush()
    return version


# ---------------------------------------------------------------------------
# Redis mock: patches cache module globals directly to bypass lazy-init
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_redis():
    import fakeredis
    import fakeredis.aioredis
    from backend.core import cache

    fake_async = fakeredis.aioredis.FakeRedis(decode_responses=True)
    fake_sync  = fakeredis.FakeRedis(decode_responses=True)

    cache._async_redis = fake_async
    cache._sync_redis  = fake_sync

    yield fake_async, fake_sync

    cache._async_redis = None
    cache._sync_redis  = None


# ---------------------------------------------------------------------------
# Mock embeddings: patches _embeddings instance in embeddings.py
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_embeddings(monkeypatch):
    mock = MagicMock()
    mock.embed_documents.return_value = [[0.1] * 768]
    mock.embed_query.return_value = [0.1] * 768
    monkeypatch.setattr("backend.ai.embeddings._embeddings", mock)
    return mock
