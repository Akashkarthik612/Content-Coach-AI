"""Read-only retrieval over one user's knowledge store, for agent tools.

Framework-agnostic on purpose: no LangChain import, so the LangChain tool
adapter (backend/ai/tools/knowledge_tools.py) and a later MCP server can both
sit on top of it. Every method takes the caller's user_id, which the adapters
bind server-side and never take from a model.

The repository is synchronous. Each call opens its own session in a worker
thread (never the request's session, which isn't thread-safe), and sets a
statement_timeout so a query a timed-out tool call left behind still stops.

Expected problems (blank query, unknown document, offset past the end) raise
KnowledgeToolError subclasses for the adapter to hand back to the model.
Infrastructure failures (DB, embeddings) propagate unchanged.
"""

import asyncio
from collections.abc import Callable
from typing import Literal, TypeVar
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.knowledge.embedder import Embedder
from backend.knowledge.errors import InvalidToolInputError
from backend.knowledge.records import (
    ChunkSnippet,
    DocumentHits,
    DocumentListPage,
    DocumentPage,
    DocumentSummary,
)
from backend.knowledge.repository import KnowledgeStore

SortBy = Literal["title", "modified"]
_SORTS: tuple[str, ...] = ("title", "modified")

T = TypeVar("T")


class KnowledgeRetrievalService:
    def __init__(
        self,
        store: KnowledgeStore,
        embedder: Embedder,
        session_factory: Callable[[], Session],
        statement_timeout_s: float,
    ) -> None:
        self._store = store
        self._embedder = embedder
        self._session_factory = session_factory
        self._statement_timeout_ms = str(int(statement_timeout_s * 1000))

    async def search(self, user_id: UUID, query: str) -> list[DocumentHits]:
        """Top KNOWLEDGE_SEARCH_TOP_K chunks, grouped by document in rank order
        (a document appears where its best chunk ranks)."""
        if not query.strip():
            raise InvalidToolInputError("query is blank")
        vector = await self._embedder.embed_query(query)
        hits = await self._db(self._store.search, user_id, vector, settings.KNOWLEDGE_SEARCH_TOP_K)

        grouped: dict[UUID, list] = {}  # insertion order = rank of each document's best chunk
        for hit in hits:
            grouped.setdefault(hit.document_id, []).append(hit)
        return [
            DocumentHits(
                document_id=document_id,
                title=group[0].title,
                url=group[0].source_url,
                chunks=tuple(ChunkSnippet(heading=h.heading, text=h.content) for h in group),
            )
            for document_id, group in grouped.items()
        ]

    async def find(self, user_id: UUID, title_query: str, limit: int) -> list[DocumentSummary]:
        if not title_query.strip():
            raise InvalidToolInputError("title_query is blank")
        _check_limit(limit, settings.KNOWLEDGE_LIST_MAX)
        return await self._db(self._store.find_documents_by_title, user_id, title_query.strip(), limit)

    async def list_documents(
        self, user_id: UUID, sort_by: SortBy, limit: int, cursor: str | None
    ) -> DocumentListPage:
        if sort_by not in _SORTS:
            raise InvalidToolInputError(f"sort_by must be one of {', '.join(_SORTS)}")
        _check_limit(limit, settings.KNOWLEDGE_LIST_MAX)
        offset = _decode_cursor(cursor, sort_by) if cursor else 0
        items, more = await self._db(self._store.list_documents_page, user_id, sort_by, limit, offset)
        return DocumentListPage(
            items=tuple(items),
            next_cursor=_encode_cursor(sort_by, offset + limit) if more else None,
        )

    async def read(self, user_id: UUID, document_id: UUID, offset: int, limit: int) -> DocumentPage:
        if offset < 0:
            raise InvalidToolInputError("offset must be 0 or more")
        _check_limit(limit, settings.KNOWLEDGE_READ_MAX_CHARS)
        page = await self._db(self._store.get_document_text, user_id, document_id, offset, limit)
        if offset >= page.total_chars:
            raise InvalidToolInputError(
                f"offset {offset} is past the end of the document ({page.total_chars} characters)"
            )
        return page

    async def has_sources(self, user_id: UUID) -> bool:
        return await self._db(self._store.has_sources, user_id)

    async def _db(self, fn: Callable[..., T], user_id: UUID, *args) -> T:
        def work() -> T:
            with self._session_factory() as db:
                # Transaction-local (is_local=true): ends with this call's transaction.
                db.execute(
                    text("SELECT set_config('statement_timeout', :ms, true)"),
                    {"ms": self._statement_timeout_ms},
                )
                return fn(db, user_id, *args)

        return await asyncio.to_thread(work)


def _check_limit(limit: int, maximum: int) -> None:
    if not 1 <= limit <= maximum:
        raise InvalidToolInputError(f"limit must be between 1 and {maximum}")


# The list cursor is opaque to the model: "<sort_by>:<offset>". Carrying the
# sort means a cursor from one order can't silently page through another.


def _encode_cursor(sort_by: str, offset: int) -> str:
    return f"{sort_by}:{offset}"


def _decode_cursor(cursor: str, sort_by: str) -> int:
    sort, _, raw = cursor.partition(":")
    if sort not in _SORTS or not raw.isdigit():
        raise InvalidToolInputError("cursor is not one returned by list_documents")
    if sort != sort_by:
        raise InvalidToolInputError(f"cursor was made for sort_by={sort}, not {sort_by}")
    return int(raw)
