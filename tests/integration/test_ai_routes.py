"""Integration tests for POST /api/ai/query and /api/ai/resume."""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock

from backend.ai.router import get_assistant
from backend.core.dependencies import get_current_user


@pytest.fixture
def ai_client_no_auth(test_client):
    """
    Like authed_ai_client but deliberately WITHOUT a get_current_user override —
    for testing the missing-auth-header path itself. Still needs a get_assistant
    override for the same reason as authed_ai_client (see its docstring).
    """
    from backend.main import app
    app.dependency_overrides[get_assistant] = lambda: _mock_assistant({
        "answer": "", "draft": "", "route": "", "task_type": "", "messages": [],
        "query": "", "user_id": "", "approval_status": "",
    })
    yield test_client
    app.dependency_overrides.pop(get_assistant, None)


@pytest.fixture
def authed_ai_client(test_client, test_user):
    """
    assistant = Depends(get_assistant) is resolved by FastAPI for every request
    to these routes before the route body runs — even ones that fail body
    validation (empty prompt, missing auth) before ever touching the graph.
    Give every test a harmless default mock so app.state.assistant (set once at
    import time in backend/main.py against an in-memory MemorySaver) doesn't
    need to exist; mock_graph_* fixtures override this per-test with a more
    specific one when a test actually cares about the graph's output.
    """
    from backend.main import app
    app.dependency_overrides[get_current_user] = lambda: test_user
    app.dependency_overrides[get_assistant] = lambda: _mock_assistant({
        "answer": "", "draft": "", "route": "", "task_type": "", "messages": [],
        "query": "", "user_id": "", "approval_status": "",
    })
    yield test_client
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_assistant, None)


def _mock_assistant(ainvoke_return: dict) -> MagicMock:
    """
    Builds a stand-in for the compiled LangGraph assistant, overriding the
    get_assistant dependency (see backend/ai/router.py) instead of patching
    backend.main.app.state.assistant directly.
    """
    assistant = MagicMock()
    assistant.ainvoke = AsyncMock(return_value=ainvoke_return)
    assistant.aget_state = AsyncMock(return_value=MagicMock(values={"messages": []}))
    assistant.aupdate_state = AsyncMock(return_value=None)
    return assistant


@pytest.fixture
def mock_graph_complete():
    """Graph returns a direct answer (status=complete)."""
    from backend.main import app
    assistant = _mock_assistant({
        "answer": "Here is your answer.",
        "draft": "",
        "route": "direct",
        "task_type": "general",
        "messages": [],
        "query": "hello",
        "user_id": "",
        "approval_status": "",
    })
    app.dependency_overrides[get_assistant] = lambda: assistant
    yield assistant.ainvoke
    app.dependency_overrides.pop(get_assistant, None)


@pytest.fixture
def mock_graph_awaiting():
    """Graph returns a draft without answer (status=awaiting_approval)."""
    from backend.main import app
    assistant = _mock_assistant({
        "answer": "",
        "draft": "Here is your LinkedIn draft post content.",
        "route": "write",
        "task_type": "write",
        "messages": [],
        "query": "write a post",
        "user_id": "",
        "approval_status": "",
    })
    app.dependency_overrides[get_assistant] = lambda: assistant
    yield assistant.ainvoke
    app.dependency_overrides.pop(get_assistant, None)


@pytest.fixture
def mock_graph_resume():
    """Graph returns answer on resume."""
    from backend.main import app
    assistant = _mock_assistant({
        "answer": "Draft saved successfully as 'My New Post'.",
        "draft": "",
        "route": "direct",
        "task_type": "write",
        "messages": [],
        "query": "write a post",
        "user_id": "",
        "approval_status": "approved",
    })
    app.dependency_overrides[get_assistant] = lambda: assistant
    yield assistant.ainvoke
    app.dependency_overrides.pop(get_assistant, None)


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

    async def test_query_no_auth_returns_422(self, ai_client_no_auth):
        # Missing required X-User-Id header → FastAPI returns 422
        r = await ai_client_no_auth.post("/api/ai/query", json={"prompt": "hello"})
        assert r.status_code == 422


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

    async def test_resume_rejected(self, authed_ai_client):
        from backend.main import app

        assistant = _mock_assistant({
            "answer": "Draft discarded.",
            "draft": "",
            "route": "direct",
            "task_type": "write",
            "messages": [],
            "query": "",
            "user_id": "",
            "approval_status": "rejected",
        })
        app.dependency_overrides[get_assistant] = lambda: assistant
        try:
            r = await authed_ai_client.post("/api/ai/resume", json={
                "thread_id": str(uuid.uuid4()),
                "action": "rejected",
                "content": "",
            })
            assert r.status_code == 200
            assert r.json()["status"] == "complete"
        finally:
            app.dependency_overrides.pop(get_assistant, None)
