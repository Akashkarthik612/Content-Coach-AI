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
    route:     str  # "tools" | "write" | "direct"

    # Writer path
    draft:           str  # produced by writer_node
    approval_status: str  # "" | "approved" | "edited" | "rejected"

    # Final surface output
    answer: str
