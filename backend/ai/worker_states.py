"""
Worker state schemas — one TypedDict per specialist worker node.

Send-dispatched workers (researcher_node today) receive ONLY the minimal
fields they need via the Send API; their output is merged back into the
global AgentState by LangGraph.

writer_node is NOT Send-dispatched — it's reached via a plain conditional or
fixed edge from supervisor_node/map_chosen_angle_node, so it always receives
the FULL merged AgentState. It resolves its own style/profile context as a
plain pre-step (context_loaders.py's StyleContextLoader) rather than relying
on an upstream worker to have populated style_json — see writer_node.py.

The orchestrator (supervisor_node) holds AgentState.
Send-dispatched workers hold their own minimal state for the duration of
their execution.
"""
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph.message import add_messages


class WriterState(TypedDict):
    """
    State available to writer_node (reached via conditional/fixed edge, never
    Send — it always needs the full merged global state).
    """
    user_id:        str
    query:          str
    messages:       Annotated[list[HumanMessage | AIMessage], add_messages]
    style_json:     dict   # unused as an input now — writer_node resolves this itself via StyleContextLoader
    research_brief: dict   # flat shape ({recommended_angle, talking_points, ...}) — empty dict if
                           # research never ran; always reshaped to this flat form before writer_node runs
    writer_task:    dict   # {action, topic, constraints} — set by router.py
    draft:          str    # previous draft, used only for rewrite action


class ResearcherState(TypedDict):
    """
    Minimal input for a platform researcher worker (e.g. researcher_linkedin).

    The worker only needs WHO the user is and WHAT topic they want researched;
    it self-serves everything else (web search, source gathering) internally.
    """
    user_id: str
    query:   str
