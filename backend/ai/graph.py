from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode

from backend.ai.state import AgentState
from backend.ai.agents.supervisor          import supervisor_node
from backend.ai.agents.writer_node         import writer_node
from backend.ai.agents.human_approval_node import human_approval_node
from backend.ai.agents.tools import (
    search_vault_posts,
    get_style_samples,
    get_topic_inventory,
    analyze_publish_history,
)


_all_tools = [search_vault_posts, get_style_samples, get_topic_inventory, analyze_publish_history]
tool_node  = ToolNode(_all_tools)


def _supervisor_router(state: AgentState) -> str:
    """Route after supervisor_node based on what the LLM produced."""
    last = state["messages"][-1]
    # LLM wants to call a tool → execute it
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    # Style samples fetched → send to writer
    if state.get("route") == "write":
        return "write"
    # General Q&A or synthesis complete → done
    return "direct"


_graph = StateGraph(AgentState)

_graph.add_node("supervisor_node",     supervisor_node)
_graph.add_node("tool_node",           tool_node)
_graph.add_node("writer_node",         writer_node)
_graph.add_node("human_approval_node", human_approval_node)

_graph.set_entry_point("supervisor_node")

_graph.add_conditional_edges("supervisor_node", _supervisor_router, {
    "tools":  "tool_node",
    "write":  "writer_node",
    "direct": END,
})
_graph.add_edge("tool_node",           "supervisor_node")   # loop: tool result → supervisor Pass 2
_graph.add_edge("writer_node",         "human_approval_node")
_graph.add_edge("human_approval_node", END)

assistant = _graph.compile(checkpointer=MemorySaver())
