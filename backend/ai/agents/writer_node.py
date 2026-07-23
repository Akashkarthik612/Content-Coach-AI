import logging

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import AIMessage, SystemMessage, HumanMessage

from backend.core.config import settings
from backend.ai.activity import STYLE_ANALYSIS_ID, STYLE_ANALYSIS_TITLE, emit_activity, emit_node_activity
from backend.ai.agents.context_loaders import StyleContextLoader
from backend.ai.llm_retry import invoke_with_retry
from backend.ai.worker_states import WriterState

logger = logging.getLogger(__name__)

_llm = ChatGoogleGenerativeAI(
    model="gemini-3.6-flash", 
    temperature=0.7,
    max_output_tokens=8192,  
                             # the final answer; a long style/research prompt could exhaust it
                             # on reasoning alone, leaving zero tokens for the actual draft
    thinking_level="low",  # drafting doesn't need deep reasoning — cuts latency
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
    streaming=True,
)

_COLD_START_SYSTEM = """\
You are a LinkedIn ghostwriter. Write a substantive, engaging post in a clean LinkedIn voice.

STRUCTURE:
- Strong opening hook — a bold statement, surprising fact, or short personal moment (1–2 lines)
- Build the idea with specifics — examples, observations, contrasts, or a mini story (4–8 lines across 2–4 paragraphs)
- Close with a single direct question or call to action

STYLE:
- First-person, conversational, no jargon
- Short paragraphs with blank lines between them — never more than 3 lines per paragraph
- Minimum 150 words, aim for 200–300 words
- No emojis unless the user's request explicitly includes them
- No bullets, no bold, no asterisks (*), no markdown — pure plain text
- If the user's message contains ANY explicit formatting instruction (e.g. "avoid *"), treat it as an absolute law

Output ONLY the post text. Nothing else.
"""


def _build_research_section(research_brief: dict) -> str:
    if not research_brief:
        return ""
    points = "\n".join(f"- {p}" for p in research_brief.get("talking_points", []))
    avoid  = research_brief.get("avoid_repeating") or ""
    hook   = research_brief.get("suggested_hook") or ""
    evidence = "\n".join(
        f"- {e.get('point', '')}" + (f" (source: {e.get('source_title')})" if e.get("source_title") else "")
        for e in research_brief.get("supporting_evidence", [])
    )
    return (
        f"\nCONTENT BRIEF (from researcher — use for WHAT to say, not HOW):\n"
        f"angle: {research_brief.get('recommended_angle', '')}\n"
        f"talking points:\n{points}\n"
        + (f"supporting facts (weave in naturally, no formal citations):\n{evidence}\n" if evidence else "")
        + (f"a hook you could open with (adapt to the style rules above): {hook}\n" if hook else "")
        + (f"avoid: {avoid}\n" if avoid else "")
        + f"length: {research_brief.get('suggested_length', 'medium')}\n"
    )


def _build_action_instruction(writer_task: dict) -> str:
    action      = writer_task.get("action", "write")
    constraints = writer_task.get("constraints") or []
    constraint_block = "\n".join(f"- {c}" for c in constraints)
    return (
        "ACTION: WRITE — produce a new post from scratch."
        if action == "write"
        else (
            "ACTION: REWRITE — the existing draft is appended at the end of this conversation.\n"
            "Apply these changes to it:\n" + (constraint_block or "(no specific constraints)")
        )
    )


def _build_system_prompt(style_json: dict, research_brief: dict, writer_task: dict) -> str:
    lt     = style_json.get("long_term") or {}
    st     = style_json.get("short_term") or {}
    merged = {**lt, **st}

    evolved_keys = {k for k in st if st.get(k) != lt.get(k)}

    style_block = "\n".join([
        f"hook_style:          {merged.get('hook_style', 'unknown')}",
        f"tone:                {merged.get('tone', 'unknown')}",
        f"sentence_rhythm:     {merged.get('sentence_rhythm', 'unknown')}",
        f"paragraph_structure: {merged.get('paragraph_structure', 'unknown')}",
        f"emoji_usage:         {merged.get('emoji_usage', 'unknown')}",
        f"cta_style:           {merged.get('cta_style', 'unknown')}",
        f"vocabulary_level:    {merged.get('vocabulary_level', 'unknown')}",
        f"structural_patterns: {merged.get('structural_patterns', 'unknown')}",
        f"recurring_themes:    {merged.get('recurring_themes', 'unknown')}",
    ])

    evolution_note = (
        f"NOTE: style evolved on [{', '.join(evolved_keys)}] in recent posts — rules above already reflect this.\n"
        if evolved_keys else ""
    )

    research_section    = _build_research_section(research_brief)
    action_instruction  = _build_action_instruction(writer_task)

    return f"""\
You are a LinkedIn ghostwriter. Write AS this specific person — the output must be \
indistinguishable from their own published posts.

STYLE RULES (extracted from their actual posts — every rule is non-negotiable):
{style_block}
{evolution_note}
{research_section}
{action_instruction}

ABSOLUTE LAWS:
- emoji_usage is law. If it says "no emojis" or "absent" — zero emojis. No exceptions ever.
- structural_patterns is law. "No bullets/no bold" means pure prose only.
- Match the post length implied by paragraph_structure and sentence_rhythm.
- If the user's message contains ANY explicit formatting instruction (e.g. "avoid *", "no asterisks", "no bullets", "no bold", "no emojis") — treat it as an absolute law that overrides everything else.
- Output ONLY the post text. No "Here's your post:", no preamble, no labels.
"""


def _build_onboarding_system_prompt(profile_context: dict, research_brief: dict, writer_task: dict) -> str:
    """Used when there's no post history yet (no style_json) but the user
    completed onboarding. Lighter-weight grounding than _build_system_prompt —
    it never claims to know the user's actual voice, only their stated
    profession/industry/audience/goals, so the model doesn't fabricate
    style rules from nothing."""
    profile_block = "\n".join([
        f"profession:       {profile_context.get('profession') or 'unknown'}",
        f"industry:         {profile_context.get('industry') or 'unknown'}",
        f"role:             {profile_context.get('role') or 'unknown'}",
        f"target audience:  {profile_context.get('target_audience') or 'unknown'}",
        f"stated writing style: {profile_context.get('writing_style') or 'unknown'}",
        f"goals:            {', '.join(profile_context.get('goals') or []) or 'unknown'}",
        f"topics of interest: {', '.join(profile_context.get('topics') or []) or 'unknown'}",
    ])

    research_section   = _build_research_section(research_brief)
    action_instruction = _build_action_instruction(writer_task)

    return f"""\
You are a LinkedIn ghostwriter. This person has no published post history yet, so you
cannot know their exact voice — do not invent specific stylistic quirks. Use what they
told us about themselves during onboarding to ground the topic and angle, and otherwise
write in a clean, professional, first-person LinkedIn voice.

WHAT THEY TOLD US ABOUT THEMSELVES:
{profile_block}
{research_section}
{action_instruction}

STYLE (defaults — no post history to override these yet):
- First-person, conversational, no jargon
- Short paragraphs with blank lines between them — never more than 3 lines per paragraph
- Minimum 150 words, aim for 200–300 words
- No emojis unless the user's request explicitly includes them
- No bullets, no bold, no asterisks (*), no markdown — pure plain text
- If the user's message contains ANY explicit formatting instruction (e.g. "avoid *"), treat it as an absolute law
- Output ONLY the post text. No "Here's your post:", no preamble, no labels.
"""


async def writer_node(state: WriterState) -> dict:
    logger.debug("writer_node invoked: user_id=%s", state.get("user_id"))
    emit_node_activity("writer_node", "running")

    emit_activity(STYLE_ANALYSIS_ID, STYLE_ANALYSIS_TITLE, "running", parent_id="writing_draft")
    context = await StyleContextLoader.load(state["user_id"])
    emit_activity(STYLE_ANALYSIS_ID, STYLE_ANALYSIS_TITLE, "completed", parent_id="writing_draft")

    style_json      = context["style_json"]
    profile_context = context["profile_context"]
    research_brief  = state.get("research_brief") or {}
    writer_task     = state.get("writer_task") or {"action": "write"}

    if style_json:
        system_content = _build_system_prompt(style_json, research_brief, writer_task)
    elif profile_context:
        logger.info("writer_node: no style_json, using onboarding profile fallback")
        system_content = _build_onboarding_system_prompt(profile_context, research_brief, writer_task)
    else:
        logger.info("writer_node: no style_json, no profile — using cold-start defaults")
        system_content = _COLD_START_SYSTEM

    messages = [SystemMessage(content=system_content), *state["messages"]]

    # On rewrite: append existing draft as context so writer knows what to modify
    if writer_task.get("action") == "rewrite" and state.get("draft"):
        messages.append(HumanMessage(content=f"[EXISTING DRAFT TO MODIFY]\n{state['draft']}"))

    # Gemini rejects any request ending on a model turn. After an angle pick,
    # state["messages"] still ends with supervisor_node's own classification
    # AIMessage (supervisor.py appends it, and no node between there and here
    # adds a new turn on the "pick" path) — guarantee the request always ends
    # on a user turn.
    if isinstance(messages[-1], AIMessage):
        messages.append(HumanMessage(
            content=writer_task.get("topic") or state.get("query") or "Write the post."
        ))

    response = await invoke_with_retry(_llm, messages)
    raw = response.content
    if isinstance(raw, list):
        content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in raw).strip()
    elif isinstance(raw, str):
        content = raw.strip()
    else:
        content = ""
    logger.info("writer_node: draft generated, char_count=%d", len(content))
    if not content:
        logger.error(
            "writer_node: LLM returned empty content — finish_reason=%r usage=%r raw=%r",
            response.response_metadata.get("finish_reason"),
            response.response_metadata.get("usage_metadata"),
            raw,
        )
    emit_node_activity("writer_node", "completed")
    return {"draft": content}
