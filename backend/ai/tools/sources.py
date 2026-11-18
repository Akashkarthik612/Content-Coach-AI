"""Shared provenance helpers; legacy document-only snapshots remain valid."""

from uuid import UUID


def source_key(source: dict) -> str:
    return str(source.get("source_id") or source.get("document_id") or "")


def source_json(source) -> dict:
    result = {
        "document_id": str(source.document_id) if source.document_id else None,
        "title": source.title,
        "url": source.url,
    }
    if source.kind == "web":
        result.update(
            source_id=source.source_id, type="web", retrieved_at=source.retrieved_at, excerpt=source.excerpt
        )
    return result


def sources_allowed(sources: list[dict], allowed: set[UUID], enabled_tools=()) -> bool:
    for source in sources:
        if source.get("type") == "web":
            if "web_search" not in enabled_tools:
                return False
        else:
            try:
                if UUID(str(source.get("document_id"))) not in allowed:
                    return False
            except (ValueError, TypeError):
                return False
    return True


def fact_keys(fact: dict) -> set[str]:
    return {str(value) for value in [*fact.get("document_ids", []), *fact.get("source_ids", [])]}
