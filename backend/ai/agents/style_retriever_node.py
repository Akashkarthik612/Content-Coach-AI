"""
Style Retriever Node — LLM node, authoritative style management for the write pipeline.

Responsibility:
  1. Read style JSON from Redis/DB (fast path — usually a cache hit)
  2. If NO style exists: fetch user's published posts, run LLM style analysis on-demand
  3. If style EXISTS but may be stale: fire refresh as a non-blocking background task,
     return current cached JSON immediately to keep write pipeline latency low
  4. Set state["style_json"] = {"long_term": {...}, "short_term": {...}|None}
"""
import asyncio
import logging
from uuid import UUID

from sqlalchemy import func

from backend.ai.worker_states import StyleRetrieverState
from backend.ai.style_memory import (
    get_style_memory,
    sync_check_and_refresh_style_memory,
    _write_db_and_cache,
)
from backend.ai.style_analyzer import analyze_style
from backend.core.database import SessionLocal
from backend.vault.models import Post, PostStatus, PostVersion

logger = logging.getLogger(__name__)


def _fetch_posts_and_count(user_id: str, limit: int) -> tuple[list[str], int]:
    """Fetch published post contents + total published count in one DB session."""
    uid = UUID(user_id)
    with SessionLocal() as db:
        count = (
            db.query(func.count(Post.id))
            .filter(Post.user_id == uid, Post.status == PostStatus.published)
            .scalar() or 0
        )
        rows = (
            db.query(PostVersion.content)
            .join(Post, Post.id == PostVersion.post_id)
            .filter(
                Post.user_id == uid,
                Post.status == PostStatus.published,
                PostVersion.version_number == Post.current_version,
            )
            .order_by(Post.updated_at.desc())
            .limit(limit)
            .all()
        )
    return [r.content for r in rows if r.content], count


async def style_retriever_node(state: StyleRetrieverState) -> dict:
    user_id = state["user_id"]
    logger.debug("style_retriever_node invoked: user_id=%s", user_id)

    memory = await get_style_memory(user_id)

    if memory is None:
        # No style data at all — run LLM analysis now before writer proceeds
        logger.info("style_retriever_node: no style memory — running on-demand analysis")
        posts, published_count = await asyncio.to_thread(_fetch_posts_and_count, user_id, 20)

        if not posts:
            logger.info("style_retriever_node: no published posts yet — cold-start")
            return {"style_json": {}}

        lt_dict = await asyncio.to_thread(analyze_style, posts[:20])
        st_dict = await asyncio.to_thread(analyze_style, posts[:5]) if len(posts) >= 5 else None

        await asyncio.to_thread(
            _write_db_and_cache, user_id, lt_dict, st_dict, published_count, None
        )
        logger.info("style_retriever_node: analysis complete, post_count=%d", len(posts))
        return {"style_json": {"long_term": lt_dict, "short_term": st_dict}}

    # Style exists — fire staleness check in background, return cached JSON now
    asyncio.ensure_future(asyncio.to_thread(sync_check_and_refresh_style_memory, user_id))
    logger.debug("style_retriever_node: returning cached style_json, stale-check fired")
    return {"style_json": memory}
