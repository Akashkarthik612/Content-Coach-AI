"""Integration fixtures: the real Postgres checkpointer, built with the same
helpers backend/main.py uses, and the fake LLM."""

import pytest

from backend.ai.independent_agents import linkedin
from backend.ai.independent_agents.checkpointer import create_checkpointer, create_pool
from backend.core.config import settings
from tests.fakes import FakeLLM


@pytest.fixture
def llm(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(linkedin, "_structured_llm", lambda: fake)
    return fake


@pytest.fixture
def open_saver():
    """Factory: an AsyncPostgresSaver on a fresh pool, set up like the app's
    lifespan does. Each call is a new pool, so closing one and opening another
    simulates a backend restart. The caller closes the pool."""

    async def _open():
        pool = create_pool(settings.DATABASE_URL)
        await pool.open()
        saver = create_checkpointer(pool)
        await saver.setup()
        return saver, pool

    return _open


@pytest.fixture
async def saver(db, open_saver):
    saver, pool = await open_saver()
    try:
        yield saver
    finally:
        await pool.close()
