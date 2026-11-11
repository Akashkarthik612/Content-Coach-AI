"""Data the custom-agent code passes around. The runner and the prompt
builder only ever see AgentConfig, never the ORM row."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from backend.agents.models import AgentModel

SUMMARY_MAX_CHARS = 90


@dataclass(frozen=True, slots=True)
class AgentConfig:
    id: UUID
    user_id: UUID
    handle: str
    model: AgentModel
    system_prompt: str
    guardrails: str | None
    created_at: datetime
    updated_at: datetime
    responsibility: str = ""

    @property
    def summary(self) -> str:
        """Shown in the @ picker (D8-D9: no description column): the first
        non-blank line of the system prompt, cut to SUMMARY_MAX_CHARS."""
        line = next((ln.strip() for ln in self.system_prompt.splitlines() if ln.strip()), "")
        return line if len(line) <= SUMMARY_MAX_CHARS else line[: SUMMARY_MAX_CHARS - 1] + "…"


class AgentAnswer(BaseModel):
    """What the model returns: submit_answer's arguments, or the structured
    output when the knowledge tools are off. No server-side fields: the
    model would invent them."""

    content: str = Field(min_length=1, description="Your full answer to the user, in Markdown.")
    note: str | None = Field(
        default=None,
        description="Short message to the user, shown apart from the answer (e.g. what you could not find). Usually empty.",
    )
