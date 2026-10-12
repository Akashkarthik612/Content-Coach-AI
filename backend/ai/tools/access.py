"""What an agent is handed to use the knowledge layer: the retrieval service
and the shared loop, built once at startup (main.py). An agent passes None
around instead when KNOWLEDGE_TOOLS_ENABLED is off and makes one structured
call, as before Day 7."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import TypeVar

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AnyMessage
from pydantic import BaseModel

from backend.ai.tools.context import ToolContext
from backend.ai.tools.knowledge_tools import build_knowledge_tools
from backend.ai.tools.records import SourceRef, ToolLoopResult
from backend.ai.tools.tool_loop import ToolCallingRunner
from backend.knowledge.retrieval import KnowledgeRetrievalService

T = TypeVar("T", bound=BaseModel)


@dataclass(frozen=True)
class KnowledgeAccess:
    service: KnowledgeRetrievalService
    runner: ToolCallingRunner

    async def write(
        self, llm: BaseChatModel, messages: Sequence[AnyMessage], output_schema: type[T], ctx: ToolContext
    ) -> ToolLoopResult[T]:
        """One agent turn with the four knowledge tools bound for ctx's user."""
        return await self.runner.run(llm, messages, build_knowledge_tools(ctx, self.service), output_schema, ctx)


def sources_json(sources: Sequence[SourceRef]) -> list[dict]:
    """Sources as plain JSON, for the checkpoint and the API."""
    return [{"document_id": str(s.document_id), "title": s.title, "url": s.url} for s in sources]
