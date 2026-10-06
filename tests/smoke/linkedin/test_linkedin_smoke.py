"""LinkedIn end to end over HTTP: real lifespan, real JWT verification, real
Postgres, real ChatGoogleGenerativeAI making a real HTTP request. Only
Google's and Supabase's servers are fake (tests/smoke/fake_upstream.py).

The contract test pins the exact request the production key will receive, so
a library upgrade that changes it fails here instead of in production.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.ai.independent_agents.limits import GEMINI_ATTEMPTS, GEMINI_TIMEOUT_S
from backend.ai.independent_agents.linkedin import SYSTEM_PROMPT
from backend.auth.models import User
from backend.main import app
from tests.conftest import SMOKE_ORIGIN
from tests.smoke import jwt_keys
from tests.smoke.fake_upstream import MODEL_PATH

URL = "/api/independent-agents/linkedin"


def _send(client, user, message, thread_id=None):
    body = {"message": message} | ({"thread_id": thread_id} if thread_id else {})
    return client.post(URL, json=body, headers=user.headers)


def _texts(gemini_body) -> list[tuple[str, str]]:
    return [(c["role"], c["parts"][0]["text"]) for c in gemini_body["contents"]]


# ── boot + auth ───────────────────────────────────────────────────────────────


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("kid", [jwt_keys.RS256_KID, jwt_keys.ES256_KID])
def test_supabase_token_is_accepted(client, token, kid):
    res = client.get(f"{URL}/threads", headers={"Authorization": f"Bearer {token(kid=kid)}"})
    assert res.status_code == 200


@pytest.mark.parametrize("case", ["missing", "stranger_key", "expired", "garbage"])
def test_bad_token_is_401(client, token, upstream, case):
    headers = {
        "missing": {},
        "stranger_key": {"Authorization": f"Bearer {token(stranger=True)}"},
        "expired": {"Authorization": f"Bearer {token(expires_in=-120)}"},
        "garbage": {"Authorization": "Bearer not-a-jwt"},
    }[case]

    assert client.post(URL, json={"message": "hi"}, headers=headers).status_code == 401
    assert upstream.requests == []  # rejected before any LLM call


# ── the request reaches Gemini ────────────────────────────────────────────────


def test_first_message_reaches_gemini_and_returns_its_post(client, upstream, user, db):
    upstream.reply_post("A post from Gemini")

    res = _send(client, user, "write about our launch")

    assert res.status_code == 200
    assert res.json()["content"] == "A post from Gemini"
    assert res.json()["thread"]["turn_count"] == 1
    assert len(upstream.requests) == 1
    assert db.get(User, user.id) is not None  # first request provisioned the users row


def test_gemini_request_contract(client, upstream, user):
    """Exactly what production sends to Google with the real key."""
    _send(client, user, "write about our launch")

    (req,) = upstream.requests
    assert req.path == MODEL_PATH
    assert req.headers["x-goog-api-key"] == "smoke-key"
    assert req.headers["x-server-timeout"] == str(GEMINI_TIMEOUT_S)
    body = req.body
    assert body["systemInstruction"]["parts"][0]["text"] == SYSTEM_PROMPT
    assert _texts(body) == [("user", "write about our launch")]
    config = body["generationConfig"]
    assert config["responseMimeType"] == "application/json"
    schema = config["responseJsonSchema"]
    assert schema["required"] == ["content"]
    assert schema["properties"]["content"]["type"] == "string"
    assert config["thinkingConfig"] == {"thinking_level": "LOW"}


def test_follow_up_sends_whole_conversation_to_gemini(client, upstream, user):
    tid = _send(client, user, "write about our launch").json()["thread"]["thread_id"]

    res = _send(client, user, "make it shorter", tid)

    assert res.json()["thread"]["turn_count"] == 2
    assert _texts(upstream.requests[1].body) == [
        ("user", "write about our launch"),
        ("model", "fake post 1"),
        ("user", "make it shorter"),
    ]


def test_thread_lifecycle(client, user):
    tid = _send(client, user, "hello").json()["thread"]["thread_id"]

    threads = client.get(f"{URL}/threads", headers=user.headers).json()
    assert [t["id"] for t in threads] == [tid]
    detail = client.get(f"{URL}/threads/{tid}", headers=user.headers).json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]

    assert client.delete(f"{URL}/threads/{tid}", headers=user.headers).status_code == 204
    assert client.get(f"{URL}/threads/{tid}", headers=user.headers).status_code == 404


def test_another_users_token_cannot_read_the_thread(client, user, token):
    tid = _send(client, user, "mine").json()["thread"]["thread_id"]
    intruder = {"Authorization": f"Bearer {token()}"}

    assert client.get(f"{URL}/threads/{tid}", headers=intruder).status_code == 404
    assert client.get(f"{URL}/threads", headers=intruder).json() == []


# ── Gemini failures ───────────────────────────────────────────────────────────


def test_gemini_rejecting_the_request_is_502_after_one_attempt(client, upstream, user, db):
    upstream.reply_error(400, "API key not valid")

    res = _send(client, user, "hello")

    assert res.status_code == 502
    assert res.json()["detail"] == "The LinkedIn agent could not generate a post. Please try again."
    assert len(upstream.requests) == 1  # a bad request is not retried
    assert db.scalar(text("SELECT count(*) FROM agent_threads")) == 0


def test_gemini_overloaded_is_504_after_all_attempts_and_thread_stays_usable(client, upstream, user):
    tid = _send(client, user, "first").json()["thread"]["thread_id"]
    upstream.fail_always(503)

    res = _send(client, user, "second", tid)

    assert res.status_code == 504
    assert res.json()["detail"] == "Request timed out. Please try again."
    assert len(upstream.requests) == 1 + GEMINI_ATTEMPTS

    upstream.always = None
    assert _send(client, user, "second again", tid).status_code == 200


# ── production config ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("setting", ["LANGCHAIN_API_KEY_GEMINI", "SUPABASE_URL"])
def test_render_without_required_setting_refuses_to_start(db, monkeypatch, setting):
    from backend.core.config import settings

    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setattr(settings, "LANGCHAIN_API_KEY_GEMINI", "set")
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://set.supabase.co")
    monkeypatch.setattr(settings, setting, "")

    with pytest.raises(RuntimeError, match=setting), TestClient(app):
        pass


def _preflight(client, origin):
    return client.options(
        URL,
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )


def test_cors_allows_the_frontend_origin(client):
    res = _preflight(client, SMOKE_ORIGIN)
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == SMOKE_ORIGIN


def test_cors_blocks_unknown_origins(client):
    assert "access-control-allow-origin" not in _preflight(client, "https://evil.example").headers
