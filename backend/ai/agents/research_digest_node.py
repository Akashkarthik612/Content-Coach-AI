"""
Research digest — user-facing worker (like writer_node).

Takes the research_brief produced by researcher_node and turns it into a plain-text
LinkedIn-creator-voiced digest. This is the only researcher-path node whose tokens
stream to the user — router.py treats it exactly like analytics_node.
"""
import logging

from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from backend.core.config import settings
from backend.ai.state import AgentState

logger = logging.getLogger(__name__)

_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.4,
    max_output_tokens=1024,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

_DIGEST_SYSTEM = """\
You are briefing a LinkedIn/Reddit/X content creator on what to write about next.
You have been given a structured research brief — turn it into a short, engaging,
conversational digest they can act on immediately.

STRUCTURE:
- Open with the recommended angle in one confident sentence
- Walk through the talking points, weaving in specific facts/figures from the
  supporting evidence naturally (mention the source by name if given, no formal citations)
- Note briefly what to avoid repeating from their past posts, if anything
- Close with the suggested hook line, framed as "a hook you could open with:"

STYLE:
- Plain text only — no markdown, no asterisks, no bullet characters, no headers
- Conversational, direct, like a sharp colleague briefing you over coffee
- 120-220 words

Output ONLY the digest text. No preamble, no "Here's your brief:".
"""


async def research_digest_node(state: AgentState) -> dict:
    user_id = state.get("user_id")
    brief = state.get("research_brief") or {}
    logger.debug("research_digest_node invoked: user_id=%s brief_keys=%s", user_id, list(brief.keys()))

    response = await _llm.ainvoke([
        SystemMessage(content=_DIGEST_SYSTEM),
        HumanMessage(content=str(brief)),
    ])
    raw = response.content
    if isinstance(raw, list):
        content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in raw).strip()
    elif isinstance(raw, str):
        content = raw.strip()
    else:
        content = ""

    logger.info("research_digest_node: digest generated, char_count=%d", len(content))
    if not content:
        logger.error("research_digest_node: LLM returned empty content — raw type=%s raw=%r", type(raw).__name__, raw)
    return {"answer": content, "route": "direct"}
