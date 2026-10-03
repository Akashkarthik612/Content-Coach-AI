from pydantic import BaseModel, ConfigDict


class TemplateFormat(BaseModel):
    model_config = ConfigDict(extra="allow")

    paragraphs:   str
    spacing:      str
    bullets:      bool | str          # bool for structured templates, "AI-selected" for ai_decides
    bullet_count: str | None = None
    emojis:       bool | str          # bool, or "style-dependent" for ai_decides
    formatting:   str


class TemplateDefinition(BaseModel):
    id:        str
    name:      str
    purpose:   str
    structure: list[str] | str        # stage names, or "AI-selected" for ai_decides
    format:    TemplateFormat
    opening:   str
    body:      str
    ending:    str
    avoid:     list[str] = []
