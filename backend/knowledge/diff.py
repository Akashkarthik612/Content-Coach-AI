"""Diff stored chunks against a document's new chunks. Pure function.

Multiset match by hash in document order: each new chunk takes the first
unused stored row with the same hash (kept: same row, same vector, maybe a
new ordinal), otherwise it must be embedded and inserted. Stored rows left
unused are deleted. A repeated paragraph is matched once per occurrence, so
[h, h] -> [h] keeps one row and deletes the other.
"""

from collections import defaultdict, deque

from backend.knowledge.records import ChunkText, DiffPlan, StoredChunkRef


def build_diff(stored: list[StoredChunkRef], new: list[ChunkText]) -> DiffPlan:
    by_hash: dict[str, deque[StoredChunkRef]] = defaultdict(deque)
    for ref in sorted(stored, key=lambda r: r.ordinal):
        by_hash[ref.chunk_hash].append(ref)

    plan = DiffPlan()
    for chunk in new:
        rows = by_hash.get(chunk.chunk_hash)
        if rows:
            ref = rows.popleft()
            plan.keep.append(ref.id)
            if ref.ordinal != chunk.ordinal:
                plan.reorder[ref.id] = chunk.ordinal
        else:
            plan.insert.append(chunk)
    plan.delete.extend(ref.id for rows in by_hash.values() for ref in rows)
    return plan
