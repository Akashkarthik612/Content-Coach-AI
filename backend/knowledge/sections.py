"""Turn document text into a Section tree for the splitter.

Markdown `#`, `##` and `###` headings become nested sections whose prefix
(the heading line) is repeated in every chunk below it; deeper headings stay
in the content. A line is a heading only if it matches `^#{1,3} \\S` and sits
outside a fenced code block, so `# comment` in code and `#hashtag` don't
create sections. Concatenating prefixes and contents in order gives back the
input exactly.

The root prefix is `$title: <title>` only. Dust also puts $updatedAt and
authors there, which changes every chunk's hash on every edit and forces a
full re-embed; dates live in columns instead (Day_5.md, Improvement 1).
"""

import re
from dataclasses import dataclass, field

from backend.knowledge.records import Section

_HEADING = re.compile(r"^(#{1,3}) \S")
_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")


@dataclass
class _Node:
    level: int
    prefix: str | None
    content: list[str] = field(default_factory=list)
    children: list["_Node"] = field(default_factory=list)

    def freeze(self) -> Section:
        return Section(
            prefix=self.prefix,
            content="".join(self.content) or None,
            sections=[c.freeze() for c in self.children],
        )


def markdown_to_section(md: str) -> Section:
    root = _Node(level=0, prefix=None)
    stack = [root]
    fence: str | None = None  # the opening fence run while inside a code block

    for line in md.splitlines(keepends=True):
        fence_match = _FENCE.match(line)
        if fence is not None:
            # Closes on the same character, at least as long as the opener.
            if (
                fence_match
                and fence_match.group(1)[0] == fence[0]
                and len(fence_match.group(1)) >= len(fence)
            ):
                fence = None
            stack[-1].content.append(line)
            continue
        if fence_match:
            fence = fence_match.group(1)
            stack[-1].content.append(line)
            continue

        heading = _HEADING.match(line)
        if heading is None:
            stack[-1].content.append(line)
            continue
        level = len(heading.group(1))
        while stack[-1].level >= level:
            stack.pop()
        node = _Node(level=level, prefix=line if line.endswith("\n") else line + "\n")
        stack[-1].children.append(node)
        stack.append(node)

    return root.freeze()


def plain_to_section(text: str) -> Section:
    return Section(content=text or None)


def title_prefix(title: str) -> str:
    # A newline inside a title would end the prefix line early.
    return f"$title: {' '.join(title.split())}\n"


def render_document(title: str, body: Section) -> Section:
    return Section(prefix=title_prefix(title), sections=[body])


def section_text(section: Section) -> str:
    """The whole tree as one string (prefixes and contents in order). This is
    what content_hash() covers, so a rename counts as a change."""
    parts = [section.prefix or "", section.content or ""]
    parts.extend(section_text(s) for s in section.sections)
    return "".join(parts)
