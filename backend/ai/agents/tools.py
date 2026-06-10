"""
LangChain @tool functions — the only place DB reads happen in the AI pipeline.

Every tool follows the same pattern:
  1. Check Redis cache  → return immediately on HIT
  2. Run DB / Gemini work
  3. Write result to Redis cache
  4. Return result

Cache is invalidated by vault/router.py on every save_version / create_post.

search_vault_posts additionally caches the query embedding vector so the
Gemini Embedding API is not called again for the same query text (24-h TTL).
"""
import asyncio
import json
import logging
from langchain_core.tools import tool
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from sqlalchemy import text
from uuid import UUID

logger = logging.getLogger(__name__)

from backend.core.config import settings
from backend.core.database import SessionLocal
from backend.core.cache import (
    async_get, async_set, async_get_json, async_set_json,
    tool_key, embed_key, query_hash,
    _TOOL_TTL,
)
from backend.vault.models import Post, PostPublishLog, PostStatus, PostTag, PostVersion

EMBEDDING_DIM = 768

# Query-side embedding client (task_type="retrieval_query" for asymmetric retrieval)
_embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    task_type="retrieval_query",
    output_dimensionality=EMBEDDING_DIM,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)


# ── Sync DB helpers (wrapped in asyncio.to_thread) ────────────────────────────

def _search_posts_sql(user_id: str, embedding_str: str) -> list:
    sql = text("""
        SELECT
            p.title,
            pe.content,
            pe.chunk_index,
            pe.embedding <=> (:embedding)::vector AS distance
        FROM post_embeddings pe
        JOIN posts p ON p.id = pe.post_id
        WHERE pe.user_id = (:user_id)::uuid
        ORDER BY distance ASC
        LIMIT 6
    """)
    with SessionLocal() as db:
        return db.execute(sql, {"embedding": embedding_str, "user_id": user_id}).fetchall()



def _fetch_style_samples_sql(uid: UUID, limit: int = 2) -> list:
    with SessionLocal() as db:
        return (
            db.query(Post, PostVersion)
            .join(
                PostVersion,
                (PostVersion.post_id == Post.id)
                & (PostVersion.version_number == Post.current_version),
            )
            .filter(Post.user_id == uid, Post.status == PostStatus.published)
            .order_by(Post.updated_at.desc())
            .limit(limit)
            .all()
        )


def _fetch_topic_inventory_sql(uid: UUID) -> tuple:
    with SessionLocal() as db:
        posts = (
            db.query(Post.title, Post.status, Post.created_at)
            .filter(Post.user_id == uid)
            .order_by(Post.created_at.desc())
            .all()
        )
        tags = (
            db.query(PostTag.tag)
            .join(Post, Post.id == PostTag.post_id)
            .filter(Post.user_id == uid)
            .distinct()
            .order_by(PostTag.tag)
            .all()
        )
    return posts, tags


def _fetch_post_analytics_sql(uid: UUID) -> list:
    # One row per post (latest publish event). Includes 150-char preview so the
    # analytics node can summarise post content alongside metrics.
    sql = text("""
        SELECT DISTINCT ON (p.id)
            p.title,
            p.status::text                  AS status,
            p.created_at::date              AS created_date,
            ppl.platform,
            ppl.published_at::date          AS published_date,
            pv.char_count,
            LEFT(pv.content, 150)           AS content_preview,
            COALESCE(pa.impressions, 0)     AS impressions,
            COALESCE(pa.reactions,   0)     AS reactions
        FROM posts p
        LEFT JOIN post_publish_log ppl ON ppl.post_id = p.id
        LEFT JOIN post_versions    pv  ON pv.id        = ppl.version_id
        LEFT JOIN post_analytics   pa  ON pa.post_id   = p.id
        WHERE p.user_id = (:user_id)::uuid
        ORDER BY p.id, ppl.published_at DESC NULLS LAST
    """)
    with SessionLocal() as db:
        return db.execute(sql, {"user_id": str(uid)}).fetchall()


def _fetch_publish_history_sql(uid: UUID) -> list:
    with SessionLocal() as db:
        return (
            db.query(
                Post.title,
                PostPublishLog.platform,
                PostPublishLog.published_at,
                PostVersion.char_count,
                PostVersion.change_summary,
            )
            .join(Post, Post.id == PostPublishLog.post_id)
            .join(PostVersion, PostVersion.id == PostPublishLog.version_id)
            .filter(Post.user_id == uid)
            .order_by(PostPublishLog.published_at.desc())
            .limit(50)
            .all()
        )


# ── Tools ─────────────────────────────────────────────────────────────────────

@tool
async def search_vault_posts(user_id: str, query: str) -> str:
    """Search the user's post vault for posts relevant to the query.
    Uses pgvector semantic search on post_embeddings; falls back to recent posts if fewer than 2 vector hits exist."""
    logger.debug("search_vault_posts: user_id=%s query_len=%d", user_id, len(query))
    if not query or not query.strip():
        return "[NO_CONTEXT_FOUND: empty search query]"

    ck = tool_key("search_vault_posts", user_id, query_hash(query))

    # 1. Tool result cache
    cached = await async_get(ck)
    if cached:
        logger.debug("search_vault_posts cache hit: user_id=%s", user_id)
        return cached

    # 2. Embedding cache — avoids Gemini API call for repeated query text
    ek = embed_key(query)
    embedding_vec: list[float] | None = await async_get_json(ek)
    if embedding_vec is None:
        embedding_vec = await asyncio.to_thread(_embeddings.embed_query, query)
        await async_set_json(ek, embedding_vec)

    embedding_str = "[" + ",".join(f"{v:.8f}" for v in embedding_vec) + "]"

    # 3. Vector search
    rows = await asyncio.to_thread(_search_posts_sql, user_id, embedding_str)
    logger.debug("search_vault_posts: %d vector results for user_id=%s", len(rows), user_id)

    if rows:
        lines = ["## Semantic Search Results\n"]
        for title, content, chunk_index, distance in rows:
            lines.append(f"### {title}  (chunk {chunk_index}, distance: {distance:.4f})")
            lines.append(content or "")
            lines.append("")
        result = "\n".join(lines)
    else:
        result = "[NO_CONTEXT_FOUND: no relevant posts found — write and save more posts to improve search results]"

    await async_set(ck, result, ttl=_TOOL_TTL)
    return result


@tool
async def get_style_samples(user_id: str) -> str:
    """Fetch the user's compressed style memory (long-term DNA + recent evolution) to guide the ghostwriter.
    Falls back to 2 raw published posts when no style memory has been generated yet."""
    logger.debug("get_style_samples: user_id=%s", user_id)
    ck = tool_key("get_style_samples", user_id)
    cached = await async_get(ck)
    if cached:
        logger.debug("get_style_samples cache hit: user_id=%s", user_id)
        return cached

    from backend.ai.style_memory import get_style_memory, format_style_memory_for_writer

    memory = await get_style_memory(user_id)

    if memory:
        result = format_style_memory_for_writer(memory)
    else:
        # Cold-start: style memory not yet generated (user hasn't reached threshold).
        # Use 2 most recent published posts as a minimal fallback.
        uid  = UUID(user_id)
        rows = await asyncio.to_thread(_fetch_style_samples_sql, uid, 2)
        logger.info("get_style_samples cold-start fallback: user_id=%s raw_posts=%d", user_id, len(rows))

        if not rows:
            result = "[NO_CONTEXT_FOUND: no published posts yet — cannot replicate writing style]"
        else:
            lines = ["## Writing Style Samples (cold-start — style memory not yet generated)\n"]
            for i, (post, version) in enumerate(rows, 1):
                char_note = f"{version.char_count} chars" if version.char_count else ""
                lines.append(f"### Sample {i} — {post.title}  ({char_note})")
                lines.append(version.content or "")
                lines.append("")
            result = "\n".join(lines)

    await async_set(ck, result, ttl=_TOOL_TTL)
    return result


@tool
async def get_topic_inventory(user_id: str) -> str:
    """Get all post titles and tags from the user's vault to identify content gaps and suggest new topics.
    Returns a structured list of every post and all distinct tags used."""
    logger.debug("get_topic_inventory: user_id=%s", user_id)
    ck = tool_key("get_topic_inventory", user_id)
    cached = await async_get(ck)
    if cached:
        return cached

    uid         = UUID(user_id)
    posts, tags = await asyncio.to_thread(_fetch_topic_inventory_sql, uid)
    logger.debug("get_topic_inventory: post_count=%d user_id=%s", len(posts), user_id)

    if not posts:
        result = "[NO_CONTEXT_FOUND: no posts in vault yet]"
    else:
        lines = ["## Topic Inventory\n", "### All Post Titles"]
        for title, status, created_at in posts:
            lines.append(f"- {title}  (status: {status.value}, created: {created_at:%Y-%m-%d})")
        lines.append("\n### All Tags Used")
        lines.append(", ".join(row.tag for row in tags) if tags else "(none tagged)")
        result = "\n".join(lines)

    await async_set(ck, result, ttl=_TOOL_TTL)
    return result


@tool
async def get_post_analytics(user_id: str) -> str:
    """Fetch all posts with performance metrics (impressions, reactions), publish history,
    and a short content preview. Use for any analytics, performance, or posting pattern questions."""
    logger.debug("get_post_analytics: user_id=%s", user_id)
    ck = tool_key("get_post_analytics", user_id)
    cached = await async_get(ck)
    if cached:
        return cached

    uid  = UUID(user_id)
    rows = await asyncio.to_thread(_fetch_post_analytics_sql, uid)
    logger.debug("get_post_analytics: row_count=%d user_id=%s", len(rows), user_id)

    if not rows:
        result = "[NO_ANALYTICS_CONTEXT: no posts found yet]"
    else:
        lines = [
            "## Post Analytics\n",
            "| Title | Status | Published | Platform | Chars | Impressions | Reactions | Preview |",
            "|---|---|---|---|---|---|---|---|",
        ]
        for title, status, created_date, platform, published_date, char_count, content_preview, impressions, reactions in rows:
            pub     = str(published_date) if published_date else f"draft ({created_date})"
            plat    = platform or "—"
            chars   = str(char_count) if char_count else "—"
            preview = (content_preview or "").replace("\n", " ").replace("|", "/")
            lines.append(
                f"| {title} | {status} | {pub} | {plat} | {chars} | {impressions} | {reactions} | {preview} |"
            )
        result = "\n".join(lines)

    await async_set(ck, result, ttl=_TOOL_TTL)
    return result


@tool
async def analyze_publish_history(user_id: str) -> str:
    """Fetch the user's full publish history (platform, date, char count, change summaries) for engagement analysis.
    Use this to answer questions about posting patterns, optimal times, and performance trends."""
    ck = tool_key("analyze_publish_history", user_id)
    cached = await async_get(ck)
    if cached:
        return cached

    uid  = UUID(user_id)
    rows = await asyncio.to_thread(_fetch_publish_history_sql, uid)

    if not rows:
        result = "[NO_ANALYTICS_CONTEXT: no published posts in log yet]"
    else:
        lines = [
            "## Publish History\n",
            "| Title | Platform | Published | Chars | Change Summary |",
            "|---|---|---|---|---|",
        ]
        for title, platform, published_at, char_count, change_summary in rows:
            chars   = str(char_count) if char_count else "—"
            summary = (change_summary or "—")[:60]
            lines.append(
                f"| {title} | {platform} | {published_at:%Y-%m-%d} | {chars} | {summary} |"
            )
        result = "\n".join(lines)

    await async_set(ck, result, ttl=_TOOL_TTL)
    return result
