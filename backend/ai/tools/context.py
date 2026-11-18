"""Who a tool call runs for. Built by the server for each request and bound
into the tools by closure, so a model can never choose whose data it reads."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
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
    execution_id: str = ""
    agent_version_id: UUID | None = None
    message_id: UUID | None = None
    run_id: UUID | None = None
    revision: int = 0
    workflow_role: str | None = None
    preview: bool = False
    # Request-local evidence, populated by server tools, never by model arguments.
    sources: dict[str, dict] = field(default_factory=dict, compare=False, repr=False)
    artifacts: list[dict] = field(default_factory=list, compare=False, repr=False)
