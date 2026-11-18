"""Validated content only. Credentials, tenant IDs and output URLs are server-owned."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ReportBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["heading", "paragraph", "bullet", "numbered"] = "paragraph"
    text: str = Field(min_length=1, max_length=6000)
    level: int = Field(default=1, ge=1, le=3)
    source_ids: list[str] = Field(default_factory=list, max_length=12)


class CreateGoogleDoc(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=160)
    blocks: list[ReportBlock] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def bounded_document(self):
        if not self.title.strip() or any(not block.text.strip() for block in self.blocks):
            raise ValueError("Document title and blocks must contain text.")
        if sum(len(block.text) for block in self.blocks) > 50000:
            raise ValueError("Keep the report under 50,000 characters.")
        return self


class WebSearch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=500)
    time_range: Literal["day", "week", "month", "year"] | None = None
    include_domains: list[str] = Field(default_factory=list, max_length=5)
