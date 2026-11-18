"""Native Docs text/style requests. Indices use Google's UTF-16 code units."""

from markdown_it import MarkdownIt

from backend.ai.tools.sources import source_key

parser = MarkdownIt("commonmark", {"html": False})


def units(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def inline(value: str):
    text = ""
    styles = []
    opened = {}
    for token in parser.parseInline(value)[0].children or []:
        if token.type in ("strong_open", "em_open", "link_open"):
            opened[token.type.split("_")[0]] = (units(text), token.attrGet("href"))
        elif token.type in ("strong_close", "em_close", "link_close"):
            key = token.type.split("_")[0]
            start, href = opened.pop(key, (units(text), None))
            style = {"bold": True} if key == "strong" else {"italic": True}
            if key == "link":
                if not (href or "").startswith(("https://", "http://")):
                    continue
                style = {"link": {"url": href}}
            if units(text) > start:
                styles.append((start, units(text), style))
        elif token.type == "code_inline":
            start = units(text)
            text += token.content
            styles.append((start, units(text), {"weightedFontFamily": {"fontFamily": "Courier New"}}))
        elif token.type in ("softbreak", "hardbreak"):
            text += "\n"
        elif token.type == "image":
            text += token.content
        else:
            text += token.content
    return text, styles


def render_report(payload: dict, sources: list[dict]):
    """A plain-text report plus atomic insert/style operations, no executable input."""
    source_map = {source_key(source): source for source in sources}
    referenced = []
    for block in payload["blocks"]:
        for key in block.get("source_ids", []):
            if key not in source_map:
                raise ValueError("unknown_source_reference")
            if key not in referenced:
                referenced.append(key)
    labels = {key: str(i + 1) for i, key in enumerate(referenced)}
    blocks = [{"type": "title", "text": payload["title"]}, *payload["blocks"]]
    if referenced:
        blocks.append({"type": "heading", "text": "Sources", "level": 1})
        for key in referenced:
            source = source_map[key]
            title = source["title"].replace("\n", " ")
            url = source.get("url") or ""
            # Source labels are verbatim, not interpreted as Markdown.
            blocks.append(
                {
                    "type": "source",
                    "text": f"[{labels[key]}] {title}" + (f" — {url}" if url else ""),
                    "url": url,
                }
            )
    text = ""
    requests = []
    for block in blocks:
        start = 1 + units(text)
        content, spans = (block["text"], []) if block["type"] == "source" else inline(block["text"])
        if block["type"] == "source" and block.get("url", "").startswith(("https://", "http://")):
            spans.append(
                (units(content[: -len(block["url"])]), units(content), {"link": {"url": block["url"]}})
            )
        refs = " ".join(f"[{labels[key]}]" for key in dict.fromkeys(block.get("source_ids", [])))
        content += f" {refs}" if refs else ""
        text += content + "\n"
        end = 1 + units(text)
        block_range = {"startIndex": start, "endIndex": end}
        if block["type"] in ("title", "heading"):
            style = "TITLE" if block["type"] == "title" else f"HEADING_{block.get('level', 1)}"
            requests.append(
                {
                    "updateParagraphStyle": {
                        "range": block_range,
                        "paragraphStyle": {"namedStyleType": style},
                        "fields": "namedStyleType",
                    }
                }
            )
            size = 24 if block["type"] == "title" else {1: 18, 2: 15, 3: 13}[block.get("level", 1)]
            requests.append(
                {
                    "updateTextStyle": {
                        "range": block_range,
                        "textStyle": {"bold": True, "fontSize": {"magnitude": size, "unit": "PT"}},
                        "fields": "bold,fontSize",
                    }
                }
            )
        elif block["type"] in ("bullet", "numbered"):
            preset = (
                "BULLET_DISC_CIRCLE_SQUARE" if block["type"] == "bullet" else "NUMBERED_DIGIT_ALPHA_ROMAN"
            )
            requests.append({"createParagraphBullets": {"range": block_range, "bulletPreset": preset}})
        for left, right, style in spans:
            requests.append(
                {
                    "updateTextStyle": {
                        "range": {"startIndex": start + left, "endIndex": start + right},
                        "textStyle": style,
                        "fields": ",".join(style),
                    }
                }
            )
    base = {
        "updateTextStyle": {
            "range": {"startIndex": 1, "endIndex": 1 + units(text)},
            "textStyle": {
                "weightedFontFamily": {"fontFamily": "Arial"},
                "fontSize": {"magnitude": 11, "unit": "PT"},
            },
            "fields": "weightedFontFamily,fontSize",
        }
    }
    return text, [{"insertText": {"location": {"index": 1}, "text": text}}, base, *requests]
