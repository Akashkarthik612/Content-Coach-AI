"""Drive connector, OAuth state and token encryption (U11-U16) over
httpx.MockTransport with recorded-style Drive JSON. Never calls Google."""

import time
import uuid
from datetime import datetime, timezone

import httpx
import pytest
from cryptography.fernet import Fernet, InvalidToken

from backend.core.config import settings
from backend.knowledge.connectors.base import (
    AuthRevokedError,
    CursorExpiredError,
    FileGoneError,
    PermanentFileError,
    RateLimitedError,
)
from backend.knowledge.connectors.factory import ConnectorFactory, UnknownProviderError
from backend.knowledge.connectors.gdrive import (
    GOOGLE_DOC,
    DriveClient,
    GDriveConnector,
    classify,
    decode_text,
)
from backend.knowledge.connectors.google_oauth import (
    STATE_TTL_SECONDS,
    GoogleOAuth,
    InvalidStateError,
    sign_state,
    verify_state,
)
from backend.knowledge.credentials import TokenCipher
from backend.knowledge.records import FileMeta, SourceRecord

KEY = Fernet.generate_key().decode()


def source(folder_ids=("F",), file_ids=(), provider="gdrive") -> SourceRecord:
    return SourceRecord(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        provider=provider,
        account_ref="perm",
        display_name="a@x.com",
        config={"folder_ids": list(folder_ids), "file_ids": list(file_ids)},
        cursor=None,
        status="active",
        last_success_at=None,
        last_error=None,
    )


class FakeTokens:
    def __init__(self):
        self.calls: list[bool] = []

    async def access_token(self, force_refresh: bool = False) -> str:
        self.calls.append(force_refresh)
        return "fresh" if force_refresh else "stale"


def drive_file(id_, name="doc.md", mime="text/markdown", parents=("F",), **extra):
    return {
        "id": id_,
        "name": name,
        "mimeType": mime,
        "modifiedTime": "2026-10-01T10:00:00.000Z",
        "webViewLink": f"https://drive.google.com/file/d/{id_}",
        "parents": list(parents),
        **extra,
    }


def connector(handler, src=None, tokens=None):
    seen: list[httpx.Request] = []

    def record(request):
        seen.append(request)
        return handler(request)

    http = httpx.AsyncClient(transport=httpx.MockTransport(record))
    return GDriveConnector(src or source(), DriveClient(tokens or FakeTokens(), http)), seen


def error(status, reason=""):
    return httpx.Response(status, json={"error": {"code": status, "errors": [{"reason": reason}]}})


# ── U11 factory ───────────────────────────────────────────────────────────────


def test_factory_creates_registered_provider(monkeypatch):
    monkeypatch.setattr(settings, "KNOWLEDGE_TOKEN_KEY", KEY)
    assert isinstance(ConnectorFactory.create(source(), db=None), GDriveConnector)


def test_factory_rejects_unknown_provider():
    with pytest.raises(UnknownProviderError):
        ConnectorFactory.create(source(provider="notion"), db=None)


# ── U12 list_changes ──────────────────────────────────────────────────────────


async def test_list_changes_applies_dusts_rules_across_pages():
    pages = {
        "c1": {
            "nextPageToken": "c2",
            "changes": [
                {"fileId": "a", "removed": False, "file": drive_file("a")},  # in F
                {"fileId": "b", "removed": False, "file": drive_file("b", trashed=True)},
                {"fileId": "img", "removed": False, "file": drive_file("img", "x.png", "image/png")},
                {
                    "fileId": "sub",
                    "removed": False,
                    "file": drive_file("sub", "Sub", "application/vnd.google-apps.folder"),
                },
            ],
        },
        "c2": {
            "newStartPageToken": "c3",
            "changes": [
                {"fileId": "out", "removed": False, "file": drive_file("out", parents=("X",))},
                {
                    "fileId": "deep",
                    "removed": False,
                    "file": drive_file("deep", "Deep", GOOGLE_DOC, parents=("G",)),
                },
                {"fileId": "gone", "removed": True},
                {"changeType": "drive", "driveId": "d1"},
            ],
        },
    }
    parents = {"X": ["Y"], "Y": [], "G": ["F"]}

    def handler(request):
        if request.url.path.endswith("/changes"):
            return httpx.Response(200, json=pages[request.url.params["pageToken"]])
        file_id = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json={"id": file_id, "parents": parents[file_id]})

    con, seen = connector(handler)
    batch = await con.list_changes("c1")
    assert {m.external_id for m in batch.changed} == {"a", "deep"}
    assert set(batch.removed) == {"b", "out", "gone"}
    assert batch.next_cursor == "c3"
    assert batch.folder_changed is True
    # Ancestors are memoized: X, Y and G looked up once each.
    lookups = [r.url.path for r in seen if "/files/" in r.url.path]
    assert sorted(lookups) == sorted(set(lookups))


# ── U13 error mapping ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("status", [410, 400])
async def test_expired_cursor(status):
    con, _ = connector(lambda r: error(status, "invalid"))
    with pytest.raises(CursorExpiredError):
        await con.list_changes("old")


@pytest.mark.parametrize(
    "response", [error(403, "rateLimitExceeded"), error(403, "userRateLimitExceeded"), error(429)]
)
async def test_rate_limits_are_transient(response):
    con, _ = connector(lambda r: response)
    with pytest.raises(RateLimitedError):
        await con.initial_cursor()


async def test_401_refreshes_once_then_succeeds():
    tokens = FakeTokens()

    def handler(request):
        if request.headers["Authorization"] == "Bearer stale":
            return httpx.Response(401)
        return httpx.Response(200, json={"startPageToken": "s1"})

    con, _ = connector(handler, tokens=tokens)
    assert await con.initial_cursor() == "s1"
    assert tokens.calls == [False, True]


async def test_second_401_means_revoked():
    con, seen = connector(lambda r: httpx.Response(401))
    with pytest.raises(AuthRevokedError):
        await con.initial_cursor()
    assert len(seen) == 2


async def test_refresh_invalid_grant_is_revoked():
    http = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(400, json={"error": "invalid_grant"}))
    )
    with pytest.raises(AuthRevokedError, match="auth_revoked"):
        await GoogleOAuth(http).refresh("rt")


# ── U14 fetch ─────────────────────────────────────────────────────────────────


def meta(id_="f1", name="Doc", mime=GOOGLE_DOC, size=None) -> FileMeta:
    return FileMeta(external_id=id_, title=name, mime_type=mime, size=size)


async def test_google_doc_is_exported_as_markdown():
    con, seen = connector(lambda r: httpx.Response(200, content=b"# Title\nbody\n"))
    doc = await con.fetch(meta())
    assert seen[0].url.path.endswith("/files/f1/export")
    assert seen[0].url.params["mimeType"] == "text/markdown"
    assert (doc.kind, doc.text) == ("markdown", "# Title\nbody\n")


def _pdf(text: str) -> bytes:
    """A minimal one-page PDF with a text layer."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
            b"/Resources << /Font << /F1 5 0 R >> >> >>"
        ),
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


async def test_pdf_text_is_extracted():
    con, seen = connector(lambda r: httpx.Response(200, content=_pdf("Quarterly plan")))
    doc = await con.fetch(meta(mime="application/pdf", name="plan.pdf"))
    assert seen[0].url.params["alt"] == "media"
    assert "Quarterly plan" in doc.text
    assert doc.kind == "plain"


async def test_damaged_pdf_is_permanent():
    con, _ = connector(lambda r: httpx.Response(200, content=b"%PDF-1.4 garbage"))
    with pytest.raises(PermanentFileError):
        await con.fetch(meta(mime="application/pdf", name="x.pdf"))


async def test_reported_size_over_cap_fails_without_downloading():
    con, seen = connector(lambda r: httpx.Response(200, content=b"x"))
    with pytest.raises(PermanentFileError):
        await con.fetch(meta(mime="text/plain", name="a.txt", size=settings.MAX_DOWNLOAD_BYTES + 1))
    assert seen == []


async def test_unreported_size_is_capped_while_streaming(monkeypatch):
    monkeypatch.setattr(settings, "MAX_DOWNLOAD_BYTES", 10)
    con, _ = connector(lambda r: httpx.Response(200, content=b"x" * 11))
    with pytest.raises(PermanentFileError):
        await con.fetch(meta())


async def test_unexportable_doc_fails_but_is_not_deleted():
    con, _ = connector(lambda r: error(403, "exportSizeLimitExceeded"))
    with pytest.raises(PermanentFileError):
        await con.fetch(meta())


@pytest.mark.parametrize("response", [error(404, "notFound"), error(403, "insufficientFilePermissions")])
async def test_missing_or_unshared_file_is_gone(response):
    con, _ = connector(lambda r: response)
    with pytest.raises(FileGoneError):
        await con.fetch(meta())


# ── full listing ──────────────────────────────────────────────────────────────


async def test_full_listing_walks_folders_dedupes_and_resolves_root():
    children = {
        "ROOTID": [drive_file("r1", "top.txt", "text/plain", parents=("ROOTID",))],
        "F": [
            drive_file("a"),
            drive_file("S", "Sub", "application/vnd.google-apps.folder"),
            drive_file("img", "x.png", "image/png"),
            drive_file("sc", "link", "application/vnd.google-apps.shortcut"),
        ],
        "S": [drive_file("b", "b.md", "application/octet-stream", parents=("S",)), drive_file("a")],
    }

    def handler(request):
        path = request.url.path
        if path.endswith("/files/root"):
            return httpx.Response(200, json={"id": "ROOTID"})
        if path.endswith("/files/solo"):
            return httpx.Response(200, json=drive_file("solo", "solo.txt", "text/plain", parents=("Z",)))
        if path.endswith("/files/missing"):
            return error(404, "notFound")
        folder = request.url.params["q"].split("'")[1]
        if folder == "GONE":
            return error(404, "notFound")
        return httpx.Response(200, json={"files": children.get(folder, [])})

    # "S" is selected twice: directly and under F.
    con, _ = connector(
        handler, src=source(folder_ids=("root", "F", "S", "GONE"), file_ids=("solo", "missing", "a"))
    )
    listed = await con.full_listing()
    assert sorted(m.external_id for m in listed) == ["a", "b", "r1", "solo"]
    assert next(m for m in listed if m.external_id == "a").modified_at == datetime(
        2026, 10, 1, 10, tzinfo=timezone.utc
    )


# ── helpers ───────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("mime", "name", "kind"),
    [
        (GOOGLE_DOC, "Doc", "gdoc"),
        ("application/pdf", "a.pdf", "pdf"),
        ("text/x-markdown", "a", "markdown"),
        ("application/octet-stream", "Notes.MD", "markdown"),
        ("text/plain", "a.md", "markdown"),
        ("text/plain", "a.log", "plain"),
        ("application/vnd.google-apps.spreadsheet", "Sheet", None),
        ("image/png", "a.png", None),
    ],
)
def test_classify(mime, name, kind):
    assert classify(mime, name) == kind


def test_decode_text_survives_latin1_and_bom():
    assert decode_text("﻿hé".encode()) == "hé"
    assert decode_text("caf\xe9".encode("latin-1")) == "caf�"


# ── U15 OAuth state ───────────────────────────────────────────────────────────


def test_state_round_trip():
    user = uuid.uuid4()
    assert verify_state(sign_state(user, KEY), KEY) == user


def test_state_tampered_or_other_key_is_rejected():
    state = sign_state(uuid.uuid4(), KEY)
    with pytest.raises(InvalidStateError):
        verify_state(state[:-4] + "AAAA", KEY)
    with pytest.raises(InvalidStateError):
        verify_state(state, Fernet.generate_key().decode())
    with pytest.raises(InvalidStateError):
        verify_state("not-a-state", KEY)


def test_state_expires():
    state = sign_state(uuid.uuid4(), KEY)
    with pytest.raises(InvalidStateError):
        verify_state(state, KEY, now=int(time.time()) + STATE_TTL_SECONDS + 5)


def test_state_key_is_not_the_token_key():
    # A sealed state must not decrypt as a stored token, and vice versa.
    with pytest.raises(InvalidToken):
        TokenCipher(KEY).decrypt(sign_state(uuid.uuid4(), KEY).encode())


# ── U16 TokenCipher ───────────────────────────────────────────────────────────


def test_cipher_round_trip_and_wrong_key():
    cipher = TokenCipher(KEY)
    ciphertext = cipher.encrypt("1//refresh-token")
    assert b"refresh-token" not in ciphertext
    assert cipher.decrypt(ciphertext) == "1//refresh-token"
    with pytest.raises(InvalidToken):
        TokenCipher(Fernet.generate_key().decode()).decrypt(ciphertext)
