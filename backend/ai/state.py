from typing import Annotated, TypedDict
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    # Immutable input — set once by router, never mutated
    query:   str
    user_id: str

    # Message history — add_messages reducer appends every turn.
    # Includes HumanMessage, AIMessage (with tool_calls), and ToolMessage (tool results).
    messages: Annotated[list[HumanMessage | AIMessage], add_messages]

    # Supervisor routing
    task_type: str  # "" | "general" | "research" | "write" | "analytics" | "suggest"
    route:     str  # "style_retrieval" | "analytics" | "tools" | "direct"

    # Inter-worker JSON contracts — structured dicts, never prose paragraphs
    style_json:     dict  # {"long_term": {9 style keys}, "short_term": {9 keys}|None}
    research_brief: dict  # {recommended_angle, talking_points, past_coverage, avoid_repeating, suggested_length}
    writer_task:    dict  # {action: "write"|"rewrite", topic, constraints: []}

    # Writer path
    draft:           str  # produced by writer_node
    approval_status: str  # "" | "approved" | "edited" | "rejected"

    # Final surface output
    answer: str
