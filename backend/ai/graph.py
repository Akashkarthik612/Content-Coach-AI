import logging

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.prebuilt import ToolNode
from langgraph.types import Send

from backend.ai.state import AgentState
from backend.ai.agents.supervisor             import supervisor_node
from backend.ai.agents.style_agent            import style_retriever_node
from backend.ai.agents.writer_node            import writer_node
from backend.ai.agents.human_approval_node    import human_approval_node
from backend.ai.agents.researcher             import researcher_node
from backend.ai.agents.angle_review_node      import angle_review_node, map_chosen_angle_node
from backend.ai.agents.tools import (
    search_vault_posts,
    get_topic_inventory,
)

logger = logging.getLogger(__name__)

# Tool node — only used for supervisor's direct/analytics tool calls
_all_tools = [search_vault_posts, get_topic_inventory]
tool_node  = ToolNode(_all_tools)


def _entry_router(state: AgentState) -> str:
    """
    Conditional entry point (replaces a hardcoded set_entry_point("supervisor_node")).

    supervisor_node always makes an LLM call to classify intent and always
    overwrites state["route"] from that classification — it never respects a
    pre-seeded route. So the only way to skip its LLM call (needed for the
    /draft-from-topic flow, where the target pipeline is already known because
    the user clicked a specific topic card) is to skip the node entirely.
    Every other entry path (pre_routed unset/False) goes through supervisor_node
    exactly as before.
    """
    if state.get("pre_routed"):
        logger.debug("entry_router: pre_routed=True -> style_retriever_node directly")
        return "style_retriever_node"
    return "supervisor_node"


def _supervisor_router(state: AgentState):
    """
    Route after supervisor_node.

    Returns a string for standard edge mapping, or list[Send] to dispatch
    a worker via the Send API (orchestrator-worker pattern).
    """
    last = state["messages"][-1]

    # Supervisor is mid-tool-loop — send to tool_node, which loops back here
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"

    route = state.get("route", "")

    if route == "style_retrieval":
        # Send API: dispatch style_retriever as an autonomous worker with its own
        # minimal state — only what it needs (user_id + query).
        # Output (style_json) merges into global AgentState; fixed edges carry
        # the merged state through writer_node → human_approval_node → END.
        logger.debug("supervisor_router: Send → style_retriever_node")
        return [Send("style_retriever_node", {
            "user_id": state["user_id"],
            "query":   state["query"],
        })]

    if route == "research":
        # Same minimal-dispatch shape as style_retrieval above. Output
        # (research_result) merges into global AgentState; fixed edge carries
        # it into angle_review_node next.
        logger.debug("supervisor_router: Send → researcher_node")
        return [Send("researcher_node", {
            "user_id": state["user_id"],
            "query":   state["query"],
        })]

    return "direct"


def _angle_review_router(state: AgentState) -> str:
    """
    Route after angle_review_node's interrupt loop resolves.

    "pick" -> picked_angle_id is set -> map_chosen_angle_node reshapes it into
    research_brief and the existing write pipeline takes over.
    "none_fit" -> picked_angle_id stays None -> back to supervisor_node, same
    as any other re-classification loop (steps_taken caps a runaway loop).
    """
    if state.get("picked_angle_id") is not None:
        return "map_chosen_angle_node"
    return "supervisor_node"


_graph = StateGraph(AgentState)

# ── Nodes ──────────────────────────────────────────────────────────────────────
_graph.add_node("supervisor_node",      supervisor_node)
_graph.add_node("tool_node",            tool_node)
_graph.add_node("style_retriever_node", style_retriever_node)   # worker: fetch/refresh style JSON
_graph.add_node("writer_node",          writer_node)             # worker: generate LinkedIn post
_graph.add_node("human_approval_node",  human_approval_node)
_graph.add_node("researcher_node",      researcher_node)         # worker: Tavily + Gemini, 5 angles
_graph.add_node("angle_review_node",    angle_review_node)       # interrupt: angle pick/expand/modify/none_fit
_graph.add_node("map_chosen_angle_node", map_chosen_angle_node)  # pure python: picked angle -> research_brief

# ── Entry point — conditional so /draft-from-topic can skip supervisor's LLM classification entirely ──
_graph.set_conditional_entry_point(_entry_router, {
    "supervisor_node":      "supervisor_node",
    "style_retriever_node": "style_retriever_node",
})

# ── Supervisor conditional edges ───────────────────────────────────────────────
_graph.add_conditional_edges("supervisor_node", _supervisor_router, {
    "tools":  "tool_node",
    "direct": END,
    # "style_retrieval" handled by Send above — no mapping entry needed
})

# ── Tool loop (supervisor chatbot / analytics data fetching) ───────────────────
_graph.add_edge("tool_node", "supervisor_node")

# ── Write pipeline — fixed sequential edges after Send dispatch (or direct conditional entry) ──
_graph.add_edge("style_retriever_node", "writer_node")
_graph.add_edge("writer_node",          "human_approval_node")
_graph.add_edge("human_approval_node",  END)

# ── Research pipeline — researcher_node (Send dispatch) -> angle_review_node
# (interrupt) -> map_chosen_angle_node (pure python) -> into the same write
# pipeline as above, joining at style_retriever_node ──
_graph.add_edge("researcher_node", "angle_review_node")
_graph.add_conditional_edges("angle_review_node", _angle_review_router, {
    "map_chosen_angle_node": "map_chosen_angle_node",
    "supervisor_node":       "supervisor_node",
})
_graph.add_edge("map_chosen_angle_node", "style_retriever_node")


def build_assistant(checkpointer: BaseCheckpointSaver):
    """
    Compile the graph against a caller-supplied checkpointer.

    backend/main.py passes a plain in-memory MemorySaver at import time — no
    persisted chat history or thread reuse across process restarts. This
    factory stays generic over any BaseCheckpointSaver so a durable one can be
    swapped in later without touching this module.
    """
    return _graph.compile(checkpointer=checkpointer)
