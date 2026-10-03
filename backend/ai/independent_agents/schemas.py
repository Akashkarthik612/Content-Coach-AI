"""API schemas shared by the independent agents' thread endpoints.

Agent-specific request/response shapes stay in each agent's own file or here
under its own name; only the thread bookkeeping shapes are common.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    # Omit to start a new chat; the server creates the thread.
    thread_id: UUID | None = None


class ThreadStatus(BaseModel):
    thread_id: UUID
    turn_count: int
    turn_limit: int
    # True once this turn used the last allowed one: the UI should ask the
    # user to start a new chat; further messages on this thread get a 409.
    limit_reached: bool


class LinkedInChatResponse(BaseModel):
    content: str
    thread: ThreadStatus


class ThreadSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str | None
    turn_count: int
    last_message_at: datetime


class ThreadMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ThreadDetail(BaseModel):
    id: UUID
    title: str | None
    messages: list[ThreadMessage]
    thread: ThreadStatus
