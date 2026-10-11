# Adapted from dust-tt/dust (MIT License, Copyright (c) 2022 Stanislas Polu)
# core/src/data_sources/splitter.rs at b92c73c0a5a9e36de668e0b9377f3ccf6749a082
"""Dust's base_v0 splitter, ported to Python.

1. Tokenize the Section tree. Each node's prefixes (its own heading plus every
   ancestor's) must take less than half of max_tokens. Content that doesn't fit
   next to its prefixes is cut into balanced pieces (split_text), and content
   on a node with a prefix or children is moved into a leaf child, so every
   piece of content is a leaf that fits in one chunk.
2. Chunk: a subtree that fits becomes one chunk (its prefixes written once,
   then the contents in order). A subtree that doesn't fit greedily merges
   consecutive small children into chunks and recurses into big ones.

So every chunk carries its heading path, and small sibling sections share a
chunk instead of producing tiny ones. Whitespace-only chunks are dropped.
"""

from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

import tiktoken

from backend.knowledge.errors import PermanentFileError, PrefixTooLongError
from backend.knowledge.records import ChunkText, Section
from backend.knowledge.text import content_hash

# How far decode may slide back to find a valid UTF-8 boundary.
_MAX_ERROR_SLIDE = 4
_TITLE_PREFIX = "$title:"


class Tokenizer(Protocol):
    def encode(self, text: str) -> list[int]: ...

    def decode(self, tokens: list[int]) -> str:
        """Strict: raises ValueError if the tokens end mid-character."""
        ...


class TiktokenTokenizer:
    """cl100k_base, the tokenizer Dust's own splitter tests use. Gemini has no
    local tokenizer; 512 cl100k tokens is far below its 8,192 input limit."""

    def __init__(self, encoding: str = "cl100k_base") -> None:
        self._enc = tiktoken.get_encoding(encoding)

    def encode(self, text: str) -> list[int]:
        # Text like "<|endoftext|>" in a user's document is just text.
        return self._enc.encode(text, disallowed_special=())

    def decode(self, tokens: list[int]) -> str:
        return self._enc.decode_bytes(tokens).decode("utf-8")  # UnicodeDecodeError is a ValueError


@lru_cache
def default_tokenizer() -> TiktokenTokenizer:
    return TiktokenTokenizer()


@dataclass
class _TokText:
    text: str
    tokens: list[int]


def _decode_with_remainder(tok: Tokenizer, chunk: list[int]) -> tuple[str, list[int], list[int]]:
    """Decode the longest prefix of `chunk` that is valid UTF-8; the rest is
    the remainder (one emoji can span several tokens)."""
    end = len(chunk)
    while end > 0:
        if len(chunk) - end > _MAX_ERROR_SLIDE:
            break
        try:
            return tok.decode(chunk[:end]), chunk[:end], chunk[end:]
        except ValueError:
            end -= 1
    raise PermanentFileError("could not tokenize the document")


def _split_text(tok: Tokenizer, max_size: int, text: str) -> list[_TokText]:
    """Pieces of at most max_size tokens, balanced so there's no tiny tail."""
    encoded = tok.encode(text)
    target = len(encoded) // (len(encoded) // max_size + 1)
    splits: list[_TokText] = []
    while encoded:
        size = min(target, len(encoded))
        decoded, chunk, remainder = _decode_with_remainder(tok, encoded[:size])
        size -= len(remainder)
        splits.append(_TokText(decoded, chunk))
        if size == 0:
            raise PermanentFileError("could not tokenize the document")
        encoded = encoded[size:]
    return splits


Prefixes = list[tuple[str, _TokText]]  # (tree path, prefix): path keeps repeated headings apart


@dataclass
class _TokenizedSection:
    max_size: int
    prefixes: Prefixes
    tokens_count: int  # tokens to render the whole node, prefixes included
    content: _TokText | None
    sections: list["_TokenizedSection"]

    @classmethod
    def build(
        cls, tok: Tokenizer, max_size: int, prefixes: Prefixes, section: Section, path: str = ""
    ) -> "_TokenizedSection":
        prefix = _TokText(section.prefix, tok.encode(section.prefix)) if section.prefix is not None else None
        content = (
            _TokText(section.content, tok.encode(section.content)) if section.content is not None else None
        )

        prefixes = list(prefixes)
        if prefix is not None:
            prefixes.append((path, prefix))
        prefixes_count = sum(len(p.tokens) for _, p in prefixes)
        if prefixes_count >= max_size // 2:
            raise PrefixTooLongError("headings take half the chunk size or more")

        sections: list[_TokenizedSection] = []
        # Content becomes leaf children (no prefix of their own) when the node
        # also has a prefix or children, or when it doesn't fit.
        if content is not None and (
            len(content.tokens) + prefixes_count > max_size or section.sections or prefix is not None
        ):
            effective = max_size - prefixes_count
            splits = (
                _split_text(tok, effective, content.text) if len(content.tokens) > effective else [content]
            )
            sections.extend(
                cls(max_size, list(prefixes), prefixes_count + len(t.tokens), t, []) for t in splits
            )
            content = None

        sections.extend(
            cls.build(tok, max_size, prefixes, s, f"{path}/{i}") for i, s in enumerate(section.sections)
        )

        if content is not None:
            tokens_count = prefixes_count + len(content.tokens)
        else:
            # Children each count the shared prefixes; a merged chunk writes them once.
            tokens_count = (
                prefixes_count + sum(s.tokens_count for s in sections) - len(sections) * prefixes_count
            )
        return cls(max_size, prefixes, tokens_count, content, sections)

    def _dfs(self) -> list["_TokenizedSection"]:
        out = [self]
        for s in self.sections:
            out.extend(s._dfs())
        return out

    def _chunk(self) -> tuple[_TokText, Prefixes]:
        """Materialize this subtree as one chunk. Also returns the heading
        path of its first content node (for the chunk's `heading` column)."""
        seen: set[str] = set()
        text: list[str] = []
        tokens: list[int] = []
        heading_prefixes: Prefixes | None = None
        nodes = self._dfs()
        for node in nodes:
            for path, p in node.prefixes:
                if path not in seen:
                    seen.add(path)
                    tokens.extend(p.tokens)
                    text.append(p.text)
            if node.content is not None:
                tokens.extend(node.content.tokens)
                text.append(node.content.text)
                if heading_prefixes is None:
                    heading_prefixes = node.prefixes
        return _TokText("".join(text), tokens), heading_prefixes or nodes[-1].prefixes

    def chunks(self) -> list[tuple[_TokText, Prefixes]]:
        if self.tokens_count <= self.max_size:
            chunk = self._chunk()
            assert len(chunk[0].tokens) == self.tokens_count <= self.max_size
            return [chunk]

        assert self.content is None
        prefixes_count = sum(len(p.tokens) for _, p in self.prefixes)
        results: list[tuple[_TokText, Prefixes]] = []
        selection: list[_TokenizedSection] = []
        selection_count = prefixes_count

        def flush() -> None:
            nonlocal selection, selection_count
            if selection:
                merged = _TokenizedSection(
                    self.max_size, list(self.prefixes), selection_count, None, selection
                )
                results.extend(merged.chunks())
                selection = []
                selection_count = prefixes_count

        for s in self.sections:
            if s.tokens_count > self.max_size:
                # Too big to merge with anything: flush, then split it on its own.
                flush()
                results.extend(s.chunks())
            elif selection_count + s.tokens_count - prefixes_count <= self.max_size:
                selection_count += s.tokens_count - prefixes_count
                selection.append(s)
            else:
                flush()
                selection_count += s.tokens_count - prefixes_count
                selection.append(s)
        flush()
        return results


def _heading(prefixes: Prefixes) -> str | None:
    """ "Intro > Setup" from the chunk's heading prefixes; the title is a column already."""
    parts = [p.text.strip().lstrip("#").strip() for _, p in prefixes if not p.text.startswith(_TITLE_PREFIX)]
    parts = [p for p in parts if p]
    return " > ".join(parts) or None


def split_texts(section: Section, max_tokens: int, tokenizer: Tokenizer | None = None) -> list[str]:
    """Chunk texts only, exactly as Dust's splitter returns them (golden tests)."""
    return [c.text for c in split(section, max_tokens, tokenizer)]


def split(section: Section, max_tokens: int, tokenizer: Tokenizer | None = None) -> list[ChunkText]:
    tok = tokenizer or default_tokenizer()
    tree = _TokenizedSection.build(tok, max_tokens, [], section)
    out: list[ChunkText] = []
    for chunk, prefixes in tree.chunks():
        if not chunk.text.strip():
            continue
        out.append(
            ChunkText(
                ordinal=len(out),
                heading=_heading(prefixes),
                text=chunk.text,
                token_count=len(chunk.tokens),
                chunk_hash=content_hash(chunk.text),
            )
        )
    return out
