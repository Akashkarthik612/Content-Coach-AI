"""
Researcher agent — LinkedIn content-strategy research node.

Given a topic query from the supervisor, this agent searches the web (and the
user's own vault, to avoid repeating past coverage) and returns up to 5
distinct strategic angles a LinkedIn post could be written from — fewer when
the topic doesn't genuinely support 5 distinct lenses, never zero. It does not
write posts itself — that's writer_node's job once one angle is picked.

Not yet wired into graph.py / routed from supervisor.py — this is a standalone,
directly-callable function (see backend/scripts/smoke_researcher.py). Because
it isn't a graph node yet, it runs its own manual tool-calling loop instead of
relying on graph.py's ToolNode.

Sibling functions for other platforms (researcher_reddit, researcher_x, ...)
will follow later, each with their own system prompt and tools. See
agents/base.py's BaseResearcher for the shared conceptual contract — this
function does not subclass it yet.

Layout: researcher_linkedin/researcher_node/expand_research_angle are the
callable entry points and stay as plain functions. Everything they lean on —
text parsing, prompt assembly, tool dispatch, profile lookup — is stateless
(no shared mutable state, no instance identity needed) and is grouped into
small single-responsibility classes of @staticmethods purely for namespacing
and readability, not because they hold any object state.
"""
import asyncio
import logging
import re
import time

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.func import task
from pydantic import BaseModel, Field, ValidationError

from backend.ai.activity import (
    BUILDING_ANGLES_ID,
    BUILDING_ANGLES_TITLE,
    TOOL_ACTIVITIES,
    emit_activity,
    emit_node_activity,
)
from backend.ai.agents.context_loaders import ProfileContextLoader
from backend.ai.agents.tools import search_vault_posts, web_search
from backend.ai.llm_retry import invoke_with_retry
from backend.ai.worker_states import ResearcherState
from backend.core.config import settings

logger = logging.getLogger(__name__)


class ResearcherDecisionError(Exception):
    """Raised when the tool-calling loop overruns its round limit, the final
    response can't be parsed into at least 1 angle (max 5), or
    ResearchArtifactParser is asked to parse/adapt a research mode it has no
    registered format for. Never swallowed into a fabricated fallback —
    matches supervisor.py's SupervisorDecisionError."""


class ResearchArtifactItem(BaseModel):
    """One item of a research artifact proposed by the researcher — e.g. one
    strategic angle today, one series entry or comparison row in a future
    mode. Kept generic (an open `attributes` bag rather than named fields
    like `audience`/`provokes_type`) so a future mode's shape doesn't force a
    schema change here — ResearchArtifactParser.to_wire_dicts() is what maps
    a mode's item back onto the field names its own frontend card expects."""
    title: str
    claim: str  # short, one-line takeaway — kept separate from `detail` so
                # map_chosen_angle_node's recommended_angle/talking-points
                # don't inherit the much longer paragraph below unless the
                # user actually expanded/modified this item.
    detail: str  # 500+ char paragraph for Strategic Angles — the actual
                 # glimpse rendered on the angle card, giving the user enough
                 # to judge the angle by before expanding.
    source_url: str = ""  # asserted by the LLM; ResearchArtifactParser.parse()
                          # blanks this out unless it matches a URL this round's
                          # web_search calls actually returned — never a fabricated link.
    attributes: dict[str, str] = Field(default_factory=dict)  # mode-specific
        # extras. For Strategic Angles: "audience", "provokes_type",
        # "provokes_reason".


class ResearchArtifact(BaseModel):
    """The mode-agnostic container researcher_linkedin() produces.
    researcher_node() adapts this into the existing research_result shape
    via ResearchArtifactParser.to_wire_dicts() — nothing downstream of that
    (angle_review_node, map_chosen_angle_node, router.py, the frontend) ever
    sees a ResearchArtifact directly."""
    mode: str
    items: list[ResearchArtifactItem]
    summary: str = ""


class ExpandedAngleSection(BaseModel):
    heading: str
    body: str


class ExpandedAngleSummary(BaseModel):
    """Structured-output contract for both expand_research_angle() and
    modify_angle_summary() — same shape as SupervisorClassification's
    convention (supervisor.py): the LLM is asked for raw JSON, parsed via
    model_validate_json(), never string-matched or trusted un-parsed."""
    sections: list[ExpandedAngleSection]


def _extract_json_text(raw: str | list) -> str:
    """Normalizes an LLM response into a bare JSON string (same normalization
    used in supervisor.py/writer_node.py — duplicated here per this file's own
    established convention of not sharing small normalization helpers across
    agent files)."""
    text = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in raw) if isinstance(raw, list) else raw
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    return text


class ResearchArtifactParser:
    """Parses the researcher LLM's free-text response into a mode-agnostic
    ResearchArtifact. Strategic Angles is the only mode with a registered
    block format today; a future mode adds its own regex + item-builder here
    (and its own branch in to_wire_dicts()) without touching anything
    downstream — angle_review_node, map_chosen_angle_node, router.py and the
    frontend all consume to_wire_dicts()'s output, never this class directly.

    Grouped as staticmethods purely for namespacing — there is no instance
    state, matching this file's established convention (ToolCallExecutor,
    ResearchPromptBuilder)."""

    # DOTALL added (alongside MULTILINE) so the detail paragraph can be a
    # genuine multi-sentence paragraph — `.` now matches newlines, but the
    # group stays non-greedy, so it still only ever captures the minimal
    # text up to the next literal marker line, whether that's on the same
    # line or several lines down.
    _STRATEGIC_ANGLE_BLOCK_RE = re.compile(
        r"\*\*(?P<title>.+?)\*\*\s*\n"
        r"(?P<argument>.+?)\n"
        r"(?P<glimpse>.+?)\n"
        r"·\s*Audience:\s*(?P<audience>.+?)\n"
        r"·\s*Provokes:\s*(?P<provokes>.+?)\s*\n?"
        r"(?:·\s*Source:\s*(?P<source_url>\S+)\s*)?(?:\n|$)",
        re.MULTILINE | re.DOTALL,
    )

    _PROVOKES_ALIASES = {
        "comment": "comment",
        "long-dwell": "long-dwell",
        "long dwell": "long-dwell",
        "longdwell": "long-dwell",
        "share": "share",
    }

    @staticmethod
    def extract_text(raw: str | list) -> str:
        """Normalizes an LLM response into a bare string — Gemini sometimes
        returns list[dict] instead of str (same normalization used in
        writer_node.py / supervisor.py)."""
        if isinstance(raw, list):
            return "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in raw).strip()
        if isinstance(raw, str):
            return raw.strip()
        return ""

    @staticmethod
    def _normalize_provokes(raw: str) -> tuple[str, str]:
        """Splits a '{type} — {reason}' provokes line into its two parts,
        tolerating a plain hyphen instead of an em-dash and minor spacing
        variance in the type. Strategic-Angles-specific — "provokes" isn't a
        generic artifact concept, which is why it lives in `attributes`
        rather than as a named field on ResearchArtifactItem."""
        # Requires whitespace on both sides so this doesn't split on the
        # hyphen embedded inside "long-dwell" itself — only the actual
        # "type — reason" separator (em-dash, or a plain hyphen tolerated as
        # a fallback) qualifies.
        parts = re.split(r"\s+[—-]\s+", raw, maxsplit=1)
        raw_type = parts[0].strip().lower()
        reason = parts[1].strip() if len(parts) > 1 else ""
        provokes_type = ResearchArtifactParser._PROVOKES_ALIASES.get(raw_type)
        if provokes_type is None:
            raise ValueError(f"unrecognized provokes type: {raw_type!r}")
        return provokes_type, reason

    @staticmethod
    def _parse_strategic_angles(raw_text: str, valid_source_urls: set[str]) -> list[ResearchArtifactItem]:
        """valid_source_urls is the set of URLs this round's web_search calls
        actually returned (see extract_sources below) — any item's asserted
        source_url that isn't in this set is blanked out rather than
        trusted, so a fabricated/hallucinated citation never reaches the
        frontend."""
        items: list[ResearchArtifactItem] = []
        for match in ResearchArtifactParser._STRATEGIC_ANGLE_BLOCK_RE.finditer(raw_text):
            try:
                provokes_type, provokes_reason = ResearchArtifactParser._normalize_provokes(
                    match.group("provokes")
                )
                source_url = (match.group("source_url") or "").strip()
                if source_url and source_url not in valid_source_urls:
                    logger.warning("researcher: dropping unverifiable source_url=%r (not in this round's results)", source_url)
                    source_url = ""
                items.append(ResearchArtifactItem(
                    title=match.group("title").strip(),
                    claim=match.group("argument").strip(),
                    detail=match.group("glimpse").strip(),
                    source_url=source_url,
                    attributes={
                        "audience": match.group("audience").strip(),
                        "provokes_type": provokes_type,
                        "provokes_reason": provokes_reason,
                    },
                ))
            except (ValueError, ValidationError) as exc:
                logger.warning("researcher: skipping unparseable angle block — %s", exc)
        return items

    @staticmethod
    def parse(mode: str, raw_text: str, valid_source_urls: set[str] | None = None) -> ResearchArtifact:
        """Entry point: dispatches to the item-builder registered for `mode`.
        Only "strategic_angles" is registered today — any other mode raises
        rather than silently mis-parsing, since no output format for it has
        actually been specified to the LLM in RESEARCH_SYSTEM yet."""
        valid_source_urls = valid_source_urls or set()
        if mode != "strategic_angles":
            raise ResearcherDecisionError(f"no parser registered for research mode {mode!r}")

        items = ResearchArtifactParser._parse_strategic_angles(raw_text, valid_source_urls)
        if not items:
            logger.error("researcher: expected at least 1 item, parsed 0 — raw=%r", raw_text)
            raise ResearcherDecisionError(
                "researcher_linkedin: expected at least 1 angle, parsed 0"
            )
        if len(items) > 5:
            logger.warning("researcher: parsed %d angles, capping to 5", len(items))
            items = items[:5]

        return ResearchArtifact(mode=mode, items=items, summary=ResearchArtifactParser._parse_summary(raw_text))

    @staticmethod
    def _parse_summary(raw_text: str) -> str:
        """Extracts the personalized SUMMARY: block the prompt asks for, which
        precedes the first item block. Deliberately not part of parse()'s
        strict-count validation — if the model skips it (or mangles the
        label), this just returns "" and the UI omits the intro text; the
        5-angle contract is the only hard requirement for this mode."""
        first_match = ResearchArtifactParser._STRATEGIC_ANGLE_BLOCK_RE.search(raw_text)
        preamble = raw_text[:first_match.start()] if first_match else raw_text
        return re.sub(r"(?i)^\s*summary\s*:\s*", "", preamble.strip()).strip()

    @staticmethod
    def collect_web_search_context(messages: list) -> str:
        """Concatenates every web_search ToolMessage's content — the raw
        evidence pool 'Expand' reuses later without a fresh Tavily call.
        Deliberately excludes search_vault_posts results (the user's own
        vault, not the web topic being researched). Mode-agnostic — operates
        on tool-call messages, not on any artifact's fields."""
        return "\n\n".join(
            m.content for m in messages
            if isinstance(m, ToolMessage) and m.name == "web_search"
        )

    _SOURCE_URL_RE = re.compile(r"^(https?://\S+)$", re.MULTILINE)

    @staticmethod
    def extract_sources(messages: list) -> set[str]:
        """The set of URLs this round's web_search tool calls actually
        returned — used by parse() to validate (never trust blindly)
        whatever source_url an item asserts. Relies on web_search's own
        output format (tools.py): each result is `### {title}\\n{url}\\n{content}`,
        so a bare URL on its own line is unambiguous here."""
        urls: set[str] = set()
        for m in messages:
            if isinstance(m, ToolMessage) and m.name == "web_search":
                urls.update(ResearchArtifactParser._SOURCE_URL_RE.findall(m.content))
        return urls

    @staticmethod
    def to_wire_dicts(artifact: ResearchArtifact) -> list[dict]:
        """Adapts the generic artifact back into the exact dict shape
        angle_review_node.py / map_chosen_angle_node / router.py /
        thread_state.py / the frontend's AngleCard already consume — the
        seam that keeps the review pipeline mode-agnostic internally but
        Strategic-Angles-shaped at the boundary, for as long as Strategic
        Angles is the only mode with a real UI. A future mode adds its own
        branch here (and, separately, its own frontend card) without this
        class's parse()/attributes contract needing to change."""
        if artifact.mode != "strategic_angles":
            raise ResearcherDecisionError(f"no wire adapter registered for research mode {artifact.mode!r}")
        return [
            {
                "title": item.title,
                "argument": item.claim,
                "glimpse": item.detail,
                "audience": item.attributes.get("audience", ""),
                "provokes_type": item.attributes.get("provokes_type", ""),
                "provokes_reason": item.attributes.get("provokes_reason", ""),
                "source_url": item.source_url,
            }
            for item in artifact.items
        ]


class ResearchPromptBuilder:
    """Builds the system prompts fed to the two research LLMs. No instance
    state — grouped here so researcher_linkedin/expand_research_angle stay
    focused on orchestration rather than prompt text."""

    RESEARCH_SYSTEM = """\
You are Honne's Research Agent.

Your responsibility is not to write content. Your responsibility is to understand what
the user is trying to accomplish and organize knowledge into the most useful research
artifact.

The Research Agent decides how knowledge should be organized.
The Writer Agent decides how knowledge should be communicated.

Never optimize for one fixed output format. Instead, choose the research artifact that
best helps the user accomplish their objective.

Research artifacts should always be designed to be reviewed, expanded, modified and
approved before passing them to the Writer.

Do not write hooks. Do not write storytelling. Do not write post copy. Those
responsibilities belong exclusively to the Writer Agent.

========================================
STEP 1 — DETERMINE USER INTENT
========================================

Before producing research, silently determine what the user is actually trying to
accomplish.

Possible research modes include:

• Strategic Angles
Generate multiple independent strategic directions for LinkedIn content.

• Content Series
Generate a connected sequence of topics designed to teach or explore a subject over
multiple posts.

• Research Brief
Produce structured research to help the user deeply understand a topic.

• Comparison
Compare products, technologies, companies or approaches.

• Learning Guide
Organize a topic into a logical learning progression.

• Evidence Pack
Collect important supporting evidence, studies, statistics and notable examples.

Choose exactly ONE research mode. Do not combine multiple modes unless explicitly
requested.

If the user explicitly requests a particular research format, honor that request.

If the request is genuinely ambiguous, ask one concise clarification question. Otherwise
infer the most appropriate format automatically.

If the request is about LinkedIn content creation but no format is specified, default to
Strategic Angles.

========================================
GENERAL RESEARCH PRINCIPLES
========================================

The output of this agent is never the final deliverable — it is an editable research
artifact.

Research should help users think before they write. Organize information clearly. Avoid
unnecessary repetition. Use evidence instead of generic observations. Never optimize for
sounding impressive — optimize for helping the user make better decisions.

Search results are raw evidence, not a brief. Mine them for concrete numbers, companies,
scenarios and examples. Never summarize search results mechanically.

========================================
STRATEGIC ANGLES MODE
========================================

Everything below applies ONLY when the selected research mode is Strategic Angles —
today the only mode with a wired output format; a request that resolves to a different
mode has no format specified yet and should still be handled through the principles
above as best you can. Generate exactly five completely independent strategic
directions.

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

Think silently. First return a short personalized summary, then exactly 5 angles — nothing else:

SUMMARY:
{2-4 sentences, written directly to the user ("you"), explaining what you're about to propose
and why — grounded in their role/industry/audience from USER CONTEXT below when it was
provided (e.g. "Since you're a cloud/DevOps engineer, I focused on angles that..."). If no
USER CONTEXT was given, keep this general — never invent a profession.}

**{Title — a claim, never a topic}**
{One sentence: the argument this post makes.}
{A 500+ character paragraph, several sentences: unpack the argument — why it's true,
what specific evidence supports it, what makes it non-obvious. This is what the user
actually reads to decide whether to write about it, so give them enough to judge —
never just restate the one-sentence argument in slightly different words.}
· Audience: {specific role}
· Provokes: {comment | long-dwell | share} — {why they react}
· Source: {the single URL from the search results above that most directly grounds
this angle — copy it exactly as it appeared. Omit this entire line if nothing in the
search results specifically supports this angle. Never invent a URL.}
"""

    EXPAND_SYSTEM = """\
You previously generated a research artifact. The user wants to expand ONE section of
that artifact.

The section may come from Strategic Angles, Content Series, Research Brief, Comparison,
Learning Guide or any future research mode.

Using ONLY the search context provided below (do not invent new facts), produce a
structured summary as raw JSON matching this exact shape — nothing else, no markdown
fences, no preamble:

{"sections": [{"heading": "...", "body": "..."}, ...]}

2 to 4 sections. Each heading is short (3-6 words, e.g. "What's happening", "Why it
matters to you", "The angle to take"). Each body is 2-4 dense sentences grounded only
in the provided search context.
"""

    MODIFY_SYSTEM = """\
You previously wrote a structured summary (sections with headings) for one research
artifact section. The user is now giving you a free-text instruction to revise that
summary — e.g. "cut the part about X", "add something about Y", "make it punchier".

Apply the instruction to produce a revised summary. Keep whatever the instruction
doesn't ask you to change. You may restructure or rename sections if the edit calls
for it, but stay within 2-4 sections total.

Ground any NEW factual claim only in the search context provided below — if the
instruction asks you to add something specific (a stat, a name, a number) that isn't
actually in that search context, do not invent it; instead phrase the addition
generically, or note in the body that this would need a source.

Return raw JSON matching this exact shape — nothing else, no markdown fences, no
preamble:

{"sections": [{"heading": "...", "body": "..."}, ...]}
"""

    @staticmethod
    def build_research_system(profile_context: dict | None) -> str:
        """Appends the user's role/industry/audience (from user_profile, when
        it exists) so the domain-fit judgment in RESEARCH_SYSTEM has
        something real to anchor on. Most users don't have a profile yet (no
        UI to create one) — profile_context is {} in that case and the base
        prompt is used as-is."""
        if not profile_context:
            return ResearchPromptBuilder.RESEARCH_SYSTEM
        context_block = (
            "\nUSER CONTEXT (use this to judge domain fit — see 'LOCATE THE TOPIC "
            "AGAINST THE USER'S EXPERTISE' above):\n"
            f"role: {profile_context.get('role', '')}\n"
            f"industry: {profile_context.get('industry', '')}\n"
            f"audience: {profile_context.get('target_audience', '')}\n"
        )
        return ResearchPromptBuilder.RESEARCH_SYSTEM + context_block


class ToolCallExecutor:
    """Executes one LLM-requested tool call from researcher_linkedin's tool
    loop, emitting activity events around it. No instance state — user_id is
    always passed in explicitly rather than trusted from the LLM's own args."""

    TOOLS = [web_search, search_vault_posts]
    TOOLS_BY_NAME = {t.name: t for t in TOOLS}

    @staticmethod
    async def execute(call: dict, user_id: str) -> ToolMessage:
        tool = ToolCallExecutor.TOOLS_BY_NAME[call["name"]]
        args = dict(call["args"])
        if tool.name == "search_vault_posts":
            # Never trust an LLM-supplied identity parameter — always override
            # with the real state value, regardless of what the model passed.
            args["user_id"] = user_id

        # Same child activity id reused across rounds for this tool —
        # re-emitting running/completed just flips one timeline row in place
        # instead of spamming a new "Search / Search / Search" row per round.
        # Title is always the fixed semantic label; the raw tool
        # name/query/URL never leaves the server (server log only, below).
        activity_id = f"tool_{tool.name}"
        activity_title = TOOL_ACTIVITIES.get(tool.name, "Gathering information")
        emit_activity(activity_id, activity_title, "running", parent_id="researching")

        t0 = time.monotonic()
        try:
            output = await tool.ainvoke(args)
        except Exception as exc:
            logger.warning("researcher: tool=%s FAILED after %.2fs — %s", tool.name, time.monotonic() - t0, exc)
            output = f"[TOOL_ERROR: {exc}]"
            emit_activity(activity_id, activity_title, "failed", parent_id="researching")
        else:
            logger.info("researcher: tool=%s took %.2fs", tool.name, time.monotonic() - t0)
            emit_activity(activity_id, activity_title, "completed", parent_id="researching")
        return ToolMessage(content=str(output), tool_call_id=call["id"], name=tool.name)


# ── Main research LLM — bound to tools, drives the angle-generation loop ──────

_llm = ChatGoogleGenerativeAI(
    model="gemini-3.6-flash",
    temperature=0.7,  # 5 genuinely distinct angles need creative divergence, not determinism
    max_output_tokens=8192,  # was 4096 — same shared thinking/output budget issue that emptied
                             # writer_node's drafts (see writer_node.py); this prompt's domain-fit
                             # + 5-distinct-lens reasoning is at least as demanding, same fix applies
    thinking_level="high",  # angle judgment across multiple sources needs real reasoning depth —
                            # bumped up from "low"; the most powerful model slot in the pipeline
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

_llm_agent = _llm.bind_tools(ToolCallExecutor.TOOLS)

_MAX_TOOL_LOOP_ROUNDS = 6

# One-shot "Expand" LLM — deliberately has NO tools bound. This is what
# guarantees clicking Expand can never trigger a fresh Tavily search: the
# summary must come only from search context already gathered during the
# original researcher_linkedin call.
_expand_llm = ChatGoogleGenerativeAI(
    model="gemini-3.6-flash",
    temperature=0.3,
    max_output_tokens=2048,  # was 512 — thinking token usage isn't proportional to a short output;
                             # a 512 cap was the least-safe budget in the app against the same
                             # shared-budget truncation bug that emptied writer_node's drafts
    thinking_level="low",  # short grounded summary — no need for deep reasoning here either
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)


async def researcher_linkedin(state: ResearcherState, profile_context: dict | None = None) -> dict:
    """LinkedIn research agent — core logic. Searches the web (and the user's
    vault) for the given topic query and produces up to 5 distinct strategic
    angles (fewer when the topic doesn't support that many, never zero).
    profile_context ({role, industry, target_audience}) is optional —
    researcher_node fetches it; direct callers (e.g. the smoke script) can omit
    it and get the base domain-fit judgment with no user grounding."""
    user_id = state["user_id"]
    query = state["query"]
    t_start = time.monotonic()
    logger.debug("researcher_linkedin invoked: user_id=%s query_len=%d", user_id, len(query))

    messages: list = [
        SystemMessage(content=ResearchPromptBuilder.build_research_system(profile_context)),
        HumanMessage(content=query),
    ]
    response: AIMessage | None = None
    building_angles_started = False

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
            messages.append(await ToolCallExecutor.execute(call, user_id))

        if not building_angles_started:
            # Once at least one round of real evidence has been gathered, the
            # remaining rounds are effectively converging toward the final
            # synthesis call — surface that as its own activity rather than
            # leaving the user staring at "Researching your topic" with no
            # sense that angles are being drafted from what was found.
            emit_activity(BUILDING_ANGLES_ID, BUILDING_ANGLES_TITLE, "running", parent_id="researching")
            building_angles_started = True
    else:
        raise ResearcherDecisionError("researcher_linkedin: tool-calling loop exceeded round limit")

    raw = ResearchArtifactParser.extract_text(response.content)
    valid_source_urls = ResearchArtifactParser.extract_sources(messages)
    artifact = ResearchArtifactParser.parse("strategic_angles", raw, valid_source_urls=valid_source_urls)
    emit_activity(BUILDING_ANGLES_ID, BUILDING_ANGLES_TITLE, "completed", parent_id="researching")
    logger.info("researcher_linkedin: TOTAL %.2fs — produced %d angles for user_id=%s",
                time.monotonic() - t_start, len(artifact.items), user_id)

    return {
        "research_artifact": artifact,
        "research_search_context": ResearchArtifactParser.collect_web_search_context(messages),
    }


def _parse_expanded_summary(response, caller: str) -> list[dict]:
    """Shared parse/validation step for both expand and modify — raises on
    empty/malformed JSON so the caller (angle_review_node) can turn that into
    an inline "error" for the interrupt payload rather than silently showing
    a blank/broken card."""
    raw = _extract_json_text(response.content)
    if not raw:
        logger.error(
            "%s: LLM returned empty content — finish_reason=%r usage=%r",
            caller,
            response.response_metadata.get("finish_reason"),
            response.response_metadata.get("usage_metadata"),
        )
        raise ResearcherDecisionError(f"{caller}: LLM returned empty content")
    try:
        parsed = ExpandedAngleSummary.model_validate_json(raw)
    except (ValidationError, ValueError) as exc:
        logger.error("%s: invalid JSON — %s | raw=%r", caller, exc, raw)
        raise ResearcherDecisionError(f"{caller}: could not parse a valid summary") from exc
    return [s.model_dump() for s in parsed.sections]


@task
async def expand_research_angle(angle: dict, search_context: str) -> list[dict]:
    """'Expand' action — a structured, sectioned summary of one angle's topic,
    grounded only in the search context researcher_linkedin already gathered.
    Never searches again: _expand_llm has no tools bound.

    Decorated with @task: angle_review_node's interrupt loop re-runs its whole
    function body from the top on every resume (only the *next* unresolved
    interrupt() actually pauses again — every earlier one just replays its
    recorded answer instantly). Without @task, every previous expand/modify
    call in a thread's history would be re-invoked for real (re-billed) on
    each later resume; @task caches a call's result in the checkpoint so a
    replay reuses it instead of calling Gemini again."""
    t0 = time.monotonic()
    human = (
        f"Angle: {angle['title']}\n"
        f"Argument: {angle['argument']}\n\n"
        f"Search context:\n{search_context or '(no search context available)'}"
    )
    response = await invoke_with_retry(_expand_llm, [
        SystemMessage(content=ResearchPromptBuilder.EXPAND_SYSTEM),
        HumanMessage(content=human),
    ])
    sections = _parse_expanded_summary(response, "expand_research_angle")
    logger.info("expand_research_angle: took %.2fs, sections=%d", time.monotonic() - t0, len(sections))
    return sections


@task
async def modify_angle_summary(angle: dict, current_sections: list[dict], instruction: str, search_context: str) -> list[dict]:
    """'Modify' action — revises the CURRENT sections for one angle (whatever
    the user is looking at right now, whether that came from expand or a
    previous modify round) per the user's free-text instruction. Only this
    one angle's data is sent — never the other 4 angles, never prior modify
    rounds' text beyond "whatever the current sections say right now".
    Same @task memoization rationale as expand_research_angle above — each
    modify round in a thread's history must not be silently re-run on a
    later resume."""
    t0 = time.monotonic()
    current_sections_text = "\n".join(f"## {s['heading']}\n{s['body']}" for s in current_sections) or "(nothing yet — treat this as a fresh summary)"
    human = (
        f"Angle: {angle['title']}\n"
        f"Argument: {angle['argument']}\n\n"
        f"Current summary:\n{current_sections_text}\n\n"
        f"User's instruction: {instruction}\n\n"
        f"Search context:\n{search_context or '(no search context available)'}"
    )
    response = await invoke_with_retry(_expand_llm, [
        SystemMessage(content=ResearchPromptBuilder.MODIFY_SYSTEM),
        HumanMessage(content=human),
    ])
    sections = _parse_expanded_summary(response, "modify_angle_summary")
    logger.info("modify_angle_summary: took %.2fs, sections=%d", time.monotonic() - t0, len(sections))
    return sections


async def researcher_node(state: ResearcherState) -> dict:
    """Graph entry point — Send-dispatched from supervisor_node with a minimal
    {user_id, query} state slice. Wraps researcher_linkedin: fetches profile
    context, runs the research, and adapts its mode-agnostic ResearchArtifact
    (via ResearchArtifactParser.to_wire_dicts()) into the single
    research_result state field that angle_review_node and
    map_chosen_angle_node read downstream — unchanged in shape regardless of
    this internal refactor."""
    user_id = state["user_id"]
    emit_node_activity("researcher_node", "running")
    profile_context = await asyncio.to_thread(ProfileContextLoader.load, user_id)

    result = await researcher_linkedin(state, profile_context=profile_context)
    artifact = result["research_artifact"]

    emit_node_activity("researcher_node", "completed")
    return {
        "research_result": {
            "angles": ResearchArtifactParser.to_wire_dicts(artifact),
            "search_context": result["research_search_context"],
            "summary": artifact.summary,
        },
    }
