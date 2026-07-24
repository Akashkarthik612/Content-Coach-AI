"""
Context Loaders — read-only, agent-internal grounding lookups shared across
agent nodes.

Distinct from backend/profile/service.py's ProfileService (API-facing CRUD,
404s on a missing profile) and from style_agent.py's analyze_style()/DB-write
logic (the actual analysis + persistence). This module only resolves data
that already exists and hands it to whichever agent needs it — researcher_node
needs profile context, writer_node needs style + profile context.

No instance state anywhere here — both classes are stateless namespaces
(never instantiated), matching the @staticmethod convention already used by
researcher.py's AngleResponseParser/ToolCallExecutor/ResearchPromptBuilder.
"""
import asyncio
import logging

from backend.core.database import SessionLocal
from backend.profile.models import UserProfile

logger = logging.getLogger(__name__)


class ProfileContextLoader:
    """Loads {role, industry, target_audience} from user_profile, when it
    exists. Used by researcher_node (domain-fit grounding) and writer_node
    (cold-start-with-onboarding fallback)."""

    @staticmethod
    def load(user_id: str) -> dict:
        """Direct query, not ProfileService.get_profile() — that raises a 404
        HTTPException when no profile exists yet, which is the common case
        today. Missing profile -> {}, not an error. A DB failure also
        degrades to {} rather than raising into the graph."""
        try:
            with SessionLocal() as db:
                profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        except Exception:
            logger.exception("ProfileContextLoader: profile read failed, user_id=%s", user_id)
            return {}
        if not profile:
            return {}
        return {
            "profession":       profile.profession,
            "role":             profile.role,
            "industry":         profile.industry,
            "target_audience":  profile.target_audience,
            "writing_style":    profile.writing_style,
            "goals":            profile.goals,
            "topics":           profile.topics,
        }


class StyleContextLoader:
    """Entry point writer_node uses to resolve style/profile inputs before
    building its system prompt. No instance state. Every DB/cache read is
    fault-isolated — a failure at any tier degrades to the next tier, never
    raises into the graph."""

    @staticmethod
    async def load(user_id: str) -> dict:
        """Returns {"style_json": dict, "profile_context": dict}. style_json
        is {} when no cached/on-demand style memory exists; profile_context
        is only fetched (and only matters) when style_json came back empty."""
        style_json = await StyleContextLoader._fetch_style(user_id)
        profile_context = {} if style_json else await asyncio.to_thread(ProfileContextLoader.load, user_id)
        return {"style_json": style_json, "profile_context": profile_context}

    @staticmethod
    async def _fetch_style(user_id: str) -> dict:
        from backend.ai.agents.style_agent import analyze_style, _fetch_posts_and_count
        from backend.ai.style_memory import get_style_memory, _write_db_and_cache

        try:
            memory = await get_style_memory(user_id)  # Redis (1h/24h TTL) -> DB cache-aside, unchanged
        except Exception:
            logger.exception("StyleContextLoader: style memory read failed, user_id=%s", user_id)
            return {}
        if memory is not None:
            return memory

        # On-demand fallback: published posts exist but no style_memory row
        # yet (e.g. the background refresh task never fired). Self-healing,
        # not the primary trigger — that's still sync_check_and_refresh_style_memory.
        try:
            posts, published_count = await asyncio.to_thread(_fetch_posts_and_count, user_id, 20)
        except Exception:
            logger.exception("StyleContextLoader: post fetch failed, user_id=%s", user_id)
            return {}
        if not posts:
            return {}
        try:
            lt_dict = await asyncio.to_thread(analyze_style, posts[:20])
            st_dict = await asyncio.to_thread(analyze_style, posts[:5]) if len(posts) >= 5 else None
            await asyncio.to_thread(_write_db_and_cache, user_id, lt_dict, st_dict, published_count, None)
        except Exception:
            logger.exception("StyleContextLoader: on-demand analyze_style failed, user_id=%s", user_id)
            return {}
        return {"long_term": lt_dict, "short_term": st_dict}
