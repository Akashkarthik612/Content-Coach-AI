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

    def test_analytics_node_registered(self):
        from backend.ai.graph import _graph
        assert "analytics_node" in _graph.nodes

    def test_human_approval_node_registered(self):
        from backend.ai.graph import _graph
        assert "human_approval_node" in _graph.nodes

    def test_five_nodes_total(self):
        from backend.ai.graph import _graph
        # supervisor, tool, writer, analytics, human_approval
        assert len(_graph.nodes) == 5


class TestGraphCompilation:
    def test_assistant_has_memory_saver_checkpointer(self):
        from backend.ai.graph import assistant
        assert isinstance(assistant.checkpointer, MemorySaver)

    def test_assistant_is_compiled(self):
        from backend.ai.graph import assistant
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

    def test_router_returns_write_when_route_is_write(self):
        from backend.ai.graph import _supervisor_router
        from unittest.mock import MagicMock

        msg = MagicMock()
        msg.tool_calls = []
        state = {"messages": [msg], "route": "write", "task_type": "write"}
        assert _supervisor_router(state) == "write"

    def test_router_returns_analytics_when_route_is_analytics(self):
        from backend.ai.graph import _supervisor_router
        from unittest.mock import MagicMock

        msg = MagicMock()
        msg.tool_calls = []
        state = {"messages": [msg], "route": "analytics", "task_type": "analytics"}
        assert _supervisor_router(state) == "analytics"

    def test_router_returns_direct_by_default(self):
        from backend.ai.graph import _supervisor_router
        from unittest.mock import MagicMock

        msg = MagicMock()
        msg.tool_calls = []
        state = {"messages": [msg], "route": "direct", "task_type": "general"}
        assert _supervisor_router(state) == "direct"


class TestAgentState:
    def test_all_required_keys_present(self):
        from backend.ai.state import AgentState
        annotations = AgentState.__annotations__
        required = ["query", "user_id", "messages", "task_type", "route",
                    "draft", "approval_status", "answer"]
        for key in required:
            assert key in annotations, f"AgentState missing key: {key}"
