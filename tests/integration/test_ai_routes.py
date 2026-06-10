"""Integration tests for POST /api/ai/query and /api/ai/resume."""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock

from backend.core.dependencies import get_current_user


@pytest.fixture
def authed_ai_client(test_client, test_user):
    from backend.main import app
    app.dependency_overrides[get_current_user] = lambda: test_user
    yield test_client
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def mock_graph_complete(monkeypatch):
    """Graph returns a direct answer (status=complete)."""
    mock = AsyncMock(return_value={
        "answer": "Here is your answer.",
        "draft": "",
        "route": "direct",
        "task_type": "general",
        "messages": [],
        "query": "hello",
        "user_id": "",
        "approval_status": "",
    })
    monkeypatch.setattr("backend.ai.router.assistant.ainvoke", mock)
    return mock


@pytest.fixture
def mock_graph_awaiting(monkeypatch):
    """Graph returns a draft without answer (status=awaiting_approval)."""
    mock = AsyncMock(return_value={
        "answer": "",
        "draft": "Here is your LinkedIn draft post content.",
        "route": "write",
        "task_type": "write",
        "messages": [],
        "query": "write a post",
        "user_id": "",
        "approval_status": "",
    })
    monkeypatch.setattr("backend.ai.router.assistant.ainvoke", mock)
    return mock


@pytest.fixture
def mock_graph_resume(monkeypatch):
    """Graph returns answer on resume."""
    mock = AsyncMock(return_value={
        "answer": "Draft saved successfully as 'My New Post'.",
        "draft": "",
        "route": "direct",
        "task_type": "write",
        "messages": [],
        "query": "write a post",
        "user_id": "",
        "approval_status": "approved",
    })
    monkeypatch.setattr("backend.ai.router.assistant.ainvoke", mock)
    return mock


class TestQueryEndpoint:
    async def test_query_returns_complete_status(self, authed_ai_client, mock_graph_complete):
        r = await authed_ai_client.post("/api/ai/query", json={"prompt": "hello"})
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "complete"
        assert body["answer"] == "Here is your answer."

    async def test_query_awaiting_approval_for_write(self, authed_ai_client, mock_graph_awaiting):
        r = await authed_ai_client.post("/api/ai/query", json={"prompt": "write a post about Python"})
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "awaiting_approval"
        assert "draft" in body
        assert body["draft"] != ""
        assert "thread_id" in body
        assert body["thread_id"] is not None

    async def test_query_empty_prompt_returns_422(self, authed_ai_client):
        r = await authed_ai_client.post("/api/ai/query", json={"prompt": ""})
        assert r.status_code == 422

    async def test_query_no_auth_returns_401(self, test_client):
        r = await test_client.post("/api/ai/query", json={"prompt": "hello"})
        assert r.status_code == 401


class TestResumeEndpoint:
    async def test_resume_approved(self, authed_ai_client, mock_graph_resume):
        thread_id = str(uuid.uuid4())
        r = await authed_ai_client.post("/api/ai/resume", json={
            "thread_id": thread_id,
            "action": "approved",
            "content": "",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "complete"
        assert "answer" in body

    async def test_resume_rejected(self, authed_ai_client, monkeypatch):
        mock = AsyncMock(return_value={
            "answer": "Draft discarded.",
            "draft": "",
            "route": "direct",
            "task_type": "write",
            "messages": [],
            "query": "",
            "user_id": "",
            "approval_status": "rejected",
        })
        monkeypatch.setattr("backend.ai.router.assistant.ainvoke", mock)

        r = await authed_ai_client.post("/api/ai/resume", json={
            "thread_id": str(uuid.uuid4()),
            "action": "rejected",
            "content": "",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "complete"
