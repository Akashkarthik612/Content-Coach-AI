# Adapted from dust-tt/dust (MIT License, Copyright (c) 2022 Stanislas Polu)
# connectors/src/connectors/google_drive/ at b92c73c0a5a9e36de668e0b9377f3ccf6749a082
"""Google Drive connector over the plain Drive v3 REST API (httpx).

Ported from Dust's Drive connector: startPageToken taken before the full
listing, changes.list rules (removed/trashed -> removed, outside the
selection -> removed), selection = the file or any ancestor selected with
parents memoized per run, and a rate-limit 403 treated as transient.

Honne additions: any folder change falls back to a full listing (changes.list
doesn't report the children of a moved folder), Drive's "root" alias is
resolved to the real folder id, downloads are streamed with a size cap, and
403s that mean "can't export this file" fail the file instead of deleting it.
"""

import asyncio
import io
import logging
from collections import deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Protocol
from uuid import UUID

import httpx
from pypdf import PdfReader
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.knowledge.connectors.base import (
    AuthRevokedError,
    BaseConnector,
    CursorExpiredError,
    FileGoneError,
    PermanentFileError,
    RateLimitedError,
    TransientConnectorError,
)
from backend.knowledge.connectors.factory import ConnectorFactory
from backend.knowledge.connectors.google_oauth import GoogleOAuth
from backend.knowledge.credentials import CredentialStore
from backend.knowledge.records import ChangeBatch, FetchedDocument, FileMeta, SourceRecord
from backend.knowledge.repository import KnowledgeRepository

logger = logging.getLogger(__name__)

API = "https://www.googleapis.com/drive/v3"
# Explicit per-phase limits: a stalled connection or a server that stops
# sending fails the call (-> TransientConnectorError) instead of hanging a run.
# read is per chunk received, not the whole download.
TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=60.0, pool=10.0)
FOLDER = "application/vnd.google-apps.folder"
GOOGLE_DOC = "application/vnd.google-apps.document"
SHORTCUT = "application/vnd.google-apps.shortcut"
PDF = "application/pdf"
FILE_FIELDS = "id,name,mimeType,modifiedTime,size,webViewLink,parents,trashed"
_RATE_LIMIT_REASONS = {"rateLimitExceeded", "userRateLimitExceeded"}
# 403s that are about this file's content, not our access: fail it, keep its chunks.
_UNEXPORTABLE_REASONS = {
    "exportSizeLimitExceeded",
    "cannotDownloadFile",
    "fileNotDownloadable",
    "cannotExportFile",
}
_MAX_ANCESTOR_DEPTH = 100

Kind = Literal["gdoc", "pdf", "markdown", "plain"]


def classify(mime_type: str, name: str) -> Kind | None:
    """Supported file kind, by MIME type with the extension as fallback: Drive
    reports .md files as text/markdown, text/x-markdown, text/plain or
    application/octet-stream depending on how they were uploaded."""
    lower = name.lower()
    if mime_type == GOOGLE_DOC:
        return "gdoc"
    if mime_type == PDF:
        return "pdf"
    if mime_type in ("text/markdown", "text/x-markdown") or lower.endswith((".md", ".markdown")):
        return "markdown"
    if mime_type == "text/plain" or lower.endswith(".txt"):
        return "plain"
    return None


def _parse_time(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _meta(f: dict[str, Any]) -> FileMeta:
    return FileMeta(
        external_id=f["id"],
        title=f.get("name") or "Untitled",
        mime_type=f.get("mimeType", ""),
        source_url=f.get("webViewLink"),
        modified_at=_parse_time(f.get("modifiedTime")),
        size=int(f["size"]) if f.get("size") is not None else None,  # a string in Drive's JSON
        parents=tuple(f.get("parents") or ()),
    )


def decode_text(data: bytes) -> str:
    """UTF-8 (BOM stripped); bytes that aren't UTF-8 become U+FFFD instead of
    failing the file."""
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("utf-8", errors="replace")


def pdf_text(data: bytes) -> str:
    """Text layer only; scanned PDFs come back empty (OCR is out of scope)."""
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise PermanentFileError("encrypted pdf")
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    except PermanentFileError:
        raise
    except Exception as exc:  # pypdf raises many types on damaged files
        raise PermanentFileError(f"unreadable pdf: {type(exc).__name__}") from exc


# ── HTTP ──────────────────────────────────────────────────────────────────────


class TokenProvider(Protocol):
    async def access_token(self, force_refresh: bool = False) -> str: ...


class DriveHTTPError(Exception):
    """A 4xx the caller must interpret (a 404 on a file means gone, on a
    listing it means something else)."""

    def __init__(self, status: int, reason: str) -> None:
        super().__init__(f"Drive HTTP {status} {reason}")
        self.status = status
        self.reason = reason


def _reason(response: httpx.Response) -> str:
    try:
        error = response.json().get("error", {})
    except ValueError:
        return ""
    if not isinstance(error, dict):
        return str(error)
    for item in error.get("errors") or []:
        if item.get("reason"):
            return item["reason"]
    for item in error.get("details") or []:
        if item.get("reason"):
            return item["reason"]
    return str(error.get("status", ""))


def _api() -> str:
    base = settings.GOOGLE_BASE_URL.rstrip("/")
    return f"{base}/drive/v3" if base else API


class DriveClient:
    """Thin Drive v3 wrapper. A 401 refreshes the access token once and
    retries; a second 401 means the grant is gone."""

    def __init__(self, tokens: TokenProvider, http: httpx.AsyncClient | None = None) -> None:
        self._tokens = tokens
        self._http = http

    async def get_json(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        async with self._send(path, params) as response:
            await response.aread()
            return response.json()

    async def download(self, path: str, params: dict[str, Any], max_bytes: int) -> bytes:
        """Streamed, so a file without a reported size still can't blow past the cap."""
        async with self._send(path, params) as response:
            data = bytearray()
            async for part in response.aiter_bytes():
                data.extend(part)
                if len(data) > max_bytes:
                    raise PermanentFileError(f"file over {max_bytes // (1024 * 1024)} MB")
            return bytes(data)

    @asynccontextmanager
    async def _send(self, path: str, params: dict[str, Any] | None) -> AsyncIterator[httpx.Response]:
        if self._http is None:
            async with httpx.AsyncClient(timeout=TIMEOUT) as http:
                self._http = http
                try:
                    async with self._send(path, params) as response:
                        yield response
                finally:
                    self._http = None
            return

        for attempt in (1, 2):
            token = await self._tokens.access_token(force_refresh=attempt == 2)
            request = self._http.build_request(
                "GET",
                f"{_api()}/{path}",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
                timeout=TIMEOUT,
            )
            try:
                response = await self._http.send(request, stream=True)
            except httpx.HTTPError as exc:
                raise TransientConnectorError(f"Drive unreachable: {type(exc).__name__}") from exc
            try:
                if response.status_code == 401 and attempt == 1:
                    continue
                if response.status_code == 401:
                    raise AuthRevokedError("auth_revoked: reconnect Google Drive")
                if response.status_code >= 400:
                    await response.aread()
                    self._raise_for(response)
                yield response
                return
            finally:
                await response.aclose()

    @staticmethod
    def _raise_for(response: httpx.Response) -> None:
        status, reason = response.status_code, _reason(response)
        if status == 429 or (status == 403 and reason in _RATE_LIMIT_REASONS):
            raise RateLimitedError(f"Drive rate limit ({reason or status})")
        if status >= 500:
            raise TransientConnectorError(f"Drive HTTP {status}")
        raise DriveHTTPError(status, reason)


# ── token provider ────────────────────────────────────────────────────────────


class StoredTokenProvider:
    """Access token from the encrypted credentials; refreshed (and cached back)
    when it is about to expire or Drive rejected it."""

    REFRESH_MARGIN = timedelta(seconds=60)

    def __init__(
        self, db: Session, user_id: UUID, source_id: UUID, store: CredentialStore, oauth: GoogleOAuth
    ):
        self._db, self._user_id, self._source_id = db, user_id, source_id
        self._store, self._oauth = store, oauth
        self._cached: tuple[str, datetime] | None = None  # one DB read per run, not per request

    def _fresh(self, token: str | None, expires_at: datetime | None) -> bool:
        return bool(token and expires_at and expires_at - self.REFRESH_MARGIN > datetime.now(timezone.utc))

    async def access_token(self, force_refresh: bool = False) -> str:
        if not force_refresh and self._cached and self._fresh(*self._cached):
            return self._cached[0]
        creds = await self._store.load(self._db, self._user_id, self._source_id)
        if creds is None:
            raise AuthRevokedError("auth_revoked: reconnect Google Drive (no credentials)")
        if not force_refresh and self._fresh(creds.access_token, creds.access_token_expires_at):
            self._cached = (creds.access_token, creds.access_token_expires_at)
            return creds.access_token
        grant = await self._oauth.refresh(creds.refresh_token)
        await self._store.update_access_token(
            self._db, self._user_id, self._source_id, grant.access_token, grant.expires_at
        )
        self._cached = (grant.access_token, grant.expires_at)
        return grant.access_token


class StaticTokenProvider:
    """A just-issued access token (OAuth completion, before a source exists)."""

    def __init__(self, token: str) -> None:
        self._token = token

    async def access_token(self, force_refresh: bool = False) -> str:
        if force_refresh:
            raise AuthRevokedError("auth_revoked: access token rejected")
        return self._token


async def drive_account(client: DriveClient) -> dict[str, str]:
    """The connected Google account. permissionId is stable even if the email
    changes, so it is the source's account_ref; the email is its display name."""
    user = (await client.get_json("about", {"fields": "user(emailAddress,permissionId,displayName)"}))["user"]
    return {
        "permission_id": user["permissionId"],
        "email": user.get("emailAddress") or user.get("displayName") or "Google Drive",
    }


# ── connector ─────────────────────────────────────────────────────────────────


_ALL_DRIVES = {"supportsAllDrives": "true", "includeItemsFromAllDrives": "true"}


@ConnectorFactory.register("gdrive")
class GDriveConnector(BaseConnector):
    def __init__(self, source: SourceRecord, client: DriveClient) -> None:
        super().__init__(source)
        self.client = client
        config = source.config or {}
        self._folder_ids: set[str] = set(config.get("folder_ids") or [])
        self._file_ids: set[str] = set(config.get("file_ids") or [])
        self._root_resolved = False
        self._ancestor_memo: dict[str, bool] = {}  # folder id -> selected or under a selected folder

    @classmethod
    def build(cls, source: SourceRecord, db: Session) -> "GDriveConnector":
        tokens = StoredTokenProvider(
            db, source.user_id, source.id, CredentialStore(KnowledgeRepository), GoogleOAuth()
        )
        return cls(source, DriveClient(tokens))

    # ── picker ──

    async def browse(self, parent_id: str) -> list[dict[str, Any]]:
        """One folder level for the picker: subfolders and supported files."""
        items = []
        async for f in self._children(parent_id):
            is_folder = f.get("mimeType") == FOLDER
            if is_folder or classify(f.get("mimeType", ""), f.get("name", "")):
                items.append(
                    {
                        "id": f["id"],
                        "name": f.get("name", ""),
                        "mime_type": f.get("mimeType"),
                        "is_folder": is_folder,
                    }
                )
        return sorted(items, key=lambda i: (not i["is_folder"], i["name"].lower()))

    # ── contract ──

    async def initial_cursor(self) -> str:
        return (await self.client.get_json("changes/startPageToken", {"supportsAllDrives": "true"}))[
            "startPageToken"
        ]

    async def full_listing(self) -> list[FileMeta]:
        await self._resolve_root()
        found: dict[str, FileMeta] = {}
        visited: set[str] = set()
        queue = deque(sorted(self._folder_ids))
        while queue:
            folder_id = queue.popleft()
            if folder_id in visited:  # nested selections, multi-parent folders
                continue
            visited.add(folder_id)
            async for f in self._children(folder_id):
                if f.get("mimeType") == FOLDER:
                    queue.append(f["id"])
                elif self._supported(f):
                    found[f["id"]] = _meta(f)
        for file_id in sorted(self._file_ids - found.keys()):
            f = await self._get_file(file_id)
            if f is not None and not f.get("trashed") and f.get("mimeType") != FOLDER and self._supported(f):
                found[file_id] = _meta(f)
        return list(found.values())

    async def list_changes(self, cursor: str) -> ChangeBatch:
        await self._resolve_root()
        outcome: dict[str, FileMeta | None] = {}  # later changes win; None = removed
        folder_changed = False
        page_token: str | None = cursor
        while True:
            try:
                page = await self.client.get_json(
                    "changes",
                    {
                        "pageToken": page_token,
                        "pageSize": 100,
                        "includeRemoved": "true",
                        "fields": f"nextPageToken,newStartPageToken,changes(changeType,fileId,removed,file({FILE_FIELDS}))",
                        **_ALL_DRIVES,
                    },
                )
            except DriveHTTPError as exc:
                if exc.status in (400, 404, 410):
                    raise CursorExpiredError(str(exc)) from exc
                raise TransientConnectorError(f"Drive changes refused: {exc}") from exc

            for change in page.get("changes", []):
                if change.get("changeType", "file") != "file":
                    continue  # a shared drive itself changed
                file_id = change.get("fileId")
                f = change.get("file")
                if f is not None and f.get("mimeType") == FOLDER:
                    # Children of a moved/trashed folder aren't reported:
                    # only a full listing sees them.
                    folder_changed = True
                    continue
                if change.get("removed") or f is None or f.get("trashed"):
                    outcome[file_id] = None
                elif not self._supported(f):
                    continue
                elif await self._in_selection(f["id"], f.get("parents") or []):
                    outcome[file_id] = _meta(f)
                else:
                    outcome[file_id] = None  # moved out of the selection
            if page.get("newStartPageToken"):
                next_cursor = page["newStartPageToken"]
                break
            page_token = page["nextPageToken"]

        return ChangeBatch(
            changed=[m for m in outcome.values() if m is not None],
            removed=[i for i, m in outcome.items() if m is None],
            next_cursor=next_cursor,
            folder_changed=folder_changed,
        )

    async def fetch(self, meta: FileMeta) -> FetchedDocument:
        kind = classify(meta.mime_type, meta.title)
        if kind is None:
            raise PermanentFileError(f"unsupported type {meta.mime_type}")
        cap = settings.MAX_DOWNLOAD_BYTES
        if meta.size is not None and meta.size > cap:
            raise PermanentFileError(f"file over {cap // (1024 * 1024)} MB")
        try:
            if kind == "gdoc":
                data = await self.client.download(
                    f"files/{meta.external_id}/export", {"mimeType": "text/markdown"}, cap
                )
                return FetchedDocument(meta=meta, text=decode_text(data), kind="markdown")
            data = await self.client.download(
                f"files/{meta.external_id}", {"alt": "media", "supportsAllDrives": "true"}, cap
            )
        except DriveHTTPError as exc:
            if exc.status == 403 and exc.reason in _UNEXPORTABLE_REASONS:
                raise PermanentFileError(f"Drive refused the download ({exc.reason})") from exc
            if exc.status in (403, 404):
                raise FileGoneError(meta.external_id) from exc
            raise PermanentFileError(str(exc)) from exc
        if kind == "pdf":
            return FetchedDocument(meta=meta, text=await asyncio.to_thread(pdf_text, data), kind="plain")
        return FetchedDocument(meta=meta, text=decode_text(data), kind=kind)

    # ── helpers ──

    @staticmethod
    def _supported(f: dict[str, Any]) -> bool:
        kind = classify(f.get("mimeType", ""), f.get("name", ""))
        if kind is None and f.get("mimeType") == SHORTCUT:
            logger.info(
                "knowledge gdrive skipped shortcut file_id=%s (shortcuts not followed yet)", f.get("id")
            )
        return kind is not None

    async def _children(self, folder_id: str) -> AsyncIterator[dict[str, Any]]:
        page_token = None
        while True:
            params = {
                "q": f"'{folder_id}' in parents and trashed=false",  # ids are validated by the router
                "fields": f"nextPageToken,files({FILE_FIELDS})",
                "pageSize": 1000,
                "corpora": "allDrives",
                **_ALL_DRIVES,
            }
            if page_token:
                params["pageToken"] = page_token
            try:
                page = await self.client.get_json("files", params)
            except DriveHTTPError as exc:
                if exc.status == 404:
                    return  # the selected folder is gone: it simply has no files
                raise TransientConnectorError(f"Drive listing refused: {exc}") from exc
            for f in page.get("files", []):
                yield f
            page_token = page.get("nextPageToken")
            if not page_token:
                return

    async def _get_file(self, file_id: str, fields: str = FILE_FIELDS) -> dict[str, Any] | None:
        try:
            return await self.client.get_json(
                f"files/{file_id}", {"fields": fields, "supportsAllDrives": "true"}
            )
        except DriveHTTPError as exc:
            if exc.status in (403, 404):
                return None
            raise TransientConnectorError(f"Drive refused file lookup: {exc}") from exc

    async def _resolve_root(self) -> None:
        """Files in My Drive list the root's real id as parent, never "root"."""
        if self._root_resolved or "root" not in self._folder_ids:
            self._root_resolved = True
            return
        root = await self._get_file("root", fields="id")
        if root is not None:
            self._folder_ids.add(root["id"])
        self._root_resolved = True

    async def _in_selection(self, file_id: str, parents: list[str]) -> bool:
        """The file, or any of its ancestors, is selected (Dust's
        objectIsInFolderSelection, parents memoized for the run)."""
        if file_id in self._file_ids or file_id in self._folder_ids:
            return True
        for parent in parents:
            if await self._ancestor_selected(parent, depth=0):
                return True
        return False

    async def _ancestor_selected(self, folder_id: str, depth: int) -> bool:
        if folder_id in self._folder_ids:
            return True
        if folder_id in self._ancestor_memo:
            return self._ancestor_memo[folder_id]
        if depth >= _MAX_ANCESTOR_DEPTH:
            return False
        self._ancestor_memo[folder_id] = False  # guards against a parent cycle
        f = await self._get_file(folder_id, fields="id,parents")
        result = False
        for parent in (f or {}).get("parents") or []:
            if await self._ancestor_selected(parent, depth + 1):
                result = True
                break
        self._ancestor_memo[folder_id] = result
        return result
