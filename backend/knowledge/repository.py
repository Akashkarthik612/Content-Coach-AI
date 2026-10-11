"""Persistence for the knowledge store. No hashing, chunking, embedding or
provider logic lives here.

Tenant rule (Dust's two guards): every method takes `user_id` right after the
session and every statement filters on it. Another user's source or document
is simply not found. The one exception is `list_due_sources`, the poller's
scan: it returns IDs only, and each run it starts is scoped again.

Each write method is one transaction: it commits on success, and on failure
rolls back, logs one line with user_id/source_id/external_id and re-raises.
"""

import logging
import math
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy import case, delete, func, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.knowledge import search_mode
from backend.knowledge.errors import InvalidVectorError, SourceNotFoundError, StaleDiffError
from backend.knowledge.models import (
    KnowledgeChunk,
    KnowledgeDocument,
    KnowledgeSource,
    KnowledgeSourceCredential,
)
from backend.knowledge.records import (
    ChunkDiff,
    ChunkHit,
    DocumentMeta,
    DocumentRecord,
    DueSource,
    EncryptedCredential,
    NewChunk,
    SourceRecord,
    StoredChunkRef,
)

logger = logging.getLogger(__name__)

MAX_SEARCH_K = 50

_S = KnowledgeSource.__table__
_D = KnowledgeDocument.__table__
_C = KnowledgeChunk.__table__
_K = KnowledgeSourceCredential.__table__

_SOURCE_COLS = (
    _S.c.id,
    _S.c.user_id,
    _S.c.provider,
    _S.c.account_ref,
    _S.c.display_name,
    _S.c.config,
    _S.c.cursor,
    _S.c.status,
    _S.c.last_success_at,
    _S.c.last_error,
    _S.c.created_at,
    _S.c.last_run_at,
    _S.c.sync_lease_until,
)
_DOCUMENT_COLS = (
    _D.c.id,
    _D.c.user_id,
    _D.c.source_id,
    _D.c.external_id,
    _D.c.title,
    _D.c.mime_type,
    _D.c.source_url,
    _D.c.source_modified_at,
    _D.c.content_hash,
    _D.c.chunk_count,
    _D.c.sync_status,
    _D.c.updated_at,
    _D.c.last_error,
)


def _source(row: Any) -> SourceRecord:
    return SourceRecord(**row)


def _document(row: Any) -> DocumentRecord:
    return DocumentRecord(**row)


def validate_vector(vector: Sequence[float]) -> None:
    """Fail fast, before any SQL: right size, finite, not all zeros (cosine
    distance to a zero vector is NaN)."""
    if len(vector) != settings.EMBEDDING_DIM:
        raise InvalidVectorError(f"expected {settings.EMBEDDING_DIM} dimensions, got {len(vector)}")
    if not all(math.isfinite(x) for x in vector):
        raise InvalidVectorError("vector contains NaN or infinity")
    if not any(vector):
        raise InvalidVectorError("zero vector has no direction")


def _is_source_fk_violation(exc: Exception) -> bool:
    if not isinstance(exc, IntegrityError):
        return False
    return (
        getattr(getattr(exc.orig, "diag", None), "constraint_name", None) == "fk_knowledge_documents_source"
    )


@contextmanager
def _transaction(
    db: Session, op: str, user_id: UUID, source_id: UUID | None = None, external_id: str | None = None
) -> Iterator[None]:
    try:
        yield
        db.commit()  # deferred constraints are checked here, so it stays inside the try
    except Exception as exc:
        db.rollback()
        expected = isinstance(exc, (StaleDiffError, SourceNotFoundError)) or _is_source_fk_violation(exc)
        logger.log(
            logging.WARNING if expected else logging.ERROR,
            "knowledge %s failed user_id=%s source_id=%s external_id=%s error=%r",
            op,
            user_id,
            source_id,
            external_id,
            exc,
        )
        if _is_source_fk_violation(exc):
            raise SourceNotFoundError(source_id) from exc
        raise


class KnowledgeStore(Protocol):
    """What the ingestion pipeline (Build 2) and the retriever depend on, so
    tests can hand them a fake."""

    def create_source(
        self, db: Session, user_id: UUID, provider: str, account_ref: str, display_name: str, config: dict
    ) -> SourceRecord: ...

    def get_source(self, db: Session, user_id: UUID, source_id: UUID) -> SourceRecord | None: ...

    def list_sources(self, db: Session, user_id: UUID) -> list[SourceRecord]: ...

    def update_source_config(
        self, db: Session, user_id: UUID, source_id: UUID, display_name: str, config: dict
    ) -> SourceRecord: ...

    def update_source_cursor(
        self,
        db: Session,
        user_id: UUID,
        source_id: UUID,
        cursor: str | None,
        ok: bool,
        error: str | None = None,
    ) -> None: ...

    def delete_source(self, db: Session, user_id: UUID, source_id: UUID) -> bool: ...

    def get_document(
        self, db: Session, user_id: UUID, source_id: UUID, external_id: str
    ) -> DocumentRecord | None: ...

    def list_document_external_ids(self, db: Session, user_id: UUID, source_id: UUID) -> set[str]: ...

    def list_documents(self, db: Session, user_id: UUID) -> list[DocumentRecord]: ...

    def list_chunk_refs(self, db: Session, user_id: UUID, document_id: UUID) -> list[StoredChunkRef]: ...

    def apply_document_version(
        self,
        db: Session,
        user_id: UUID,
        source_id: UUID,
        meta: DocumentMeta,
        content_hash: str,
        diff: ChunkDiff,
        base_content_hash: str | None,
    ) -> DocumentRecord: ...

    def mark_failed(
        self, db: Session, user_id: UUID, source_id: UUID, external_id: str, error: str
    ) -> bool: ...

    def delete_document(self, db: Session, user_id: UUID, source_id: UUID, external_id: str) -> bool: ...

    def search(
        self,
        db: Session,
        user_id: UUID,
        query_vector: Sequence[float],
        k: int,
        source_ids: Sequence[UUID] | None = None,
    ) -> list[ChunkHit]: ...

    def save_credentials(
        self,
        db: Session,
        user_id: UUID,
        source_id: UUID,
        refresh_token_enc: bytes,
        access_token_enc: bytes | None,
        access_token_expires_at: datetime | None,
        scope: str,
    ) -> None: ...

    def get_credentials(self, db: Session, user_id: UUID, source_id: UUID) -> EncryptedCredential | None: ...

    def update_access_token(
        self,
        db: Session,
        user_id: UUID,
        source_id: UUID,
        access_token_enc: bytes,
        access_token_expires_at: datetime,
    ) -> None: ...

    def acquire_sync_lease(
        self, db: Session, user_id: UUID, source_id: UUID, run_id: UUID, seconds: int
    ) -> bool: ...

    def renew_sync_lease(
        self, db: Session, user_id: UUID, source_id: UUID, run_id: UUID, seconds: int
    ) -> bool: ...

    def release_sync_lease(self, db: Session, user_id: UUID, source_id: UUID, run_id: UUID) -> None: ...

    def mark_needs_reauth(self, db: Session, user_id: UUID, source_id: UUID, error: str) -> None: ...

    def list_due_sources(self, db: Session, interval_seconds: int, limit: int) -> list[DueSource]: ...


# ── apply_document_version steps (module-level so a test can make one fail) ──


def _delete_chunks(db: Session, user_id: UUID, document_id: UUID, ids: list[UUID]) -> None:
    if not ids:
        return
    deleted = db.execute(
        delete(_C).where(_C.c.document_id == document_id, _C.c.user_id == user_id, _C.c.id.in_(ids))
    ).rowcount
    if deleted != len(set(ids)):
        raise StaleDiffError(f"expected to delete {len(set(ids))} chunks, deleted {deleted}")


def _reorder_chunks(db: Session, user_id: UUID, document_id: UUID, reorder: dict[UUID, int]) -> None:
    if not reorder:
        return
    moved = db.execute(
        update(_C)
        .where(_C.c.document_id == document_id, _C.c.user_id == user_id, _C.c.id.in_(list(reorder)))
        .values(ordinal=case(reorder, value=_C.c.id))
    ).rowcount
    if moved != len(reorder):
        raise StaleDiffError(f"expected to reorder {len(reorder)} chunks, moved {moved}")


def _insert_chunks(
    db: Session, user_id: UUID, source_id: UUID, document_id: UUID, chunks: list[NewChunk]
) -> None:
    if not chunks:
        return
    db.execute(
        _C.insert(),
        [
            {
                "document_id": document_id,
                "user_id": user_id,
                "source_id": source_id,
                "ordinal": c.ordinal,
                "heading": c.heading,
                "content": c.content,
                "chunk_hash": c.chunk_hash,
                "token_count": c.token_count,
                "embedding": list(c.embedding),
                "embedding_model": c.embedding_model,
            }
            for c in chunks
        ],
    )


class KnowledgeRepository:
    # ── sources ───────────────────────────────────────────────────────────────

    @staticmethod
    def create_source(
        db: Session, user_id: UUID, provider: str, account_ref: str, display_name: str, config: dict
    ) -> SourceRecord:
        """Idempotent: connecting the same account twice returns the existing
        row unchanged (use update_source_config to change it)."""
        with _transaction(db, "create_source", user_id):
            row = (
                db.execute(
                    pg_insert(_S)
                    .values(
                        user_id=user_id,
                        provider=provider,
                        account_ref=account_ref,
                        display_name=display_name,
                        config=config,
                    )
                    .on_conflict_do_nothing(constraint="uq_knowledge_sources_user_provider_account")
                    .returning(*_SOURCE_COLS)
                )
                .mappings()
                .one_or_none()
            )
            if row is None:
                row = (
                    db.execute(
                        select(*_SOURCE_COLS).where(
                            _S.c.user_id == user_id,
                            _S.c.provider == provider,
                            _S.c.account_ref == account_ref,
                        )
                    )
                    .mappings()
                    .one()
                )
        return _source(row)

    @staticmethod
    def get_source(db: Session, user_id: UUID, source_id: UUID) -> SourceRecord | None:
        row = (
            db.execute(select(*_SOURCE_COLS).where(_S.c.id == source_id, _S.c.user_id == user_id))
            .mappings()
            .one_or_none()
        )
        return _source(row) if row else None

    @staticmethod
    def list_sources(db: Session, user_id: UUID) -> list[SourceRecord]:
        rows = db.execute(
            select(*_SOURCE_COLS).where(_S.c.user_id == user_id).order_by(_S.c.created_at)
        ).mappings()
        return [_source(r) for r in rows]

    @staticmethod
    def update_source_config(
        db: Session, user_id: UUID, source_id: UUID, display_name: str, config: dict
    ) -> SourceRecord:
        """New folder selection. Clears the cursor so the next sync does a full
        listing (and garbage-collects files no longer selected)."""
        with _transaction(db, "update_source_config", user_id, source_id):
            row = (
                db.execute(
                    update(_S)
                    .where(_S.c.id == source_id, _S.c.user_id == user_id)
                    .values(display_name=display_name, config=config, cursor=None, updated_at=func.now())
                    .returning(*_SOURCE_COLS)
                )
                .mappings()
                .one_or_none()
            )
            if row is None:
                raise SourceNotFoundError(source_id)
        return _source(row)

    @staticmethod
    def update_source_cursor(
        db: Session, user_id: UUID, source_id: UUID, cursor: str | None, ok: bool, error: str | None = None
    ) -> None:
        """Record a sync run. Only a successful run moves the cursor; a failed
        one keeps it so the same changes are retried. A paused source stays
        paused either way; a needs_reauth one only recovers on success."""
        values: dict[str, Any] = {"last_run_at": func.now(), "updated_at": func.now()}
        if ok:
            values |= {
                "cursor": cursor,
                "last_success_at": func.now(),
                "last_error": None,
                "status": case((_S.c.status == "paused", "paused"), else_="active"),
            }
        else:
            values |= {
                "last_error": error,
                "status": case((_S.c.status.in_(("paused", "needs_reauth")), _S.c.status), else_="error"),
            }
        with _transaction(db, "update_source_cursor", user_id, source_id):
            updated = db.execute(
                update(_S).where(_S.c.id == source_id, _S.c.user_id == user_id).values(**values)
            ).rowcount
            if updated == 0:
                raise SourceNotFoundError(source_id)

    @staticmethod
    def mark_needs_reauth(db: Session, user_id: UUID, source_id: UUID, error: str) -> None:
        """Google revoked access: record the run and stop polling the source
        until the user reconnects (save_credentials sets it back to active).
        The cursor is kept, so a reconnect resumes where the last run stopped."""
        with _transaction(db, "mark_needs_reauth", user_id, source_id):
            updated = db.execute(
                update(_S)
                .where(_S.c.id == source_id, _S.c.user_id == user_id)
                .values(
                    status=case((_S.c.status == "paused", "paused"), else_="needs_reauth"),
                    last_error=error,
                    last_run_at=func.now(),
                    updated_at=func.now(),
                )
            ).rowcount
            if updated == 0:
                raise SourceNotFoundError(source_id)

    @staticmethod
    def list_due_sources(db: Session, interval_seconds: int, limit: int) -> list[DueSource]:
        """The poller's scan, and the ONLY query here without a user_id: it
        looks across every user to find what to sync, so it returns IDs only
        (no content, config or tokens). Each run is then scoped by
        sync_source(user_id, source_id).

        Due = syncable status, something selected (a source with nothing
        selected never records a run, so it would sort first every tick), not
        run within the interval, lease free. Never-run first, then oldest.
        Times come from the database's now(), like the lease."""
        rows = db.execute(
            text(
                """
                SELECT user_id, id
                  FROM knowledge_sources
                 WHERE status IN ('active', 'error')
                   AND (config @? '$.folder_ids[0]' OR config @? '$.file_ids[0]')
                   AND (last_run_at IS NULL OR last_run_at < now() - make_interval(secs => :interval))
                   AND (sync_lease_until IS NULL OR sync_lease_until < now())
                 ORDER BY last_run_at NULLS FIRST, id
                 LIMIT :limit
                """
            ),
            {"interval": interval_seconds, "limit": limit},
        ).all()
        return [DueSource(user_id=r.user_id, source_id=r.id) for r in rows]

    @staticmethod
    def delete_source(db: Session, user_id: UUID, source_id: UUID) -> bool:
        """Documents and chunks cascade. False if there was nothing to delete."""
        with _transaction(db, "delete_source", user_id, source_id):
            deleted = db.execute(delete(_S).where(_S.c.id == source_id, _S.c.user_id == user_id)).rowcount
        return deleted > 0

    # ── documents ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_document(db: Session, user_id: UUID, source_id: UUID, external_id: str) -> DocumentRecord | None:
        row = (
            db.execute(
                select(*_DOCUMENT_COLS).where(
                    _D.c.user_id == user_id, _D.c.source_id == source_id, _D.c.external_id == external_id
                )
            )
            .mappings()
            .one_or_none()
        )
        return _document(row) if row else None

    @staticmethod
    def list_documents(db: Session, user_id: UUID) -> list[DocumentRecord]:
        """Every document of every source the user has, for the knowledge page.
        Metadata only: no chunk text, no vectors."""
        rows = db.execute(
            select(*_DOCUMENT_COLS).where(_D.c.user_id == user_id).order_by(_D.c.title, _D.c.id)
        ).mappings()
        return [_document(r) for r in rows]

    @staticmethod
    def list_document_external_ids(db: Session, user_id: UUID, source_id: UUID) -> set[str]:
        """For garbage collection after a full listing: stored ids that the
        listing no longer contains are deleted by the caller."""
        return set(
            db.scalars(select(_D.c.external_id).where(_D.c.user_id == user_id, _D.c.source_id == source_id))
        )

    @staticmethod
    def list_chunk_refs(db: Session, user_id: UUID, document_id: UUID) -> list[StoredChunkRef]:
        """(id, hash, ordinal) for the diff. Never loads embeddings (3 KB each)."""
        rows = db.execute(
            select(_C.c.id, _C.c.chunk_hash, _C.c.ordinal)
            .where(_C.c.user_id == user_id, _C.c.document_id == document_id)
            .order_by(_C.c.ordinal)
        ).mappings()
        return [StoredChunkRef(**r) for r in rows]

    @staticmethod
    def apply_document_version(
        db: Session,
        user_id: UUID,
        source_id: UUID,
        meta: DocumentMeta,
        content_hash: str,
        diff: ChunkDiff,
        base_content_hash: str | None,
    ) -> DocumentRecord:
        """Write one document version in one transaction: upsert the document,
        delete, insert and reorder chunks, then set chunk_count.

        `base_content_hash` is the stored hash the diff was computed against
        (None for a new document). Under the row lock it must still match,
        otherwise another sync applied first and StaleDiffError is raised with
        nothing written."""
        for chunk in diff.to_insert:
            validate_vector(chunk.embedding)

        with _transaction(db, "apply_document_version", user_id, source_id, meta.external_id):
            # KEY SHARE on the source: it can't be deleted until this commits.
            source_ok = db.execute(
                select(_S.c.id)
                .where(_S.c.id == source_id, _S.c.user_id == user_id)
                .with_for_update(read=True, key_share=True)
            ).one_or_none()
            if source_ok is None:
                raise SourceNotFoundError(source_id)

            current = db.execute(
                select(_D.c.id, _D.c.content_hash)
                .where(
                    _D.c.user_id == user_id, _D.c.source_id == source_id, _D.c.external_id == meta.external_id
                )
                .with_for_update()
            ).one_or_none()
            stored_hash = current.content_hash if current else None
            if stored_hash != base_content_hash:
                raise StaleDiffError(f"stored hash {stored_hash!r} != base {base_content_hash!r}")

            fields = {
                "title": meta.title,
                "mime_type": meta.mime_type,
                "source_url": meta.source_url,
                "source_modified_at": meta.source_modified_at,
                "content_hash": content_hash,
                "sync_status": "synced",
                "last_error": None,
            }
            if current is None:
                document_id = db.execute(
                    pg_insert(_D)
                    .values(user_id=user_id, source_id=source_id, external_id=meta.external_id, **fields)
                    .on_conflict_do_nothing(constraint="uq_knowledge_documents_source_ext")
                    .returning(_D.c.id)
                ).scalar_one_or_none()
                if document_id is None:  # a concurrent sync inserted it first
                    raise StaleDiffError("document was created concurrently")
            else:
                document_id = current.id
                db.execute(update(_D).where(_D.c.id == document_id).values(**fields, updated_at=func.now()))

            _delete_chunks(db, user_id, document_id, list(diff.to_delete_ids))
            _reorder_chunks(db, user_id, document_id, dict(diff.reorder))
            _insert_chunks(db, user_id, source_id, document_id, list(diff.to_insert))

            count = db.execute(
                select(func.count()).select_from(_C).where(_C.c.document_id == document_id)
            ).scalar_one()
            row = (
                db.execute(
                    update(_D)
                    .where(_D.c.id == document_id)
                    .values(chunk_count=count)
                    .returning(*_DOCUMENT_COLS)
                )
                .mappings()
                .one()
            )
        return _document(row)

    @staticmethod
    def mark_failed(db: Session, user_id: UUID, source_id: UUID, external_id: str, error: str) -> bool:
        """Flag a document whose new version couldn't be ingested. Its old
        chunks stay searchable. False if the document was never stored."""
        with _transaction(db, "mark_failed", user_id, source_id, external_id):
            updated = db.execute(
                update(_D)
                .where(_D.c.user_id == user_id, _D.c.source_id == source_id, _D.c.external_id == external_id)
                .values(sync_status="failed", last_error=error, updated_at=func.now())
            ).rowcount
        return updated > 0

    @staticmethod
    def delete_document(db: Session, user_id: UUID, source_id: UUID, external_id: str) -> bool:
        """Chunks cascade. False if there was nothing to delete."""
        with _transaction(db, "delete_document", user_id, source_id, external_id):
            deleted = db.execute(
                delete(_D).where(
                    _D.c.user_id == user_id, _D.c.source_id == source_id, _D.c.external_id == external_id
                )
            ).rowcount
        return deleted > 0

    @staticmethod
    def exclude_document(db: Session, user_id: UUID, document_id: UUID) -> bool:
        """The user removed one document: delete it (chunks cascade) and add its
        external id to the source's `config.excluded_ids` in the same transaction,
        so the next sync doesn't bring it back. The cursor is kept. False if the
        user has no such document."""
        with _transaction(db, "exclude_document", user_id):
            doc = db.execute(
                delete(_D)
                .where(_D.c.id == document_id, _D.c.user_id == user_id)
                .returning(_D.c.source_id, _D.c.external_id)
            ).one_or_none()
            if doc is None:
                return False
            config = db.execute(
                select(_S.c.config).where(_S.c.id == doc.source_id, _S.c.user_id == user_id).with_for_update()
            ).scalar_one()
            excluded = list(dict.fromkeys([*config.get("excluded_ids", []), doc.external_id]))
            db.execute(
                update(_S)
                .where(_S.c.id == doc.source_id, _S.c.user_id == user_id)
                .values(config={**config, "excluded_ids": excluded}, updated_at=func.now())
            )
        return True

    # ── search ────────────────────────────────────────────────────────────────

    @staticmethod
    def search(
        db: Session,
        user_id: UUID,
        query_vector: Sequence[float],
        k: int,
        source_ids: Sequence[UUID] | None = None,
    ) -> list[ChunkHit]:
        """Nearest chunks by cosine distance, only ever from this user's
        sources. source_ids=None searches all of them; an empty list searches
        none. A foreign source id matches nothing. Paused sources and chunks
        embedded with another model are skipped."""
        validate_vector(query_vector)
        if not 1 <= k <= MAX_SEARCH_K:
            raise ValueError(f"k must be between 1 and {MAX_SEARCH_K}, got {k}")
        if source_ids is not None and len(source_ids) == 0:
            return []

        distance = _C.c.embedding.cosine_distance(list(query_vector))
        filters = [
            _C.c.user_id == user_id,
            _C.c.embedding_model == settings.EMBEDDING_MODEL_TAG,
            _S.c.status != "paused",
        ]
        if source_ids is not None:
            filters.append(_C.c.source_id.in_(list(source_ids)))
        nearest = (
            select(
                _C.c.id,
                _C.c.document_id,
                _C.c.source_id,
                _C.c.heading,
                _C.c.content,
                distance.label("distance"),
            )
            .join(_S, (_S.c.id == _C.c.source_id) & (_S.c.user_id == _C.c.user_id))
            .where(*filters)
            .order_by(distance)
            .limit(k)
            .subquery()
        )
        # Outer sort: relaxed_order may return the inner rows slightly out of order.
        query = (
            select(nearest, _D.c.title, _D.c.source_url)
            .join(_D, _D.c.id == nearest.c.document_id)
            .order_by(nearest.c.distance, nearest.c.id)
        )

        with _transaction(db, "search", user_id):
            mode = search_mode.detect_search_mode(db)
            db.execute(text(search_mode.scan_settings(mode)))
            rows = db.execute(query).mappings().all()
        return [
            ChunkHit(
                chunk_id=r["id"],
                document_id=r["document_id"],
                source_id=r["source_id"],
                title=r["title"],
                source_url=r["source_url"],
                heading=r["heading"],
                content=r["content"],
                distance=float(r["distance"]),
            )
            for r in rows
        ]

    # ── credentials (0026) ─────────────────────────────────────────────────────
    # Ciphertext only: encryption lives in credentials.py, never here.

    @staticmethod
    def save_credentials(
        db: Session,
        user_id: UUID,
        source_id: UUID,
        refresh_token_enc: bytes,
        access_token_enc: bytes | None,
        access_token_expires_at: datetime | None,
        scope: str,
    ) -> None:
        """Upsert: reconnecting the same account replaces its tokens. Also puts
        the source back to active, since a reconnect is how a revoked source
        recovers. A foreign or missing source raises SourceNotFoundError."""
        tokens = {
            "refresh_token_enc": refresh_token_enc,
            "access_token_enc": access_token_enc,
            "access_token_expires_at": access_token_expires_at,
            "scope": scope,
        }
        with _transaction(db, "save_credentials", user_id, source_id):
            reactivated = db.execute(
                update(_S)
                .where(_S.c.id == source_id, _S.c.user_id == user_id)
                .values(
                    status=case((_S.c.status == "paused", "paused"), else_="active"),
                    last_error=None,
                    updated_at=func.now(),
                )
            ).rowcount
            if reactivated == 0:
                raise SourceNotFoundError(source_id)
            db.execute(
                pg_insert(_K)
                .values(source_id=source_id, user_id=user_id, **tokens)
                .on_conflict_do_update(index_elements=[_K.c.source_id], set_={**tokens, "updated_at": func.now()})
            )

    @staticmethod
    def get_credentials(db: Session, user_id: UUID, source_id: UUID) -> EncryptedCredential | None:
        row = (
            db.execute(
                select(
                    _K.c.source_id,
                    _K.c.user_id,
                    _K.c.refresh_token_enc,
                    _K.c.access_token_enc,
                    _K.c.access_token_expires_at,
                    _K.c.scope,
                ).where(_K.c.source_id == source_id, _K.c.user_id == user_id)
            )
            .mappings()
            .one_or_none()
        )
        if row is None:
            return None
        access = row["access_token_enc"]
        return EncryptedCredential(
            source_id=row["source_id"],
            user_id=row["user_id"],
            # psycopg returns BYTEA as memoryview; Fernet wants bytes.
            refresh_token_enc=bytes(row["refresh_token_enc"]),
            access_token_enc=bytes(access) if access is not None else None,
            access_token_expires_at=row["access_token_expires_at"],
            scope=row["scope"],
        )

    @staticmethod
    def update_access_token(
        db: Session,
        user_id: UUID,
        source_id: UUID,
        access_token_enc: bytes,
        access_token_expires_at: datetime,
    ) -> None:
        """Cache a refreshed access token."""
        with _transaction(db, "update_access_token", user_id, source_id):
            updated = db.execute(
                update(_K)
                .where(_K.c.source_id == source_id, _K.c.user_id == user_id)
                .values(
                    access_token_enc=access_token_enc,
                    access_token_expires_at=access_token_expires_at,
                    updated_at=func.now(),
                )
            ).rowcount
            if updated == 0:
                raise SourceNotFoundError(source_id)

    # ── sync lease (0026) ──────────────────────────────────────────────────────
    # One run per source: take the lease only if it is free or expired, and
    # renew or release it only while run_id still owns it (Dust's Redis lock:
    # random owner value + expiry + delete-only-if-owner).

    @staticmethod
    def acquire_sync_lease(db: Session, user_id: UUID, source_id: UUID, run_id: UUID, seconds: int) -> bool:
        with _transaction(db, "acquire_sync_lease", user_id, source_id):
            row = db.execute(
                update(_S)
                .where(
                    _S.c.id == source_id,
                    _S.c.user_id == user_id,
                    (_S.c.sync_lease_until.is_(None)) | (_S.c.sync_lease_until < func.now()),
                )
                .values(sync_lease_until=func.now() + timedelta(seconds=seconds), sync_lease_owner=run_id)
                .returning(_S.c.id)
            ).one_or_none()
        return row is not None

    @staticmethod
    def renew_sync_lease(db: Session, user_id: UUID, source_id: UUID, run_id: UUID, seconds: int) -> bool:
        """False means another run took the lease (ours expired): stop now."""
        with _transaction(db, "renew_sync_lease", user_id, source_id):
            renewed = db.execute(
                update(_S)
                .where(_S.c.id == source_id, _S.c.user_id == user_id, _S.c.sync_lease_owner == run_id)
                .values(sync_lease_until=func.now() + timedelta(seconds=seconds))
            ).rowcount
        return renewed > 0

    @staticmethod
    def release_sync_lease(db: Session, user_id: UUID, source_id: UUID, run_id: UUID) -> None:
        with _transaction(db, "release_sync_lease", user_id, source_id):
            db.execute(
                update(_S)
                .where(_S.c.id == source_id, _S.c.user_id == user_id, _S.c.sync_lease_owner == run_id)
                .values(sync_lease_until=None, sync_lease_owner=None)
            )
