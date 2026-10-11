"""SyncPoller with fakes (Day 6: T3-T8, T13, T15). No database, Google or
Gemini: the store and SyncService are faked, except in T15, where the real
SyncService and DriveClient talk to a local socket that never answers."""

import asyncio
import logging
import uuid
from contextlib import nullcontext
from dataclasses import replace
from datetime import datetime, timezone

import httpx
import pytest

from backend.knowledge.connectors import gdrive
from backend.knowledge.connectors.base import BaseConnector
from backend.knowledge.records import DueSource, SourceRecord, SyncReport
from backend.knowledge.sync import SyncService
from backend.knowledge.sync_poller import (
    PollerSettings,
    SyncPoller,
    start_sync_poller,
    stop_sync_poller,
)

DEFAULTS = PollerSettings(
    enabled=True, interval_s=300, max_concurrency=2, source_timeout_s=5, batch_size=50, first_run_delay_s=0
)


def cfg(**overrides) -> PollerSettings:
    return replace(DEFAULTS, **overrides)


def due(n: int) -> list[DueSource]:
    return [DueSource(uuid.uuid4(), uuid.uuid4()) for _ in range(n)]


class FakeStore:
    def __init__(self, sources: list[DueSource]):
        self.sources = sources

    def list_due_sources(self, db, interval_seconds, limit):
        return self.sources[:limit]


class FakeSync:
    """Per-source behaviour: an outcome string, an exception to raise, or an
    awaitable to wait on first. Tracks how many runs are alive at once."""

    def __init__(self, behaviour=None, delay_s: float = 0.0):
        self.behaviour = behaviour or {}
        self.delay_s = delay_s
        self.calls: list[tuple[uuid.UUID, uuid.UUID]] = []
        self.alive = 0
        self.max_alive = 0

    async def sync_source(self, db, user_id, source_id):
        self.calls.append((user_id, source_id))
        self.alive += 1
        self.max_alive = max(self.max_alive, self.alive)
        try:
            what = self.behaviour.get(source_id, "ok")
            if self.delay_s:
                await asyncio.sleep(self.delay_s)
            if isinstance(what, asyncio.Event):
                await what.wait()
                what = "ok"
            if isinstance(what, Exception):
                raise what
            return SyncReport(source_id=source_id, outcome=what)
        finally:
            self.alive -= 1


def poller(sources, sync, **overrides) -> SyncPoller:
    return SyncPoller(lambda: nullcontext(None), FakeStore(sources), sync, cfg(**overrides))


# ── T3 isolation, T6 lease / mapping ──────────────────────────────────────────


async def test_t3_one_failing_source_does_not_stop_the_others():
    sources = due(3)
    sync = FakeSync({sources[1].source_id: RuntimeError("boom")})
    report = await poller(sources, sync).run_tick()
    assert (report.due, report.ok, report.failed, report.ran) == (3, 2, 1, 3)
    assert len(sync.calls) == 3


async def test_t6_outcomes_are_mapped():
    sources = due(5)
    outcomes = ["already_running", "lease_lost", "paused", "transient_error", "auth_revoked"]
    sync = FakeSync({s.source_id: o for s, o in zip(sources, outcomes)})
    report = await poller(sources, sync).run_tick()
    assert (report.skipped_locked, report.skipped, report.failed, report.ok) == (2, 1, 2, 0)
    assert report.ran == 2  # locked and skipped runs did no work


async def test_t9_runs_are_scoped_to_each_sources_own_user():
    sources = due(2)
    sync = FakeSync()
    await poller(sources, sync).run_tick()
    assert sorted(sync.calls) == sorted((s.user_id, s.source_id) for s in sources)


# ── T4 semaphore, T5 timeout ──────────────────────────────────────────────────


async def test_t4_never_more_than_max_concurrency_alive():
    sync = FakeSync(delay_s=0.02)
    report = await poller(due(5), sync, max_concurrency=2).run_tick()
    assert report.ok == 5 and sync.max_alive == 2


async def test_t4_stragglers_keep_their_slot():
    """Every run times out, yet no more than 2 are ever alive at once."""
    sync = FakeSync(delay_s=0.05)
    p = poller(due(5), sync, max_concurrency=2, source_timeout_s=0.005)
    report = await p.run_tick()
    assert report.timed_out == 5 and sync.max_alive == 2
    await asyncio.wait(list(p._running))


async def test_t5_timed_out_run_is_left_running_and_frees_its_slot_when_done():
    sources = due(1)
    release = asyncio.Event()
    sync = FakeSync({sources[0].source_id: release})
    p = poller(sources, sync, max_concurrency=1, source_timeout_s=0.01)

    report = await p.run_tick()
    assert (report.timed_out, report.stragglers, report.failed) == (1, 1, 0)
    (straggler,) = p._running
    assert not straggler.cancelled() and p._slots.locked()

    release.set()
    await straggler
    assert straggler.result().outcome == "ok"
    assert not p._running and not p._slots.locked()


# ── T7 loop survives, T13 fixed rate ──────────────────────────────────────────


async def test_t7_a_failing_tick_is_logged_and_the_loop_goes_on(caplog):
    p = poller([], FakeSync(), interval_s=0)
    ticks = []

    async def run_tick():
        ticks.append(1)
        if len(ticks) == 1:
            raise RuntimeError("db blip")
        raise asyncio.CancelledError  # stop the loop after the second tick

    p.run_tick = run_tick
    with caplog.at_level(logging.ERROR), pytest.raises(asyncio.CancelledError):
        await p.poll_forever()
    assert len(ticks) == 2
    assert "knowledge poll tick failed" in caplog.text


def test_t13_next_tick_keeps_a_fixed_rate():
    p = poller([], FakeSync(), interval_s=300)
    assert p.next_delay(200) == 100
    assert p.next_delay(400) == 0


# ── T8 wiring ─────────────────────────────────────────────────────────────────


async def test_t8_disabled_poller_starts_nothing():
    assert start_sync_poller(cfg(enabled=False)) is None
    await stop_sync_poller(None)


async def test_t8_enabled_poller_starts_and_stops_cleanly():
    built = poller([], FakeSync(), first_run_delay_s=3600)
    started = start_sync_poller(cfg(), build=lambda c: built)
    assert started is not None
    p, task = started
    assert p is built and not task.done()
    await stop_sync_poller(started)
    assert task.cancelled()


# ── T15 a hung HTTP call ends the run and frees the slot ──────────────────────


class FakeSourceStore:
    """Just enough of the store for SyncService to take the lease and record the run."""

    def __init__(self, source: SourceRecord):
        self.source = source
        self.recorded: list[tuple[bool, str | None]] = []
        self.lease_released = False

    def get_source(self, db, user_id, source_id):
        return self.source

    def acquire_sync_lease(self, db, user_id, source_id, run_id, seconds):
        return True

    def release_sync_lease(self, db, user_id, source_id, run_id):
        self.lease_released = True

    def update_source_cursor(self, db, user_id, source_id, cursor, ok, error=None):
        self.recorded.append((ok, error))


class DriveOnlyConnector(BaseConnector):
    """A real DriveClient; the first call of a full listing hangs."""

    provider = "gdrive"

    async def initial_cursor(self):
        client = gdrive.DriveClient(gdrive.StaticTokenProvider("token"))
        return (await client.get_json("changes/startPageToken"))["startPageToken"]

    async def full_listing(self):
        raise AssertionError("never reached")

    async def list_changes(self, cursor):
        raise AssertionError("never reached")

    async def fetch(self, meta):
        raise AssertionError("never reached")


class Connectors:
    def create(self, source, db):
        return DriveOnlyConnector(source)


@pytest.fixture
async def silent_server():
    """Accepts connections and never sends a byte."""
    hang = asyncio.Event()

    async def handler(reader, writer):
        await hang.wait()
        writer.close()

    server = await asyncio.start_server(handler, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        hang.set()
        server.close()


async def test_t15_hung_http_call_times_out_ends_the_run_and_frees_the_slot(silent_server, monkeypatch):
    monkeypatch.setattr(gdrive, "API", silent_server)
    monkeypatch.setattr(gdrive, "TIMEOUT", httpx.Timeout(connect=1.0, read=0.2, write=1.0, pool=1.0))
    user_id, source_id = uuid.uuid4(), uuid.uuid4()
    store = FakeSourceStore(
        SourceRecord(
            id=source_id,
            user_id=user_id,
            provider="gdrive",
            account_ref="perm-1",
            display_name="a@x.com",
            config={"folder_ids": ["F"]},
            cursor=None,
            status="active",
            last_success_at=datetime.now(timezone.utc),
            last_error=None,
        )
    )
    sync = SyncService(store, Connectors(), pipeline=None)
    # The poller's own timeout is far longer: it's the HTTP timeout that ends the run.
    p = SyncPoller(
        lambda: nullcontext(None),
        FakeStore([DueSource(user_id, source_id)]),
        sync,
        cfg(max_concurrency=1, source_timeout_s=10),
    )

    report = await asyncio.wait_for(p.run_tick(), timeout=5)

    assert (report.failed, report.timed_out, report.stragglers) == (1, 0, 0)
    assert store.recorded == [(False, "TransientConnectorError: Drive unreachable: ReadTimeout")]
    assert store.lease_released
    assert not p._running and not p._slots.locked()
