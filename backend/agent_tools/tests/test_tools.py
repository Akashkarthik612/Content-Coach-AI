import json
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError

from backend.agent_tools.providers import GoogleDocuments, TavilySearch, ToolServiceError
from backend.agent_tools.rendering import render_report, units
from backend.agent_tools.schemas import CreateGoogleDoc
from backend.ai.tools.context import ToolContext
from backend.ai.tools.external import build_external_tools
from backend.ai.tools.sources import sources_allowed
from backend.core.config import settings


async def test_tavily_returns_safe_citable_evidence_and_bounded_request(monkeypatch):
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "test-secret-never-log")

    def handler(request):
        payload = json.loads(request.content)
        assert payload["max_results"] == 5
        assert payload["include_answer"] is False
        assert request.headers["Authorization"] == "Bearer test-secret-never-log"
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "title": "Research",
                        "url": "https://example.com/report?q=a_b",
                        "content": "Supported observation.",
                    },
                    {"title": "Duplicate", "url": "https://example.com/report?q=a_b", "content": "Same."},
                    {"title": "Unsafe", "url": "javascript:alert(1)", "content": "Discard."},
                    {"title": "Private", "url": "http://127.0.0.1/admin", "content": "Discard."},
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        refs = await TavilySearch(client).search("public research")
    assert len(refs) == 1
    assert refs[0].document_id is None
    assert refs[0].key.startswith("web:")
    assert refs[0].retrieved_at
    assert refs[0].excerpt == "Supported observation."


@pytest.mark.parametrize(
    ("status", "code"),
    [(401, "tavily_auth_failed"), (429, "tavily_limit_reached"), (500, "web_search_unavailable")],
)
async def test_tavily_failures_are_sanitized(monkeypatch, status, code):
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "test-secret")
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(status, text="secret upstream content"))
    ) as client:
        with pytest.raises(ToolServiceError, match=code):
            await TavilySearch(client).search("test")


async def test_missing_tavily_key_has_no_provider_call(monkeypatch):
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "")
    with pytest.raises(ToolServiceError, match="tavily_not_configured"):
        await TavilySearch().search("test")


def test_external_tools_are_explicit_opt_in():
    user = uuid4()
    assert build_external_tools(ToolContext(user, "custom", "test")) == []
    assert [
        t.name
        for t in build_external_tools(ToolContext(user, "custom", "test", enabled_tools=("web_search",)))
    ] == ["web_search"]
    declared = json.dumps(
        build_external_tools(ToolContext(user, "custom", "test", enabled_tools=("create_google_doc",)))[
            0
        ].args
    )
    assert "user_id" not in declared and "workspace_id" not in declared and "token" not in declared


async def test_preview_validates_report_without_database_or_google(monkeypatch):
    from backend.agent_tools import documents

    async def forbidden(*args):
        raise AssertionError("Preview must not use the database or Google")

    monkeypatch.setattr(documents, "database", forbidden)
    ctx = ToolContext(uuid4(), "custom", "preview", enabled_tools=("create_google_doc",), preview=True)
    tool = build_external_tools(ctx)[0]
    response = await tool.ainvoke(
        {
            "type": "tool_call",
            "id": "preview",
            "name": "create_google_doc",
            "args": {"title": "Rapport", "blocks": [{"type": "paragraph", "text": "Résumé."}]},
        }
    )
    assert json.loads(response.content)["preview_only"] is True
    assert response.artifact.result_count == 0
    assert ctx.artifacts == []


async def test_unknown_citations_are_rejected_before_any_write():
    from backend.agent_tools.documents import create_document

    ctx = ToolContext(uuid4(), "custom", "preview", preview=True)
    with pytest.raises(ToolServiceError, match="unknown_source_reference"):
        await create_document(
            ctx, {"title": "Report", "blocks": [{"text": "Claim", "source_ids": ["invented"]}]}
        )


def test_renderer_formats_french_markdown_citations_and_utf16_indices():
    payload = CreateGoogleDoc(
        title="Étude 🧪",
        blocks=[
            {"type": "heading", "text": "Résultats", "level": 1},
            {"type": "paragraph", "text": "**Décision** : vérifier le contexte 🧪.", "source_ids": ["web:1"]},
            {"type": "bullet", "text": "Préserver le fichier `docs/a__b.md`."},
        ],
    ).model_dump()
    text, requests = render_report(
        payload,
        [{"source_id": "web:1", "type": "web", "title": "Source", "url": "https://example.com/a__b?q=a*b"}],
    )
    assert "**" not in text and "`" not in text
    assert "docs/a__b.md" in text and "[1]" in text
    assert "https://example.com/a__b?q=a*b" in text
    assert units("🧪") == 2
    assert requests[0]["insertText"]["text"] == text
    assert any("createParagraphBullets" in r for r in requests)
    assert any(r.get("updateTextStyle", {}).get("textStyle", {}).get("bold") for r in requests)
    assert any(
        r.get("updateTextStyle", {}).get("textStyle", {}).get("link", {}).get("url")
        == "https://example.com/a__b?q=a*b"
        for r in requests
    )
    assert max(
        r.get("updateTextStyle", {}).get("range", {}).get("endIndex", 0) for r in requests
    ) <= 1 + units(text)


def test_web_and_internal_permissions_remain_separate():
    doc_id = uuid4()
    refs = [{"document_id": str(doc_id)}, {"type": "web", "source_id": "web:1"}]
    assert sources_allowed(refs, {doc_id}, ("web_search",))
    assert not sources_allowed(refs, {doc_id}, ())
    assert not sources_allowed(refs, set(), ("web_search",))


async def test_google_populate_recovers_lost_atomic_response_without_duplicate_text():
    calls = []
    text = "Report\nContent\n"

    def handler(request):
        calls.append(request.method)
        return httpx.Response(
            200,
            json={
                "body": {"content": [{"paragraph": {"elements": [{"textRun": {"content": text + "\n"}}]}}]}
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await GoogleDocuments("test-token", client).populate("test-doc", text, [])
    assert calls == ["GET"]


async def test_google_does_not_overwrite_user_edited_document():
    def handler(request):
        assert request.method == "GET"
        return httpx.Response(
            200,
            json={
                "body": {"content": [{"paragraph": {"elements": [{"textRun": {"content": "User edits\n"}}]}}]}
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ToolServiceError, match="google_document_modified"):
            await GoogleDocuments("test-token", client).populate("test-doc", "Expected\n", [])


def test_document_limits_and_model_owned_fields_are_rejected():
    with pytest.raises(ValidationError):
        CreateGoogleDoc(title="Report", blocks=[{"text": "A"}], user_id=str(uuid4()))
    with pytest.raises(ValidationError):
        CreateGoogleDoc(title=" ", blocks=[{"text": "A"}])
    with pytest.raises(ValidationError):
        CreateGoogleDoc(title="Report", blocks=[{"text": "A" * 6000}] * 10)


async def test_google_native_creation_and_atomic_format_requests_use_expected_apis():
    payload = CreateGoogleDoc(
        title="Résumé", blocks=[{"type": "heading", "text": "Résultats"}, {"text": "Texte vérifié."}]
    ).model_dump()
    text, requests = render_report(payload, [])
    seen = []

    def handler(request):
        seen.append((request.method, request.url.path))
        if request.method == "POST" and request.url.path == "/drive/v3/files":
            body = json.loads(request.content)
            assert body["mimeType"] == "application/vnd.google-apps.document"
            assert body["appProperties"]["honne_report_id"] == "report-marker"
            return httpx.Response(200, json={"id": "native-document"})
        if request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "revisionId": "rev-1",
                    "body": {"content": [{"paragraph": {"elements": [{"textRun": {"content": "\n"}}]}}]},
                },
            )
        body = json.loads(request.content)
        assert body["writeControl"]["requiredRevisionId"] == "rev-1"
        assert body["requests"][0]["insertText"]["text"] == text
        return httpx.Response(200, json={"replies": []})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        google = GoogleDocuments("fake-access", client)
        doc_id = await google.create("report-marker", "Résumé")
        await google.populate(doc_id, text, requests)
    assert seen == [
        ("POST", "/drive/v3/files"),
        ("GET", "/v1/documents/native-document"),
        ("POST", "/v1/documents/native-document:batchUpdate"),
    ]


async def test_search_budget_is_enforced_per_agent_turn(monkeypatch):
    async def search(*args):
        return []

    monkeypatch.setattr(TavilySearch, "search", search)
    ctx = ToolContext(uuid4(), "custom", "limited", enabled_tools=("web_search",))
    tool = build_external_tools(ctx)[0]
    for index in range(3):
        result = await tool.ainvoke(
            {"type": "tool_call", "id": str(index), "name": "web_search", "args": {"query": "public topic"}}
        )
    assert result.artifact.error_code == "web_search_limit"
