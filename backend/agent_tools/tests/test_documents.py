"""Real migrated Postgres; Google, Tavily and the LLM are controlled fakes."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI, HTTPException
from sqlalchemy import select

from backend.agent_tools import documents
from backend.agent_tools import router as api
from backend.agent_tools.models import AgentDocument, GoogleDocsConnection
from backend.agent_tools.providers import DOCS_SCOPE, ToolServiceError
from backend.agent_tools.schemas import CreateGoogleDoc
from backend.ai.tools.access import KnowledgeAccess
from backend.ai.tools.context import ToolContext
from backend.ai.tools.tool_loop import SUBMIT_ANSWER, ToolCallingRunner
from backend.auth.services import get_current_user
from backend.core.config import settings
from backend.core.database import get_db
from backend.knowledge.credentials import TokenCipher
from backend.knowledge.permissions import WorkspaceKnowledgeScope
from backend.workspaces.models import AgentVersion, Workspace, WorkspaceMember
from backend.workspaces.schemas import AgentIn
from backend.workspaces.service import save_agent
from tests.fakes import ScriptedChatModel, tool_call

pytestmark = pytest.mark.integration


@pytest.fixture
def setup(db, make_user, monkeypatch):
    monkeypatch.setattr(settings, "KNOWLEDGE_TOKEN_KEY", Fernet.generate_key().decode())
    user = make_user()
    workspace = Workspace(name="Reports test", created_by=user)
    db.add(workspace)
    db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user, role="admin"))
    db.commit()
    agent = save_agent(
        db,
        workspace.id,
        user,
        AgentIn(
            name="User configured specialist",
            handle="reporter",
            description="Prepare reports.",
            responsibility="Research and report.",
            system_prompt="Prepare sourced reports when asked.",
            enabled_tools=["web_search", "create_google_doc"],
        ),
    )
    db.commit()
    version = db.scalar(select(AgentVersion).where(AgentVersion.agent_id == agent.id))
    ctx = ToolContext(
        user,
        "custom",
        "report-test",
        knowledge_scope=WorkspaceKnowledgeScope(workspace.id),
        enabled_tools=("web_search", "create_google_doc"),
        execution_id="test-execution",
        agent_version_id=version.id,
        sources={
            "web:1": {
                "type": "web",
                "source_id": "web:1",
                "title": "Research",
                "url": "https://example.com/source",
            }
        },
    )
    return user, workspace, agent, ctx


@pytest.fixture
def google(monkeypatch):
    class Google:
        def __init__(self):
            self.files = {}
            self.creates = 0
            self.fail_format = False
            self.lose_create_response = False
            self.populate_calls = 0

        async def find(self, artifact_id):
            return self.files.get(str(artifact_id))

        async def create(self, artifact_id, title):
            self.creates += 1
            self.files[str(artifact_id)] = f"doc-{self.creates}"
            if self.lose_create_response:
                self.lose_create_response = False
                raise ToolServiceError("google_docs_unavailable")
            return self.files[str(artifact_id)]

        async def populate(self, document_id, text, requests):
            self.populate_calls += 1
            assert "Sources" in text
            if self.fail_format:
                raise ToolServiceError("google_docs_unavailable")

    value = Google()
    monkeypatch.setattr(documents, "GoogleDocuments", lambda _: value)

    async def token(_):
        return "fake-access-token"

    monkeypatch.setattr(documents, "access_token", token)
    return value


def connection(db, user):
    db.add(
        GoogleDocsConnection(
            user_id=user,
            refresh_token_enc=TokenCipher().encrypt("refresh-test"),
            scope=DOCS_SCOPE,
            email="owner@example.test",
            status="connected",
        )
    )
    db.commit()


def report():
    return CreateGoogleDoc(
        title="Étude de marché",
        blocks=[{"type": "paragraph", "text": "**Constat documenté**.", "source_ids": ["web:1"]}],
    ).model_dump()


async def test_report_is_persisted_and_same_request_is_idempotent(db, setup, google):
    user, workspace, _agent, ctx = setup
    connection(db, user)
    first = await documents.create_document(ctx, report())
    second = await documents.create_document(ctx, report())
    assert first["id"] == second["id"]
    assert first["status"] == "ready" and first["url"] == "https://docs.google.com/document/d/doc-1/edit"
    assert google.creates == 1
    db.expire_all()
    stored = db.get(AgentDocument, first["id"])
    assert stored.sources[0]["source_id"] == "web:1"
    assert len(documents.list_documents(db, workspace.id)) == 1


async def test_missing_connection_preserves_draft_then_retries(db, setup, google):
    user, _workspace, _agent, ctx = setup
    with pytest.raises(ToolServiceError, match="google_docs_not_connected"):
        await documents.create_document(ctx, report())
    assert google.creates == 0
    stored = db.scalar(select(AgentDocument))
    assert stored.payload["title"] == "Étude de marché"
    assert stored.status == "failed"
    connection(db, user)
    result = await documents.generate_document(stored.id, user)
    assert result["status"] == "ready" and google.creates == 1


async def test_failed_formatting_reuses_existing_file(db, setup, google):
    user, _, _, ctx = setup
    connection(db, user)
    google.fail_format = True
    with pytest.raises(ToolServiceError):
        await documents.create_document(ctx, report())
    stored = db.scalar(select(AgentDocument))
    assert stored.google_document_id == "doc-1" and stored.status == "failed"
    google.fail_format = False
    result = await documents.generate_document(stored.id, user)
    assert result["status"] == "ready" and google.creates == 1


async def test_lost_create_response_recovers_by_provider_marker(db, setup, google):
    user, _, _, ctx = setup
    connection(db, user)
    google.lose_create_response = True
    with pytest.raises(ToolServiceError, match="google_creation_uncertain"):
        await documents.create_document(ctx, report())
    stored = db.scalar(select(AgentDocument))
    assert stored.status == "creation_uncertain" and stored.google_document_id is None
    result = await documents.generate_document(stored.id, user)
    assert result["status"] == "ready" and google.creates == 1


async def test_cannot_retry_as_another_user_or_after_tool_removed(db, setup, google, make_user):
    user, _, agent, ctx = setup
    connection(db, user)
    google.fail_format = True
    with pytest.raises(ToolServiceError):
        await documents.create_document(ctx, report())
    stored = db.scalar(select(AgentDocument))
    other = make_user()
    with pytest.raises(HTTPException) as failure:
        await documents.generate_document(stored.id, other)
    assert failure.value.status_code == 404
    agent.enabled_tools = ["web_search"]
    db.commit()
    with pytest.raises(ToolServiceError, match="document_tool_not_enabled"):
        await documents.generate_document(stored.id, user)
    assert google.creates == 1


async def test_switched_google_account_cannot_reuse_original_document(db, setup, google):
    user, _, _, ctx = setup
    connection(db, user)
    google.fail_format = True
    with pytest.raises(ToolServiceError):
        await documents.create_document(ctx, report())
    stored = db.scalar(select(AgentDocument))
    credentials = db.get(GoogleDocsConnection, user)
    credentials.email = "different@example.test"
    db.commit()
    google.fail_format = False
    with pytest.raises(ToolServiceError, match="google_docs_account_changed"):
        await documents.generate_document(stored.id, user)
    assert google.creates == 1


async def test_report_tool_runs_without_rag_and_saves_artifact(db, setup, google):
    user, _, _, ctx = setup
    connection(db, user)
    model = ScriptedChatModel(
        tool_call("create_google_doc", report()),
        tool_call("submit_answer", {"content": "Report created.", "note": None}),
    )
    from backend.agents.records import AgentAnswer

    access = KnowledgeAccess(None, ToolCallingRunner(4, 4, 10))
    result = await access.write(model, [], AgentAnswer, ctx, SUBMIT_ANSWER)
    assert result.output.content == "Report created."
    assert ctx.artifacts[0]["status"] == "ready"
    assert "search_knowledge" not in model.calls[0][0]


async def test_catalog_and_oauth_state_are_membership_bound_and_single_use(db, setup, monkeypatch, make_user):
    user, workspace, _, _ = setup
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "fake-client")
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "fake-secret")
    monkeypatch.setattr(settings, "GOOGLE_DRIVE_REDIRECT_URI", "http://localhost/connect/gdrive/callback")
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "fake-key")
    from backend.auth.models import User

    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[get_current_user] = lambda: db.get(User, user)
    app.dependency_overrides[get_db] = lambda: db
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
        response = await client.get(f"/api/workspaces/{workspace.id}/tools")
        assert response.status_code == 200
        catalog = response.json()
        assert len(catalog["tools"]) == 6
        assert "fake-key" not in response.text
        assert catalog["google_docs"]["connected"] is False
        response = await client.get(f"/api/workspaces/{uuid4()}/tools")
        assert response.status_code == 404
        response = await client.get(f"/api/workspaces/{workspace.id}/google-docs/connect")
        from urllib.parse import parse_qs, urlsplit

        params = parse_qs(urlsplit(response.json()["auth_url"]).query)
        assert params["scope"] == [DOCS_SCOPE]
        state = params["state"][0]
        body = {"state": state, "error": "access_denied"}
        path = f"/api/workspaces/{workspace.id}/google-docs/complete"
        other = make_user()
        app.dependency_overrides[get_current_user] = lambda: db.get(User, other)
        response = await client.post(path, json=body)
        assert response.status_code == 404
        app.dependency_overrides[get_current_user] = lambda: db.get(User, user)
        response = await client.post(path, json=body)
        assert response.status_code == 400 and response.json()["detail"]["reason"] == "consent_denied"
        response = await client.post(path, json=body)
        assert response.status_code == 400 and response.json()["detail"]["reason"] == "invalid_state"


async def test_active_report_lease_blocks_concurrent_retry(db, setup, google):
    user, _, _, ctx = setup
    with pytest.raises(ToolServiceError):
        await documents.create_document(ctx, report())
    stored = db.scalar(select(AgentDocument))
    stored.lease_until = datetime.now(UTC) + timedelta(seconds=30)
    db.commit()
    with pytest.raises(ToolServiceError, match="document_busy"):
        await documents.generate_document(stored.id, user)
    assert google.creates == 0


async def test_user_defined_agent_creates_report_in_running_members_account(
    db, setup, google, make_user, monkeypatch
):
    from backend.agent_tools.providers import TavilySearch
    from backend.agents import runner as custom_runner
    from backend.ai.tools.records import SourceRef
    from backend.workspaces import chat
    from backend.workspaces.models import ChatMessage, Conversation
    from backend.workspaces.router import get_conversation

    owner, workspace, _, _ = setup
    employee = make_user()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=employee, role="member"))
    conversation = Conversation(workspace_id=workspace.id, title="Report request", created_by=employee)
    db.add(conversation)
    db.commit()
    connection(db, employee)

    async def search(*args, **kwargs):
        return [
            SourceRef(
                None,
                "Research",
                "https://example.com/source",
                kind="web",
                source_id="web:1",
                retrieved_at=datetime.now(UTC).isoformat(),
                excerpt="A public observation.",
            )
        ]

    monkeypatch.setattr(TavilySearch, "search", search)
    model = ScriptedChatModel(
        tool_call("web_search", {"query": "public research"}),
        tool_call("create_google_doc", report()),
        tool_call("submit_answer", {"content": "Your report is ready.", "note": None}),
    )
    monkeypatch.setattr(custom_runner, "chat_model", lambda _: model)
    answer_id, attempt_id = chat.start_turn(
        db, workspace.id, employee, conversation.id, "@reporter Create a sourced Google Docs report."
    )
    db.commit()
    await chat.run_turn(KnowledgeAccess(None, ToolCallingRunner(4, 4, 10)), answer_id, attempt_id)
    db.expire_all()
    answer = db.get(ChatMessage, answer_id)
    assert answer.status == "ok", answer.error_code
    assert answer.sources[0]["type"] == "web"
    document = db.scalar(select(AgentDocument))
    assert document.created_by == employee and document.created_by != owner
    assert document.message_id == answer_id and document.status == "ready"
    from backend.auth.models import User

    snapshot = get_conversation(workspace.id, conversation.id, db.get(User, employee), db)
    assert snapshot["messages"][-1]["artifacts"][0]["url"] == "https://docs.google.com/document/d/doc-1/edit"


async def test_revoked_google_grant_updates_connection_status(db, setup, google, monkeypatch):
    user, _, _, ctx = setup
    connection(db, user)

    async def revoked(_):
        raise ToolServiceError("google_docs_reconnect_required")

    monkeypatch.setattr(documents, "access_token", revoked)
    with pytest.raises(ToolServiceError, match="google_docs_reconnect_required"):
        await documents.create_document(ctx, report())
    db.expire_all()
    assert db.get(GoogleDocsConnection, user).status == "needs_reauth"
    assert google.creates == 0


async def test_creation_rechecks_internal_source_permissions(db, setup, google):
    user, _, _, ctx = setup
    connection(db, user)
    google.fail_format = True
    with pytest.raises(ToolServiceError):
        await documents.create_document(ctx, report())
    stored = db.scalar(select(AgentDocument))
    stored.sources = [{"document_id": str(uuid4()), "title": "No longer shared", "url": None}]
    db.commit()
    with pytest.raises(ToolServiceError, match="document_sources_no_longer_permitted"):
        await documents.generate_document(stored.id, user)
    assert google.populate_calls == 1


async def test_docs_oauth_success_encrypts_own_credentials_and_rejects_other_member_state(
    db, setup, monkeypatch, make_user
):
    from urllib.parse import parse_qs, urlsplit

    from backend.auth.models import User
    from backend.knowledge.connectors.google_oauth import TokenGrant

    user, workspace, _, _ = setup
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "fake-client")
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "fake-secret")
    monkeypatch.setattr(settings, "GOOGLE_DRIVE_REDIRECT_URI", "http://localhost/connect/gdrive/callback")

    async def exchange(self, code):
        assert code == "one-time-code"
        return TokenGrant(
            "access-test", datetime.now(UTC) + timedelta(hours=1), DOCS_SCOPE, "refresh-private"
        )

    class Account:
        async def account(self):
            return {"emailAddress": "employee@example.test", "permissionId": "google-account-test"}

    monkeypatch.setattr(api.GoogleOAuth, "exchange", exchange)
    monkeypatch.setattr(api, "GoogleDocuments", lambda _: Account())
    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[get_current_user] = lambda: db.get(User, user)
    app.dependency_overrides[get_db] = lambda: db
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
        response = await client.get(f"/api/workspaces/{workspace.id}/google-docs/connect")
        state = parse_qs(urlsplit(response.json()["auth_url"]).query)["state"][0]
        other = make_user()
        db.add(WorkspaceMember(workspace_id=workspace.id, user_id=other, role="member"))
        db.commit()
        app.dependency_overrides[get_current_user] = lambda: db.get(User, other)
        response = await client.post(
            f"/api/workspaces/{workspace.id}/google-docs/complete",
            json={"state": state, "code": "one-time-code"},
        )
        assert response.status_code == 400 and response.json()["detail"]["reason"] == "invalid_state"
        app.dependency_overrides[get_current_user] = lambda: db.get(User, user)
        response = await client.post(
            f"/api/workspaces/{workspace.id}/google-docs/complete",
            json={"state": state, "code": "one-time-code"},
        )
        assert response.status_code == 200 and response.json()["connected"]
        credentials = db.get(GoogleDocsConnection, user)
        assert b"refresh-private" not in credentials.refresh_token_enc
        assert TokenCipher().decrypt(credentials.refresh_token_enc) == "refresh-private"
        assert db.get(GoogleDocsConnection, other) is None
