"""Who a tool call runs for. Built by the server for each request and bound
into the tools by closure, so a model can never choose whose data it reads."""

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class ToolContext:
    user_id: UUID
    agent: str  # "linkedin" | "reddit" | "x" (later: the supervisor's workers)
    correlation_id: str  # thread id, or a per-request uuid for stateless agents
