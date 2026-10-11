"""Knowledge E2E: Google Drive auth -> documents -> chunks + embeddings in
Postgres, then an edit in Drive picked up by the background poller.

The whole backend runs for real (FastAPI app + lifespan, Supabase JWT auth,
router, OAuth exchange, encrypted token storage, DriveClient, connector,
SyncService, pipeline, splitter, GeminiEmbedder, repository, SyncPoller).
Only Google and Gemini are fakes, over real HTTP (tests/smoke/fake_google.py).

E2E1  connect Drive -> pick a folder -> "Sync now": every supported doc is
      chunked, embedded and stored; nothing outside the selection is; a rerun
      embeds nothing.
E2E2  after E2E1's setup, a doc is edited in Drive; the poller (interval cut
      from 300 s to 1 s) notices it on its own and re-embeds only the changed
      chunks.

Each run appends the backend's knowledge logs plus a timing summary to
reports/knowledge_e2e.log (uploaded by CI with the other test reports).
"""

import asyncio
import logging
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import text

from backend.core.config import settings
from backend.knowledge.sync_poller import PollerSettings, build_sync_poller, stop_sync_poller
from tests.smoke.fake_google import ROOT_ID

ROOT = Path(__file__).resolve().parents[3]
LOG_FILE = ROOT / "reports" / "knowledge_e2e.log"
REDIRECT_URI = "http://localhost:5173/connect/gdrive/callback"
API = "/api/knowledge"


def section(heading: str, topic: str, n: int = 20) -> str:
    sentences = " ".join(
        f"{topic} note {i}: we tried approach {i} with early users and recorded what changed." for i in range(n)
    )
    return f"## {heading}\n\n{sentences}\n\n"


LAUNCH_PLAN = (
    "# Launch plan\n\n"
    + section("Pricing", "Pricing")
    + section("Channels", "Channels")
    + section("Timeline", "Timeline")
    + section("Risks", "Risks")
)
INTERVIEWS = "# Customer interviews\n\n" + section("Founders", "Founders") + section("Agencies", "Agencies")
IDEAS = "# Post ideas\n\n- Build in public thread\n- Lessons from the first ten users\n"


# ── fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def drive(client, upstream, monkeypatch):
    """The real app wired to the fake Google; returns the fake Drive."""
    monkeypatch.setattr(settings, "GOOGLE_BASE_URL", upstream.url)
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "e2e-client.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "e2e-secret")
    monkeypatch.setattr(settings, "GOOGLE_DRIVE_REDIRECT_URI", REDIRECT_URI)
    monkeypatch.setattr(settings, "KNOWLEDGE_TOKEN_KEY", Fernet.generate_key().decode())
    return upstream.google


@pytest.fixture
def e2e_log(request, caplog):
    """Backend knowledge logs -> reports/knowledge_e2e.log (and caplog for asserts)."""
    LOG_FILE.parent.mkdir(exist_ok=True)
    handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    knowledge = logging.getLogger("backend.knowledge")
    knowledge.addHandler(handler)
    caplog.set_level(logging.INFO, logger="backend.knowledge")
    note = logging.getLogger("e2e")
    note.addHandler(handler)
    note.setLevel(logging.INFO)
    note.info("===== %s =====", request.node.name)
    yield note
    knowledge.removeHandler(handler)
    note.removeHandler(handler)
    handler.close()


# ── steps a user goes through ─────────────────────────────────────────────────


def connect_drive(client, user) -> str:
    """Connect Drive exactly as the browser does: get the consent URL, "Allow"
    on Google's page, then the callback page POSTs code + state."""
    auth_url = client.get(f"{API}/sources/gdrive/connect", headers=user.headers).json()["auth_url"]
    consent = httpx.get(auth_url, follow_redirects=False)
    assert consent.status_code in (302, 307), consent.text
    back = urlparse(consent.headers["location"])
    assert f"{back.scheme}://{back.netloc}{back.path}" == REDIRECT_URI
    query = parse_qs(back.query)
    done = client.post(
        f"{API}/sources/gdrive/complete",
        json={"state": query["state"][0], "code": query["code"][0]},
        headers=user.headers,
    )
    assert done.status_code == 200, done.text
    return done.json()["id"]


def pick_folder(client, user, source_id: str, folder_name: str) -> str:
    items = client.get(f"{API}/sources/{source_id}/folders", headers=user.headers).json()["items"]
    folder = next(i for i in items if i["name"] == folder_name)
    assert folder["is_folder"]
    picked = client.put(
        f"{API}/sources/{source_id}/selection",
        json={"folder_ids": [folder["id"]], "file_ids": []},
        headers=user.headers,
    )
    assert picked.status_code == 200, picked.text
    return folder["id"]


def sync_now(client, user, source_id: str) -> None:
    # TestClient runs the background task before returning, so the run is done here.
    started = client.post(f"{API}/sources/{source_id}/sync", headers=user.headers)
    assert started.status_code == 202, started.text


def fill_drive(drive) -> dict[str, str]:
    folder = drive.add_folder("Honne notes")
    return {
        "launch": drive.add_doc("Launch plan", LAUNCH_PLAN, folder),
        "interviews": drive.add_doc("Customer interviews", INTERVIEWS, folder),
        "ideas": drive.add_file("ideas.md", "text/markdown", IDEAS, folder),
        "logo": drive.add_file("logo.png", "image/png", "not text", folder),  # unsupported type
        "outside": drive.add_doc("Private diary", "# Diary\n\nNot selected.\n", ROOT_ID),
    }


# ── DB views ──────────────────────────────────────────────────────────────────


def documents(db, source_id) -> dict[str, dict]:
    rows = db.execute(
        text(
            "SELECT external_id, title, sync_status, chunk_count, content_hash FROM knowledge_documents "
            "WHERE source_id = :s"
        ),
        {"s": source_id},
    ).mappings()
    return {r["external_id"]: dict(r) for r in rows}


def chunks(db, external_id) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT c.id, c.ordinal, c.chunk_hash, c.content, c.token_count, c.embedding_model, "
            "vector_dims(c.embedding) AS dims "
            "FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id "
            "WHERE d.external_id = :e ORDER BY c.ordinal"
        ),
        {"e": external_id},
    ).mappings()
    return [dict(r) for r in rows]


def source_row(db, source_id) -> dict:
    db.expire_all()
    return dict(
        db.execute(
            text("SELECT status, cursor, last_success_at, last_error FROM knowledge_sources WHERE id = :s"),
            {"s": source_id},
        )
        .mappings()
        .one()
    )


def log_lines(caplog, prefix: str) -> list[str]:
    return [r.getMessage() for r in caplog.records if r.getMessage().startswith(prefix)]


def connect_and_first_sync(client, user, drive, db, note) -> tuple[str, dict[str, str]]:
    ids = fill_drive(drive)
    t0 = time.monotonic()
    source_id = connect_drive(client, user)
    t_auth = time.monotonic()
    pick_folder(client, user, source_id, "Honne notes")
    sync_now(client, user, source_id)
    t_done = time.monotonic()
    note.info(
        "timing auth_ms=%d select_and_sync_ms=%d auth_to_embedded_ms=%d",
        (t_auth - t0) * 1000,
        (t_done - t_auth) * 1000,
        (t_done - t0) * 1000,
    )
    return source_id, ids


# ── E2E1 ──────────────────────────────────────────────────────────────────────


def test_e2e1_drive_auth_to_chunked_and_stored(client, user, drive, upstream, db, e2e_log, caplog):
    source_id, ids = connect_and_first_sync(client, user, drive, db, e2e_log)

    # Tokens are stored encrypted, never in plain text.
    stored = db.execute(
        text("SELECT refresh_token_enc FROM knowledge_source_credentials WHERE source_id = :s"),
        {"s": source_id},
    ).scalar_one()
    assert b"1//refresh-" not in bytes(stored)

    # Exactly the supported files in the selected folder became documents.
    docs = documents(db, source_id)
    assert set(docs) == {ids["launch"], ids["interviews"], ids["ideas"]}
    assert {d["title"] for d in docs.values()} == {"Launch plan", "Customer interviews", "ideas.md"}
    assert all(d["sync_status"] == "synced" and d["chunk_count"] > 0 for d in docs.values())

    # Every document is chunked and every chunk is embedded and searchable.
    all_chunks = {ext: chunks(db, ext) for ext in docs}
    for ext, rows in all_chunks.items():
        assert len(rows) == docs[ext]["chunk_count"]
        assert [r["ordinal"] for r in rows] == list(range(len(rows)))
        title = docs[ext]["title"]
        for r in rows:
            assert r["dims"] == settings.EMBEDDING_DIM
            assert r["embedding_model"] == settings.EMBEDDING_MODEL_TAG
            assert title in r["content"]  # the title prefix travels with every chunk
            assert 0 < r["token_count"] <= settings.CHUNK_MAX_TOKENS
    total_chunks = sum(len(r) for r in all_chunks.values())
    assert len(all_chunks[ids["launch"]]) >= 4  # one per section at least
    assert len(upstream.embeddings.texts) == total_chunks  # embedded once each
    assert all(t.startswith("title: ") for t in upstream.embeddings.texts)

    src = source_row(db, source_id)
    assert src["status"] == "active" and src["cursor"] and src["last_success_at"] and not src["last_error"]

    # The logs say what happened, per file and per run, with timings.
    files = log_lines(caplog, "knowledge file synced")
    assert len(files) == 3 and all("status=created" in f for f in files)
    (run,) = log_lines(caplog, "knowledge sync ")
    assert "outcome=ok mode=full" in run and f"embedded={total_chunks}" in run
    assert "first_success=True" in run and "since_connect_ms=None" not in run

    # A second "Sync now" with nothing changed in Drive embeds nothing.
    sync_now(client, user, source_id)
    assert len(upstream.embeddings.texts) == total_chunks
    rerun = log_lines(caplog, "knowledge sync ")[-1]
    assert "outcome=ok" in rerun and "embedded=0" in rerun and "first_success=False" in rerun

    e2e_log.info(
        "result documents=%d chunks=%d embedded_texts=%d chunks_per_doc=%s",
        len(docs),
        total_chunks,
        len(upstream.embeddings.texts),
        {docs[e]["title"]: len(r) for e, r in all_chunks.items()},
    )


# ── E2E2 ──────────────────────────────────────────────────────────────────────


async def wait_for(condition, timeout_s: float, every_s: float = 0.2):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if await asyncio.to_thread(condition):
            return
        await asyncio.sleep(every_s)
    raise AssertionError(f"condition not met within {timeout_s}s")


async def test_e2e2_edit_in_drive_is_reembedded_by_the_poller(client, user, drive, upstream, db, e2e_log, caplog):
    source_id, ids = connect_and_first_sync(client, user, drive, db, e2e_log)
    before = {e: chunks(db, e) for e in (ids["launch"], ids["interviews"], ids["ideas"])}
    hash_before = documents(db, source_id)[ids["launch"]]["content_hash"]
    cursor_before = source_row(db, source_id)["cursor"]
    embedded_before = len(upstream.embeddings.texts)

    # The user rewrites one section of one Google Doc and saves.
    edited = LAUNCH_PLAN.replace(section("Timeline", "Timeline"), section("Timeline", "Revised timeline", 12))
    assert edited != LAUNCH_PLAN
    drive.edit(ids["launch"], edited)
    edited_at = time.monotonic()

    # Nobody clicks "Sync now": the poller (5 min in production, 1 s here) finds it.
    cfg = PollerSettings(
        enabled=True, interval_s=1, max_concurrency=2, source_timeout_s=60, batch_size=50, first_run_delay_s=0
    )
    started = (poller := build_sync_poller(cfg)), asyncio.create_task(poller.poll_forever())

    def reembedded() -> bool:
        db.expire_all()
        return documents(db, source_id)[ids["launch"]]["content_hash"] != hash_before

    try:
        await wait_for(reembedded, timeout_s=30)
    finally:
        await stop_sync_poller(started)
    edit_to_embedded_ms = (time.monotonic() - edited_at) * 1000

    # Only the rewritten section was embedded again; everything else was reused.
    after_launch = chunks(db, ids["launch"])
    old_ids = {c["id"] for c in before[ids["launch"]]}
    new_rows = [c for c in after_launch if c["id"] not in old_ids]
    kept_rows = [c for c in after_launch if c["id"] in old_ids]
    new_texts = upstream.embeddings.texts[embedded_before:]
    assert new_rows and kept_rows
    assert len(new_texts) == len(new_rows)
    assert all("Revised timeline" in c["content"] for c in new_rows)
    assert all("Revised timeline" not in c["content"] for c in kept_rows)
    assert not any("Revised timeline" in c["content"] for c in before[ids["launch"]])

    # The other documents were not touched.
    for other in (ids["interviews"], ids["ideas"]):
        assert [c["id"] for c in chunks(db, other)] == [c["id"] for c in before[other]]

    src = source_row(db, source_id)
    assert src["status"] == "active" and src["cursor"] != cursor_before

    file_line = next(f for f in log_lines(caplog, "knowledge file synced") if ids["launch"] in f and "status=updated" in f)
    assert f"embedded={len(new_rows)}" in file_line and f"kept={len(kept_rows)}" in file_line
    assert any("mode=incremental" in r for r in log_lines(caplog, "knowledge sync "))
    assert any("ok=1" in t for t in log_lines(caplog, "knowledge poll tick_id"))

    e2e_log.info(
        "timing edit_to_embedded_ms=%d (poller interval 1 s here, 300 s in production) result "
        "chunks_reembedded=%d chunks_kept=%d",
        edit_to_embedded_ms,
        len(new_rows),
        len(kept_rows),
    )


# ── E2E3 ──────────────────────────────────────────────────────────────────────


def test_e2e3_delete_in_drive_removes_document_and_its_vectors(client, user, drive, upstream, db, e2e_log, caplog):
    source_id, ids = connect_and_first_sync(client, user, drive, db, e2e_log)
    launch_chunks = len(chunks(db, ids["launch"]))
    assert launch_chunks >= 4

    def vectors_for(external_id) -> int:
        return db.execute(
            text(
                "SELECT count(*) FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id "
                "WHERE d.external_id = :e AND c.embedding IS NOT NULL"
            ),
            {"e": external_id},
        ).scalar_one()

    total_before = db.execute(
        text("SELECT count(*) FROM knowledge_chunks WHERE source_id = :s"), {"s": source_id}
    ).scalar_one()

    # The user moves "Launch plan" to the trash in Drive; the next sync removes it.
    drive.trash(ids["launch"])
    sync_now(client, user, source_id)
    db.expire_all()

    assert ids["launch"] not in documents(db, source_id)
    assert vectors_for(ids["launch"]) == 0
    total_after = db.execute(
        text("SELECT count(*) FROM knowledge_chunks WHERE source_id = :s"), {"s": source_id}
    ).scalar_one()
    assert total_after == total_before - launch_chunks  # exactly its chunks, nothing else
    assert set(documents(db, source_id)) == {ids["interviews"], ids["ideas"]}
    assert any("deleted=1" in r and "mode=incremental" in r for r in log_lines(caplog, "knowledge sync "))
    e2e_log.info("result deleted_document_chunks=%d remaining_chunks=%d", launch_chunks, total_after)
