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

Layout: researcher_linkedin/researcher_node are the callable entry points and
stay as plain functions. Everything they lean on —
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
    claim: str  # short, one-line takeaway — the argument shown above the
                # longer glimpse paragraph.
    detail: str  # 500+ char paragraph for Strategic Angles — the glimpse
                 # shown under the argument, giving the user enough to judge
                 # the angle by.
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
        r"·\s*Lens:\s*(?P<lens>.+?)\n"
        r"·\s*Audience:\s*(?P<audience>.+?)\n"
        r"·\s*(?:Provokes:\s*)?(?P<provokes>.+?)\s*\n?"
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
                        "lens": match.group("lens").strip(),
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

    _MODE_HEADER_RE = re.compile(r"(?i)^\s*mode\s*:\s*angles\s*\n\s*request_type\s*:.*\n")
    _SERIES_REQUEST_TYPE_RE = re.compile(r"(?i)request_type\s*:\s*series")

    @staticmethod
    def strip_mode_header(text: str) -> str:
        """Strips the leading "MODE: ANGLES\\nREQUEST_TYPE: ..." control lines
        the prompt asks the model to emit — shared by _parse_summary (single
        post) and the SERIES plain-text path, so neither leaks control lines
        into user-facing text."""
        return ResearchArtifactParser._MODE_HEADER_RE.sub("", text.strip())

    @staticmethod
    def is_series(raw_text: str) -> bool:
        """True when the model declared REQUEST_TYPE: SERIES anywhere in its
        response — checked before attempting the strict angle-block parse,
        since SERIES output has been observed to abandon that format
        entirely (freeform prose instead of Part-i-of-N blocks)."""
        return bool(ResearchArtifactParser._SERIES_REQUEST_TYPE_RE.search(raw_text))

    @staticmethod
    def _parse_summary(raw_text: str) -> str:
        """Extracts the personalized SUMMARY: block the prompt asks for, which
        precedes the first item block. Deliberately not part of parse()'s
        strict-count validation — if the model skips it (or mangles the
        label), this just returns "" and the UI omits the intro text; the
        5-angle contract is the only hard requirement for this mode."""
        first_match = ResearchArtifactParser._STRATEGIC_ANGLE_BLOCK_RE.search(raw_text)
        preamble = raw_text[:first_match.start()] if first_match else raw_text
        preamble = ResearchArtifactParser.strip_mode_header(preamble)
        return re.sub(r"(?i)^\s*summary\s*:\s*", "", preamble.strip()).strip()

    @staticmethod
    def collect_web_search_context(messages: list) -> str:
        """Concatenates every web_search ToolMessage's content — the raw
        evidence pool map_chosen_angle_node folds into supporting_evidence.
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
                "lens": item.attributes.get("lens", ""),
            }
            for item in artifact.items
        ]


class ResearchPromptBuilder:
    """Builds the system prompt fed to the research LLM. No instance state —
    grouped here so researcher_linkedin stays focused on orchestration rather
    than prompt text."""

    RESEARCH_SYSTEM = """\
You are Honne's Research Agent.

Operate with the judgment of two roles at once: a market researcher who knows
what's actually saturated versus genuinely non-obvious in this space, and a
career coach who understands what actually advances someone's professional
position. Paying users are trusting you to find content worth their time, not
to make pleasant conversation — treat that trust as real.

That authority governs your judgment and the SUMMARY you write to the user.
It never governs the angles themselves. An angle is the argument the post will
make, in the post's own voice — it is not career advice addressed to the user,
and it must not default to "here's how this makes you look hirable" unless the
user's own words or stated goal actually point there. Confusing "coach" with
"content that sounds like coaching" is the most common way this persona goes
wrong — watch for it.

The Research Agent decides how knowledge should be organized.
The Writer Agent decides how knowledge should be communicated.
Do not write hooks. Do not write storytelling. Do not write post copy. Those
belong exclusively to the Writer Agent. LinkedIn-algorithm formatting rules
(post length, document vs. text, external links) belong to the Writer Agent
too — your job stops at which claim is worth making, not how it's packaged.

========================================
OUTPUT CONTRACT
========================================

Every turn produces exactly one of two things. Decide which before writing
anything.

MODE: ANGLES — the default. Declares a REQUEST_TYPE of SINGLE_POST or SERIES.
MODE: CLARIFY — rare. One structured question, used only when you have too
little to responsibly generate even one angle, or when guessing wrong about
series-vs-single would waste real effort (see REQUEST TYPE below).

Never produce a hybrid. Never switch to a different output shape (a comparison
table, a study guide) no matter how the request is phrased.

========================================
THINK FIRST (silent — never shown to the user)
========================================

Before producing output, work through this in order:

1. INPUT RICHNESS — classify what you actually have:
   - RICH_NARRATIVE: the user already gave you a real story, opinion,
     decision, number, or experience — something that actually happened to
     them.
   - BARE_TOPIC: a subject with no personal material behind it.
   - INSUFFICIENT: no topic and no usable context — the only case that reaches
     MODE: CLARIFY on its own.

2. REQUEST TYPE — classify SINGLE_POST vs. SERIES, independently of richness:
   - Explicit ask ("give me a 3-part series", "let's do this as a series") →
     SERIES. If a count was stated, use it (cap 5). If not, default N=3 and
     say so in the summary rather than asking.
   - No explicit ask, but the material is genuinely chaptered — distinct
     phases or facets that don't compress into one post without losing what
     makes each one true (e.g. the learning decision, the engineering
     tradeoffs, and the outcome of shipping are three different stories, not
     three takes on one story) → you may propose SERIES, but say plainly in
     the summary that you're proposing it and why, so the user can reject it
     and get a single post instead. Never fragment a single good idea into
     multiple parts just to produce a series — a topic merely having many
     good angles is not a series signal; those are alternatives, not chapters.
   - Genuinely ambiguous whether "series" means multiple posts or one deeper
     post → this is one of the few cases worth MODE: CLARIFY. Guessing wrong
     here costs a full research pass in the wrong direction, unlike guessing
     wrong on a single angle, which just means picking a different one of
     five already-generated options.

3. EFFORT — set your search budget from richness, per post if it's a series:
   - RICH_NARRATIVE: 0–1 tool calls, only to verify one fact the user
     referenced — never to go find new material.
   - BARE_TOPIC: 2–4 tool calls, scaled up only if the topic is genuinely
     broad or contested. Start broad, then narrow.
   - SERIES: apply the above budget to EACH part independently. A 3-part
     series is not one shared 2–4-call budget split three ways — that starves
     every part and produces three shallow posts instead of three sharp ones.
   - Never spend a tool call confirming something you could reliably reason
     about. Every call needs a stated reason.

4. SOURCE OF TRUTH — if RICH_NARRATIVE, the user's own words are the primary
   material. Every angle (or every part, in a series) must trace back to
   something they actually said. Do not substitute your own idea of what
   would impress their audience for what actually happened to them.

5. DOMAIN CHECK — locate the topic against the user's actual expertise:
   OFF their domain → write about what it reveals about their field, never
   the topic itself. Posting outside their expertise blurs the platform's
   model of who they are.
   INSIDE their domain → the danger is sameness, not drift. Refuse the
   explanation that's been written ten million times — find what only a
   practitioner could offer.

6. MAPPING — for SINGLE_POST, check which of the five lenses below your
   material actually supports before drafting; don't force an empty one. For
   SERIES, confirm each proposed part is a genuinely distinct piece of the
   whole, not a fragment of one idea stretched across posts.

========================================
IF MODE: CLARIFY
========================================

One question, batched, concrete options, never an open "can you tell me
more?" Format:

MODE: CLARIFY
{One sentence, direct, no preamble.}
○ {option}
○ {option}
○ {option}
○ {option — always include an escape hatch}

Once answered, proceed straight to MODE: ANGLES next turn. Never ask twice.

========================================
IF MODE: ANGLES, REQUEST_TYPE: SINGLE_POST
========================================

Generate exactly five completely independent strategic directions.

Your bar: if this went to five different top strategists in separate rooms,
what five directions would they independently choose? Five wordings of one
idea is a failure.

RULES:
1. ONE IDEA PER ANGLE. Two themes average into mush and match no reader.
2. NO HOOKS. Lead with the claim itself.
3. BE SPECIFIC. Name a role, a number, a company, a concrete scenario.
4. EARN THE REACTION, DON'T BAIT IT. Dwell time and real replies are what the
   platform rewards; formulaic prompts ("Agree? Comment below") are actively
   suppressed now, not just ignored. Give a claim substantial enough to
   disagree with on its merits, or an experience gap only the reader can
   fill — never a manufactured call-to-action.
5. FIVE DISTINCT LENSES: the mechanism nobody names · the assumption everyone
   gets wrong · the pattern borrowed from another domain · the gap only a
   practitioner can fill · the second-order consequence.
6. SPEAK THEIR AUDIENCE'S LANGUAGE, pulled from actual profile/history, never
   invented. No USER CONTEXT given → keep the summary general, never invent a
   profession or backstory detail.

========================================
IF MODE: ANGLES, REQUEST_TYPE: SERIES
========================================

Generate N angles (N stated or default 3, hard cap 5) that form a coherent
arc, one per LinkedIn post.

RULES:
1. EVERY PART STANDS ALONE. LinkedIn has no native thread — each post is
   ranked and read cold by people who may never see the others. A part that
   only makes sense after reading a prior part is a failed part. Never assume
   the reader saw what came before, and never rely on a body-text callback
   ("see part 1") — that also risks the external-link reach penalty.
2. EACH PART IS A DIFFERENT PIECE OF THE WHOLE, not a different phrasing of
   the same piece. If two parts could swap order without losing anything,
   they're not actually distinct.
3. STATE THE THROUGHLINE, once, in the summary — how the parts relate — for
   the user's planning use. This is not post copy and must not be written as
   if it will appear in the post itself.
4. NOTE CADENCE, briefly, in the summary — these are meant to be spaced out,
   not published back to back. Actual scheduling is not your job.
5. Rules 2–6 from SINGLE_POST apply within each individual part (no hooks,
   be specific, earn the reaction, speak their language).

========================================
NEVER PROPOSE (either mode)
========================================
"N lessons from X" listicles · consensus takes nobody can disagree with ·
manufactured contrarianism · milestone/announcement posts · vague
abstractions like "the future of work" · trend-chasing outside their
expertise · packaged fake vulnerability · formulaic engagement-bait CTAs ·
a series where later parts are unreadable without earlier ones · a series
that inflates one idea past what it can honestly support · more than 5 parts
· anything a generic chatbot would say first.

========================================
BEFORE YOU RESPOND — HARD GATE
========================================

Check every item. Fix and re-check before sending:
- Every `Source:` line is a URL a tool call actually returned this turn. If
  nothing specifically supports an angle, omit the line entirely.
- No number, percentage, or named claim appears unless a tool result or the
  user's own words actually stated it.
- SINGLE_POST: all five angles are genuinely distinct lenses.
- SERIES: every part stands alone; part count ≤ 5; each part got its own
  research budget, not a shared fraction of one.
- If RICH_NARRATIVE, every angle/part traces back to something the user
  actually said.
- No angle reads as coaching advice to the user instead of the post's own
  argument.

========================================
FORMAT — MODE: ANGLES, SINGLE_POST
========================================

MODE: ANGLES
REQUEST_TYPE: SINGLE_POST

SUMMARY:
{2-4 sentences, directly to the user ("you"), explaining what you're
proposing and why — grounded in USER CONTEXT when provided, general
otherwise.}

**{Title — a claim, never a topic}**
{One sentence: the argument this post makes.}
{500+ characters: unpack the argument — why it's true, what evidence or
personal detail supports it, what makes it non-obvious.}
· Lens: {the one lens from RULE 5 above that this angle actually uses,
verbatim — e.g. "The mechanism nobody names"}
· Audience: {specific role}
· Provokes: {comment | long-dwell | share} — {why they react}
· Source: {URL a tool call returned this turn. Omit line if none.}

{...repeat for all 5 angles, each with a different lens...}

========================================
FORMAT — MODE: ANGLES, SERIES
========================================

MODE: ANGLES
REQUEST_TYPE: SERIES (N={count})

SUMMARY:
{2-4 sentences: why this became a series, the throughline across parts, and
a one-line cadence note.}

**Part 1 of {N} — {Title — a claim, never a topic}**
{One sentence: the argument this specific post makes.}
{500+ characters unpacking it, written so it stands alone.}
· Lens: Part 1 of {N}
· Audience: {specific role}
· Provokes: {comment | long-dwell | share} — {why they react}
· Source: {URL a tool call returned this turn. Omit line if none.}

{...repeat per part, incrementing "Part i of N" in both the title and the
Lens line...}
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
    emit_activity(BUILDING_ANGLES_ID, BUILDING_ANGLES_TITLE, "completed", parent_id="researching")

    if ResearchArtifactParser.is_series(raw):
        # SERIES output has been observed to abandon the Part-i-of-N block
        # format entirely (freeform prose instead) — no parser can reliably
        # hang a "pick" UI on that, so it's shown as plain chat text instead
        # of going through the strict angle parser at all.
        series_text = ResearchArtifactParser.strip_mode_header(raw)
        if valid_source_urls:
            series_text += "\n\nSources:\n" + "\n".join(sorted(valid_source_urls))
        logger.info("researcher_linkedin: TOTAL %.2fs — SERIES response for user_id=%s",
                    time.monotonic() - t_start, user_id)
        return {
            "series_text": series_text,
            "research_search_context": ResearchArtifactParser.collect_web_search_context(messages),
        }

    artifact = ResearchArtifactParser.parse("strategic_angles", raw, valid_source_urls=valid_source_urls)
    logger.info("researcher_linkedin: TOTAL %.2fs — produced %d angles for user_id=%s",
                time.monotonic() - t_start, len(artifact.items), user_id)

    return {
        "research_artifact": artifact,
        "research_search_context": ResearchArtifactParser.collect_web_search_context(messages),
    }


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
    emit_node_activity("researcher_node", "completed")

    if "series_text" in result:
        return {"answer": result["series_text"]}

    artifact = result["research_artifact"]
    return {
        "research_result": {
            "angles": ResearchArtifactParser.to_wire_dicts(artifact),
            "search_context": result["research_search_context"],
            "summary": artifact.summary,
        },
    }
