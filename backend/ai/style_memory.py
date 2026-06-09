"""
Style Memory lifecycle — window-based trigger, DB persistence, Redis cache.

PostgreSQL (user_style_memory) is the durable source of truth.
Redis is a read-through cache that re-warms automatically on any DB hit.

Window thresholds:
  Short-term: re-analyze every 3 new published posts (last 5 posts as input)
  Long-term:  re-analyze every 10 new published posts (last 20 posts as input)

Called as FastAPI BackgroundTask after save_version:
  sync_check_and_refresh_style_memory(user_id)
"""
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import func, text

from backend.core.cache import (
    _LT_STYLE_TTL,
    _ST_STYLE_TTL,
    style_lt_key,
    style_st_key,
    sync_get_json,
    sync_set_json,
    async_get,
    async_set,
    _TOOL_TTL,
)
from backend.core.database import SessionLocal
from backend.ai.style_analyzer import analyze_style

logger = logging.getLogger(__name__)

_ST_THRESHOLD = 3    # new published posts before re-running short-term analysis
_LT_THRESHOLD = 10   # new published posts before re-running long-term analysis
_ST_WINDOW    = 5    # last N published posts for short-term analysis input
_LT_WINDOW    = 20   # last N published posts for long-term analysis input


# ── Background task (sync) ────────────────────────────────────────────────────

def sync_check_and_refresh_style_memory(user_id: str) -> None:
    """
    Called as a FastAPI BackgroundTask after every save_version.

    Does one cheap COUNT query. Only fires the LLM analyzer when the window
    threshold is reached (every 3 posts for ST, every 10 for LT).
    On most saves this exits in < 10 ms with no LLM call.
    """
    try:
        with SessionLocal() as db:
            published_count = _count_published_posts(db, user_id)
            row = _read_db_memory(db, user_id)

        st_count = row["short_term_post_count"] if row else 0
        lt_count = row["long_term_post_count"]  if row else 0

        run_st = (published_count - st_count) >= _ST_THRESHOLD
        run_lt = (published_count - lt_count) >= _LT_THRESHOLD

        if not run_st and not run_lt:
            return  # nothing to do — fast exit

        # Fetch posts once for both analyses (LT window is larger)
        fetch_limit = _LT_WINDOW if run_lt else _ST_WINDOW
        with SessionLocal() as db:
            posts = _fetch_published_post_contents(db, user_id, limit=fetch_limit)

        if not posts:
            return

        new_lt: dict | None = None
        new_st: dict | None = None

        if run_lt and len(posts) >= _LT_THRESHOLD:
            new_lt = analyze_style(posts[:_LT_WINDOW])
            logger.info("Long-term style updated for user %s (%d posts)", user_id, published_count)

        if run_st:
            new_st = analyze_style(posts[:_ST_WINDOW])
            logger.info("Short-term style updated for user %s (%d posts)", user_id, published_count)

        _write_db_and_cache(user_id, new_lt, new_st, published_count, existing=row)

    except Exception:
        logger.exception("sync_check_and_refresh_style_memory failed for user %s", user_id)


# ── Async read (called from get_style_samples tool) ───────────────────────────

async def get_style_memory(user_id: str) -> dict | None:
    """
    Returns {"long_term": dict, "short_term": dict | None} or None if no memory exists.

    Check order: Redis → DB (repopulates Redis on hit) → None.
    Gracefully handles Redis being down — falls through to DB.
    """
    lt_key = style_lt_key(user_id)
    st_key = style_st_key(user_id)

    lt_raw = await async_get(lt_key)
    st_raw = await async_get(st_key)

    if lt_raw:
        return {
            "long_term":  json.loads(lt_raw),
            "short_term": json.loads(st_raw) if st_raw else None,
        }

    # Redis miss (cold start or eviction) — read from DB
    import asyncio
    row = await asyncio.to_thread(_read_db_memory, None, user_id)

    if not row or not row.get("long_term"):
        return None

    lt_dict = row["long_term"]
    st_dict = row.get("short_term")

    # Repopulate Redis cache
    await async_set(lt_key, json.dumps(lt_dict), ttl=_LT_STYLE_TTL)
    if st_dict:
        await async_set(st_key, json.dumps(st_dict), ttl=_ST_STYLE_TTL)

    return {"long_term": lt_dict, "short_term": st_dict}


def format_style_memory_for_writer(memory: dict) -> str:
    """
    Converts {"long_term": dict, "short_term": dict|None} into a compact text block
    suitable for injection into the writer's context window.
    """
    lines = ["## Established Writing Style (long-term patterns)\n"]
    for key, val in memory["long_term"].items():
        lines.append(f"{key.replace('_', ' ').title()}: {val}")

    if memory.get("short_term"):
        lines.append("\n## Recent Style Evolution (last 5 posts)\n")
        for key, val in memory["short_term"].items():
            lines.append(f"{key.replace('_', ' ').title()}: {val}")

    return "\n".join(lines)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _count_published_posts(db, user_id: str) -> int:
    from backend.vault.models import Post, PostStatus
    from uuid import UUID
    return (
        db.query(func.count(Post.id))
        .filter(Post.user_id == UUID(user_id), Post.status == PostStatus.published)
        .scalar()
        or 0
    )


def _fetch_published_post_contents(db, user_id: str, limit: int) -> list[str]:
    """Returns list of content strings, most recent first."""
    from backend.vault.models import Post, PostVersion, PostStatus
    from uuid import UUID
    rows = (
        db.query(PostVersion.content)
        .join(Post, Post.id == PostVersion.post_id)
        .filter(
            Post.user_id == UUID(user_id),
            Post.status == PostStatus.published,
            PostVersion.version_number == Post.current_version,
        )
        .order_by(Post.updated_at.desc())
        .limit(limit)
        .all()
    )
    return [r.content for r in rows if r.content]


def _read_db_memory(db, user_id: str) -> dict | None:
    """
    Reads user_style_memory row. Returns dict or None.
    If db is None, opens its own session (used from async context via to_thread).
    """
    if db is None:
        with SessionLocal() as session:
            return _read_db_memory(session, user_id)

    row = db.execute(
        text("""
            SELECT long_term, long_term_post_count,
                   short_term, short_term_post_count
            FROM user_style_memory
            WHERE user_id = :uid::uuid
        """),
        {"uid": user_id},
    ).fetchone()

    if row is None:
        return None

    return {
        "long_term":             row.long_term,
        "long_term_post_count":  row.long_term_post_count,
        "short_term":            row.short_term,
        "short_term_post_count": row.short_term_post_count,
    }


def _write_db_and_cache(
    user_id: str,
    new_lt: dict | None,
    new_st: dict | None,
    published_count: int,
    existing: dict | None,
) -> None:
    now = datetime.now(timezone.utc)

    with SessionLocal() as db:
        row = _read_db_memory(db, user_id)

        if row is None:
            # INSERT
            db.execute(
                text("""
                    INSERT INTO user_style_memory
                        (user_id,
                         long_term,  long_term_post_count,  long_term_updated_at,
                         short_term, short_term_post_count, short_term_updated_at)
                    VALUES (
                        :uid::uuid,
                        :lt::jsonb,  :lt_count,  :lt_at,
                        :st::jsonb,  :st_count,  :st_at
                    )
                """),
                {
                    "uid":      user_id,
                    "lt":       json.dumps(new_lt)  if new_lt  else None,
                    "lt_count": published_count      if new_lt  else 0,
                    "lt_at":    now                  if new_lt  else None,
                    "st":       json.dumps(new_st)  if new_st  else None,
                    "st_count": published_count      if new_st  else 0,
                    "st_at":    now                  if new_st  else None,
                },
            )
        else:
            # UPDATE only the columns that changed
            updates = {}
            params  = {"uid": user_id}
            if new_lt:
                updates["long_term"]             = ":lt::jsonb"
                updates["long_term_post_count"]  = ":lt_count"
                updates["long_term_updated_at"]  = ":lt_at"
                params.update({"lt": json.dumps(new_lt), "lt_count": published_count, "lt_at": now})
            if new_st:
                updates["short_term"]             = ":st::jsonb"
                updates["short_term_post_count"]  = ":st_count"
                updates["short_term_updated_at"]  = ":st_at"
                params.update({"st": json.dumps(new_st), "st_count": published_count, "st_at": now})

            if updates:
                set_clause = ", ".join(f"{col} = {expr}" for col, expr in updates.items())
                db.execute(
                    text(f"UPDATE user_style_memory SET {set_clause} WHERE user_id = :uid::uuid"),
                    params,
                )
        db.commit()

    # Update Redis only for the keys that changed
    if new_lt:
        sync_set_json(style_lt_key(user_id), new_lt, ttl=_LT_STYLE_TTL)
    if new_st:
        sync_set_json(style_st_key(user_id), new_st, ttl=_ST_STYLE_TTL)
