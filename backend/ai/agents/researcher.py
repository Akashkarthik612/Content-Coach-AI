"""
Researcher agent — LinkedIn content-strategy research node.

Given a topic query from the supervisor, this agent searches the web (and the
user's own vault, to avoid repeating past coverage) and returns exactly 5
distinct strategic angles a LinkedIn post could be written from. It does not
write posts itself — that's writer_node's job once one angle is picked.

Not yet wired into graph.py / routed from supervisor.py — this is a standalone,
directly-callable function (see backend/scripts/smoke_researcher.py). Because
it isn't a graph node yet, it runs its own manual tool-calling loop instead of
relying on graph.py's ToolNode.

Sibling functions for other platforms (researcher_reddit, researcher_x, ...)
will follow later, each with their own system prompt and tools. See
agents/base.py's BaseResearcher for the shared conceptual contract — this
function does not subclass it yet.
"""
import asyncio
import logging
import re
import time
from typing import Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, ValidationError

from backend.ai.agents.tools import search_vault_posts, web_search
from backend.ai.llm_retry import invoke_with_retry
from backend.ai.worker_states import ResearcherState
from backend.core.config import settings
from backend.core.database import SessionLocal
from backend.profile.models import UserProfile

logger = logging.getLogger(__name__)


class ResearcherDecisionError(Exception):
    """Raised when the tool-calling loop overruns its round limit or the final
    response can't be parsed into exactly 5 angles. Never swallowed into a
    fabricated fallback — matches supervisor.py's SupervisorDecisionError."""


class ResearchAngle(BaseModel):
    title: str
    argument: str
    audience: str
    provokes_type: Literal["comment", "long-dwell", "share"]
    provokes_reason: str


# ── Main research LLM — bound to tools, drives the angle-generation loop ──────

_llm = ChatGoogleGenerativeAI(
    model="gemini-3.5-flash",
    temperature=0.7,  # 5 genuinely distinct angles need creative divergence, not determinism
    max_output_tokens=8192,  # was 4096 — same shared thinking/output budget issue that emptied
                             # writer_node's drafts (see writer_node.py); this prompt's domain-fit
                             # + 5-distinct-lens reasoning is at least as demanding, same fix applies
    thinking_level="low",  # Gemini 3.5 Flash thinks by default (medium) — low keeps a
                           # multi-round tool-calling loop from paying that tax every round
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

_all_tools = [web_search, search_vault_posts]
_llm_agent = _llm.bind_tools(_all_tools)
_tools_by_name = {t.name: t for t in _all_tools}

_MAX_TOOL_LOOP_ROUNDS = 6

_RESEARCH_SYSTEM = """\
You are an elite LinkedIn content strategist. You do not write posts. You find the
strongest strategic directions a post could be written from, and hand one to a writer.

Your bar: if this topic went to five different top strategists in separate rooms, what
five directions would they independently choose? Five wordings of one idea is a failure.

FIRST, LOCATE THE TOPIC AGAINST THE USER'S EXPERTISE. Everything depends on this.

  OFF their domain → Do not write about the topic. Write about what the topic reveals
  about their field. A SaaS founder asking about a football team's comeback gets angles on
  what the coach's mid-game substitutions say about killing a failing product line — never
  a sports take. Posting outside their expertise blurs the platform's model of who they
  are and buries them with the audience they actually want. This bridge is the single most
  valuable thing you do.

  INSIDE their domain → The danger is not drift, it is sameness. "What is Kubernetes" has
  been written ten million times; the obvious explanation reaches no one. Refuse it. Find
  the angles only someone who has actually done the work could offer.

RULES:
1. ONE IDEA PER ANGLE. LinkedIn averages every word of a post into a single meaning. Two
   themes average into mush and match no reader. If an angle needs two ideas, it is two
   angles.
2. NO HOOKS. The opening sentence carries no more weight than the last. Clever bait buys
   nothing. Lead with the claim itself.
3. BE SPECIFIC. Name a role, a number, a company, or a concrete scenario. "AI in
   marketing" is dead. "Why three-person SaaS teams should not automate competitive
   analysis" is alive.
4. ENGINEER A COMMENT. Likes are the cheapest signal. Target comments and long reading
   time. A reader who fully agrees has nothing to type — give them a claim they can push
   back on, or an experience gap only they can fill.
5. FIVE DISTINCT LENSES, not five phrasings: the mechanism nobody names · the assumption
   everyone gets wrong · the pattern borrowed from another domain · the gap only a
   practitioner can fill · the second-order consequence.
6. SPEAK THEIR AUDIENCE'S LANGUAGE. The exact words decide who gets reached. Use the
   vocabulary the target audience uses about themselves.

NEVER PROPOSE: "N lessons from X" listicles · consensus takes nobody can disagree with ·
manufactured contrarianism · milestone or announcement posts · vague abstractions like
"the future of work" · trend-chasing outside their expertise · packaged fake
vulnerability · anything a generic chatbot would say first.

Search results are raw evidence, not a brief. Mine them for the specific number, name, or
scenario that makes an angle concrete. Never summarize them.

Think silently. Return exactly 5 angles, nothing else, no preamble:

**{Title — a claim, never a topic}**
{One sentence: the argument this post makes.}
· Audience: {specific role}
· Provokes: {comment | long-dwell | share} — {why they react}
"""


def _build_research_system(profile_context: dict | None) -> str:
    """Appends the user's role/industry/audience (from user_profile, when it
    exists) so the domain-fit judgment in _RESEARCH_SYSTEM has something real
    to anchor on. Most users don't have a profile yet (no UI to create one) —
    profile_context is {} in that case and the base prompt is used as-is."""
    if not profile_context:
        return _RESEARCH_SYSTEM
    context_block = (
        "\nUSER CONTEXT (use this to judge domain fit — see 'LOCATE THE TOPIC "
        "AGAINST THE USER'S EXPERTISE' above):\n"
        f"role: {profile_context.get('role', '')}\n"
        f"industry: {profile_context.get('industry', '')}\n"
        f"audience: {profile_context.get('target_audience', '')}\n"
    )
    return _RESEARCH_SYSTEM + context_block

# One-shot "Expand" LLM — deliberately has NO tools bound. This is what
# guarantees clicking Expand can never trigger a fresh Tavily search: the
# summary must come only from search context already gathered during the
# original researcher_linkedin call.
_expand_llm = ChatGoogleGenerativeAI(
    model="gemini-3.5-flash",
    temperature=0.3,
    max_output_tokens=8192,  # was 512 — thinking token usage isn't proportional to a short output;
                             # a 512 cap was the least-safe budget in the app against the same
                             # shared-budget truncation bug that emptied writer_node's drafts
    thinking_level="low",  # short grounded summary — no need for deep reasoning here either
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

_EXPAND_SYSTEM = """\
You already researched a topic and proposed several strategic angles for a LinkedIn
post. The user wants more detail on ONE specific angle before deciding to write it up.

Using ONLY the search context provided below (do not invent new facts), write a short,
dense summary (3-5 sentences) that gives the user enough grounding on this angle's
topic to decide whether to proceed. No preamble, no "here is a summary" framing —
just the summary text.
"""

_ANGLE_BLOCK_RE = re.compile(
    r"\*\*(?P<title>.+?)\*\*\s*\n"
    r"(?P<argument>.+?)\n"
    r"·\s*Audience:\s*(?P<audience>.+?)\n"
    r"·\s*Provokes:\s*(?P<provokes>.+?)\s*(?:\n|$)",
    re.MULTILINE,
)

_PROVOKES_ALIASES = {
    "comment": "comment",
    "long-dwell": "long-dwell",
    "long dwell": "long-dwell",
    "longdwell": "long-dwell",
    "share": "share",
}


def _extract_text(raw: str | list) -> str:
    """Normalizes an LLM response into a bare string — Gemini sometimes returns
    list[dict] instead of str (same normalization used in writer_node.py /
    supervisor.py)."""
    if isinstance(raw, list):
        return "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in raw).strip()
    if isinstance(raw, str):
        return raw.strip()
    return ""


def _normalize_provokes(raw: str) -> tuple[str, str]:
    """Splits a '{type} — {reason}' provokes line into its two parts, tolerating
    a plain hyphen instead of an em-dash and minor spacing variance in the type."""
    # Requires whitespace on both sides so this doesn't split on the hyphen
    # embedded inside "long-dwell" itself — only the actual "type — reason"
    # separator (em-dash, or a plain hyphen tolerated as a fallback) qualifies.
    parts = re.split(r"\s+[—-]\s+", raw, maxsplit=1)
    raw_type = parts[0].strip().lower()
    reason = parts[1].strip() if len(parts) > 1 else ""
    provokes_type = _PROVOKES_ALIASES.get(raw_type)
    if provokes_type is None:
        raise ValueError(f"unrecognized provokes type: {raw_type!r}")
    return provokes_type, reason


def _parse_angles(raw_text: str) -> list[ResearchAngle]:
    angles: list[ResearchAngle] = []
    for match in _ANGLE_BLOCK_RE.finditer(raw_text):
        try:
            provokes_type, provokes_reason = _normalize_provokes(match.group("provokes"))
            angles.append(ResearchAngle(
                title=match.group("title").strip(),
                argument=match.group("argument").strip(),
                audience=match.group("audience").strip(),
                provokes_type=provokes_type,
                provokes_reason=provokes_reason,
            ))
        except (ValueError, ValidationError) as exc:
            logger.warning("researcher: skipping unparseable angle block — %s", exc)

    if len(angles) != 5:
        logger.error("researcher: expected 5 angles, parsed %d — raw=%r", len(angles), raw_text)
        raise ResearcherDecisionError(
            f"researcher_linkedin: expected exactly 5 angles, parsed {len(angles)}"
        )
    return angles


def _collect_web_search_context(messages: list) -> str:
    """Concatenates every web_search ToolMessage's content — the raw evidence
    pool 'Expand' reuses later without a fresh Tavily call. Deliberately
    excludes search_vault_posts results (the user's own vault, not the web
    topic being expanded)."""
    return "\n\n".join(
        m.content for m in messages
        if isinstance(m, ToolMessage) and m.name == "web_search"
    )


async def _execute_tool_call(call: dict, user_id: str) -> ToolMessage:
    tool = _tools_by_name[call["name"]]
    args = dict(call["args"])
    if tool.name == "search_vault_posts":
        # Never trust an LLM-supplied identity parameter — always override with
        # the real state value, regardless of what the model passed.
        args["user_id"] = user_id
    t0 = time.monotonic()
    try:
        output = await tool.ainvoke(args)
    except Exception as exc:
        logger.warning("researcher: tool=%s FAILED after %.2fs — %s", tool.name, time.monotonic() - t0, exc)
        output = f"[TOOL_ERROR: {exc}]"
    else:
        logger.info("researcher: tool=%s took %.2fs", tool.name, time.monotonic() - t0)
    return ToolMessage(content=str(output), tool_call_id=call["id"], name=tool.name)


async def researcher_linkedin(state: ResearcherState, profile_context: dict | None = None) -> dict:
    """LinkedIn research agent — core logic. Searches the web (and the user's
    vault) for the given topic query and produces exactly 5 distinct strategic
    angles. profile_context ({role, industry, target_audience}) is optional —
    researcher_node fetches it; direct callers (e.g. the smoke script) can omit
    it and get the base domain-fit judgment with no user grounding."""
    user_id = state["user_id"]
    query = state["query"]
    t_start = time.monotonic()
    logger.debug("researcher_linkedin invoked: user_id=%s query_len=%d", user_id, len(query))

    messages: list = [SystemMessage(content=_build_research_system(profile_context)), HumanMessage(content=query)]
    response: AIMessage | None = None

    for round_num in range(_MAX_TOOL_LOOP_ROUNDS):
        t_round = time.monotonic()
        logger.info("researcher_linkedin: round=%d calling Gemini (%d messages in history)...", round_num, len(messages))
        response = await invoke_with_retry(_llm_agent, messages)
        logger.info("researcher_linkedin: round=%d Gemini responded in %.2fs, tool_calls=%d",
                     round_num, time.monotonic() - t_round, len(response.tool_calls or []))
        messages.append(response)

        if not response.tool_calls:
            break

        for call in response.tool_calls:
            logger.info("researcher_linkedin: round=%d executing tool=%s args=%s", round_num, call["name"], call["args"])
            messages.append(await _execute_tool_call(call, user_id))
    else:
        raise ResearcherDecisionError("researcher_linkedin: tool-calling loop exceeded round limit")

    raw = _extract_text(response.content)
    angles = _parse_angles(raw)
    logger.info("researcher_linkedin: TOTAL %.2fs — produced %d angles for user_id=%s",
                time.monotonic() - t_start, len(angles), user_id)

    return {
        "research_topics": [a.model_dump() for a in angles],
        "research_search_context": _collect_web_search_context(messages),
    }


async def expand_research_angle(angle: dict, search_context: str) -> str:
    """'Expand' action — a short summary of one angle's topic, grounded only in
    the search context researcher_linkedin already gathered. Never searches
    again: _expand_llm has no tools bound."""
    t0 = time.monotonic()
    human = (
        f"Angle: {angle['title']}\n"
        f"Argument: {angle['argument']}\n\n"
        f"Search context:\n{search_context or '(no search context available)'}"
    )
    response = await invoke_with_retry(_expand_llm, [
        SystemMessage(content=_EXPAND_SYSTEM),
        HumanMessage(content=human),
    ])
    content = _extract_text(response.content)
    logger.info("expand_research_angle: took %.2fs", time.monotonic() - t0)
    if not content:
        logger.error(
            "expand_research_angle: LLM returned empty content — finish_reason=%r usage=%r raw=%r",
            response.response_metadata.get("finish_reason"),
            response.response_metadata.get("usage_metadata"),
            response.content,
        )
    return content


def _fetch_profile_context(user_id: str) -> dict:
    """Direct query, not ProfileService.get_profile() — that raises a 404
    HTTPException when no profile exists yet, which is the common case today
    (no profile UI to create one). Missing profile -> {}, not an error."""
    with SessionLocal() as db:
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        return {}
    return {
        "role": profile.role,
        "industry": profile.industry,
        "target_audience": profile.target_audience,
    }


async def researcher_node(state: ResearcherState) -> dict:
    """Graph entry point — Send-dispatched from supervisor_node with the same
    minimal {user_id, query} shape as style_retriever_node. Wraps
    researcher_linkedin: fetches profile context, runs the research, and
    reshapes its two-key return into the single research_result state field
    that angle_review_node and map_chosen_angle_node read downstream."""
    user_id = state["user_id"]
    profile_context = await asyncio.to_thread(_fetch_profile_context, user_id)

    result = await researcher_linkedin(state, profile_context=profile_context)

    return {
        "research_result": {
            "angles": result["research_topics"],
            "search_context": result["research_search_context"],
        },
    }
