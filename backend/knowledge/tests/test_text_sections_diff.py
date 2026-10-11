"""normalize/content_hash (U1-U2), Markdown sections (U3, U3b), the title-only
prefix (U9) and the multiset diff (U10). Unit tests: no DB."""

import uuid

from backend.knowledge.diff import build_diff
from backend.knowledge.records import ChunkText, Section, StoredChunkRef
from backend.knowledge.sections import markdown_to_section, render_document, section_text
from backend.knowledge.splitter import split
from backend.knowledge.text import content_hash, normalize

# ── U1, U2 ────────────────────────────────────────────────────────────────────


def test_normalize_cleans_and_is_idempotent():
    raw = "a\x00b  \r\nline\t\r\n\r\n\r\n\r\nend\ud800"
    once = normalize(raw)
    assert once == "ab\nline\n\nend?"
    assert normalize(once) == once


def test_hash_ignores_cosmetics_but_not_words():
    base = normalize("Hello world.\nSecond line.\n")
    assert content_hash(base) == content_hash(normalize("Hello world.   \r\nSecond line.\r\n"))
    assert content_hash(base) != content_hash(normalize("Hello there.\nSecond line.\n"))


# ── U3, U3b ───────────────────────────────────────────────────────────────────


def _shape(s: Section):
    return (s.prefix, s.content, [_shape(c) for c in s.sections])


def test_headings_nest_and_leading_text_is_kept():
    md = "intro\n# A\na\n## A1\na1\n### A1x\nx\n#### deep\nd\n## A2\na2\n# B\nb\n"
    assert _shape(markdown_to_section(md)) == (
        None,
        "intro\n",
        [
            (
                "# A\n",
                "a\n",
                [
                    ("## A1\n", "a1\n", [("### A1x\n", "x\n#### deep\nd\n", [])]),
                    ("## A2\n", "a2\n", []),
                ],
            ),
            ("# B\n", "b\n", []),
        ],
    )
    assert section_text(markdown_to_section(md)) == md  # lossless


def test_fenced_code_and_hashtags_are_not_headings():
    md = (
        "# Real\n```python\n# comment\n~~~\n# still code\n```\n#hashtag\n~~~~\n## in tilde fence\n~~~~\nend\n"
    )
    tree = markdown_to_section(md)
    assert len(tree.sections) == 1
    assert tree.sections[0].prefix == "# Real\n"
    assert tree.sections[0].sections == []
    assert section_text(tree) == md


# ── U9 ────────────────────────────────────────────────────────────────────────


def test_only_title_reaches_chunk_text_so_metadata_changes_keep_hashes():
    body = markdown_to_section("# A\nalpha\n# B\nbeta\n")
    first = [c.chunk_hash for c in split(render_document("Notes", body), 32)]
    # Same title and body, later "updatedAt"/author: nothing of that is in the
    # rendered text, so every hash is unchanged.
    again = [c.chunk_hash for c in split(render_document("Notes", body), 32)]
    assert first == again
    renamed = [c.chunk_hash for c in split(render_document("Notes v2", body), 32)]
    assert set(first).isdisjoint(renamed)


def test_title_newlines_cannot_break_the_prefix():
    assert render_document("a\nb", Section()).prefix == "$title: a b\n"


# ── U10 ───────────────────────────────────────────────────────────────────────


def _new(*hashes: str) -> list[ChunkText]:
    return [
        ChunkText(ordinal=i, heading=None, text=h, token_count=1, chunk_hash=h) for i, h in enumerate(hashes)
    ]


def _stored(*hashes: str) -> list[StoredChunkRef]:
    return [StoredChunkRef(id=uuid.uuid4(), chunk_hash=h, ordinal=i) for i, h in enumerate(hashes)]


def test_identical_keeps_everything():
    stored = _stored("h1", "h2", "h3")
    plan = build_diff(stored, _new("h1", "h2", "h3"))
    assert plan.keep == [r.id for r in stored]
    assert (plan.insert, plan.delete, plan.reorder) == ([], [], {})


def test_one_edited_chunk_is_one_insert_and_one_delete():
    stored = _stored("h1", "h2", "h3", "h4")
    plan = build_diff(stored, _new("h1", "h2x", "h3", "h4"))
    assert [c.chunk_hash for c in plan.insert] == ["h2x"]
    assert plan.delete == [stored[1].id]
    assert plan.reorder == {}


def test_reorder_keeps_rows_with_new_ordinals():
    stored = _stored("h1", "h2", "h3")
    plan = build_diff(stored, _new("h3", "h1", "h2"))
    assert plan.insert == [] and plan.delete == []
    assert plan.reorder == {stored[2].id: 0, stored[0].id: 1, stored[1].id: 2}


def test_duplicates_match_once_per_occurrence():
    stored = _stored("h", "h")
    plan = build_diff(stored, _new("h"))
    assert plan.keep == [stored[0].id]
    assert plan.delete == [stored[1].id]


def test_deleted_section_leaves_contiguous_ordinals():
    stored = _stored("h1", "h2", "h3", "h4")
    plan = build_diff(stored, _new("h1", "h2", "h4"))
    assert plan.delete == [stored[2].id]
    assert plan.reorder == {stored[3].id: 2}
