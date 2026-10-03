from enum import Enum

from pydantic import BaseModel, ConfigDict


class ConversationStage(str, Enum):
    """Drives the UI's distinct views per CLAUDE.md §3 ('not just a single chat stream')."""

    INTENT = "intent"
    SUGGESTIONS = "suggestions"
    DECISION = "decision"
    DRAFTING = "drafting"
    COMMIT = "commit"


class SuggestionItem(BaseModel):
    """Common envelope for researcher/angles/series output.

    A single shared shape lets state.py and the supervisor treat all three
    sub-agents' output identically (Liskov-substitutable) — adding a 5th
    suggestion-producing agent later touches only that agent's tool, never
    state.py or the supervisor's rendering logic (Open/Closed).
    """

    model_config = ConfigDict(extra="forbid")

    id: str  # stable id supervisor/frontend can reference when picking one
    source: str  # "researcher" | "angles" | "series_<n>" etc.
    title: str
    summary: str
    payload: dict  # agent-specific detail the writer tool will need verbatim


class DraftPost(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    content: str
    source_suggestion_id: str | None = None
    revision: int = 0  # bumped per edit; no history kept in state (see state hygiene)


class UserProfileSnapshot(BaseModel):
    """Read-only mirror of user_profile, sized to what the supervisor's prompt needs.
    Loaded fresh by the FastAPI route on every turn — never mutated by graph logic.
    """

    model_config = ConfigDict(extra="forbid")

    profession: str | None = None
    industry: str | None = None
    role: str | None = None
    target_audience: str | None = None
    writing_style: str | None = None
    topics: list[str] = []
