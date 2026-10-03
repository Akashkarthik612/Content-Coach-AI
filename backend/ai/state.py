import operator
from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

from backend.ai.schemas import (
    ConversationStage,
    DraftPost,
    SuggestionItem,
    UserProfileSnapshot,
)


class AgentState(TypedDict):
    """The supervisor's full working memory for one thread. One flat schema —
    no sub-graph state, no per-worker TypedDicts (CLAUDE.md: 'no subgraphs for
    workers — supervisor needs full AgentState visibility').

    Every field but `messages` and `step_count` uses LangGraph's default
    reducer (whole-value overwrite): each turn's return value from the
    supervisor fully replaces the field. This is what CLAUDE.md's 'state
    hygiene' rule requires — no past draft/suggestion list is ever appended
    to or replayed.
    """

    # Identity — who this conversation belongs to (DB ownership checks in
    # tools). NOT thread_id: that's run config, not agent-reasoning state.
    user_id: str

    # Full transcript backing the ReAct loop; add_messages appends new
    # messages and dedupes by id instead of overwriting.
    messages: Annotated[list[AnyMessage], add_messages]

    # Which of the 5 conversation stages the UI should render (CLAUDE.md §3).
    stage: ConversationStage

    # Injected fresh by the FastAPI route on every invoke — overwritten each
    # turn, so a mid-conversation profile edit is never stale.
    user_profile: UserProfileSnapshot | None

    # Current set of options from researcher/angles/series — overwritten
    # wholesale on each new suggestion round, never accumulated.
    current_suggestions: list[SuggestionItem] | None

    # Which suggestion the user committed to (decision stage onward).
    selected_suggestion: SuggestionItem | None

    # Writer's latest output. Overwritten per redraft — no version list
    # (CLAUDE.md: "keep only the current draft as an overwritten field").
    current_draft: DraftPost | None

    # Surfaces a Layer-1 (bad tool args) or Layer-2 (bad sub-agent output,
    # retry budget exhausted) failure back into supervisor context; cleared
    # (set to None) on the next successful tool call.
    last_tool_error: str | None

    # Observability only — LangGraph's own `recursion_limit` (graph.invoke
    # config) is what actually bounds the loop; this is just a counter to
    # log/inspect, so it accumulates instead of overwriting.
    step_count: Annotated[int, operator.add]
