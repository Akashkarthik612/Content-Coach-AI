from backend.ai.templates.data import TEMPLATE_DEFINITIONS
from backend.ai.templates.schemas import TemplateDefinition


class TemplateService:
    """Resolves a template id into its validated JSON structure and normalizes
    it into the plain dict writer_node reads. Static in-memory data — no DB,
    no caching, mirrors LinkedInConnectService's static-method shape."""

    @staticmethod
    def get_template(template_id: str) -> TemplateDefinition | None:
        raw = TEMPLATE_DEFINITIONS.get(template_id)
        return TemplateDefinition.model_validate(raw) if raw else None

    @staticmethod
    def list_ids() -> list[str]:
        return list(TEMPLATE_DEFINITIONS.keys())

    @staticmethod
    def to_writer_shape(template: TemplateDefinition) -> dict:
        return template.model_dump()
