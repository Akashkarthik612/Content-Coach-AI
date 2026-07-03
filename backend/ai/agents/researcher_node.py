"""
Researcher — agentic tool-calling worker (same shape as supervisor_node's loop).

Behaves like a plain research assistant with live internet access by default —
web_search + fetch_page are always available. The user's own vault
(get_topic_inventory / search_vault_posts) is available too, but the system
prompt instructs the model to only reach for it when the user explicitly asks
about their own past posts/coverage — this is a general research agent first,
not a vault-lookup agent.

Loops via research_tool_node (a plain ToolNode, wired in graph.py) until the LLM
has no more tool calls, then its final turn is the strict research_brief JSON
contract writer_node/research_digest_node both read. Never streamed to the user —
router.py doesn't match this node's name, only research_digest_node's.
"""
import json
import logging

from langchain_core.messages import SystemMessage

from langchain_google_genai import ChatGoogleGenerativeAI

from backend.ai._log_setup import log_research_json
from backend.ai.agents.tools import get_topic_inventory, search_vault_posts
from backend.ai.agents.web_tools import web_search, fetch_page
from backend.ai.worker_states import ResearcherState
from backend.core.config import settings

logger = logging.getLogger(__name__)

_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.2,
    max_output_tokens=2048,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

research_tools = [web_search, fetch_page, get_topic_inventory, search_vault_posts]
_llm_agent = _llm.bind_tools(research_tools)

_RESEARCHER_SYSTEM = """\
You are a research analyst for LinkedIn/Reddit/X content creators — think PhD-level
subject matter scholar prepping a creator for their next post, not a generic chatbot.

Tools available (always pass user_id="{user_id}" to the vault ones):
  - web_search(query)                  → find current web/news coverage on a topic
  - fetch_page(url)                    → read a specific page (company site, article) in full
  - get_topic_inventory(user_id)       → ONLY if the user asks about their own past posts/coverage
  - search_vault_posts(user_id, query) → ONLY if the user asks about their own past posts/coverage

RULES:
- Call web_search at least once for anything with a topic. Call fetch_page on your
  best 1-2 result URLs before stating specific facts (numbers, dates, specs, quotes)
  — don't rely on search snippets alone for specifics.
- Only call get_topic_inventory / search_vault_posts if the user's message explicitly
  references their own past posts, coverage, or history. Do NOT call them for a plain
  "research X" or "what should I write about" query — most research requests don't need it.
- When you have enough to brief the user, respond with ONLY this JSON (no markdown
  fences, no prose outside it):
{{
  "recommended_angle": "...",
  "talking_points": ["...", "..."],
  "supporting_evidence": [{{"point": "...", "source_title": "...", "source_url": "..."}}],
  "past_coverage": "...",
  "avoid_repeating": "...",
  "suggested_length": "short|medium|long",
  "suggested_hook": "..."
}}
Leave past_coverage/avoid_repeating as empty strings if you never checked the vault.
"""

_EXPECTED_KEYS = {
    "recommended_angle", "talking_points", "supporting_evidence",
    "past_coverage", "avoid_repeating", "suggested_length", "suggested_hook",
}


def _fallback_brief(raw_text: str) -> dict:
    return {
        "recommended_angle": raw_text[:200],
        "talking_points": [],
        "supporting_evidence": [],
        "past_coverage": "",
        "avoid_repeating": "",
        "suggested_length": "medium",
        "suggested_hook": "",
    }


async def researcher_node(state: ResearcherState) -> dict:
    user_id = state["user_id"]
    logger.debug("researcher_node invoked: user_id=%s query_len=%d", user_id, len(state.get("query", "")))

    system = SystemMessage(content=_RESEARCHER_SYSTEM.format(user_id=user_id))
    response = await _llm_agent.ainvoke([system, *state["messages"]])

    if response.tool_calls:
        logger.debug("researcher_node: %d tool call(s) requested: %s",
                     len(response.tool_calls), [tc["name"] for tc in response.tool_calls])
        return {"messages": [response]}

    raw = response.content.strip() if isinstance(response.content, str) else ""
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        brief = json.loads(raw)
        missing = _EXPECTED_KEYS - brief.keys()
        if missing:
            raise ValueError(f"research_brief missing keys: {missing}")
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("researcher_node: JSON parse failed (%s), using fallback brief", exc)
        brief = _fallback_brief(raw)

    log_research_json(logger, f"researcher_node output user={user_id}", brief)
    logger.info("researcher_node: research_brief ready, angle=%r", brief.get("recommended_angle", "")[:80])
    return {"messages": [response], "research_brief": brief}
