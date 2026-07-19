"""
Worker state schemas — one TypedDict per specialist worker node.

Each worker receives ONLY the fields it needs via the Send API.
Outputs from each worker are merged back into the global AgentState by LangGraph.

Flow:
  AgentState (orchestrator) ──Send──► StyleRetrieverState ──output: style_json──►
  ──fixed edge──► WriterState (full state, style_json now merged in) ──output: draft──►
  ──fixed edge──► human_approval_node

One additional entry path into this same style_retriever_node -> writer_node chain:
  - /draft-from-topic: graph.py's conditional entry point (_entry_router) sends
    pre_routed=True requests straight to style_retriever_node, skipping supervisor_node's
    classification LLM call entirely, since the target pipeline is already known.

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
    research_brief: dict   # flat shape ({recommended_angle, talking_points, ...}) — empty dict if
                           # research never ran; always reshaped to this flat form before writer_node runs
    writer_task:    dict   # {action, topic, constraints} — set by router.py
    draft:          str    # previous draft, used only for rewrite action


class ResearcherState(TypedDict):
    """
    Minimal input for a platform researcher worker (e.g. researcher_linkedin).

    Same minimal-dispatch shape as StyleRetrieverState — the worker only needs
    WHO the user is and WHAT topic they want researched; it self-serves
    everything else (web search, source gathering) internally.
    """
    user_id: str
    query:   str
