"""SyncService against real Postgres with a fake connector and FakeEmbedder
(I9-I15, plus the edge cases found in the pre-coding review)."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from backend.knowledge.connectors.base import (
    AuthRevokedError,
    BaseConnector,
    CursorExpiredError,
    FileGoneError,
    PermanentFileError,
    TransientConnectorError,
)
from backend.knowledge.embedder import FakeEmbedder
from backend.knowledge.pipeline import IngestionPipeline
from backend.knowledge.records import ChangeBatch, FetchedDocument, FileMeta
from backend.knowledge.repository import KnowledgeRepository as Repo
from backend.knowledge.sync import SyncService

pytestmark = pytest.mark.integration

T0 = datetime(2026, 10, 1, tzinfo=timezone.utc)
CONFIG = {"folder_ids": ["F"], "file_ids": []}


def meta(id_: str, modified: datetime = T0) -> FileMeta:
    return FileMeta(external_id=id_, title=f"Doc {id_}", mime_type="text/markdown", modified_at=modified)


class FakeConnector(BaseConnector):
    provider = "gdrive"

    def __init__(self, source, files=(), changes=None):
        super().__init__(source)
        self.files: list[FileMeta] = list(files)
        self.changes = changes  # ChangeBatch, or an exception to raise
        self.listing_error: Exception | None = None
        self.fetch_errors: dict[str, Exception] = {}
        self.on_fetch = None  # hook(meta) run before each fetch
        self.calls: list[str] = []

    async def initial_cursor(self):
        self.calls.append("initial_cursor")
        return "start-1"

    async def full_listing(self):
        self.calls.append("full_listing")
        if self.listing_error:
            raise self.listing_error
        return list(self.files)

    async def list_changes(self, cursor):
        self.calls.append(f"list_changes:{cursor}")
        if isinstance(self.changes, Exception):
            raise self.changes
        return self.changes

    async def fetch(self, m):
        self.calls.append(f"fetch:{m.external_id}")
        if self.on_fetch:
            self.on_fetch(m)
        if m.external_id in self.fetch_errors:
            raise self.fetch_errors[m.external_id]
        return FetchedDocument(
            meta=m, text=f"# {m.external_id}\nBody of {m.external_id} at {m.modified_at}.\n", kind="markdown"
        )


class OneConnector:
    def __init__(self, connector):
        self.connector = connector

    def create(self, source, db):
        self.connector.source = source
        return self.connector


@pytest.fixture
def user(make_user):
    return make_user()


@pytest.fixture
def source(db, user):
    return Repo.create_source(db, user, "gdrive", "perm-1", "a@x.com", CONFIG)


@pytest.fixture
def embedder():
    return FakeEmbedder()


def service(con, embedder):
    return SyncService(Repo, OneConnector(con), IngestionPipeline(Repo, embedder))


def set_cursor(db, user, source, cursor="c1"):
    Repo.update_source_cursor(db, user, source.id, cursor, ok=True)
    return Repo.get_source(db, user, source.id)


def ids(db, user, source):
    return Repo.list_document_external_ids(db, user, source.id)


# ── I9, I10 first run ─────────────────────────────────────────────────────────


async def test_i9_first_run_takes_cursor_before_listing(db, user, source, embedder):
    con = FakeConnector(source, files=[meta("a"), meta("b")])
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert con.calls[:2] == ["initial_cursor", "full_listing"]
    assert (report.outcome, report.mode, report.ingested) == ("ok", "full", 2)
    assert Repo.get_source(db, user, source.id).cursor == "start-1"
    assert ids(db, user, source) == {"a", "b"}


async def test_i10_first_run_garbage_collects_unlisted_documents(db, user, source, embedder):
    await service(FakeConnector(source, files=[meta("a"), meta("old")]), embedder).sync_source(
        db, user, source.id
    )
    Repo.update_source_config(db, user, source.id, "a@x.com", CONFIG)  # clears cursor
    report = await service(FakeConnector(source, files=[meta("a")]), embedder).sync_source(
        db, user, source.id
    )
    assert report.deleted == 1
    assert ids(db, user, source) == {"a"}


# ── I11-I14 incremental ───────────────────────────────────────────────────────


async def test_i11_transient_error_keeps_cursor(db, user, source, embedder):
    src = set_cursor(db, user, source)
    con = FakeConnector(
        src, changes=ChangeBatch(changed=[meta("a"), meta("b"), meta("c")], removed=[], next_cursor="c2")
    )
    con.fetch_errors["b"] = TransientConnectorError("Drive HTTP 503")
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert report.outcome == "transient_error"
    assert ids(db, user, source) == {"a"}
    after = Repo.get_source(db, user, source.id)
    assert after.cursor == "c1"
    assert after.status == "error" and "503" in after.last_error


async def test_i12_permanent_error_fails_one_file_and_advances(db, user, source, embedder):
    src = set_cursor(db, user, source)
    con = FakeConnector(
        src, changes=ChangeBatch(changed=[meta("a"), meta("b"), meta("c")], removed=[], next_cursor="c2")
    )
    con.fetch_errors["b"] = PermanentFileError("unsupported")
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert (report.outcome, report.ingested, report.failed) == ("ok", 2, 1)
    assert report.failures == [("b", "unsupported")]
    assert Repo.get_source(db, user, source.id).cursor == "c2"


async def test_i13_expired_cursor_falls_back_to_full_listing_with_gc(db, user, source, embedder):
    await service(FakeConnector(source, files=[meta("a"), meta("old")]), embedder).sync_source(
        db, user, source.id
    )
    src = Repo.get_source(db, user, source.id)
    con = FakeConnector(src, files=[meta("a")], changes=CursorExpiredError("410"))
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert con.calls[:3] == ["list_changes:start-1", "initial_cursor", "full_listing"]
    assert (report.mode, report.deleted) == ("full", 1)
    assert Repo.get_source(db, user, source.id).cursor == "start-1"


async def test_i14_same_modified_time_is_never_fetched(db, user, source, embedder):
    await service(FakeConnector(source, files=[meta("a")]), embedder).sync_source(db, user, source.id)
    Repo.update_source_config(db, user, source.id, "a@x.com", CONFIG)
    con = FakeConnector(source, files=[meta("a")])
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert "fetch:a" not in con.calls
    assert (report.unchanged, report.embedded) == (1, 0)


async def test_removed_and_gone_files_are_deleted(db, user, source, embedder):
    await service(FakeConnector(source, files=[meta("a"), meta("b"), meta("c")]), embedder).sync_source(
        db, user, source.id
    )
    src = Repo.get_source(db, user, source.id)
    later = T0 + timedelta(hours=1)
    con = FakeConnector(
        src, changes=ChangeBatch(changed=[meta("b", later)], removed=["c", "never-stored"], next_cursor="c9")
    )
    con.fetch_errors["b"] = FileGoneError("b")
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert report.deleted == 2
    assert ids(db, user, source) == {"a"}


async def test_rerun_embeds_nothing(db, user, source, embedder):
    files = [meta("a"), meta("b")]
    await service(FakeConnector(source, files=files), embedder).sync_source(db, user, source.id)
    embedder.calls.clear()
    Repo.update_source_config(db, user, source.id, "a@x.com", CONFIG)
    report = await service(FakeConnector(source, files=files), embedder).sync_source(db, user, source.id)
    assert report.embedded == 0 and embedder.calls == []


# ── I15 lease ─────────────────────────────────────────────────────────────────


async def test_i15_second_run_is_refused_while_lease_is_held(db, user, source, embedder):
    assert Repo.acquire_sync_lease(db, user, source.id, uuid.uuid4(), 900)
    con = FakeConnector(source, files=[meta("a")])
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert report.outcome == "already_running"
    assert con.calls == []


async def test_expired_lease_can_be_taken_over(db, user, source, embedder):
    assert Repo.acquire_sync_lease(db, user, source.id, uuid.uuid4(), -1)  # already expired
    report = await service(FakeConnector(source, files=[meta("a")]), embedder).sync_source(
        db, user, source.id
    )
    assert report.outcome == "ok"


async def test_lease_is_released_after_a_run(db, user, source, embedder):
    await service(FakeConnector(source, files=[meta("a")]), embedder).sync_source(db, user, source.id)
    assert Repo.acquire_sync_lease(db, user, source.id, uuid.uuid4(), 900)


async def test_lost_lease_stops_the_run_without_saving_the_cursor(db, user, source, embedder):
    con = FakeConnector(source, files=[meta("a"), meta("b")])

    def steal(m):
        # Our lease "expired" and another run took it.
        if m.external_id == "a":
            Repo.release_sync_lease(db, user, source.id, _owner(db, source))
            Repo.acquire_sync_lease(db, user, source.id, uuid.uuid4(), 900)

    con.on_fetch = steal
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert report.outcome == "lease_lost"
    assert "fetch:b" not in con.calls
    assert Repo.get_source(db, user, source.id).cursor is None


def _owner(db, source):
    from sqlalchemy import select

    from backend.knowledge.models import KnowledgeSource

    return db.execute(
        select(KnowledgeSource.sync_lease_owner).where(KnowledgeSource.id == source.id)
    ).scalar_one()


# ── review edge cases ─────────────────────────────────────────────────────────


async def test_selection_change_during_run_keeps_cursor_cleared(db, user, source, embedder):
    con = FakeConnector(source, files=[meta("a")])
    con.on_fetch = lambda m: Repo.update_source_config(db, user, source.id, "a@x.com", {"folder_ids": ["G"]})
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert report.outcome == "ok" and report.cursor_saved is False
    assert Repo.get_source(db, user, source.id).cursor is None  # next run lists the new selection


async def test_folder_change_falls_back_to_full_listing(db, user, source, embedder):
    src = set_cursor(db, user, source)
    batch = ChangeBatch(changed=[], removed=[], next_cursor="c2", folder_changed=True)
    con = FakeConnector(src, files=[meta("moved-in")], changes=batch)
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert report.mode == "full"
    assert ids(db, user, source) == {"moved-in"}
    assert Repo.get_source(db, user, source.id).cursor == "start-1"


async def test_failed_listing_never_garbage_collects(db, user, source, embedder):
    await service(FakeConnector(source, files=[meta("a")]), embedder).sync_source(db, user, source.id)
    Repo.update_source_config(db, user, source.id, "a@x.com", CONFIG)
    con = FakeConnector(source)
    con.listing_error = TransientConnectorError("Drive listing refused")
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert report.outcome == "transient_error"
    assert ids(db, user, source) == {"a"}


async def test_source_deleted_mid_run_ends_quietly(db, user, source, embedder):
    con = FakeConnector(source, files=[meta("a"), meta("b")])
    con.on_fetch = lambda m: Repo.delete_source(db, user, source.id)
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert report.outcome == "source_deleted"
    assert Repo.get_source(db, user, source.id) is None


async def test_revoked_auth_marks_source_for_reconnect(db, user, source, embedder):
    src = set_cursor(db, user, source)
    con = FakeConnector(src, changes=AuthRevokedError("auth_revoked: reconnect Google Drive"))
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert report.outcome == "auth_revoked"
    after = Repo.get_source(db, user, source.id)
    assert after.status == "needs_reauth" and after.last_error.startswith("auth_revoked:")
    assert after.cursor == "c1"


async def test_t10_revoked_source_is_not_polled_until_reconnected(db, user, source, embedder):
    def an_hour_later():
        db.execute(text("UPDATE knowledge_sources SET last_run_at = now() - interval '1 hour'"))
        db.commit()

    con = FakeConnector(set_cursor(db, user, source), changes=AuthRevokedError("auth_revoked: x"))
    await service(con, embedder).sync_source(db, user, source.id)
    an_hour_later()
    assert Repo.list_due_sources(db, 300, 50) == []
    # A later failed run (e.g. "Sync now") doesn't turn it back into a retried 'error'.
    Repo.update_source_cursor(db, user, source.id, None, ok=False, error="TransientSyncError: x")
    assert Repo.get_source(db, user, source.id).status == "needs_reauth"
    # Reconnecting stores new tokens and makes it due again.
    Repo.save_credentials(db, user, source.id, b"r", None, None, "scope")
    assert Repo.get_source(db, user, source.id).status == "active"
    an_hour_later()
    assert [d.source_id for d in Repo.list_due_sources(db, 300, 50)] == [source.id]


async def test_nothing_selected_does_nothing(db, user, embedder):
    empty = Repo.create_source(db, user, "gdrive", "perm-2", "b@x.com", {})
    con = FakeConnector(empty, files=[meta("a")])
    report = await service(con, embedder).sync_source(db, user, empty.id)
    assert report.outcome == "nothing_selected" and con.calls == []


async def test_file_cap_limits_ingestion_but_not_gc(db, user, source, embedder, monkeypatch):
    from backend.core.config import settings

    await service(FakeConnector(source, files=[meta("c")]), embedder).sync_source(db, user, source.id)
    Repo.update_source_config(db, user, source.id, "a@x.com", CONFIG)
    monkeypatch.setattr(settings, "MAX_FILES_PER_SOURCE", 2)
    report = await service(
        FakeConnector(source, files=[meta("a"), meta("b"), meta("c")]), embedder
    ).sync_source(db, user, source.id)
    assert report.skipped_over_cap == 1
    assert ids(db, user, source) == {"a", "b", "c"}  # c is over the cap but still listed: not collected


async def test_document_deleted_by_the_user_is_not_synced_back(db, user, source, embedder):
    await service(FakeConnector(source, files=[meta("a"), meta("b")]), embedder).sync_source(
        db, user, source.id
    )
    assert Repo.exclude_document(db, user, Repo.get_document(db, user, source.id, "b").id)
    src = Repo.get_source(db, user, source.id)
    assert (src.config["excluded_ids"], src.cursor) == (["b"], "start-1")  # cursor kept

    later = T0 + timedelta(hours=1)
    con = FakeConnector(src, changes=ChangeBatch(changed=[meta("b", later)], removed=[], next_cursor="c2"))
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert "fetch:b" not in con.calls and report.files_seen == 0

    Repo.update_source_config(db, user, source.id, "a@x.com", src.config)  # forces a full listing
    con = FakeConnector(src, files=[meta("a"), meta("b", later)])
    report = await service(con, embedder).sync_source(db, user, source.id)
    assert report.mode == "full" and "fetch:b" not in con.calls
    assert ids(db, user, source) == {"a"}
