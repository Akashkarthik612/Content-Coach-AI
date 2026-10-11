"""Splitter: Dust's own base_v0 tests ported as golden tests (U4-U8), plus
Honne's invariants. Dust tests with OpenAI text-embedding-3, whose tokenizer
is cl100k_base, the same one used here. Unit tests: no DB."""

import pytest

from backend.knowledge.errors import PrefixTooLongError
from backend.knowledge.records import Section
from backend.knowledge.sections import markdown_to_section, render_document
from backend.knowledge.splitter import split, split_texts

S = Section


# ── Dust golden tests (core/src/data_sources/splitter.rs @ b92c73c) ───────────


def _plain(text: str, max_tokens: int, count: int) -> None:
    out = split_texts(S(content=text), max_tokens)
    assert "".join(out) == text
    assert len(out) == count


def test_one_utf8_char_maps_to_multiple_tokens():
    # '🔥' is 3 tokens; max 4 cuts mid-character and must slide back.
    _plain("🔥🔥", 4, 2)


@pytest.mark.parametrize(
    ("text", "count"),
    [
        ("a random document string with no double space" * 10, 12),
        ("a  random  document \nstring WITH double spaces" * 8, 12),
    ],
)
def test_basic_text(text, count):
    _plain(text, 8, count)


def test_sections_normal():
    section = S(
        prefix="# title\n",
        content="A line.\nAnother line.\n",
        sections=[
            S(prefix="# p1\n", content="A paragraph\nAnother paragraph.\n"),
            S(prefix="# p2 alone\n"),
        ],
    )
    assert split_texts(section, 18) == [
        "# title\nA line.\nAnother line.\n",
        "# title\n# p1\nA paragraph\nAnother paragraph.\n# p2 alone\n",
    ]


def _tree(p1_content: str | None, p0_content: str = "c0........") -> Section:
    return S(
        prefix="p",
        content="c..",
        sections=[
            S(
                prefix="p0",
                content=p0_content,
                sections=[S(content="c01......"), S(prefix="p02", content="c02....")],
            ),
            S(prefix="p1", content=p1_content, sections=[S(prefix="p10", content="c10........")]),
        ],
    )


def test_sections():
    assert split_texts(_tree("c1"), 12) == [
        "pc..",
        "pp0c0........c01......",
        "pp0p02c02....",
        "pp1c1p10c10........",
    ]


def test_sections_variant():
    assert split_texts(_tree(None), 12) == [
        "pc..",
        "pp0c0........c01......",
        "pp0p02c02....",
        "pp1p10c10........",
    ]


def test_sections_no_content():
    def node(p, *kids):
        return S(prefix=p, sections=list(kids))

    section = node(
        "p",
        node("p0", node("p01"), node("p02")),
        node("p1", node("p10")),
        node("p2", node("p21"), node("p22")),
        node("p3", node("p30")),
        node("p4", node("p40")),
        node("p5", node("p50")),
    )
    assert split_texts(section, 12) == ["pp0p01p02p1p10", "pp2p21p22p3p30", "pp4p40p5p50"]


def test_sections_long_content():
    long = (
        "c0........+-+-+-+-+-+-+-+-+-+-+-+-+-++-+-+-+-+-+-++-+-+-+-+-+-+-"
        "+-+-+-+-+-+-+-+-+-+-+-+-+-++-+-+-+-+-+-++-+-+-+-+-+-+-"
    )
    assert split_texts(_tree("c1", p0_content=long), 12) == [
        "pc..",
        "pp0c0........+-+-+-+-+-+-+-+-+-+-+-+-+-++-",
        "pp0+-+-+-+-+-++-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-",
        "pp0++-+-+-+-+-+-++-+-+-+-+-+-+-",
        "pp0c01......p02c02....",
        "pp1c1p10c10........",
    ]


def test_unaligned_content():
    assert split_texts(S(content="asdjqweiozclknasidjhqlkdnaljch\n"), 8) == [
        "asdjqweioz",
        "clknasidjh",
        "qlkdnaljch\n",
    ]


def test_bug_20231201_repeated_prefix_text_is_not_deduplicated():
    section = S(
        prefix="Thread in #brand [20230908 10:16]: Should we make a poster?...\n",
        sections=[
            S(prefix=">> @ed [20230908 10:16]:\n", content="Should we make a poster?\n"),
            S(prefix=">> @spolu [20230908 10:16]:\n", content=":100:\n"),
            S(prefix=">> @spolu [20230908 10:16]:\n", content='"Factory" :p\n'),
        ],
    )
    assert split_texts(section, 256) == [
        (
            "Thread in #brand [20230908 10:16]: Should we make a poster?...\n"
            ">> @ed [20230908 10:16]:\nShould we make a poster?\n"
            ">> @spolu [20230908 10:16]:\n:100:\n"
            '>> @spolu [20230908 10:16]:\n"Factory" :p\n'
        )
    ]


def test_bug_20240111_no_prefix_with_content_and_children():
    section = S(
        prefix="Ok a prefix\n",
        sections=[
            S(
                content="Then a section with no prefix, but content and children",
                sections=[S(prefix="Prefix1", content="Text1"), S(prefix="Prefix2", content="Text2")],
            )
        ],
    )
    assert split_texts(section, 256)


# ── Honne invariants ──────────────────────────────────────────────────────────


def test_prefixes_at_half_max_are_rejected():
    with pytest.raises(PrefixTooLongError):
        split(S(prefix="word " * 10, content="x"), 16)


def _long_doc() -> str:
    para = "Retrieval works better when every chunk keeps its heading context. " * 60
    return f"# Intro\n{para}\n## Setup\n{para}\n### Details\n{para}\n# Usage\n{para}\n"


def test_every_chunk_fits_and_carries_title_and_heading_path():
    chunks = split(render_document("Design notes", markdown_to_section(_long_doc())), 512)
    assert len(chunks) > 4
    for c in chunks:
        assert c.token_count <= 512
        assert c.text.startswith("$title: Design notes\n")
        assert c.heading
    assert {c.heading for c in chunks} >= {"Intro", "Intro > Setup", "Intro > Setup > Details", "Usage"}
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))


def test_whitespace_only_chunks_are_dropped():
    assert split(S(content="  \n\n \t\n"), 64) == []
