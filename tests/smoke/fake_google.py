"""Stand-ins for Google OAuth, the Drive v3 API and Gemini embeddings, over
real HTTP. The backend is pointed here with settings.GOOGLE_BASE_URL (Drive +
OAuth) and settings.GEMINI_BASE_URL (embeddings), so the real GoogleOAuth,
DriveClient, GDriveConnector and GeminiEmbedder run unchanged.

Only what the connector calls is implemented, with Drive's response shapes
(https://developers.google.com/drive/api/reference/rest/v3):
  OAuth   GET /o/oauth2/v2/auth (consent: redirects back with ?code&state),
          POST /token (authorization_code, refresh_token), POST /revoke
  Drive   about, changes/startPageToken, changes, files?q='<id>' in parents,
          files/{id}, files/{id}?alt=media, files/{id}/export
  Gemini  POST /v1beta/models/{model}:batchEmbedContents (dispatched from
          fake_upstream's catch-all POST)

The change log is a list; a page token is an index into it. Every add, edit
or trash appends an entry, as Drive's changes feed does.
"""

import hashlib
import itertools
import math
import re
import secrets
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlencode

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
FOLDER = "application/vnd.google-apps.folder"
GOOGLE_DOC = "application/vnd.google-apps.document"
ROOT_ID = "0AFakeRootFolder"
_PARENT_QUERY = re.compile(r"'([^']+)' in parents")


@dataclass
class DriveFile:
    id: str
    name: str
    mime_type: str
    parents: list[str]
    content: str = ""
    modified: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    trashed: bool = False

    def as_json(self) -> dict:
        body = {
            "id": self.id,
            "name": self.name,
            "mimeType": self.mime_type,
            "modifiedTime": self.modified.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "parents": list(self.parents),
            "trashed": self.trashed,
            "webViewLink": f"https://drive.google.com/file/d/{self.id}/view",
        }
        if self.mime_type not in (FOLDER, GOOGLE_DOC):
            body["size"] = str(len(self.content.encode()))  # a string, like Drive
        return body


def _drive_error(status: int, reason: str) -> JSONResponse:
    return JSONResponse(
        {"error": {"code": status, "message": reason, "errors": [{"reason": reason}]}}, status_code=status
    )


class FakeGoogle:
    """One Google account with a Drive. Thread-safe: the fake server runs on
    its own thread while the test thread edits files."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self.files: dict[str, DriveFile] = {ROOT_ID: DriveFile(ROOT_ID, "My Drive", FOLDER, [])}
            self.changes: list[str] = []
            self.codes: set[str] = set()
            self.access_tokens: set[str] = set()
            self.refresh_tokens: set[str] = set()
            self.calls: list[str] = []
            self.account = {"emailAddress": "e2e@drive.test", "permissionId": "perm-e2e", "displayName": "E2E"}
            self._ids = itertools.count(1)

    # ── what a person does in Drive (called by the test) ──

    def add_folder(self, name: str, parent: str = ROOT_ID) -> str:
        return self._add(name, FOLDER, parent, "")

    def add_doc(self, name: str, markdown: str, parent: str = ROOT_ID) -> str:
        """A Google Doc; its Markdown export is `markdown`."""
        return self._add(name, GOOGLE_DOC, parent, markdown)

    def add_file(self, name: str, mime_type: str, content: str, parent: str = ROOT_ID) -> str:
        return self._add(name, mime_type, parent, content)

    def edit(self, file_id: str, content: str) -> None:
        with self._lock:
            f = self.files[file_id]
            f.content = content
            f.modified = self._later_than(f.modified)
            self.changes.append(file_id)

    def trash(self, file_id: str) -> None:
        """Move a file to Drive's trash (what "Remove" does in the Drive UI)."""
        with self._lock:
            f = self.files[file_id]
            f.trashed = True
            f.modified = self._later_than(f.modified)
            self.changes.append(file_id)

    def revoke_access(self) -> None:
        """The user removes Honne in their Google account: every token stops working."""
        with self._lock:
            self.access_tokens.clear()
            self.refresh_tokens.clear()

    def _add(self, name: str, mime_type: str, parent: str, content: str) -> str:
        with self._lock:
            file_id = f"fake{next(self._ids):04d}"
            self.files[file_id] = DriveFile(file_id, name, mime_type, [parent], content)
            self.changes.append(file_id)
            return file_id

    @staticmethod
    def _later_than(previous: datetime) -> datetime:
        # Drive keeps milliseconds: make sure an edit always moves modifiedTime.
        return max(datetime.now(timezone.utc), previous + timedelta(milliseconds=1))

    # ── HTTP ──

    def mount(self, app: FastAPI) -> None:
        @app.get("/o/oauth2/v2/auth")
        def consent(redirect_uri: str, state: str, scope: str, access_type: str, client_id: str):
            """The user clicks "Allow": back to the app with a one-time code."""
            assert access_type == "offline" and DRIVE_SCOPE in scope.split() and client_id
            code = f"code-{secrets.token_hex(8)}"
            with self._lock:
                self.codes.add(code)
            return RedirectResponse(f"{redirect_uri}?{urlencode({'code': code, 'state': state})}")

        @app.post("/token")
        async def token(request: Request):
            # Form-encoded, parsed by hand (no python-multipart dependency).
            form = {k: v[0] for k, v in parse_qs((await request.body()).decode()).items()}
            with self._lock:
                if form.get("grant_type") == "authorization_code" and form.get("code") in self.codes:
                    self.codes.discard(form["code"])
                    refresh = f"1//refresh-{secrets.token_hex(8)}"
                    self.refresh_tokens.add(refresh)
                elif form.get("grant_type") == "refresh_token" and form.get("refresh_token") in self.refresh_tokens:
                    refresh = None
                else:
                    return JSONResponse({"error": "invalid_grant"}, status_code=400)
                access = f"ya29.fake-{secrets.token_hex(8)}"
                self.access_tokens.add(access)
            body = {"access_token": access, "expires_in": 3599, "scope": DRIVE_SCOPE, "token_type": "Bearer"}
            if refresh:
                body["refresh_token"] = refresh
            return body

        @app.post("/revoke")
        def revoke():
            return {}

        @app.get("/drive/v3/{path:path}")
        def drive(path: str, request: Request):
            self.calls.append(f"GET /drive/v3/{path}")
            bearer = request.headers.get("authorization", "").removeprefix("Bearer ")
            if bearer not in self.access_tokens:
                return _drive_error(401, "authError")
            with self._lock:
                return self._drive(path, dict(request.query_params))

    def _drive(self, path: str, params: dict) -> Response:
        if path == "about":
            return JSONResponse({"user": self.account})
        if path == "changes/startPageToken":
            return JSONResponse({"startPageToken": str(len(self.changes))})
        if path == "changes":
            start = int(params["pageToken"])
            changes = [
                {
                    "changeType": "file",
                    "fileId": file_id,
                    "removed": False,
                    "file": self.files[file_id].as_json(),
                }
                for file_id in dict.fromkeys(self.changes[start:])  # later edits of a file collapse
            ]
            return JSONResponse({"changes": changes, "newStartPageToken": str(len(self.changes))})
        if path == "files":
            parent = _PARENT_QUERY.search(params.get("q", "")).group(1)
            parent = ROOT_ID if parent == "root" else parent
            children = [f.as_json() for f in self.files.values() if parent in f.parents and not f.trashed]
            return JSONResponse({"files": children})
        match = re.fullmatch(r"files/([^/]+)(/export)?", path)
        if match is None:
            return _drive_error(404, "notFound")
        file_id = ROOT_ID if match.group(1) == "root" else match.group(1)
        f = self.files.get(file_id)
        if f is None:
            return _drive_error(404, "notFound")
        if match.group(2):  # export
            if f.mime_type != GOOGLE_DOC or params.get("mimeType") != "text/markdown":
                return _drive_error(403, "cannotExportFile")
            return Response(f.content.encode(), media_type="text/markdown")
        if params.get("alt") == "media":
            return Response(f.content.encode(), media_type=f.mime_type)
        return JSONResponse(f.as_json())


class FakeEmbeddings:
    """batchEmbedContents with deterministic, normalized vectors; records
    every text it was asked to embed."""

    def __init__(self) -> None:
        self.texts: list[str] = []
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self.texts.clear()

    @staticmethod
    def is_embed_path(path: str) -> bool:
        return path.endswith(":batchEmbedContents")

    def reply(self, body: dict) -> dict:
        embeddings = []
        for req in body["requests"]:
            text = req["content"]["parts"][0]["text"]
            with self._lock:
                self.texts.append(text)
            embeddings.append({"values": self._vector(text, req["outputDimensionality"])})
        return {"embeddings": embeddings}

    @staticmethod
    def _vector(text: str, dim: int) -> list[float]:
        seed = hashlib.sha256(text.encode()).digest()
        raw = [(seed[i % len(seed)] + i) % 251 + 1.0 for i in range(dim)]
        norm = math.sqrt(sum(x * x for x in raw))
        return [x / norm for x in raw]
