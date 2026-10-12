"""The four knowledge tools, as LangChain tools over KnowledgeRetrievalService.

Adapter + factory: build_knowledge_tools(ctx, service) is all a new agent
needs to get knowledge access. ctx.user_id is bound by closure and never
appears in a tool's arguments (Dust's hideInternalConfiguration), so no
prompt can make a tool read another user's data.

Each tool returns (JSON text for the model, ToolOutcome for the loop).
Expected problems (KnowledgeToolError) become {"error", "message"} results the
model can recover from, logged at WARNING. Anything else propagates and fails
the turn.
"""

import json
import logging
from typing import Any, Literal
from uuid import UUID

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from backend.ai.tools.context import ToolContext
from backend.ai.tools.records import SourceRef, ToolOutcome
from backend.core.config import settings
from backend.knowledge.errors import InvalidToolInputError, KnowledgeToolError
from backend.knowledge.records import DocumentSummary
from backend.knowledge.retrieval import KnowledgeRetrievalService

logger = logging.getLogger(__name__)

SEARCH = "search_knowledge"
FIND = "find_documents"
LIST = "list_documents"
READ = "read_document"

_NO_SOURCES_HINT = "no_sources"  # the user hasn't connected anything yet


class SearchArgs(BaseModel):
    query: str = Field(min_length=1, max_length=500, description="What to look for, in plain words.")


class FindArgs(BaseModel):
    title_query: str = Field(
        min_length=1, max_length=200, description="Part of the document's title, e.g. 'Q3 launch'."
    )
    limit: int = Field(default=settings.KNOWLEDGE_LIST_DEFAULT, ge=1, le=settings.KNOWLEDGE_LIST_MAX)


class ListArgs(BaseModel):
    sort_by: Literal["title", "modified"] = Field(
        default="modified", description="'modified' lists the most recently changed first."
    )
    limit: int = Field(default=settings.KNOWLEDGE_LIST_DEFAULT, ge=1, le=settings.KNOWLEDGE_LIST_MAX)
    cursor: str | None = Field(default=None, description="next_cursor from the previous page, to continue.")


class ReadArgs(BaseModel):
    document_id: str = Field(description="document_id from search_knowledge, find_documents or list_documents.")
    offset: int = Field(default=0, ge=0, description="Character to start at; use next_offset to continue.")
    limit: int = Field(
        default=settings.KNOWLEDGE_READ_MAX_CHARS, ge=1, le=settings.KNOWLEDGE_READ_MAX_CHARS
    )


def build_knowledge_tools(ctx: ToolContext, service: KnowledgeRetrievalService) -> list[StructuredTool]:
    user_id = ctx.user_id

    async def search_knowledge(query: str) -> tuple[str, ToolOutcome]:
        async def work():
            results = await service.search(user_id, query)
            payload = {
                "results": [
                    {
                        "document_id": str(r.document_id),
                        "title": r.title,
                        "url": r.url,
                        "chunks": [{"heading": c.heading, "text": c.text} for c in r.chunks],
                    }
                    for r in results
                ]
            }
            sources = tuple(SourceRef(r.document_id, r.title, r.url) for r in results)
            return payload, sources, sum(len(r.chunks) for r in results)

        return await _run(SEARCH, ctx, service, work, query_chars=len(query))

    async def find_documents(title_query: str, limit: int = settings.KNOWLEDGE_LIST_DEFAULT):
        async def work():
            docs = await service.find(user_id, title_query, limit)
            return {"documents": [_summary(d) for d in docs]}, (), len(docs)

        return await _run(FIND, ctx, service, work, query_chars=len(title_query))

    async def list_documents(
        sort_by: Literal["title", "modified"] = "modified",
        limit: int = settings.KNOWLEDGE_LIST_DEFAULT,
        cursor: str | None = None,
    ):
        async def work():
            page = await service.list_documents(user_id, sort_by, limit, cursor)
            payload = {"documents": [_summary(d) for d in page.items], "next_cursor": page.next_cursor}
            return payload, (), len(page.items)

        return await _run(LIST, ctx, service, work)

    async def read_document(
        document_id: str, offset: int = 0, limit: int = settings.KNOWLEDGE_READ_MAX_CHARS
    ):
        async def work():
            page = await service.read(user_id, _parse_id(document_id), offset, limit)
            payload = {
                "document_id": str(page.document_id),
                "title": page.title,
                "url": page.url,
                "text": page.text,
                "offset": page.offset,
                "total_chars": page.total_chars,
                "next_offset": page.next_offset,
            }
            return payload, (SourceRef(page.document_id, page.title, page.url),), 1

        return await _run(READ, ctx, service, work)

    return [
        StructuredTool.from_function(
            coroutine=search_knowledge,
            name=SEARCH,
            description=(
                "Search the user's documents by meaning. Returns the most relevant passages, grouped by "
                "document. Use it to find facts about a topic when you don't know which document has them."
            ),
            args_schema=SearchArgs,
            response_format="content_and_artifact",
        ),
        StructuredTool.from_function(
            coroutine=find_documents,
            name=FIND,
            description=(
                "Find documents by title when the user names one ('my Q3 launch plan'). Returns ids to pass "
                "to read_document."
            ),
            args_schema=FindArgs,
            response_format="content_and_artifact",
        ),
        StructuredTool.from_function(
            coroutine=list_documents,
            name=LIST,
            description=(
                "List the user's documents, newest first or by title, one page at a time. Use it to see what "
                "exists or what changed recently."
            ),
            args_schema=ListArgs,
            response_format="content_and_artifact",
        ),
        StructuredTool.from_function(
            coroutine=read_document,
            name=READ,
            description=(
                "Read a document's full text, up to "
                f"{settings.KNOWLEDGE_READ_MAX_CHARS} characters per call. If next_offset is not null, call "
                "again with offset=next_offset for more."
            ),
            args_schema=ReadArgs,
            response_format="content_and_artifact",
        ),
    ]


async def _run(
    name: str, ctx: ToolContext, service: KnowledgeRetrievalService, work, query_chars: int | None = None
) -> tuple[str, ToolOutcome]:
    """Run one tool body; turn expected errors into a result; log one line."""
    try:
        payload, sources, count = await work()
    except KnowledgeToolError as exc:
        _log(logging.WARNING, name, ctx, 0, exc.code, query_chars)
        return json.dumps({"error": exc.code, "message": exc.message}), ToolOutcome(error_code=exc.code)

    if count == 0 and not await service.has_sources(ctx.user_id):
        payload["hint"] = _NO_SOURCES_HINT
    _log(logging.INFO, name, ctx, count, None, query_chars)
    return json.dumps(payload, default=str), ToolOutcome(sources=sources, result_count=count)


def _summary(d: DocumentSummary) -> dict[str, Any]:
    return {
        "document_id": str(d.document_id),
        "title": d.title,
        "source": d.source_name,
        "mime_type": d.mime_type,
        "modified_at": d.modified_at.isoformat() if d.modified_at else None,
        "url": d.url,
    }


def _parse_id(raw: str) -> UUID:
    try:
        return UUID(raw)
    except ValueError as exc:
        raise InvalidToolInputError(f"{raw!r} is not a document_id") from exc


def _log(level: int, tool: str, ctx: ToolContext, count: int, error: str | None, query_chars: int | None):
    # Never the query or document text: only its length.
    fields = {
        "tool": tool,
        "user_id": ctx.user_id,
        "agent": ctx.agent,
        "correlation_id": ctx.correlation_id,
        "result_count": count,
        "error_code": error,
        "query_chars": query_chars,
    }
    logger.log(level, "knowledge.tool %s", " ".join(f"{k}={v}" for k, v in fields.items()), extra=fields)
