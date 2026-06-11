import logging

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage

from backend.core.config import settings
from backend.ai.worker_states import WriterState

logger = logging.getLogger(__name__)

_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.7,
    max_output_tokens=4096,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
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

    research_section = ""
    if research_brief:
        points = "\n".join(f"- {p}" for p in research_brief.get("talking_points", []))
        avoid  = research_brief.get("avoid_repeating") or ""
        research_section = (
            f"\nCONTENT BRIEF (from researcher — use for WHAT to say, not HOW):\n"
            f"angle: {research_brief.get('recommended_angle', '')}\n"
            f"talking points:\n{points}\n"
            + (f"avoid: {avoid}\n" if avoid else "")
            + f"length: {research_brief.get('suggested_length', 'medium')}\n"
        )

    action      = writer_task.get("action", "write")
    constraints = writer_task.get("constraints") or []
    constraint_block = "\n".join(f"- {c}" for c in constraints)
    action_instruction = (
        "ACTION: WRITE — produce a new post from scratch."
        if action == "write"
        else (
            "ACTION: REWRITE — the existing draft is appended at the end of this conversation.\n"
            "Apply these changes to it:\n" + (constraint_block or "(no specific constraints)")
        )
    )

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


async def writer_node(state: WriterState) -> dict:
    logger.debug("writer_node invoked: user_id=%s", state.get("user_id"))

    style_json     = state.get("style_json") or {}
    research_brief = state.get("research_brief") or {}
    writer_task    = state.get("writer_task") or {"action": "write"}

    if not style_json:
        logger.info("writer_node: no style_json — using cold-start defaults")
        system_content = _COLD_START_SYSTEM
    else:
        system_content = _build_system_prompt(style_json, research_brief, writer_task)

    messages = [SystemMessage(content=system_content), *state["messages"]]

    # On rewrite: append existing draft as context so writer knows what to modify
    if writer_task.get("action") == "rewrite" and state.get("draft"):
        messages.append(HumanMessage(content=f"[EXISTING DRAFT TO MODIFY]\n{state['draft']}"))

    response = await _llm.ainvoke(messages)
    content = response.content.strip() if isinstance(response.content, str) else ""
    logger.info("writer_node: draft generated, char_count=%d", len(content))
    if not content:
        logger.error("writer_node: LLM returned empty content — model may have refused or failed")
    return {"draft": content}
