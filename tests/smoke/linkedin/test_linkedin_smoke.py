"""LinkedIn end to end over HTTP: real lifespan, real JWT verification, real
Postgres, real ChatGoogleGenerativeAI making a real HTTP request. Only
Google's and Supabase's servers are fake (tests/smoke/fake_upstream.py).

The contract test pins the exact request the production key will receive, so
a library upgrade that changes it fails here instead of in production.
"""

import asyncio
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.ai.independent_agents.limits import GEMINI_ATTEMPTS, GEMINI_TIMEOUT_S
from backend.ai.independent_agents.prompts.builder import SystemPromptBuilder
from backend.ai.independent_agents.prompts.platform_specs import LINKEDIN_PROMPT
from backend.auth.models import User
from backend.core.config import settings
from backend.knowledge.embedder import FakeEmbedder
from backend.knowledge.pipeline import IngestionPipeline
from backend.knowledge.records import FetchedDocument, FileMeta
from backend.knowledge.repository import KnowledgeRepository as Repo
from backend.main import app
from tests.conftest import SMOKE_ORIGIN
from tests.smoke import jwt_keys
from tests.smoke.conftest import reset_clients
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
    """Exactly what production sends to Google with the real key (knowledge
    tools on, the default): function declarations, tool_choice=any, and no
    response schema, since the post comes back as submit_post's arguments."""
    _send(client, user, "write about our launch")

    (req,) = upstream.requests
    assert req.path == MODEL_PATH
    assert req.headers["x-goog-api-key"] == "smoke-key"
    assert req.headers["x-server-timeout"] == str(GEMINI_TIMEOUT_S)
    body = req.body
    expected_prompt = SystemPromptBuilder.build(LINKEDIN_PROMPT, tools_bound=True).text
    assert body["systemInstruction"]["parts"][0]["text"] == expected_prompt
    assert _texts(body) == [("user", "write about our launch")]
    declared = {f["name"]: f for t in body["tools"] for f in t["functionDeclarations"]}
    assert sorted(declared) == sorted(
        ["search_knowledge", "find_documents", "list_documents", "read_document", "submit_post"]
    )
    submit_params = json.dumps(declared["submit_post"])
    assert '"content"' in submit_params and "user_id" not in json.dumps(declared)
    assert body["toolConfig"]["functionCallingConfig"]["mode"] == "ANY"
    config = body["generationConfig"]
    assert "responseJsonSchema" not in config
    assert config["thinkingConfig"] == {"thinking_level": "LOW"}


def test_gemini_request_contract_with_knowledge_tools_off(db, upstream, user, monkeypatch):
    """KNOWLEDGE_TOOLS_ENABLED=False: one structured-output call, as before Day 7."""
    monkeypatch.setattr(settings, "KNOWLEDGE_TOOLS_ENABLED", False)
    upstream.reset()
    monkeypatch.setattr(settings, "GEMINI_BASE_URL", upstream.url)
    monkeypatch.setattr(settings, "LANGCHAIN_API_KEY_GEMINI", "smoke-key")
    monkeypatch.setattr(settings, "SUPABASE_URL", upstream.url)
    reset_clients()
    try:
        with TestClient(app) as client:
            res = _send(client, user, "write about our launch")
    finally:
        reset_clients()

    assert res.status_code == 200
    (req,) = upstream.requests
    body = req.body
    assert body["systemInstruction"]["parts"][0]["text"] == SystemPromptBuilder.build(LINKEDIN_PROMPT).text
    assert "tools" not in body
    config = body["generationConfig"]
    assert config["responseMimeType"] == "application/json"
    schema = config["responseJsonSchema"]
    assert schema["required"] == ["content"]
    assert schema["properties"]["content"]["type"] == "string"


def test_t16_agent_searches_a_seeded_document_then_submits(client, upstream, user, db):
    """Fake Gemini scripts search_knowledge on the user's synced doc, then
    submit_post. The second request carries the tool's real result."""
    assert client.get(f"{URL}/threads", headers=user.headers).status_code == 200  # provisions the user
    source = Repo.create_source(db, user.id, "gdrive", "acct", "Drive", {"folder_ids": ["F"]})
    asyncio.run(
        IngestionPipeline(Repo, FakeEmbedder()).ingest(
            db, user.id, source.id,
            FetchedDocument(
                FileMeta("f1", "Q3 Launch Plan", "text/markdown"),
                "# Pilot\nWe ship v2 to 40 pilot teams.\n",
                "markdown",
            ),
        )
    )
    upstream.reply_call("search_knowledge", {"query": "pilot plan"})
    upstream.reply_post("Shipping v2 to 40 pilot teams.")

    res = _send(client, user, "write about our pilot")

    assert res.status_code == 200
    assert res.json()["content"] == "Shipping v2 to 40 pilot teams."
    assert [s["title"] for s in res.json()["sources"]] == ["Q3 Launch Plan"]
    _, second = upstream.requests
    assert second.body["toolConfig"]["functionCallingConfig"]["mode"] == "ANY"
    parts = [p for c in second.body["contents"] for p in c["parts"]]
    response = next(p["functionResponse"] for p in parts if "functionResponse" in p)
    assert response["name"] == "search_knowledge"
    assert "40 pilot teams" in json.dumps(response)


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


_RENDER_SETTINGS = {
    "LANGCHAIN_API_KEY_GEMINI": "set",
    "SUPABASE_URL": "https://set.supabase.co",
    "GOOGLE_OAUTH_CLIENT_ID": "client-id",
    "GOOGLE_OAUTH_CLIENT_SECRET": "client-secret",
    "GOOGLE_DRIVE_REDIRECT_URI": "https://app.example/connect/gdrive/callback",
    "KNOWLEDGE_TOKEN_KEY": "ZmFrZS1rZXktZm9yLXRlc3RzLW9ubHktMzItYnl0ZXM=",
}


def _render_env(monkeypatch, **overrides):
    from backend.core.config import settings

    monkeypatch.setenv("RENDER", "true")
    for name, value in {**_RENDER_SETTINGS, **overrides}.items():
        monkeypatch.setattr(settings, name, value)


@pytest.mark.parametrize("setting", list(_RENDER_SETTINGS))
def test_render_without_required_setting_refuses_to_start(db, monkeypatch, setting):
    _render_env(monkeypatch, **{setting: ""})
    with pytest.raises(RuntimeError, match=setting), TestClient(app):
        pass


def test_render_with_malformed_token_key_refuses_to_start(db, monkeypatch):
    _render_env(monkeypatch, KNOWLEDGE_TOKEN_KEY="not-a-fernet-key")
    with pytest.raises(RuntimeError, match="KNOWLEDGE_TOKEN_KEY"), TestClient(app):
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
