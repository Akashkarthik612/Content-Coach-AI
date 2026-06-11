import logging

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode
from langgraph.types import Send

from backend.ai.state import AgentState
from backend.ai.agents.supervisor             import supervisor_node
from backend.ai.agents.style_retriever_node   import style_retriever_node
from backend.ai.agents.writer_node            import writer_node
from backend.ai.agents.analytics_node         import analytics_node
from backend.ai.agents.human_approval_node    import human_approval_node
from backend.ai.agents.tools import (
    search_vault_posts,
    get_topic_inventory,
    analyze_publish_history,
    get_post_analytics,
)

logger = logging.getLogger(__name__)

# Tool node — only used for supervisor's direct/analytics tool calls
_all_tools = [search_vault_posts, get_topic_inventory, analyze_publish_history, get_post_analytics]
tool_node  = ToolNode(_all_tools)


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

    if route == "analytics":
        return "analytics"

    return "direct"


_graph = StateGraph(AgentState)

# ── Nodes ──────────────────────────────────────────────────────────────────────
_graph.add_node("supervisor_node",      supervisor_node)
_graph.add_node("tool_node",            tool_node)
_graph.add_node("style_retriever_node", style_retriever_node)   # worker: fetch/refresh style JSON
_graph.add_node("writer_node",          writer_node)             # worker: generate LinkedIn post
_graph.add_node("analytics_node",       analytics_node)
_graph.add_node("human_approval_node",  human_approval_node)

_graph.set_entry_point("supervisor_node")

# ── Supervisor conditional edges ───────────────────────────────────────────────
_graph.add_conditional_edges("supervisor_node", _supervisor_router, {
    "tools":     "tool_node",
    "analytics": "analytics_node",
    "direct":    END,
    # "style_retrieval" handled by Send above — no mapping entry needed
})

# ── Tool loop (supervisor chatbot / analytics data fetching) ───────────────────
_graph.add_edge("tool_node", "supervisor_node")

# ── Write pipeline — fixed sequential edges after Send dispatch ────────────────
_graph.add_edge("style_retriever_node", "writer_node")
_graph.add_edge("writer_node",          "human_approval_node")
_graph.add_edge("human_approval_node",  END)

# ── Analytics path ─────────────────────────────────────────────────────────────
_graph.add_edge("analytics_node", END)

assistant = _graph.compile(checkpointer=MemorySaver())
