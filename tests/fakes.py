"""Fakes shared by the unit and integration tests.

FakeLLM replaces linkedin._structured_llm() and records what it was sent.
FakeThreads is an in-memory AgentThreadService with the same methods and
errors, for tests that don't want a database.
"""

import uuid
from typing import ClassVar

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

    async def ainvoke(self, messages):
        if self.fail:
            raise self.error
        if self.on_call:
            self.on_call()
        self.calls.append(messages)
        return linkedin.LinkedInPost(content=f"post {len(self.calls)}")


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
