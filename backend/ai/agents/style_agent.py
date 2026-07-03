"""
Style Agent — LLM-based style analysis + style retriever node.

analyze_style: pure LLM function; extracts a 9-key writing style dict from post content.
style_retriever_node: LangGraph node; manages cache/DB reads and triggers analysis when needed.
"""
import asyncio
import json
import logging
from uuid import UUID

from sqlalchemy import func
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from backend.ai._log_setup import log_style_json
from backend.ai.worker_states import StyleRetrieverState
from backend.core.config import settings
from backend.core.database import SessionLocal
from backend.vault.models import Post, PostStatus, PostVersion

logger = logging.getLogger(__name__)

# ── LLM instance ──────────────────────────────────────────────────────────────

_llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash-lite",
    temperature=0.1,
    max_output_tokens=512,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

_SYSTEM = """\
You are a writing style analyst. Analyze the LinkedIn posts provided and return
a JSON object with exactly these 9 keys:

  hook_style           — how the posts typically open (question, bold claim, story, stat)
  tone                 — overall voice (professional, personal, storytelling, tactical, etc.)
  sentence_rhythm      — typical sentence length and flow
  paragraph_structure  — spacing, paragraph length, use of white space
  emoji_usage          — frequency and placement, or deliberate absence
  cta_style            — how posts typically end (question, call-out, direct ask, none)
  vocabulary_level     — plain English vs technical vs jargon-heavy
  structural_patterns  — bullets, bold, numbered lists, or absence of formatting
  recurring_themes     — topics, ideas, or narratives that appear repeatedly

Each value is a single concrete descriptive sentence. Use evidence from the posts.
Be specific — avoid vague terms like "varies" or "sometimes".

Output ONLY valid JSON. No markdown fences. No preamble. No extra keys.
"""

_EXPECTED_KEYS = {
    "hook_style", "tone", "sentence_rhythm", "paragraph_structure",
    "emoji_usage", "cta_style", "vocabulary_level", "structural_patterns",
    "recurring_themes",
}


# ── LLM function ──────────────────────────────────────────────────────────────

def analyze_style(post_contents: list[str]) -> dict:
    """
    Analyze a list of post content strings and return a style dict with 9 keys.

    Raises ValueError if the LLM returns unparseable JSON or is missing keys.
    Caller (style_memory.py) is responsible for catching and logging errors.
    """
    if not post_contents:
        raise ValueError("analyze_style called with empty post list")

    combined = "\n\n---\n\n".join(post_contents)

    response = _llm.invoke([
        SystemMessage(content=_SYSTEM),
        HumanMessage(content=f"Posts to analyze:\n\n{combined}"),
    ])

    raw = response.content.strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    result = json.loads(raw)

    missing = _EXPECTED_KEYS - result.keys()
    if missing:
        raise ValueError(f"Style JSON missing keys: {missing}")

    log_style_json(logger, "style_analyzer output", result)
    return result


# ── Graph node ────────────────────────────────────────────────────────────────

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
    from backend.ai.style_memory import (  # local import breaks circular dependency
        get_style_memory,
        sync_check_and_refresh_style_memory,
        _write_db_and_cache,
    )

    user_id = state["user_id"]
    logger.debug("style_retriever_node invoked: user_id=%s", user_id)

    memory = await get_style_memory(user_id)

    if memory is None:
        logger.info("style_retriever_node: no style memory — running on-demand analysis")
        posts, published_count = await asyncio.to_thread(_fetch_posts_and_count, user_id, 20)

        if not posts:
            logger.info("style_retriever_node: no published posts yet — cold-start")
            log_style_json(logger, f"style_retriever_node cold-start user={user_id}", {})
            return {"style_json": {}}

        lt_dict = await asyncio.to_thread(analyze_style, posts[:20])
        st_dict = await asyncio.to_thread(analyze_style, posts[:5]) if len(posts) >= 5 else None

        await asyncio.to_thread(
            _write_db_and_cache, user_id, lt_dict, st_dict, published_count, None
        )
        logger.info("style_retriever_node: analysis complete, post_count=%d", len(posts))
        result = {"long_term": lt_dict, "short_term": st_dict}
        log_style_json(logger, f"style_retriever_node on-demand user={user_id}", result)
        return {"style_json": result}

    asyncio.ensure_future(asyncio.to_thread(sync_check_and_refresh_style_memory, user_id))
    logger.debug("style_retriever_node: returning cached style_json, stale-check fired")
    log_style_json(logger, f"style_retriever_node cache-hit user={user_id}", memory)
    return {"style_json": memory}
