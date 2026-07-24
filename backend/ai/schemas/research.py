"""
Pydantic DTOs for the dormant research_brief shape — the flat contract
writer_node.py reads from state["research_brief"], populated only by
router.py's /draft-from-topic endpoint (ResearchTopic + topic_to_flat).
ResearchBrief/fallback_brief are leftovers from the old, already-removed
research_digest_node and are currently unused.
"""
from pydantic import BaseModel, Field, field_validator

MAX_TOPICS = 5
MAX_TALKING_POINTS = 6
MAX_SUPPORTING_EVIDENCE = 4


class SupportingEvidence(BaseModel):
    point: str
    source_title: str = ""
    source_url: str = ""


class ResearchTopic(BaseModel):
    title: str
    preview: str = ""
    talking_points: list[str] = Field(default_factory=list)
    supporting_evidence: list[SupportingEvidence] = Field(default_factory=list)
    suggested_hook: str = ""
    suggested_length: str = "medium"
    past_coverage: str = ""
    avoid_repeating: str = ""

    @field_validator("suggested_length")
    @classmethod
    def _valid_length(cls, v: str) -> str:
        return v if v in ("short", "medium", "long") else "medium"

    @field_validator("talking_points")
    @classmethod
    def _cap_points(cls, v: list[str]) -> list[str]:
        return v[:MAX_TALKING_POINTS]

    @field_validator("supporting_evidence")
    @classmethod
    def _cap_evidence(cls, v: list) -> list:
        return v[:MAX_SUPPORTING_EVIDENCE]


class ResearchBrief(BaseModel):
    """Multi-topic contract — currently unused, kept alongside fallback_brief()."""
    topics: list[ResearchTopic] = Field(default_factory=list)

    @field_validator("topics")
    @classmethod
    def _cap_topics(cls, v: list[ResearchTopic]) -> list[ResearchTopic]:
        return v[:MAX_TOPICS]


class FlatResearchBrief(BaseModel):
    """The pre-existing flat shape — writer_node's contract, unchanged."""
    recommended_angle: str = ""
    talking_points: list[str] = Field(default_factory=list)
    supporting_evidence: list[SupportingEvidence] = Field(default_factory=list)
    past_coverage: str = ""
    avoid_repeating: str = ""
    suggested_length: str = "medium"
    suggested_hook: str = ""


def topic_to_flat(topic: ResearchTopic) -> FlatResearchBrief:
    """Single normalization point: one picked ResearchTopic -> writer_node's expected flat shape."""
    angle = topic.title
    if topic.preview:
        angle = f"{topic.title} — {topic.preview}"
    return FlatResearchBrief(
        recommended_angle=angle,
        talking_points=topic.talking_points,
        supporting_evidence=topic.supporting_evidence,
        past_coverage=topic.past_coverage,
        avoid_repeating=topic.avoid_repeating,
        suggested_length=topic.suggested_length,
        suggested_hook=topic.suggested_hook,
    )


def fallback_brief(raw_text: str) -> ResearchBrief:
    """Degrade gracefully on parse/validation failure — one topic wrapping the raw LLM text."""
    return ResearchBrief(topics=[ResearchTopic(title="Research summary", preview=raw_text[:280])])
