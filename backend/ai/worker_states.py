"""
Worker state schemas — one TypedDict per specialist worker node.

Each worker receives ONLY the fields it needs via the Send API.
Outputs from each worker are merged back into the global AgentState by LangGraph.

Flow:
  AgentState (orchestrator) ──Send──► StyleRetrieverState ──output: style_json──►
  ──fixed edge──► WriterState (full state, style_json now merged in) ──output: draft──►
  ──fixed edge──► human_approval_node

The orchestrator (supervisor_node) holds AgentState.
Workers hold their own minimal state for the duration of their execution.
"""
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph.message import add_messages


class StyleRetrieverState(TypedDict):
    """
    Minimal input sent to style_retriever_node via Send API.

    The worker only needs to know WHO the user is and WHAT they want to write —
    it fetches the style data itself from Redis/DB.
    """
    user_id: str
    query:   str


class WriterState(TypedDict):
    """
    State available to writer_node (reached via fixed edge, not Send).

    Since writer runs after style_retriever via a fixed edge, it receives the
    FULL merged global state — style_json is already populated by style_retriever.
    All fields here should be present in AgentState.
    """
    user_id:        str
    query:          str
    messages:       Annotated[list[HumanMessage | AIMessage], add_messages]
    style_json:     dict   # populated by style_retriever_node
    research_brief: dict   # populated by researcher_node (empty dict if not run)
    writer_task:    dict   # {action, topic, constraints} — set by router.py
    draft:          str    # previous draft, used only for rewrite action


class ResearcherState(TypedDict):
    """
    State sent to researcher_node via Send API (future — not yet wired).

    When the orchestrator decides research is needed before writing, it sends
    both user context and the already-fetched style_json so researcher can
    tailor its angle suggestions to the user's existing coverage.
    """
    user_id:    str
    query:      str
    style_json: dict   # passed in so researcher can avoid redundant topic angles


class AnalyticsState(TypedDict):
    """
    State available to analytics_node (reached via fixed edge after supervisor
    calls analytics tools through the tool_node loop).

    The tool results are in messages as ToolMessages — analytics_node reads them.
    """
    user_id:  str
    query:    str
    messages: Annotated[list[HumanMessage | AIMessage], add_messages]
