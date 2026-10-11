"""One sync run for one source (Day_5.md §B6.4). "Sync now" calls it today;
the 5-minute timer will call the same method.

  1. Take the source's lease (one run at a time; renewed after every file).
  2. No cursor (first run, new selection, expired cursor, or a folder moved):
     take the start cursor FIRST, then list everything, and delete stored
     documents the listing no longer has (GC). Otherwise read the changes.
  3. Per changed file: skip if modifiedTime is unchanged, else fetch + ingest.
  4. Delete removed files.
  5. Save the new cursor only if nothing transient went wrong; otherwise keep
     the old one so the next run retries the same changes.

Error policy (B-D10): transient -> stop, cursor kept; permanent for one file
-> mark it failed, carry on, cursor advances. Every run ends in one log line.
"""

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.knowledge.connectors.base import (
    AuthRevokedError,
    BaseConnector,
    CursorExpiredError,
    FileGoneError,
)
from backend.knowledge.connectors.factory import ConnectorFactory, ConnectorProvider
from backend.knowledge.errors import (
    LeaseLostError,
    PermanentFileError,
    SourceNotFoundError,
    StaleDiffError,
    TransientSyncError,
)
from backend.knowledge.pipeline import IngestionPipeline
from backend.knowledge.records import FileMeta, IngestResult, SourceRecord, SyncReport
from backend.knowledge.repository import KnowledgeStore

logger = logging.getLogger(__name__)


class SyncService:
    def __init__(
        self, store: KnowledgeStore, connectors: ConnectorProvider, pipeline: IngestionPipeline
    ) -> None:
        self._store = store
        self._connectors = connectors
        self._pipeline = pipeline

    async def _db(self, fn, *args: Any) -> Any:
        return await asyncio.to_thread(fn, *args)

    async def sync_source(self, db: Session, user_id: UUID, source_id: UUID) -> SyncReport:
        report = SyncReport(source_id=source_id)
        run_id = uuid.uuid4()
        started = time.monotonic()
        source = await self._db(self._store.get_source, db, user_id, source_id)
        if source is None:
            report.outcome = "source_missing"
        elif source.status == "paused":
            report.outcome = "paused"
        elif not (source.config.get("folder_ids") or source.config.get("file_ids")):
            report.outcome = "nothing_selected"
        elif not await self._db(
            self._store.acquire_sync_lease, db, user_id, source_id, run_id, settings.SYNC_LEASE_SECONDS
        ):
            report.outcome = "already_running"
        else:
            try:
                await self._run(db, user_id, source, run_id, report)
            except LeaseLostError:
                report.outcome = "lease_lost"
            except SourceNotFoundError:
                report.outcome = "source_deleted"
            except Exception as exc:  # a bug: record it on the source, never fail silently
                logger.exception("knowledge sync crashed user_id=%s source_id=%s", user_id, source_id)
                report.outcome, report.error = "transient_error", f"internal error: {type(exc).__name__}"
                try:
                    await self._record(db, user_id, source_id, ok=False, error=report.error)
                except Exception:
                    logger.exception("knowledge sync could not record the crash source_id=%s", source_id)
            finally:
                try:
                    await self._db(self._store.release_sync_lease, db, user_id, source_id, run_id)
                except Exception:
                    logger.exception("knowledge sync lease release failed source_id=%s", source_id)
        report.duration_ms = _ms_since(started)
        self._log(user_id, report)
        return report

    async def _run(
        self, db: Session, user_id: UUID, source: SourceRecord, run_id: UUID, report: SyncReport
    ) -> None:
        connector = self._connectors.create(source, db)
        try:
            planning = time.monotonic()
            changed, removed, next_cursor = await self._plan(db, user_id, source, connector, report)
            report.plan_ms = _ms_since(planning)
            for meta in changed:
                await self._sync_file(db, user_id, source.id, connector, meta, report)
                await self._renew(db, user_id, source.id, run_id)
            for external_id in removed:
                if await self._db(self._store.delete_document, db, user_id, source.id, external_id):
                    report.deleted += 1
        except AuthRevokedError as exc:
            report.outcome, report.error = "auth_revoked", str(exc)
        except (TransientSyncError, StaleDiffError) as exc:
            # StaleDiffError: another run applied first; recompute next run.
            report.outcome, report.error = "transient_error", f"{type(exc).__name__}: {exc}"

        if report.outcome == "auth_revoked":
            # Retrying won't help until the user reconnects: stop the poller picking it up.
            await self._db(self._store.mark_needs_reauth, db, user_id, source.id, report.error)
            return
        if report.outcome != "ok":
            await self._record(db, user_id, source.id, ok=False, error=report.error)
            return
        # A selection change during this run cleared the cursor: keep it
        # cleared so the next run lists (and garbage-collects) the new selection.
        fresh = await self._db(self._store.get_source, db, user_id, source.id)
        if fresh is None:
            raise SourceNotFoundError(source.id)
        cursor = next_cursor if fresh.config == source.config else None
        await self._record(db, user_id, source.id, ok=True, cursor=cursor)
        report.cursor_saved = cursor is not None
        if source.last_success_at is None:
            # Drive connected -> knowledge searchable: the end-to-end time a new user waits
            # (includes the time they took to pick folders).
            report.first_success = True
            if source.created_at is not None:
                report.since_connect_ms = int((datetime.now(timezone.utc) - source.created_at).total_seconds() * 1000)

    async def _plan(
        self, db: Session, user_id: UUID, source: SourceRecord, connector: BaseConnector, report: SyncReport
    ) -> tuple[list[FileMeta], list[str], str]:
        # Files the user removed in Honne stay out while they remain in Drive.
        excluded = set(source.config.get("excluded_ids", []))
        if source.cursor:
            try:
                batch = await connector.list_changes(source.cursor)
            except CursorExpiredError:
                logger.info("knowledge sync cursor expired source_id=%s; full listing", source.id)
            else:
                if not batch.folder_changed:
                    report.mode = "incremental"
                    changed = [f for f in batch.changed if f.external_id not in excluded]
                    report.files_seen = len(changed)
                    return changed, batch.removed, batch.next_cursor
                logger.info("knowledge sync folder changed source_id=%s; full listing", source.id)

        report.mode = "full"
        start = await connector.initial_cursor()  # BEFORE listing: nothing changed meanwhile is missed
        files = [f for f in await connector.full_listing() if f.external_id not in excluded]
        listed = {f.external_id for f in files}
        stored = await self._db(self._store.list_document_external_ids, db, user_id, source.id)
        cap = settings.MAX_FILES_PER_SOURCE
        if len(files) > cap:
            report.skipped_over_cap = len(files) - cap
            logger.warning(
                "knowledge sync over file cap source_id=%s listed=%d cap=%d", source.id, len(files), cap
            )
            files = files[:cap]
        report.files_seen = len(files)
        # GC only from a listing that completed: any error above raised before here.
        return files, sorted(stored - listed), start

    async def _sync_file(
        self,
        db: Session,
        user_id: UUID,
        source_id: UUID,
        connector: BaseConnector,
        meta: FileMeta,
        report: SyncReport,
    ) -> None:
        stored = await self._db(self._store.get_document, db, user_id, source_id, meta.external_id)
        if (
            stored is not None
            and meta.modified_at is not None
            and stored.source_modified_at == meta.modified_at
            and stored.sync_status == "synced"
        ):
            report.unchanged += 1
            return
        fetching = time.monotonic()
        try:
            doc = await connector.fetch(meta)
        except FileGoneError:
            if await self._db(self._store.delete_document, db, user_id, source_id, meta.external_id):
                report.deleted += 1
            return
        except PermanentFileError as exc:
            await self._pipeline.fail(db, user_id, source_id, meta.external_id, str(exc))
            report.failed += 1
            report.failures.append((meta.external_id, str(exc)))
            return

        fetch_ms = _ms_since(fetching)
        ingesting = time.monotonic()
        result = await self._pipeline.ingest(db, user_id, source_id, doc)
        self._log_file(user_id, source_id, meta, result, fetch_ms, _ms_since(ingesting))
        report.embedded += result.embedded
        report.chunks_kept += result.kept
        if result.status == "failed":
            report.failed += 1
            report.failures.append((meta.external_id, result.reason or ""))
        elif result.status == "unchanged":
            report.unchanged += 1
        else:
            report.ingested += 1

    async def _renew(self, db: Session, user_id: UUID, source_id: UUID, run_id: UUID) -> None:
        if not await self._db(
            self._store.renew_sync_lease, db, user_id, source_id, run_id, settings.SYNC_LEASE_SECONDS
        ):
            raise LeaseLostError(source_id)

    async def _record(
        self,
        db: Session,
        user_id: UUID,
        source_id: UUID,
        ok: bool,
        cursor: str | None = None,
        error: str | None = None,
    ) -> None:
        await self._db(self._store.update_source_cursor, db, user_id, source_id, cursor, ok, error)

    @staticmethod
    def _log_file(
        user_id: UUID, source_id: UUID, meta: FileMeta, result: IngestResult, fetch_ms: int, ingest_ms: int
    ) -> None:
        """One line per downloaded file: how many chunks it has, how many were
        embedded vs reused, and where the time went. since_edit_s = how long
        after the file's last edit it became searchable."""
        since_edit = (
            int((datetime.now(timezone.utc) - meta.modified_at).total_seconds())
            if meta.modified_at is not None and result.status in ("created", "updated")
            else None
        )
        logger.log(
            logging.WARNING if result.status == "failed" else logging.INFO,
            "knowledge file synced user_id=%s source_id=%s external_id=%s status=%s chunks=%d embedded=%d "
            "kept=%d deleted=%d fetch_ms=%d ingest_ms=%d since_edit_s=%s reason=%s",
            user_id,
            source_id,
            meta.external_id,
            result.status,
            result.embedded + result.kept,
            result.embedded,
            result.kept,
            result.deleted,
            fetch_ms,
            ingest_ms,
            since_edit,
            result.reason,
        )

    @staticmethod
    def _log(user_id: UUID, r: SyncReport) -> None:
        logger.log(
            logging.INFO
            if r.outcome in ("ok", "already_running", "nothing_selected", "paused")
            else logging.WARNING,
            "knowledge sync user_id=%s source_id=%s outcome=%s mode=%s seen=%d ingested=%d unchanged=%d "
            "failed=%d deleted=%d embedded=%d chunks_kept=%d over_cap=%d cursor_saved=%s plan_ms=%d "
            "duration_ms=%d first_success=%s since_connect_ms=%s error=%s",
            user_id,
            r.source_id,
            r.outcome,
            r.mode,
            r.files_seen,
            r.ingested,
            r.unchanged,
            r.failed,
            r.deleted,
            r.embedded,
            r.chunks_kept,
            r.skipped_over_cap,
            r.cursor_saved,
            r.plan_ms,
            r.duration_ms,
            r.first_success,
            r.since_connect_ms,
            r.error,
        )


def _ms_since(start: float) -> int:
    return int((time.monotonic() - start) * 1000)


def default_sync_service() -> SyncService:
    from backend.knowledge.connectors import gdrive  # noqa: F401  (registers the provider)
    from backend.knowledge.embedder import GeminiEmbedder
    from backend.knowledge.repository import KnowledgeRepository

    return SyncService(
        KnowledgeRepository, ConnectorFactory, IngestionPipeline(KnowledgeRepository, GeminiEmbedder())
    )


async def run_sync_in_background(user_id: UUID, source_id: UUID) -> None:
    """FastAPI background task: its own session, since the request's closed
    when the 202 went out."""
    from backend.core.database import SessionLocal

    with SessionLocal() as db:
        await default_sync_service().sync_source(db, user_id, source_id)
