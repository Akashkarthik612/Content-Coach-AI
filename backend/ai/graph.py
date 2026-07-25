import logging

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.prebuilt import ToolNode
from langgraph.types import Send

from backend.ai.state import AgentState
from backend.ai.agents.supervisor             import supervisor_node
from backend.ai.agents.writer_node            import writer_node
from backend.ai.agents.human_approval_node    import human_approval_node
from backend.ai.agents.researcher             import researcher_node
from backend.ai.agents.angle_review_node      import angle_review_node, map_chosen_angle_node
from backend.ai.agents.tools import (
    search_vault_posts,
    get_topic_inventory,
    get_style_memory,
    get_session_context,
)

logger = logging.getLogger(__name__)

# Tool node — the actual executor of supervisor_node's tool-calling loop, so
# this list must stay in sync with whatever supervisor.py binds via
# bind_tools() (see supervisor.py's _all_tools) — an LLM-requested tool call
# for anything missing here fails at execution time. get_style_memory was
# previously missing despite being bound on the supervisor's LLM; added here
# alongside get_session_context while fixing this same list.
_all_tools = [search_vault_posts, get_topic_inventory, get_style_memory, get_session_context]
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
        logger.debug("entry_router: pre_routed=True -> writer_node directly")
        return "writer_node"
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
        # writer_node now resolves style/profile context itself as a plain
        # pre-step (StyleContextLoader) — no separate worker needed here, and
        # writer_node needs the FULL state (messages/writer_task), not a
        # Send's minimal slice.
        logger.debug("supervisor_router: -> writer_node")
        return "writer_node"

    if route == "research":
        # Same minimal-dispatch shape as style_retrieval above. Output
        # (research_result) merges into global AgentState; fixed edge carries
        # it into angle_review_node next.
        logger.debug("supervisor_router: Send → researcher_node")
        return [Send("researcher_node", {
            "user_id": state["user_id"],
            "query":   state["query"],
        })]

    if route == "write":
        # Rewrite/redraft of existing content — supervisor already set
        # writer_task.action="rewrite" on state. Plain edge (not Send) so
        # writer_node keeps the full merged state — messages, writer_task,
        # and any vault content fetched via tools during classification are
        # all present in state["messages"] and must survive to writer_node.
        logger.debug("supervisor_router: -> writer_node (rewrite)")
        return "writer_node"

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
_graph.add_node("writer_node",          writer_node)             # resolves style/profile context itself, then generates the post
_graph.add_node("human_approval_node",  human_approval_node)
_graph.add_node("researcher_node",      researcher_node)         # worker: Tavily + Gemini, 5 angles
_graph.add_node("angle_review_node",    angle_review_node)       # interrupt: angle pick/expand/modify/none_fit
_graph.add_node("map_chosen_angle_node", map_chosen_angle_node)  # pure python: picked angle -> research_brief

# ── Entry point — conditional so /draft-from-topic can skip supervisor's LLM classification entirely ──
_graph.set_conditional_entry_point(_entry_router, {
    "supervisor_node": "supervisor_node",
    "writer_node":      "writer_node",
})

# ── Supervisor conditional edges ───────────────────────────────────────────────
_graph.add_conditional_edges("supervisor_node", _supervisor_router, {
    "tools":       "tool_node",
    "direct":      END,
    "writer_node": "writer_node",
})

# ── Tool loop (supervisor chatbot / analytics data fetching) ───────────────────
_graph.add_edge("tool_node", "supervisor_node")

# ── Write pipeline ──────────────────────────────────────────────────────────────
_graph.add_edge("writer_node", "human_approval_node")
_graph.add_edge("human_approval_node", END)

# ── Research pipeline — researcher_node (Send dispatch) -> angle_review_node
# (interrupt) -> map_chosen_angle_node (pure python) -> writer_node ──
_graph.add_edge("researcher_node", "angle_review_node")
_graph.add_conditional_edges("angle_review_node", _angle_review_router, {
    "map_chosen_angle_node": "map_chosen_angle_node",
    "supervisor_node":       "supervisor_node",
})
_graph.add_edge("map_chosen_angle_node", "writer_node")


def build_assistant(checkpointer: BaseCheckpointSaver):
    """
    Compile the graph against a caller-supplied checkpointer.

    backend/main.py passes a plain in-memory MemorySaver at import time — no
    persisted chat history or thread reuse across process restarts. This
    factory stays generic over any BaseCheckpointSaver so a durable one can be
    swapped in later without touching this module.
    """
    return _graph.compile(checkpointer=checkpointer)
