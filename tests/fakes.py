"""Fakes shared by the unit and integration tests.

FakeLLM is a structured-output model (what `with_structured_output` returns):
it records what it was sent and returns a LinkedInPost.
ScriptedChatModel stands in for the raw Gemini chat model: `bind_tools` calls
return queued AIMessages (tool calls), `with_structured_output` returns a
FakeLLM. Both record every call.
FakeThreads is an in-memory AgentThreadService with the same methods and
errors, for tests that don't want a database.
"""

import uuid
from collections import deque
from typing import ClassVar

from langchain_core.messages import AIMessage

from backend.ai.independent_agents import linkedin
from backend.ai.independent_agents.threads import (
    ThreadBusyError,
    ThreadLimitReachedError,
    ThreadNotFoundError,
)
from backend.core.config import settings


class FakeLLM:
    def __init__(self):
        self.calls: list[list] = []
        self.fail = False
        self.error: Exception = RuntimeError("gemini down")
        self.on_call = None  # hook to simulate something happening mid-turn
        self.note: str | None = None  # note returned alongside the post

    async def ainvoke(self, messages):
        if self.fail:
            raise self.error
        if self.on_call:
            self.on_call()
        self.calls.append(messages)
        return linkedin.LinkedInPost(content=f"post {len(self.calls)}", note=self.note)


def tool_call(name: str, args: dict | None = None, call_id: str | None = None) -> AIMessage:
    """A model reply that calls one tool."""
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": args or {}, "id": call_id or f"call-{uuid.uuid4().hex[:8]}"}],
    )


def submit(**post) -> AIMessage:
    return tool_call("submit_post", post)


class ScriptedChatModel:
    """Replies come from `replies` in order: an AIMessage, or an exception to
    raise. `calls` records (tool names bound, tool_choice, messages) per call."""

    def __init__(self, *replies):
        self.replies: deque = deque(replies)
        self.calls: list[tuple[tuple[str, ...], object, list]] = []
        self.structured = FakeLLM()  # used when the knowledge tools are switched off
        self.structured_schemas: list[type] = []

    def bind_tools(self, tools, tool_choice=None, **_):
        return _BoundScript(self, tuple(getattr(t, "name", str(t)) for t in tools), tool_choice)

    def with_structured_output(self, schema, **_):
        self.structured_schemas.append(schema)
        return self.structured


class _BoundScript:
    def __init__(self, model: ScriptedChatModel, names: tuple[str, ...], tool_choice):
        self._model, self._names, self._choice = model, names, tool_choice

    async def ainvoke(self, messages, *_, **__):
        self._model.calls.append((self._names, self._choice, list(messages)))
        if not self._model.replies:
            raise AssertionError("ScriptedChatModel ran out of replies")
        reply = self._model.replies.popleft()
        if isinstance(reply, Exception):
            raise reply
        return reply


class FakeThreads:
    """In-memory stand-in for AgentThreadService (same methods, same errors)."""

    rows: ClassVar[dict] = {}

    @classmethod
    def reset(cls):
        cls.rows = {}

    @classmethod
    def create(cls, db, user_id, agent, first_message):
        tid = uuid.uuid4()
        cls.rows[tid] = {"user_id": user_id, "agent": agent, "turns": 0, "busy": True, "title": first_message}
        return tid

    @classmethod
    def acquire(cls, db, thread_id, user_id, agent):
        row = cls.rows.get(thread_id)
        if row is None or row["user_id"] != user_id or row["agent"] != agent:
            raise ThreadNotFoundError
        if row["turns"] >= settings.THREAD_TURN_LIMIT:
            raise ThreadLimitReachedError
        if row["busy"]:
            raise ThreadBusyError
        row["busy"] = True

    @classmethod
    def finish(cls, db, thread_id):
        row = cls.rows.get(thread_id)
        if row is None:
            raise ThreadNotFoundError
        row["turns"] += 1
        row["busy"] = False
        return row["turns"]

    @classmethod
    def release(cls, db, thread_id):
        cls.rows[thread_id]["busy"] = False

    @classmethod
    def delete_row(cls, db, thread_id):
        cls.rows.pop(thread_id, None)
