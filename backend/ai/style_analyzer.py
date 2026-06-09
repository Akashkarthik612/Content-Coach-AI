"""
Style Analyzer — LLM-based writing style extraction.

Runs synchronously (no async) so it can be called directly from FastAPI
BackgroundTasks without event-loop complications.

One function: analyze_style(post_contents).
The caller decides which posts to pass (5 recent for short-term, 20 historical
for long-term). The same prompt and model handles both cases.
"""
import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from backend.core.config import settings

logger = logging.getLogger(__name__)

_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
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


def analyze_style(post_contents: list[str]) -> dict:
    """
    Analyze a list of post content strings and return a style dict with 9 keys.

    Raises ValueError if the LLM returns unparseable JSON.
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

    # Strip markdown fences if the model added them despite instructions
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    result = json.loads(raw)

    _EXPECTED_KEYS = {
        "hook_style", "tone", "sentence_rhythm", "paragraph_structure",
        "emoji_usage", "cta_style", "vocabulary_level", "structural_patterns",
        "recurring_themes",
    }
    missing = _EXPECTED_KEYS - result.keys()
    if missing:
        raise ValueError(f"Style JSON missing keys: {missing}")

    return result
