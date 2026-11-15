from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend.auth.services import get_current_user
from backend.core.database import get_db
from backend.knowledge.records import ChunkSnippet, DocumentHits
from backend.workspaces import evaluation


@pytest.fixture
def capture(monkeypatch):
    workspace, document, employee = uuid4(), uuid4(), uuid4()
    calls = []

    class Retrieval:
        async def search(self, user_id, query, *, scope):
            calls.append((user_id, query, scope))
            return [DocumentHits(document, "Test source", None, (ChunkSnippet(None, "Actual retrieved evidence"),))]

    app = FastAPI()
    app.include_router(evaluation.router, prefix="/api/workspaces")
    app.state.knowledge = SimpleNamespace(service=Retrieval())
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=employee)
    app.dependency_overrides[get_db] = lambda: SimpleNamespace(rollback=lambda: None)
    monkeypatch.setattr(evaluation.settings, "RAG_EVALUATION_WORKSPACE_IDS", str(workspace))
    monkeypatch.setattr(evaluation.service, "member", lambda *a, **kw: None)
    monkeypatch.setattr(evaluation.service, "visible_documents", lambda *a: [SimpleNamespace(id=document, sync_status="synced")])
    return TestClient(app), workspace, document, employee, calls


def test_capture_uses_real_tool_payload_and_exact_scope(capture):
    client, workspace, document, employee, calls = capture
    response = client.post(f"/api/workspaces/{workspace}/evaluation/retrieve", json={"query": "Which mode?", "document_ids": [str(document)]})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert data["retrieved_contexts"] == ["Actual retrieved evidence"]
    assert data["retrieved_source_ids"] == [str(document)]
    assert calls[0][0] == employee
    assert calls[0][2].workspace_id == workspace
    assert calls[0][2].document_ids == (document,)
    assert calls[0][2].source_ids == ()


def test_capture_disabled_by_default(capture, monkeypatch):
    client, workspace, document, _, calls = capture
    monkeypatch.setattr(evaluation.settings, "RAG_EVALUATION_WORKSPACE_IDS", "")
    result = client.post(f"/api/workspaces/{workspace}/evaluation/retrieve", json={"query": "Which mode?", "document_ids": [str(document)]})
    assert result.status_code == 404
    assert calls == []


def test_capture_requires_workspace_admin(capture, monkeypatch):
    client, workspace, document, _, calls = capture

    def refuse(*args, **kwargs):
        assert kwargs["admin"] is True
        raise HTTPException(403, "workspace_admin_required")

    monkeypatch.setattr(evaluation.service, "member", refuse)
    result = client.post(f"/api/workspaces/{workspace}/evaluation/retrieve", json={"query": "Which mode?", "document_ids": [str(document)]})
    assert result.status_code == 403
    assert calls == []


def test_capture_rejects_unshared_documents_before_search(capture):
    client, workspace, _, _, calls = capture
    result = client.post(f"/api/workspaces/{workspace}/evaluation/retrieve", json={"query": "Which mode?", "document_ids": [str(uuid4())]})
    assert result.status_code == 422
    assert calls == []


def test_capture_limits_source_count(capture):
    client, workspace, _, _, calls = capture
    result = client.post(f"/api/workspaces/{workspace}/evaluation/retrieve", json={"query": "Which mode?", "document_ids": [str(uuid4()) for _ in range(501)]})
    assert result.status_code == 422
    assert calls == []


def test_capture_preserves_all_five_hundred_document_ids(capture, monkeypatch):
    client, workspace, document, employee, calls = capture
    documents = [document, *[uuid4() for _ in range(499)]]
    monkeypatch.setattr(evaluation.service, "visible_documents", lambda *a: [
        SimpleNamespace(id=item, sync_status="synced") for item in documents
    ])
    result = client.post(f"/api/workspaces/{workspace}/evaluation/retrieve", json={
        "query": "Which mode?", "document_ids": [str(item) for item in documents],
    })
    assert result.status_code == 200, result.text
    assert calls[0][0] == employee
    assert set(calls[0][2].document_ids) == set(documents)
    assert set(result.json()["honne_document_ids"]) == {str(item) for item in documents}
