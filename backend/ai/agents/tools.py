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
import re
from typing import Annotated
from uuid import UUID

from langchain_core.tools import tool
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langgraph.prebuilt import InjectedState
from sqlalchemy import text
from tavily import TavilyClient

logger = logging.getLogger(__name__)

from backend.ai.checkpointing.models import ThreadRegistry
from backend.core.config import settings
from backend.core.database import SessionLocal
from backend.core.cache import (
    async_get, async_set, async_get_json, async_set_json,
    tool_key, embed_key, query_hash, search_key,
    _TOOL_TTL, _SEARCH_TTL,
)
from backend.vault.models import Post, PostStatus, PostTag, PostVersion

_SESSION_CONTEXT_MAX_THREADS = 6  # recency cap — keeps the recall tool's own cost bounded even in a very long session

EMBEDDING_DIM = 768

# Query-side embedding client (task_type="retrieval_query" for asymmetric retrieval)
_embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    task_type="retrieval_query",
    output_dimensionality=EMBEDDING_DIM,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

# Tavily web search — global (not user-scoped) results cache, see cache.search_key
_tavily_client = TavilyClient(api_key=settings.TAVILY_API_KEY)
_SEARCH_MAX_RESULTS = 4
_SEARCH_DEPTH = "basic"           # cheaper than "advanced" — explicit constant, not a default left implicit
_SEARCH_QUERY_CHAR_CAP = 400      # cheap defensive guard against pathological query strings


def _strip_html(raw_html: str) -> str:
    text_only = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", raw_html, flags=re.DOTALL | re.IGNORECASE)
    text_only = re.sub(r"<[^>]+>", " ", text_only)
    return re.sub(r"\s+", " ", text_only).strip()


# ── Sync DB helpers (wrapped in asyncio.to_thread) ────────────────────────────

def _tavily_search_sync(query: str) -> list[dict]:
    return _tavily_client.search(
        query=query, search_depth=_SEARCH_DEPTH, max_results=_SEARCH_MAX_RESULTS
    ).get("results", [])


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


def _fetch_session_thread_ids_sql(user_id: str, session_id: str) -> list[str]:
    with SessionLocal() as db:
        rows = (
            db.query(ThreadRegistry.thread_id)
            .filter(ThreadRegistry.session_id == UUID(session_id), ThreadRegistry.user_id == UUID(user_id))
            .order_by(ThreadRegistry.created_at.asc())
            .all()
        )
    return [str(r[0]) for r in rows]


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
async def get_style_memory(user_id: str) -> str:
    """Fetch the user's long-term and short-term writing style profile (voice, tone,
    structure, recurring themes). Use for meta-questions about the user's own writing
    style or how it has evolved — not for drafting, that's writer_node's job."""
    logger.debug("get_style_memory: user_id=%s", user_id)
    from backend.ai.style_memory import format_style_memory_for_writer
    from backend.ai.style_memory import get_style_memory as _fetch_style_memory

    memory = await _fetch_style_memory(user_id)
    if not memory:
        return "[NO_CONTEXT_FOUND: no style memory yet — user hasn't published enough posts]"
    return format_style_memory_for_writer(memory)


@tool
async def get_session_context(question: str, state: Annotated[dict, InjectedState]) -> str:
    """Look up prior drafts, research angles, or answers from earlier in this
    chat session. Call this ONLY when the user's message references something
    said earlier in the same conversation (e.g. "that draft", "the audience we
    discussed", "the last post") — not for a fresh, self-contained request."""
    session_id = state.get("session_id")
    user_id    = state["user_id"]
    logger.debug("get_session_context: user_id=%s session_id=%s", user_id, session_id)

    if not session_id:
        return "[NO_SESSION_CONTEXT: this is a new session with no prior history]"

    thread_ids = await asyncio.to_thread(_fetch_session_thread_ids_sql, user_id, session_id)
    if not thread_ids:
        return "[NO_SESSION_CONTEXT: no earlier threads in this session]"

    # Local imports avoid a module-load-time circular import (assistant_registry
    # is set by main.py only after graph.py/tools.py have already been imported).
    from backend.ai.assistant_registry import get_assistant_instance
    from backend.ai.thread_state import shape_thread_state

    assistant = get_assistant_instance()
    parts = []
    for tid in thread_ids[-_SESSION_CONTEXT_MAX_THREADS:]:
        thread_state = await assistant.aget_state({"configurable": {"thread_id": tid}})
        shaped = shape_thread_state(tid, thread_state)
        summary = shaped["answer"] or shaped["draft"]
        if summary:
            parts.append(f'Earlier, you asked: "{shaped["user_prompt"]}"\nResponse: {summary}')

    if not parts:
        return "[NO_SESSION_CONTEXT: nothing usable found from earlier in this session]"
    return "\n\n---\n\n".join(parts)


@tool
async def web_search(query: str) -> str:
    """Search the web for current information on a topic. Returns a short list of
    candidate URLs with titles and snippets — use fetch_and_summarize_url on one
    of them for more detail once a promising source is found."""
    # TODO: no per-user rate limiting yet — this tool costs money per call and
    # takes an LLM-controllable query string. Add a rate:websearch:{user_id}:{yyyymmdd}
    # Redis counter before this is exposed to untrusted/high-volume traffic.
    logger.debug("web_search: query_len=%d", len(query or ""))
    if not query or not query.strip():
        return "[NO_CONTEXT_FOUND: empty search query]"

    query = query.strip()[:_SEARCH_QUERY_CHAR_CAP]
    ck = search_key(query)

    cached = await async_get(ck)
    if cached:
        logger.debug("web_search cache hit: query=%r", query)
        return cached

    try:
        results = await asyncio.to_thread(_tavily_search_sync, query)
    except Exception as exc:
        logger.warning("web_search: Tavily search failed for %r — %s", query, exc)
        return "[SEARCH_FAILED: web search temporarily unavailable]"

    if not results:
        result = "[NO_CONTEXT_FOUND: no web results found for that query]"
        await async_set(ck, result, ttl=_SEARCH_TTL)
        return result

    lines = [f'## Web Search Results — "{query}"\n']
    for r in results:
        lines.append(f"### {r.get('title') or '(untitled)'}")
        lines.append(r.get("url") or "")
        lines.append(r.get("content") or "")
        lines.append("")
    result = "\n".join(lines)

    await async_set(ck, result, ttl=_SEARCH_TTL)
    return result






