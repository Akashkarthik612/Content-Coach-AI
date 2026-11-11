"""Strict request contracts; no model or client supplied employee/owner identity."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from backend.agents.models import AgentModel
from backend.agents.schemas import Guardrails, Handle, SystemPrompt

TextInput = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
ToolName = Literal["search_knowledge", "find_documents", "list_documents", "read_document"]
WorkflowRole = Literal["product", "marketing", "support", "custom"]
ALL_TOOLS = ["search_knowledge", "find_documents", "list_documents", "read_document"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WorkspaceIn(Input):
    name: TextInput = Field(max_length=120)


class MemberIn(Input):
    email: TextInput = Field(max_length=320)
    role: Literal["admin", "member"] = "member"


class ShareIn(Input):
    source_id: UUID
    # None = explicitly share all current AND future documents; [] = no documents.
    document_ids: list[UUID] | None = Field(default=None, max_length=200)


class AgentIn(Input):
    name: TextInput = Field(max_length=100)
    handle: Handle
    description: TextInput = Field(max_length=500)
    responsibility: TextInput = Field(max_length=1000)
    system_prompt: SystemPrompt
    guardrails: Guardrails = None
    model: AgentModel = AgentModel.GEMINI_FLASH
    workflow_role: WorkflowRole = "custom"
    source_ids: list[UUID] = Field(default_factory=list, max_length=200)
    document_ids: list[UUID] = Field(default_factory=list, max_length=200)
    enabled_tools: list[ToolName] = Field(default_factory=lambda: ALL_TOOLS.copy(), max_length=4)

    @field_validator("source_ids", "document_ids", "enabled_tools")
    @classmethod
    def unique(cls, value):
        return list(dict.fromkeys(value))


class AgentEdit(AgentIn):
    expected_version: int = Field(ge=1)


class PreviewIn(Input):
    configuration: AgentIn
    message: TextInput = Field(max_length=8000)


class ConversationIn(Input):
    title: TextInput = Field(default="Company conversation", max_length=120)


class MessageIn(Input):
    message: TextInput = Field(max_length=8000)


class WorkflowIn(Input):
    request: TextInput = Field(max_length=8000)
    # Optional explicit assignment resolves ambiguous workspace roles.
    agents: dict[Literal["product", "marketing", "support"], UUID] | None = None

    @model_validator(mode="after")
    def complete_team(self):
        if self.agents is not None and set(self.agents) != {"product", "marketing", "support"}:
            raise ValueError("Assign product, marketing and support agents.")
        if self.agents and len(set(self.agents.values())) != 3:
            raise ValueError("Assign three distinct specialist agents.")
        return self


class ReviewIn(Input):
    action: Literal["approve", "request_changes", "reject"]
    feedback: str = Field(default="", max_length=4000)
    expected_revision: int = Field(ge=0)

    @model_validator(mode="after")
    def feedback_required(self):
        if self.action == "request_changes" and not self.feedback.strip():
            raise ValueError("Describe the changes needed.")
        return self


class Fact(Input):
    category: Literal["product", "feature", "pricing", "limitation", "policy", "other"]
    statement: str = Field(min_length=1, max_length=1500)
    document_ids: list[UUID] = Field(
        min_length=1,
        max_length=12,
        description="Document IDs actually returned by this turn's knowledge tools. No invented IDs.",
    )


class ProductFacts(Input):
    content: str = Field(
        min_length=1, max_length=14000, description="Product summary for the human reviewer."
    )
    facts: list[Fact] = Field(default_factory=list, max_length=40)
    missing: list[str] = Field(default_factory=list, max_length=30)
    contradictions: list[str] = Field(default_factory=list, max_length=30)
    note: str | None = Field(default=None, max_length=1000)


class Deliverable(Input):
    content: str = Field(min_length=1, max_length=16000)
    missing: list[str] = Field(default_factory=list, max_length=30)
    contradictions: list[str] = Field(default_factory=list, max_length=30)
    note: str | None = Field(default=None, max_length=1000)
