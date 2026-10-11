"""How filtered vector search stays complete on one global HNSW graph.

Dust gives each tenant its own HNSW graph (Qdrant `m=0, payload_m=16`).
pgvector has one graph for every user, so a plain index scan takes the global
top `ef_search` (40) neighbours and only then filters by user: if other users'
chunks are closer, a user can get fewer than k results, or none.

- pgvector >= 0.8 ("iterative"): `hnsw.iterative_scan = relaxed_order` keeps
  scanning the graph until the filtered LIMIT is met; the outer query re-sorts.
- older ("exact"): index scans are turned off for the query, so the planner
  scans the user's rows exactly. Fine for small per-user corpora.

The version is read once (at startup, or lazily on the first search) and the
chosen mode is logged; there is no silent fallback.
"""

import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

ITERATIVE = "iterative"
EXACT = "exact"
_ITERATIVE_SCAN_SINCE = (0, 8)

_mode: str | None = None


def _parse(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split(".") if part.isdigit())


def detect_search_mode(db: Session) -> str:
    global _mode
    if _mode is None:
        version = db.execute(
            text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
        ).scalar_one_or_none()
        if version is None:
            raise RuntimeError("pgvector extension is not installed; knowledge search cannot run")
        _mode = ITERATIVE if _parse(version) >= _ITERATIVE_SCAN_SINCE else EXACT
        logger.info("Knowledge search mode: %s (pgvector %s)", _mode, version)
    return _mode


def scan_settings(mode: str) -> str:
    """The SET LOCAL statement for a search transaction. LOCAL, never plain
    SET: behind Supabase's transaction pooler a session setting would leak to
    whoever gets the connection next."""
    if mode == ITERATIVE:
        return "SET LOCAL hnsw.iterative_scan = relaxed_order"
    return "SET LOCAL enable_indexscan = off"
