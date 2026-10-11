"""Text cleanup and hashing. Pure functions.

normalize() makes cosmetic differences (line endings, trailing spaces, extra
blank lines) disappear, so content_hash() changes only when the words do.
"""

import hashlib
import re

_TRAILING_SPACE = re.compile(r"[ \t]+$", re.MULTILINE)
_EXTRA_BLANK_LINES = re.compile(r"\n{3,}")


def normalize(text: str) -> str:
    """Strip NUL (Postgres TEXT rejects it) and lone surrogates (psycopg can't
    encode them; pypdf sometimes emits them), unify newlines, drop trailing
    spaces per line, collapse 3+ newlines to 2. Idempotent."""
    text = text.replace("\x00", "")
    text = text.encode("utf-8", "replace").decode("utf-8")  # lone surrogate -> "?"
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _TRAILING_SPACE.sub("", text)
    return _EXTRA_BLANK_LINES.sub("\n\n", text)


def content_hash(text: str) -> str:
    """sha256 hex. Callers pass already-normalized text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
