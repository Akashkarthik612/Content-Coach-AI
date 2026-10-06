"""Data classes for the independent agents' system prompts. Data only, no logic
beyond validating their own invariants.

Flow: PlatformPromptSpec + PromptContext -> SystemPromptBuilder -> RenderedPrompt.
"""

import re
from dataclasses import dataclass, fields

_PLATFORM_RE = re.compile(r"^[a-z][a-z0-9_]*$")


@dataclass(frozen=True, slots=True)
class PlatformPromptSpec:
    """The fixed prompt content of one platform: the same for every user and call.

    `banned_patterns` holds only this platform's patterns; the cross-platform
    list and the honesty rules are shared and added by the builder.
    """

    platform: str
    version: str  # bump on every content change; logged on every call
    persona: str
    mechanics: tuple[str, ...]  # what the platform rewards / penalises
    voice_rules: tuple[str, ...]
    format_rules: tuple[str, ...]
    banned_patterns: tuple[str, ...]
    output_contract: str  # must name every field of the agent's response model

    def __post_init__(self) -> None:
        # Invalid specs fail at import, so the app never boots with a broken prompt.
        if not _PLATFORM_RE.match(self.platform):
            raise ValueError(f"spec platform {self.platform!r} must match {_PLATFORM_RE.pattern}")
        for f in fields(self):
            value = getattr(self, f.name)
            if isinstance(value, str) and not value.strip():
                raise ValueError(f"{self.platform} spec: {f.name} is blank")
            if isinstance(value, tuple):
                if not value:
                    raise ValueError(f"{self.platform} spec: {f.name} is empty")
                if any(not item.strip() for item in value):
                    raise ValueError(f"{self.platform} spec: {f.name} has a blank item")


@dataclass(frozen=True, slots=True)
class PromptContext:
    """Per-request optional extras. Empty today; Step 2 fills `knowledge`.

    A slot that is None or blank is left out of the prompt entirely. A new
    slot is a new field here plus one line in the builder's slot table.
    """

    brand_voice: str | None = None
    knowledge: str | None = None


@dataclass(frozen=True, slots=True)
class RenderedPrompt:
    """The builder's output: the text sent to Gemini, plus what to log about it."""

    text: str
    platform: str
    version: str
    content_hash: str  # sha256[:12] of text; changes when shared rules change too
    slots_included: tuple[str, ...]
    char_length: int
