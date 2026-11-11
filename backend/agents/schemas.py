"""API shapes for /api/agents.

Validation lives here so a bad request is a 422 before any query runs:
handles are trimmed, lowercased and checked against the pattern (the database
checks it again); prompt and guardrail lengths come from settings. Reserved
handles are a rule, so the service checks them (and logs the rejection).
"""

import re
from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from backend.agents.models import HANDLE_PATTERN, AgentModel
from backend.agents.records import AgentConfig
from backend.ai.independent_agents.schemas import SourceRefOut
from backend.core.config import settings

_HANDLE_RE = re.compile(HANDLE_PATTERN)
MESSAGE_MAX_CHARS = 8000


def normalize_handle(value: str) -> str:
    handle = value.strip().removeprefix("@").lower()
    if not _HANDLE_RE.fullmatch(handle):
        raise PydanticCustomError(
            "invalid_handle",
            "Use 2-30 lowercase letters, digits or hyphens, starting with a letter or digit.",
        )
    return handle


def _check_prompt(value: str) -> str:
    prompt = value.strip()
    if not prompt:
        raise PydanticCustomError("prompt_empty", "The system prompt can't be empty.")
    limit = settings.CUSTOM_AGENT_PROMPT_MAX_CHARS
    if len(prompt) > limit:
        raise PydanticCustomError("prompt_too_long", "Keep the system prompt under {limit} characters.", {"limit": limit})
    return prompt


def _check_guardrails(value: str | None) -> str | None:
    """Blank means "no guardrails" and is stored as NULL."""
    if value is None or not value.strip():
        return None
    guardrails = value.strip()
    limit = settings.CUSTOM_AGENT_GUARDRAILS_MAX_CHARS
    if len(guardrails) > limit:
        raise PydanticCustomError(
            "guardrails_too_long", "Keep the guardrails under {limit} characters.", {"limit": limit}
        )
    return guardrails


Handle = Annotated[str, AfterValidator(normalize_handle)]
SystemPrompt = Annotated[str, AfterValidator(_check_prompt)]
Guardrails = Annotated[str | None, AfterValidator(_check_guardrails)]


class AgentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    handle: Handle
    model: AgentModel = AgentModel.GEMINI_FLASH
    system_prompt: SystemPrompt
    guardrails: Guardrails = None


class AgentUpdate(BaseModel):
    """Only the fields sent are changed (model_fields_set). `guardrails: null`
    or blank clears them; the other fields can't be cleared."""

    model_config = ConfigDict(extra="forbid")

    handle: Handle | None = None
    model: AgentModel | None = None
    system_prompt: SystemPrompt | None = None
    guardrails: Guardrails = None

    @model_validator(mode="after")
    def _something_to_change(self) -> "AgentUpdate":
        if not self.model_fields_set:
            raise PydanticCustomError("empty_update", "Send at least one field to change.")
        for name in ("handle", "model", "system_prompt"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise PydanticCustomError("required", "{field} can't be cleared.", {"field": name})
        return self

    def changes(self) -> dict[str, Any]:
        """Column -> new value, for the fields that were sent."""
        return {name: getattr(self, name) for name in self.model_fields_set}


class AgentOut(BaseModel):
    id: UUID
    handle: str
    model: AgentModel
    system_prompt: str
    guardrails: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, c: AgentConfig) -> "AgentOut":
        return cls(
            id=c.id,
            handle=c.handle,
            model=c.model,
            system_prompt=c.system_prompt,
            guardrails=c.guardrails,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )


class AgentListItem(BaseModel):
    """One row of the @ picker."""

    id: UUID
    handle: str
    model: AgentModel
    summary: str

    @classmethod
    def of(cls, c: AgentConfig) -> "AgentListItem":
        return cls(id=c.id, handle=c.handle, model=c.model, summary=c.summary)


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MESSAGE_MAX_CHARS)


class AgentChatResponse(BaseModel):
    content: str
    note: str | None = None
    sources: list[SourceRefOut] = []
