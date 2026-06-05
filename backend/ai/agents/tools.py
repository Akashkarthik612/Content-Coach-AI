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
from langchain_core.tools import tool
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from sqlalchemy import text
from uuid import UUID

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


def _fetch_recent_posts(uid: UUID) -> list:
    with SessionLocal() as db:
        return (
            db.query(Post, PostVersion)
            .join(
                PostVersion,
                (PostVersion.post_id == Post.id)
                & (PostVersion.version_number == Post.current_version),
            )
            .filter(Post.user_id == uid)
            .order_by(Post.updated_at.desc())
            .limit(10)
            .all()
        )


def _fetch_style_samples_sql(uid: UUID) -> list:
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
            .limit(8)
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
    ck = tool_key("search_vault_posts", user_id, query_hash(query))

    # 1. Tool result cache
    cached = await async_get(ck)
    if cached:
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

    if len(rows) >= 2:
        lines = ["## Semantic Search Results\n"]
        for title, content, chunk_index, distance in rows:
            lines.append(f"### {title}  (chunk {chunk_index}, distance: {distance:.4f})")
            lines.append(content or "")
            lines.append("")
        result = "\n".join(lines)
    else:
        # Fallback: recent posts (no embeddings generated yet for this user)
        uid = UUID(user_id)
        fallback_rows = await asyncio.to_thread(_fetch_recent_posts, uid)

        if not fallback_rows:
            result = "[NO_CONTEXT_FOUND: no posts in vault yet]"
        else:
            lines = ["## Recent Posts (no embeddings found — showing latest posts)\n"]
            for post, version in fallback_rows:
                lines.append(
                    f"### {post.title}  (status: {post.status.value}, updated: {post.updated_at:%Y-%m-%d})"
                )
                lines.append(version.content or "")
                lines.append("")
            result = "\n".join(lines)

    await async_set(ck, result, ttl=_TOOL_TTL)
    return result


@tool
async def get_style_samples(user_id: str) -> str:
    """Fetch the user's 8 most recent published posts to analyse writing style, tone, and formatting.
    Returns full post content so a ghostwriter can match the user's voice."""
    ck = tool_key("get_style_samples", user_id)
    cached = await async_get(ck)
    if cached:
        return cached

    uid  = UUID(user_id)
    rows = await asyncio.to_thread(_fetch_style_samples_sql, uid)

    if not rows:
        result = "[NO_CONTEXT_FOUND: no published posts yet — cannot replicate writing style]"
    else:
        lines = ["## Writing Style Samples (published posts)\n"]
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
    ck = tool_key("get_topic_inventory", user_id)
    cached = await async_get(ck)
    if cached:
        return cached

    uid         = UUID(user_id)
    posts, tags = await asyncio.to_thread(_fetch_topic_inventory_sql, uid)

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
