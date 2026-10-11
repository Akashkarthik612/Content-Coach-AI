"""Background knowledge sync (Day_6.md, plan in docs/day6/sync_poller_plan.md).

Every interval, find the sources that are due and run the existing
SyncService.sync_source() for each, so a change in a selected Drive folder
reaches the knowledge store without anyone clicking "Sync now". The poller
decides when and which; sync_source() decides what changed. It never locks
anything itself: the per-source lease inside sync_source() does that, which
also makes several app instances (or "Sync now" at the same moment) safe.

Invariants:
- At most max_concurrency poller-started runs are alive at once. A run's slot
  is freed when the run really ends, not when the tick stops waiting for it.
- A run that passes its timeout is NOT cancelled. sync_source() is a coroutine
  whose DB calls run in worker threads; cancelling it mid-call would let its
  cleanup use the same Session from a second thread. It keeps running (still
  holding its slot and lease) and the tick moves on. Drive and Gemini calls
  carry their own httpx timeouts, so a run can't hang forever.
- Ticks never overlap; the next one starts `interval` after the last started.
"""

import asyncio
import logging
import time
import uuid
from collections import Counter
from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.knowledge.records import DueSource, SyncReport, TickOutcome, TickReport
from backend.knowledge.repository import KnowledgeRepository, KnowledgeStore
from backend.knowledge.sync import SyncService, default_sync_service

logger = logging.getLogger(__name__)

# SyncReport.outcome -> what the poller counts it as.
_LOCKED = frozenset({"already_running", "lease_lost"})  # another run owns the source
_SKIPPED = frozenset({"paused", "nothing_selected", "source_missing", "source_deleted"})


@dataclass(frozen=True)
class PollerSettings:
    enabled: bool
    interval_s: float
    max_concurrency: int
    source_timeout_s: float
    batch_size: int
    first_run_delay_s: float

    @classmethod
    def from_settings(cls, s) -> "PollerSettings":
        return cls(
            enabled=s.KNOWLEDGE_SYNC_ENABLED,
            interval_s=s.KNOWLEDGE_SYNC_INTERVAL_SECONDS,
            max_concurrency=s.KNOWLEDGE_SYNC_MAX_CONCURRENCY,
            source_timeout_s=s.KNOWLEDGE_SYNC_SOURCE_TIMEOUT_SECONDS,
            batch_size=s.KNOWLEDGE_SYNC_BATCH_SIZE,
            first_run_delay_s=s.KNOWLEDGE_SYNC_FIRST_RUN_DELAY_SECONDS,
        )


class SyncPoller:
    def __init__(
        self,
        session_factory: Callable[[], AbstractContextManager[Session]],
        store: KnowledgeStore,
        sync_service: SyncService,
        cfg: PollerSettings,
    ) -> None:
        self._session_factory = session_factory
        self._store = store
        self._sync_service = sync_service
        self._cfg = cfg
        self._slots = asyncio.Semaphore(cfg.max_concurrency)
        self._running: set[asyncio.Task] = set()

    async def poll_forever(self) -> None:
        """Started from lifespan. An error in one tick is logged and the loop
        goes on; cancellation (shutdown) propagates."""
        await asyncio.sleep(self._cfg.first_run_delay_s)
        while True:
            started = time.monotonic()
            try:
                await self.run_tick()
            except Exception:
                logger.exception("knowledge poll tick failed; retrying next interval")
            await asyncio.sleep(self.next_delay(time.monotonic() - started))

    def next_delay(self, elapsed_s: float) -> float:
        """Fixed rate: a slow tick shortens the wait instead of stretching the interval."""
        return max(0.0, self._cfg.interval_s - elapsed_s)

    async def run_tick(self) -> TickReport:
        tick_id, started_at, t0 = uuid.uuid4(), datetime.now(timezone.utc), time.monotonic()
        due = await asyncio.to_thread(self._list_due)
        counts = Counter(await asyncio.gather(*(self._run_one(d) for d in due)))
        report = TickReport(
            tick_id=tick_id,
            started_at=started_at,
            duration_ms=int((time.monotonic() - t0) * 1000),
            due=len(due),
            ran=counts["ok"] + counts["failed"] + counts["timed_out"],
            ok=counts["ok"],
            skipped_locked=counts["skipped_locked"],
            skipped=counts["skipped"],
            failed=counts["failed"],
            timed_out=counts["timed_out"],
            stragglers=len(self._running),
        )
        self._log(report)
        return report

    async def stop(self, grace_s: float = 5.0) -> None:
        """Shutdown: cancel runs still going (stragglers, or a tick cut short).
        A run's lease then expires on its own if its release didn't get through."""
        tasks = list(self._running)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.wait(tasks, timeout=grace_s)

    def _list_due(self) -> list[DueSource]:
        with self._session_factory() as db:
            return self._store.list_due_sources(db, self._cfg.interval_s, self._cfg.batch_size)

    async def _run_one(self, due: DueSource) -> TickOutcome:
        await self._slots.acquire()
        task = asyncio.create_task(self._sync(due))
        self._running.add(task)
        task.add_done_callback(self._finished)
        done, _ = await asyncio.wait({task}, timeout=self._cfg.source_timeout_s)
        if not done:
            logger.warning(
                "knowledge poll run timed out user_id=%s source_id=%s after=%ss; left running",
                due.user_id,
                due.source_id,
                self._cfg.source_timeout_s,
            )
            return "timed_out"
        return self.classify(task.result())

    def _finished(self, task: asyncio.Task) -> None:
        self._running.discard(task)
        self._slots.release()

    async def _sync(self, due: DueSource) -> SyncReport | None:
        """One run on its own session. Never raises (except cancellation):
        sync_source() logs its own outcome; anything escaping it is logged here."""
        try:
            with self._session_factory() as db:
                return await self._sync_service.sync_source(db, due.user_id, due.source_id)
        except Exception as exc:
            logger.exception(
                "knowledge poll run crashed user_id=%s source_id=%s error=%s",
                due.user_id,
                due.source_id,
                type(exc).__name__,
            )
            return None

    @staticmethod
    def classify(report: SyncReport | None) -> TickOutcome:
        if report is None:
            return "failed"
        if report.outcome == "ok":
            return "ok"
        if report.outcome in _LOCKED:
            return "skipped_locked"
        if report.outcome in _SKIPPED:
            return "skipped"
        return "failed"  # transient_error, auth_revoked: already recorded on the source

    @staticmethod
    def _log(r: TickReport) -> None:
        logger.log(
            logging.WARNING if r.failed or r.timed_out else logging.INFO,
            "knowledge poll tick_id=%s due=%d ran=%d ok=%d skipped_locked=%d skipped=%d failed=%d "
            "timed_out=%d stragglers=%d duration_ms=%d",
            r.tick_id,
            r.due,
            r.ran,
            r.ok,
            r.skipped_locked,
            r.skipped,
            r.failed,
            r.timed_out,
            r.stragglers,
            r.duration_ms,
        )


def build_sync_poller(cfg: PollerSettings) -> SyncPoller:
    from backend.core.database import SessionLocal

    return SyncPoller(SessionLocal, KnowledgeRepository, default_sync_service(), cfg)


def start_sync_poller(
    cfg: PollerSettings, build: Callable[[PollerSettings], SyncPoller] = build_sync_poller
) -> tuple[SyncPoller, asyncio.Task] | None:
    """Called from lifespan. None when KNOWLEDGE_SYNC_ENABLED is off (tests, CI)."""
    if not cfg.enabled:
        logger.info("knowledge poll disabled (KNOWLEDGE_SYNC_ENABLED=false)")
        return None
    poller = build(cfg)
    return poller, asyncio.create_task(poller.poll_forever(), name="knowledge-sync-poller")


async def stop_sync_poller(started: tuple[SyncPoller, asyncio.Task] | None) -> None:
    if started is None:
        return
    poller, task = started
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
    await poller.stop()
