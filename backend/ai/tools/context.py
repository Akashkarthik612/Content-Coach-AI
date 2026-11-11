"""Who a tool call runs for. Built by the server for each request and bound
into the tools by closure, so a model can never choose whose data it reads."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from backend.knowledge.permissions import WorkspaceKnowledgeScope


@dataclass(frozen=True)
class ToolContext:
    user_id: UUID
    agent: str  # "linkedin" | "reddit" | "x" | "custom" (later: the supervisor's workers)
    correlation_id: str  # thread id, or a per-request uuid for stateless agents
    knowledge_scope: WorkspaceKnowledgeScope | None = None
    enabled_tools: tuple[str, ...] | None = None
    on_tool: Callable[[dict[str, Any]], Awaitable[None]] | None = None
    on_usage: Callable[[dict[str, Any]], Awaitable[None]] | None = None
