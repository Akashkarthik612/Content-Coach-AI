import logging

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.store.base import BaseStore
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
    recall_past_sessions,
)

logger = logging.getLogger(__name__)

# Tool node — the actual executor of supervisor_node's tool-calling loop, so
# this list must stay in sync with whatever supervisor.py binds via
# bind_tools() (see supervisor.py's _all_tools) — an LLM-requested tool call
# for anything missing here fails at execution time. get_style_memory was
# previously missing despite being bound on the supervisor's LLM; added here
# alongside get_session_context while fixing this same list. recall_past_sessions
# (cross-session semantic recall via the Store, see checkpointing/session_memory_store.py)
# added the same way — keep both lists in sync when touching either.
_all_tools = [
    search_vault_posts,
    get_topic_inventory,
    get_style_memory,
    get_session_context,
    recall_past_sessions,
]
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

    if route == "direct" and state.get("research_result") and state.get("picked_angle_id") is None:
        # Supervisor answered a question about already-proposed angles
        # (see supervisor.py rule 5) — re-pause on the same angle set
        # instead of ending, so the user can still pick one afterward.
        logger.debug("supervisor_router: direct answer mid angle-review -> angle_review_node")
        return "angle_review_node"

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


def _approval_router(state: AgentState) -> str:
    """
    Route after human_approval_node resolves.

    "regenerate" -> back to writer_node. human_approval_node already set
    draft to the user's edited text and writer_task.action="rewrite" (see
    human_approval_node.py), so writer_node treats the edit as the new base
    to redraft. The fixed writer_node -> human_approval_node edge below then
    re-pauses on a fresh interrupt() — same HITL checkpoint, new draft.
    Anything else (approved/edited/rejected) -> END, nothing left to do.
    """
    if state.get("approval_status") == "regenerate":
        return "writer_node"
    return "end"


def _researcher_router(state: AgentState) -> str:
    """
    Route after researcher_node.

    SINGLE_POST -> research_result.angles is populated -> angle_review_node
    (pick/none_fit HITL, unchanged).
    SERIES -> researcher_node set state["answer"] directly instead (see
    researcher.py) — nothing to review or pick, so this ends here like any
    other direct answer.
    """
    if state.get("research_result", {}).get("angles"):
        return "angle_review_node"
    return "end"


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
_graph.add_node("researcher_node",      researcher_node)         # worker: Tavily + Gemini, up to 5 angles (or a plain SERIES answer)
_graph.add_node("angle_review_node",    angle_review_node)       # interrupt: angle pick/expand/modify/none_fit
_graph.add_node("map_chosen_angle_node", map_chosen_angle_node)  # pure python: picked angle -> research_brief

# ── Entry point — conditional so /draft-from-topic can skip supervisor's LLM classification entirely ──
_graph.set_conditional_entry_point(_entry_router, {
    "supervisor_node": "supervisor_node",
    "writer_node":      "writer_node",
})

# ── Supervisor conditional edges ───────────────────────────────────────────────
_graph.add_conditional_edges("supervisor_node", _supervisor_router, {
    "tools":             "tool_node",
    "direct":            END,
    "writer_node":       "writer_node",
    "angle_review_node": "angle_review_node",
})

# ── Tool loop (supervisor chatbot / analytics data fetching) ───────────────────
_graph.add_edge("tool_node", "supervisor_node")

# ── Write pipeline ──────────────────────────────────────────────────────────────
_graph.add_edge("writer_node", "human_approval_node")
_graph.add_conditional_edges("human_approval_node", _approval_router, {
    "writer_node": "writer_node",
    "end":         END,
})

# ── Research pipeline — researcher_node (Send dispatch) -> angle_review_node
# (interrupt) -> map_chosen_angle_node (pure python) -> writer_node.
# SERIES responses skip straight to END instead (researcher_node sets
# state["answer"] directly — see _researcher_router). ──
_graph.add_conditional_edges("researcher_node", _researcher_router, {
    "angle_review_node": "angle_review_node",
    "end":                END,
})
_graph.add_conditional_edges("angle_review_node", _angle_review_router, {
    "map_chosen_angle_node": "map_chosen_angle_node",
    "supervisor_node":       "supervisor_node",
})
_graph.add_edge("map_chosen_angle_node", "writer_node")


def build_assistant(checkpointer: BaseCheckpointSaver, store: BaseStore | None = None):
    """
    Compile the graph against a caller-supplied checkpointer (per-turn/per-thread
    state) and store (cross-thread/cross-session long-term memory — the
    chat_sessions namespace, see checkpointing/session_memory_store.py).

    store is optional so this stays compileable in isolation (e.g. a future
    test) without a Postgres-backed store; backend/main.py always passes one.
    """
    return _graph.compile(checkpointer=checkpointer, store=store)
