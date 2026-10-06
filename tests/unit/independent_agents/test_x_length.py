"""X agent: posts over the platform limit fail loudly, never get truncated."""

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.ai.independent_agents import x
from backend.ai.independent_agents.limits import X_POST_MAX_CHARS
from backend.auth.services import get_current_user
from backend.main import app

USER_ID = uuid.uuid4()


def test_post_at_limit_passes():
    x.XAgent.check_lengths(x.XPostResponse(posts=["a" * X_POST_MAX_CHARS]), USER_ID)


def test_post_over_limit_raises_with_position():
    result = x.XPostResponse(posts=["ok", "a" * (X_POST_MAX_CHARS + 1)])
    with pytest.raises(x.XPostTooLongError) as err:
        x.XAgent.check_lengths(result, USER_ID)
    assert (err.value.index, err.value.length) == (1, X_POST_MAX_CHARS + 1)


def test_schema_sent_to_gemini_carries_max_length():
    items = x.XPostResponse.model_json_schema()["properties"]["posts"]["items"]
    assert items == {"type": "string", "maxLength": X_POST_MAX_CHARS}


def test_route_returns_502_for_too_long_post(monkeypatch):
    async def too_long(req, user_id):
        x.XAgent.check_lengths(x.XPostResponse(posts=["a" * (X_POST_MAX_CHARS + 1)]), user_id)

    monkeypatch.setattr(x.XAgent, "run", staticmethod(too_long))
    app.dependency_overrides[get_current_user] = lambda: type("U", (), {"id": USER_ID})()
    try:
        res = TestClient(app).post("/api/independent-agents/x", json={"topic": "anything"})
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 502
    assert str(X_POST_MAX_CHARS) in res.json()["detail"]
