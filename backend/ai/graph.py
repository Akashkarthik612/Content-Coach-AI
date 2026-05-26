from langgraph.graph import StateGraph, END

from backend.ai.state import AgentState
from backend.ai.agents.supervisor import supervisor
from backend.ai.agents.helper import helper


def _route(state: AgentState) -> str:
    return state.get("route", "direct")


_graph = StateGraph(AgentState)

_graph.add_node("supervisor", supervisor)
_graph.add_node("helper", helper)

_graph.set_entry_point("supervisor")
_graph.add_conditional_edges("supervisor", _route, {
    "direct":   END,
    "research": "helper",
})
_graph.add_edge("helper", "supervisor")

assistant = _graph.compile()
