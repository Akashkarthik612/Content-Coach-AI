"""Smoke fixtures: the real app with its real lifespan, real auth and the real
Gemini client — pointed at tests/smoke/fake_upstream.py instead of Google and
Supabase. Nothing inside the backend is patched."""

import uuid
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from backend.ai.independent_agents import linkedin
from backend.auth import services as auth_services
from backend.core.config import settings
from backend.main import app
from tests.smoke import fake_upstream, jwt_keys

GEMINI_KEY = "smoke-key"


@pytest.fixture(scope="session")
def upstream():
    return fake_upstream.start()


def _reset_clients():
    linkedin._structured_llm.cache_clear()  # rebuilt with the settings below
    auth_services._jwks_client = None  # refetch JWKS from the fake


@pytest.fixture
def client(db, upstream, monkeypatch):
    upstream.reset()
    monkeypatch.setattr(settings, "GEMINI_BASE_URL", upstream.url)
    monkeypatch.setattr(settings, "LANGCHAIN_API_KEY_GEMINI", GEMINI_KEY)
    monkeypatch.setattr(settings, "SUPABASE_URL", upstream.url)
    _reset_clients()
    with TestClient(app) as test_client:
        yield test_client
    _reset_clients()


@pytest.fixture
def token(upstream):
    """Mint a Supabase-style access token; defaults to a fresh user."""

    def _mint(sub: uuid.UUID | None = None, **kwargs) -> str:
        return jwt_keys.mint_token(upstream.url, sub or uuid.uuid4(), **kwargs)

    return _mint


@dataclass
class SmokeUser:
    id: uuid.UUID
    headers: dict


@pytest.fixture
def user(token) -> SmokeUser:
    """One signed-in user; send `user.headers` with each request."""
    user_id = uuid.uuid4()
    return SmokeUser(user_id, {"Authorization": f"Bearer {token(user_id, email='smoke@test.local')}"})
