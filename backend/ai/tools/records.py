"""Data passed between tools, the tool-calling loop and the agents. In memory
only: the tools store nothing."""

from dataclasses import dataclass, field
from typing import Generic, TypeVar
from uuid import UUID

T = TypeVar("T")


@dataclass(frozen=True)
class SourceRef:
    """A document a tool showed the model; collected for the response."""

    document_id: UUID | None
    title: str
    url: str | None
    kind: str = "document"
    source_id: str | None = None
    retrieved_at: str | None = None
    excerpt: str | None = None

    @property
    def key(self) -> str:
        return self.source_id or str(self.document_id)


@dataclass(frozen=True)
class ToolOutcome:
    """The artifact every tool returns beside its JSON text (LangChain's
    content_and_artifact), so the loop reads sources and errors without
    knowing any tool's JSON shape."""

    sources: tuple[SourceRef, ...] = ()
    result_count: int = 0
    error_code: str | None = None


@dataclass(frozen=True)
class ToolCallRecord:
    name: str
    ok: bool
    error_code: str | None
    result_count: int


@dataclass(frozen=True)
class ToolLoopResult(Generic[T]):
    output: T
    sources: tuple[SourceRef, ...]  # deduplicated, first-seen order
    calls: tuple[ToolCallRecord, ...] = field(default=())
    rounds: int = 0  # model calls made, including the one that submitted
    forced_submit: bool = False
