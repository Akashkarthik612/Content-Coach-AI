"""One document version in: normalize -> sections -> hash check -> split ->
diff against stored chunks -> embed only the new chunks -> apply in one
transaction (Day_5.md §B4).

Re-ingesting unchanged text embeds nothing. An edit embeds only the chunks
whose text changed, because the chunk prefix holds the title and headings
but no dates (Improvement 1), and unchanged rows are kept, not re-inserted
(Improvement 2).

The repository is synchronous, so its calls (and the CPU-bound splitter) run
in a worker thread to keep the event loop free.
"""

import asyncio
import logging
from uuid import UUID

from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.knowledge.diff import build_diff
from backend.knowledge.embedder import Embedder
from backend.knowledge.errors import PermanentFileError
from backend.knowledge.records import (
    ChunkDiff,
    DocumentRecord,
    FetchedDocument,
    IngestResult,
    NewChunk,
    Section,
)
from backend.knowledge.repository import KnowledgeStore
from backend.knowledge.sections import markdown_to_section, plain_to_section, render_document, section_text
from backend.knowledge.splitter import Tokenizer, split
from backend.knowledge.text import content_hash, normalize

logger = logging.getLogger(__name__)


class IngestionPipeline:
    def __init__(self, store: KnowledgeStore, embedder: Embedder, tokenizer: Tokenizer | None = None) -> None:
        self._store = store
        self._embedder = embedder
        self._tokenizer = tokenizer

    async def ingest(self, db: Session, user_id: UUID, source_id: UUID, doc: FetchedDocument) -> IngestResult:
        """Transient errors (EmbeddingUnavailableError, StaleDiffError) are
        raised with nothing written; the caller stops the run. A permanent
        problem with this file marks it failed and returns status 'failed'."""
        meta = doc.meta.to_document_meta()
        try:
            root = self._render(doc)
        except PermanentFileError as exc:
            return await self.fail(db, user_id, source_id, meta.external_id, str(exc))
        new_hash = content_hash(section_text(root))

        stored = await asyncio.to_thread(self._store.get_document, db, user_id, source_id, meta.external_id)
        if stored is not None and stored.content_hash == new_hash:
            await self._touch_metadata(db, user_id, source_id, meta, stored)
            return IngestResult(status="unchanged", kept=stored.chunk_count)

        try:
            chunks = await asyncio.to_thread(split, root, settings.CHUNK_MAX_TOKENS, self._tokenizer)
            if not chunks:
                raise PermanentFileError("no extractable text")
            refs = (
                await asyncio.to_thread(self._store.list_chunk_refs, db, user_id, stored.id) if stored else []
            )
            plan = build_diff(refs, chunks)
            vectors = (
                await self._embedder.embed_documents(meta.title, [c.text for c in plan.insert])
                if plan.insert
                else []
            )
        except PermanentFileError as exc:
            return await self.fail(db, user_id, source_id, meta.external_id, str(exc))

        diff = ChunkDiff(
            to_insert=[
                NewChunk(
                    ordinal=c.ordinal,
                    heading=c.heading,
                    content=c.text,
                    chunk_hash=c.chunk_hash,
                    token_count=c.token_count,
                    embedding=v,
                    embedding_model=self._embedder.model_tag,
                )
                for c, v in zip(plan.insert, vectors, strict=True)
            ],
            to_delete_ids=list(plan.delete),
            reorder=dict(plan.reorder),
        )
        await asyncio.to_thread(
            self._store.apply_document_version,
            db,
            user_id,
            source_id,
            meta,
            new_hash,
            diff,
            stored.content_hash if stored else None,
        )
        return IngestResult(
            status="updated" if stored else "created",
            embedded=len(plan.insert),
            kept=len(plan.keep),
            deleted=len(plan.delete),
        )

    async def fail(
        self, db: Session, user_id: UUID, source_id: UUID, external_id: str, reason: str
    ) -> IngestResult:
        """Permanent per-file failure: flag it (old chunks stay searchable), log
        one line, and let the run continue."""
        logger.warning(
            "knowledge ingest failed user_id=%s source_id=%s external_id=%s reason=%s",
            user_id,
            source_id,
            external_id,
            reason,
        )
        await asyncio.to_thread(self._store.mark_failed, db, user_id, source_id, external_id, reason)
        return IngestResult(status="failed", reason=reason)

    @staticmethod
    def _render(doc: FetchedDocument) -> Section:
        text = normalize(doc.text)
        if not text.strip():
            raise PermanentFileError("no extractable text")
        if len(text) > settings.MAX_DOCUMENT_CHARS:
            raise PermanentFileError(f"document over {settings.MAX_DOCUMENT_CHARS} characters")
        body = markdown_to_section(text) if doc.kind == "markdown" else plain_to_section(text)
        return render_document(doc.meta.title, body)

    async def _touch_metadata(
        self, db: Session, user_id: UUID, source_id: UUID, meta, stored: DocumentRecord
    ) -> None:
        """Same text, but the provider's metadata moved on (a comment bumps a
        Doc's modifiedTime) or the last attempt failed. Record it with an empty
        diff, otherwise every later listing would download the file again."""
        if (
            stored.source_modified_at == meta.source_modified_at
            and stored.source_url == meta.source_url
            and stored.mime_type == meta.mime_type
            and stored.sync_status == "synced"
        ):
            return
        await asyncio.to_thread(
            self._store.apply_document_version,
            db,
            user_id,
            source_id,
            meta,
            stored.content_hash,
            ChunkDiff(),
            stored.content_hash,
        )
