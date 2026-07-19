"""
Structural tests for the LangGraph agent graph.
Verifies node registration, routing, and AgentState schema
without making any LLM calls.
"""

import pytest
from langgraph.checkpoint.memory import MemorySaver


class TestGraphNodes:
    def test_supervisor_node_registered(self):
        from backend.ai.graph import _graph
        assert "supervisor_node" in _graph.nodes

    def test_tool_node_registered(self):
        from backend.ai.graph import _graph
        assert "tool_node" in _graph.nodes

    def test_writer_node_registered(self):
        from backend.ai.graph import _graph
        assert "writer_node" in _graph.nodes

    def test_human_approval_node_registered(self):
        from backend.ai.graph import _graph
        assert "human_approval_node" in _graph.nodes

    def test_researcher_node_registered(self):
        from backend.ai.graph import _graph
        assert "researcher_node" in _graph.nodes

    def test_angle_review_node_registered(self):
        from backend.ai.graph import _graph
        assert "angle_review_node" in _graph.nodes

    def test_map_chosen_angle_node_registered(self):
        from backend.ai.graph import _graph
        assert "map_chosen_angle_node" in _graph.nodes

    def test_eight_nodes_total(self):
        from backend.ai.graph import _graph
        # supervisor, tool, style_retriever, writer, human_approval,
        # researcher, angle_review, map_chosen_angle.
        # No separate research_tool_node — researcher_linkedin keeps its own
        # internal manual tool-calling loop rather than a graph-level ToolNode.
        assert len(_graph.nodes) == 8


class TestGraphCompilation:
    """
    The graph is compiled via build_assistant(checkpointer) — a thin factory
    kept generic over any BaseCheckpointSaver. backend/main.py calls it with a
    plain in-memory MemorySaver at import time (no persisted chat history
    across process restarts); these tests exercise the same factory directly.
    """

    def test_build_assistant_uses_given_checkpointer(self):
        from backend.ai.graph import build_assistant
        checkpointer = MemorySaver()
        assistant = build_assistant(checkpointer)
        assert assistant.checkpointer is checkpointer

    def test_build_assistant_is_compiled(self):
        from backend.ai.graph import build_assistant
        assistant = build_assistant(MemorySaver())
        # Compiled graph exposes .invoke and .ainvoke
        assert callable(getattr(assistant, "ainvoke", None))


class TestSupervisorRouter:
    def test_router_returns_tools_when_tool_calls_present(self):
        from backend.ai.graph import _supervisor_router
        from unittest.mock import MagicMock

        msg = MagicMock()
        msg.tool_calls = [{"name": "search_vault_posts"}]
        state = {"messages": [msg], "route": "", "task_type": "research"}
        assert _supervisor_router(state) == "tools"

    def test_router_returns_send_to_style_retriever_when_route_is_style_retrieval(self):
        from backend.ai.graph import _supervisor_router
        from langgraph.types import Send
        from unittest.mock import MagicMock

        msg = MagicMock()
        msg.tool_calls = []
        state = {"messages": [msg], "route": "style_retrieval", "user_id": "u1", "query": "q"}
        result = _supervisor_router(state)
        assert isinstance(result, list) and len(result) == 1
        assert isinstance(result[0], Send) and result[0].node == "style_retriever_node"

    def test_router_returns_send_to_researcher_when_route_is_research(self):
        from backend.ai.graph import _supervisor_router
        from langgraph.types import Send
        from unittest.mock import MagicMock

        msg = MagicMock()
        msg.tool_calls = []
        state = {"messages": [msg], "route": "research", "user_id": "u1", "query": "q"}
        result = _supervisor_router(state)
        assert isinstance(result, list) and len(result) == 1
        assert isinstance(result[0], Send) and result[0].node == "researcher_node"

    def test_router_returns_direct_by_default(self):
        from backend.ai.graph import _supervisor_router
        from unittest.mock import MagicMock

        msg = MagicMock()
        msg.tool_calls = []
        state = {"messages": [msg], "route": "direct", "task_type": "general"}
        assert _supervisor_router(state) == "direct"


class TestAngleReviewRouter:
    def test_router_returns_map_chosen_angle_when_angle_picked(self):
        from backend.ai.graph import _angle_review_router

        state = {"picked_angle_id": 2}
        assert _angle_review_router(state) == "map_chosen_angle_node"

    def test_router_returns_supervisor_when_no_angle_picked(self):
        from backend.ai.graph import _angle_review_router

        state = {"picked_angle_id": None}
        assert _angle_review_router(state) == "supervisor_node"


class TestAgentState:
    def test_all_required_keys_present(self):
        from backend.ai.state import AgentState
        annotations = AgentState.__annotations__
        required = ["query", "user_id", "messages", "task_type", "route",
                    "steps_taken", "research_result", "picked_angle_id", "entry_point",
                    "draft", "approval_status", "answer"]
        for key in required:
            assert key in annotations, f"AgentState missing key: {key}"
