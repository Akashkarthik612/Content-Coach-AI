"""Bounded HTTP clients. Never log provider bodies, keys, queries or tokens."""

import re
from datetime import UTC, datetime
from hashlib import sha256
from urllib.parse import urlsplit

import httpx

from backend.ai.tools.records import SourceRef
from backend.core.config import settings
from backend.knowledge.connectors.google_oauth import GoogleOAuth, _url

DOCS_SCOPE = "https://www.googleapis.com/auth/drive.file"


class ToolServiceError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def public_url(value: str) -> bool:
    try:
        from ipaddress import ip_address

        parsed = urlsplit(value)
        host = parsed.hostname or ""
        if parsed.scheme not in ("https", "http") or not host or parsed.username or parsed.password:
            return False
        if host.lower() == "localhost" or host.endswith((".local", ".internal")):
            return False
        try:
            return ip_address(host).is_global
        except ValueError:
            return "." in host
    except ValueError:
        return False


class TavilySearch:
    def __init__(self, client=None):
        self.client = client

    async def search(self, query, time_range=None, include_domains=None):
        if not settings.TAVILY_API_KEY:
            raise ToolServiceError("tavily_not_configured")
        if not query.strip():
            raise ToolServiceError("invalid_search_query")
        domains = include_domains or []
        if any(not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?", d) for d in domains):
            raise ToolServiceError("invalid_search_domain")
        body = {
            "query": query,
            "search_depth": "basic",
            "max_results": 5,
            "include_answer": False,
            "include_raw_content": False,
            "auto_parameters": False,
        }
        if time_range:
            body["time_range"] = time_range
        if domains:
            body["include_domains"] = domains
        try:
            async with httpx.AsyncClient() as default:
                response = await (self.client or default).post(
                    settings.TAVILY_BASE_URL.rstrip("/") + "/search",
                    json=body,
                    headers={"Authorization": f"Bearer {settings.TAVILY_API_KEY}"},
                    timeout=10,
                )
            if response.status_code in (401, 403):
                raise ToolServiceError("tavily_auth_failed")
            if response.status_code in (429, 432, 433):
                raise ToolServiceError("tavily_limit_reached")
            if response.status_code != 200:
                raise ToolServiceError("web_search_unavailable")
            hits = response.json().get("results", [])
            if not isinstance(hits, list):
                raise TypeError("invalid results")
            refs = []
            seen = set()
            at = datetime.now(UTC).isoformat()
            for hit in hits[:5]:
                if not isinstance(hit, dict):
                    continue
                url = str(hit.get("url", ""))
                if not public_url(url) or url in seen:
                    continue
                seen.add(url)
                refs.append(
                    SourceRef(
                        None,
                        str(hit.get("title") or urlsplit(url).hostname)[:500],
                        url,
                        kind="web",
                        source_id="web:" + sha256(url.encode()).hexdigest()[:24],
                        retrieved_at=at,
                        excerpt=str(hit.get("content") or "")[:3500],
                    )
                )
            return refs
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise ToolServiceError("web_search_unavailable") from exc


class GoogleDocuments:
    def __init__(self, token, client=None):
        self.token = token
        self.client = client

    async def request(self, method, url, **kwargs):
        try:
            async with httpx.AsyncClient() as default:
                response = await (self.client or default).request(
                    method, _url(url), headers={"Authorization": f"Bearer {self.token}"}, timeout=8, **kwargs
                )
            if response.status_code == 401:
                raise ToolServiceError("google_docs_reconnect_required")
            if response.status_code == 403:
                raise ToolServiceError("google_docs_access_denied")
            if response.status_code == 404:
                raise ToolServiceError("google_document_unavailable")
            if response.status_code not in (200, 201):
                raise ToolServiceError("google_docs_unavailable")
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ToolServiceError("google_docs_unavailable") from exc

    async def account(self):
        result = await self.request(
            "GET",
            "https://www.googleapis.com/drive/v3/about",
            params={"fields": "user(emailAddress,permissionId)"},
        )
        return result["user"]

    async def find(self, artifact_id):
        result = await self.request(
            "GET",
            "https://www.googleapis.com/drive/v3/files",
            params={
                "q": "trashed=false and appProperties has { key='honne_report_id' and value='"
                + str(artifact_id)
                + "' }",
                "fields": "files(id)",
                "pageSize": 10,
            },
        )
        return next(iter(result.get("files", [])), {}).get("id")

    async def create(self, artifact_id, title):
        result = await self.request(
            "POST",
            "https://www.googleapis.com/drive/v3/files",
            params={"fields": "id"},
            json={
                "name": title,
                "mimeType": "application/vnd.google-apps.document",
                "appProperties": {"honne_report_id": str(artifact_id)},
            },
        )
        document_id = result.get("id", "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", document_id):
            raise ToolServiceError("google_docs_unavailable")
        return document_id

    async def populate(self, document_id, text, requests):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", document_id):
            raise ToolServiceError("google_document_unavailable")
        url = f"https://docs.googleapis.com/v1/documents/{document_id}"
        current = await self.request("GET", url)
        existing = "".join(
            element.get("textRun", {}).get("content", "")
            for paragraph in current.get("body", {}).get("content", [])
            for element in paragraph.get("paragraph", {}).get("elements", [])
        )
        if existing == text + "\n" or existing == text:
            # A previous atomic batch succeeded but its HTTP response was lost.
            return
        if existing.strip():
            raise ToolServiceError("google_document_modified")
        body = {"requests": requests}
        if current.get("revisionId"):
            body["writeControl"] = {"requiredRevisionId": current["revisionId"]}
        await self.request("POST", url + ":batchUpdate", json=body)


async def access_token(refresh_token):
    try:
        grant = await GoogleOAuth().refresh(refresh_token)
        return grant.access_token
    except Exception as exc:
        from backend.knowledge.connectors.base import AuthRevokedError

        code = (
            "google_docs_reconnect_required"
            if isinstance(exc, AuthRevokedError)
            else "google_docs_unavailable"
        )
        raise ToolServiceError(code) from exc
