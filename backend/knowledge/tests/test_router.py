"""Knowledge endpoints against real Postgres (I16-I18 and the Drive connect
flow). Google and the background sync are stubbed: no network calls."""

import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from backend.auth.services import get_current_user
from backend.core.config import settings
from backend.knowledge import router as router_module
from backend.knowledge.connectors.google_oauth import (
    DRIVE_SCOPE,
    GoogleOAuth,
    TokenGrant,
    sign_state,
    verify_state,
)
from backend.knowledge.credentials import CredentialStore
from backend.knowledge.embedder import FakeEmbedder
from backend.knowledge.models import KnowledgeChunk, KnowledgeDocument, KnowledgeSourceCredential
from backend.knowledge.pipeline import IngestionPipeline
from backend.knowledge.records import FetchedDocument, FileMeta
from backend.knowledge.repository import KnowledgeRepository as Repo

pytestmark = pytest.mark.integration


class As:
    """Switchable signed-in user for dependency_overrides."""

    def __init__(self):
        self.user = None

    def __call__(self):
        return self.user


@pytest.fixture
def oauth_settings(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "cid")
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "secret")
    monkeypatch.setattr(
        settings, "GOOGLE_DRIVE_REDIRECT_URI", "http://localhost:5173/connect/gdrive/callback"
    )
    monkeypatch.setattr(settings, "KNOWLEDGE_TOKEN_KEY", Fernet.generate_key().decode())


@pytest.fixture
def users(db, make_user):
    from backend.auth.models import User

    return db.get(User, make_user()), db.get(User, make_user())


@pytest.fixture
def signed_in():
    return As()


@pytest.fixture
def synced(monkeypatch):
    calls = []

    async def fake_sync(user_id, source_id):
        calls.append((user_id, source_id))

    monkeypatch.setattr(router_module, "run_sync_in_background", fake_sync)
    return calls


@pytest.fixture
def client(db, signed_in, synced, oauth_settings):
    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[get_current_user] = signed_in
    with TestClient(app) as c:
        yield c


@pytest.fixture
def google(monkeypatch):
    """Stub the code exchange and the account lookup."""
    state = {"grant": None, "account": {"permission_id": "perm-1", "email": "a@x.com"}}

    def grant(scope=DRIVE_SCOPE, refresh="1//refresh", access="ya29.access"):
        return TokenGrant(access, datetime.now(timezone.utc) + timedelta(hours=1), scope, refresh)

    state["grant"] = grant()

    async def exchange(self, code):
        return state["grant"]

    async def revoke(self, token):
        state["revoked"] = token

    async def account(client):
        return state["account"]

    monkeypatch.setattr(GoogleOAuth, "exchange", exchange)
    monkeypatch.setattr(GoogleOAuth, "revoke", revoke)
    monkeypatch.setattr(router_module, "drive_account", account)
    state["make_grant"] = grant
    return state


def count(db, model, *where):
    db.expire_all()
    return db.execute(select(func.count()).select_from(model).where(*where)).scalar_one()


# ── connect flow ──────────────────────────────────────────────────────────────


def test_connect_returns_consent_url_with_state_for_this_user(client, signed_in, users):
    signed_in.user = users[0]
    res = client.get("/api/knowledge/sources/gdrive/connect")
    params = parse_qs(urlparse(res.json()["auth_url"]).query)
    assert params["scope"] == [DRIVE_SCOPE]
    assert params["access_type"] == ["offline"] and params["prompt"] == ["consent select_account"]
    assert verify_state(params["state"][0]) == users[0].id


def test_connect_without_google_config_is_503(client, signed_in, users, monkeypatch):
    signed_in.user = users[0]
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "")
    assert client.get("/api/knowledge/sources/gdrive/connect").status_code == 503


def test_complete_creates_source_with_encrypted_tokens(client, db, signed_in, users, google):
    signed_in.user = users[0]
    res = client.post(
        "/api/knowledge/sources/gdrive/complete", json={"state": sign_state(users[0].id), "code": "c"}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["provider"], body["display_name"], body["needs_reconnect"]) == ("gdrive", "a@x.com", False)
    stored = db.get(KnowledgeSourceCredential, body["id"])
    assert b"1//refresh" not in stored.refresh_token_enc
    import asyncio

    creds = asyncio.run(CredentialStore(Repo).load(db, users[0].id, stored.source_id))
    assert (creds.refresh_token, creds.access_token) == ("1//refresh", "ya29.access")


def test_reconnecting_same_account_reuses_source_and_reactivates(client, db, signed_in, users, google):
    signed_in.user = users[0]
    first = client.post(
        "/api/knowledge/sources/gdrive/complete", json={"state": sign_state(users[0].id), "code": "c"}
    )
    source_id = first.json()["id"]
    Repo.mark_needs_reauth(db, users[0].id, source_id, "auth_revoked: reconnect Google Drive")
    listed = client.get("/api/knowledge/sources").json()
    assert (listed[0]["status"], listed[0]["needs_reconnect"]) == ("needs_reauth", True)
    google["grant"] = google["make_grant"](refresh="1//new")
    second = client.post(
        "/api/knowledge/sources/gdrive/complete", json={"state": sign_state(users[0].id), "code": "c"}
    )
    assert second.json()["id"] == source_id
    assert (second.json()["status"], second.json()["needs_reconnect"]) == ("active", False)
    assert count(db, KnowledgeSourceCredential) == 1


def test_reconnect_with_folders_picked_resumes_syncing_at_once(client, db, signed_in, users, google, synced):
    signed_in.user = users[0]
    complete = {"state": sign_state(users[0].id), "code": "c"}
    source_id = client.post("/api/knowledge/sources/gdrive/complete", json=complete).json()["id"]
    assert synced == []  # a fresh connect has nothing selected yet: no sync

    Repo.update_source_config(db, users[0].id, source_id, "a@x.com", {"folder_ids": ["F"], "file_ids": []})
    Repo.mark_needs_reauth(db, users[0].id, source_id, "auth_revoked: reconnect Google Drive")
    client.post("/api/knowledge/sources/gdrive/complete", json={**complete, "state": sign_state(users[0].id)})
    assert [str(s) for _, s in synced] == [source_id]


def test_complete_rejects_a_state_sealed_for_another_user(client, db, signed_in, users, google):
    attacker, victim = users
    signed_in.user = victim  # the victim's browser finishes the attacker's consent link
    res = client.post(
        "/api/knowledge/sources/gdrive/complete", json={"state": sign_state(attacker.id), "code": "c"}
    )
    assert (res.status_code, res.json()["detail"]["reason"]) == (400, "invalid_state")
    assert Repo.list_sources(db, attacker.id) == [] and Repo.list_sources(db, victim.id) == []


@pytest.mark.parametrize(
    ("payload", "reason"),
    [
        ({"error": "access_denied"}, "consent_denied"),
        ({"error": "server_error"}, "oauth_error"),
        ({}, "missing_code"),
    ],
)
def test_complete_reports_consent_problems(client, db, signed_in, users, google, payload, reason):
    signed_in.user = users[0]
    res = client.post(
        "/api/knowledge/sources/gdrive/complete", json={"state": sign_state(users[0].id), **payload}
    )
    assert (res.status_code, res.json()["detail"]["reason"]) == (400, reason)
    assert Repo.list_sources(db, users[0].id) == []


def test_complete_requires_drive_scope_and_refresh_token(client, db, signed_in, users, google):
    signed_in.user = users[0]
    state = sign_state(users[0].id)
    google["grant"] = google["make_grant"](scope="openid email")
    res = client.post("/api/knowledge/sources/gdrive/complete", json={"state": state, "code": "c"})
    assert res.json()["detail"]["reason"] == "scope_not_granted"
    assert google["revoked"] == "ya29.access"
    google["grant"] = google["make_grant"](refresh=None)
    res = client.post("/api/knowledge/sources/gdrive/complete", json={"state": state, "code": "c"})
    assert res.json()["detail"]["reason"] == "no_refresh_token"
    assert Repo.list_sources(db, users[0].id) == []


def test_complete_rejects_garbage_state(client, signed_in, users, google):
    signed_in.user = users[0]
    res = client.post("/api/knowledge/sources/gdrive/complete", json={"state": "garbage", "code": "c"})
    assert res.json()["detail"]["reason"] == "invalid_state"


# ── I16 ownership ─────────────────────────────────────────────────────────────


def test_i16_other_users_source_is_always_404(client, db, signed_in, users, synced):
    owner, other = users
    source = Repo.create_source(db, owner.id, "gdrive", "perm", "a@x.com", {"folder_ids": ["F"]})
    signed_in.user = other
    base = f"/api/knowledge/sources/{source.id}"
    assert client.get(f"{base}/folders").status_code == 404
    assert client.put(f"{base}/selection", json={"folder_ids": ["X"]}).status_code == 404
    assert client.post(f"{base}/sync").status_code == 404
    assert client.delete(base).status_code == 404
    assert client.get("/api/knowledge/sources").json() == []
    assert synced == []
    assert Repo.get_source(db, owner.id, source.id).config == {"folder_ids": ["F"]}


# ── I17 selection, sync ───────────────────────────────────────────────────────


def test_i17_selection_saves_config_and_clears_cursor(client, db, signed_in, users):
    user = users[0]
    source = Repo.create_source(db, user.id, "gdrive", "perm", "a@x.com", {})
    Repo.update_source_cursor(db, user.id, source.id, "c1", ok=True)
    signed_in.user = user
    res = client.put(
        f"/api/knowledge/sources/{source.id}/selection",
        json={"folder_ids": ["F1", "F1", "root"], "file_ids": ["a_B-1"]},
    )
    assert res.status_code == 200
    db.expire_all()
    after = Repo.get_source(db, user.id, source.id)
    assert after.config == {"folder_ids": ["F1", "root"], "file_ids": ["a_B-1"]}
    assert after.cursor is None


@pytest.mark.parametrize(
    "body",
    [
        {"folder_ids": ["x' or name contains 'secret"]},
        {"file_ids": ["a/b"]},
        {"folder_ids": [f"f{i}" for i in range(201)]},
    ],
    ids=["quote-injection", "slash", "too-many"],
)
def test_selection_rejects_unsafe_or_excessive_ids(client, db, signed_in, users, body):
    source = Repo.create_source(db, users[0].id, "gdrive", "perm", "a@x.com", {})
    signed_in.user = users[0]
    assert client.put(f"/api/knowledge/sources/{source.id}/selection", json=body).status_code == 422


def test_browse_rejects_unsafe_parent_id(client, db, signed_in, users):
    source = Repo.create_source(db, users[0].id, "gdrive", "perm", "a@x.com", {})
    signed_in.user = users[0]
    res = client.get(
        f"/api/knowledge/sources/{source.id}/folders", params={"parent_id": "x' in parents or '1"}
    )
    assert res.status_code == 422


def test_sync_now_is_accepted_and_runs_in_background(client, db, signed_in, users, synced):
    source = Repo.create_source(db, users[0].id, "gdrive", "perm", "a@x.com", {"folder_ids": ["F"]})
    signed_in.user = users[0]
    res = client.post(f"/api/knowledge/sources/{source.id}/sync")
    assert (res.status_code, res.json()) == (202, {"status": "started"})
    assert synced == [(users[0].id, source.id)]


# ── I18 delete ────────────────────────────────────────────────────────────────


async def test_i18_delete_removes_documents_chunks_and_credentials(client, db, signed_in, users, google):
    user = users[0]
    source = Repo.create_source(db, user.id, "gdrive", "perm", "a@x.com", {"folder_ids": ["F"]})
    await CredentialStore(Repo).save(db, user.id, source.id, "1//refresh", "ya29", None, DRIVE_SCOPE)
    meta = FileMeta(external_id="f1", title="Doc", mime_type="text/markdown")
    await IngestionPipeline(Repo, FakeEmbedder()).ingest(
        db, user.id, source.id, FetchedDocument(meta=meta, text="# A\nalpha\n", kind="markdown")
    )
    assert count(db, KnowledgeChunk) > 0

    signed_in.user = user
    assert client.delete(f"/api/knowledge/sources/{source.id}").status_code == 204
    assert (
        count(db, KnowledgeDocument) == count(db, KnowledgeChunk) == count(db, KnowledgeSourceCredential) == 0
    )
    assert google["revoked"] == "1//refresh"
    assert client.delete(f"/api/knowledge/sources/{source.id}").status_code == 404


async def ingest(db, user_id, source_id, external_id, text):
    meta = FileMeta(external_id=external_id, title=f"Doc {external_id}", mime_type="text/markdown")
    await IngestionPipeline(Repo, FakeEmbedder()).ingest(
        db, user_id, source_id, FetchedDocument(meta=meta, text=text, kind="markdown")
    )


async def test_documents_lists_only_the_signed_in_users_documents(client, db, signed_in, users):
    a, b = users
    sa = Repo.create_source(db, a.id, "gdrive", "pa", "a@x.com", {"folder_ids": ["F"]})
    sb = Repo.create_source(db, b.id, "gdrive", "pb", "b@x.com", {"folder_ids": ["F"]})
    await ingest(db, a.id, sa.id, "a1", "# A\nalpha\n")
    await ingest(db, b.id, sb.id, "b1", "# B\nbeta\n")
    Repo.mark_failed(db, a.id, sa.id, "a1", "file over 20 MB")

    signed_in.user = a
    docs = client.get("/api/knowledge/documents").json()
    assert [(d["title"], d["source_id"]) for d in docs] == [("Doc a1", str(sa.id))]
    assert docs[0]["chunk_count"] > 0  # a failed refresh keeps the old chunks searchable
    assert (docs[0]["sync_status"], docs[0]["last_error"]) == ("failed", "file over 20 MB")
    assert "content" not in docs[0] and "embedding" not in docs[0]


def test_sources_report_a_running_sync(client, db, signed_in, users):
    user = users[0]
    source = Repo.create_source(db, user.id, "gdrive", "perm", "a@x.com", {"folder_ids": ["F"]})
    signed_in.user = user
    assert client.get("/api/knowledge/sources").json()[0]["syncing"] is False

    assert Repo.acquire_sync_lease(db, user.id, source.id, uuid.uuid4(), 60)
    listed = client.get("/api/knowledge/sources").json()[0]
    assert listed["syncing"] is True and listed["last_run_at"] is None


async def test_delete_document_removes_it_and_its_chunks_and_excludes_it(client, db, signed_in, users):
    a, b = users
    sa = Repo.create_source(db, a.id, "gdrive", "pa", "a@x.com", {"folder_ids": ["F"]})
    Repo.update_source_cursor(db, a.id, sa.id, "c1", ok=True)
    await ingest(db, a.id, sa.id, "a1", "# A\nalpha\n")
    await ingest(db, a.id, sa.id, "a2", "# B\nbeta\n")
    doc = Repo.get_document(db, a.id, sa.id, "a1")

    signed_in.user = b  # someone else's document is 404, and stays
    assert client.delete(f"/api/knowledge/documents/{doc.id}").status_code == 404
    assert count(db, KnowledgeDocument) == 2

    signed_in.user = a
    assert client.delete(f"/api/knowledge/documents/{doc.id}").status_code == 204
    assert count(db, KnowledgeChunk, KnowledgeChunk.document_id == doc.id) == 0
    assert [d["title"] for d in client.get("/api/knowledge/documents").json()] == ["Doc a2"]
    after = Repo.get_source(db, a.id, sa.id)
    assert (after.config["excluded_ids"], after.cursor) == (["a1"], "c1")
    assert client.delete(f"/api/knowledge/documents/{doc.id}").status_code == 404


def test_selection_change_keeps_excluded_documents(client, db, signed_in, users):
    user = users[0]
    source = Repo.create_source(
        db, user.id, "gdrive", "perm", "a@x.com", {"folder_ids": ["F"], "excluded_ids": ["x1"]}
    )
    signed_in.user = user
    client.put(f"/api/knowledge/sources/{source.id}/selection", json={"folder_ids": ["G"]})
    db.expire_all()
    assert Repo.get_source(db, user.id, source.id).config["excluded_ids"] == ["x1"]
