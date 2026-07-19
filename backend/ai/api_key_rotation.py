"""
Gemini API key fallback — rotates to a second key on quota/error failures.

ChatGoogleGenerativeAI builds its internal google.genai Client once at
construction (see langchain_google_genai/chat_models.py) and never re-reads
its google_api_key field afterward — so recovering from an exhausted key
means rebuilding that client in place, not just reassigning a field.

No-op until LANGCHAIN_API_KEY_GEMINI_2 is set in .env — rotate_gemini_key()
just returns False and the caller's original error propagates unchanged.
"""
import logging

from google.genai.client import Client

from backend.core.config import settings

logger = logging.getLogger(__name__)

_KEYS = [k for k in (settings.LANGCHAIN_API_KEY_GEMINI, settings.LANGCHAIN_API_KEY_GEMINI_2) if k]
_current_index = 0


def get_current_gemini_key() -> str:
    """Current Gemini API key — pass to google_api_key= when constructing a
    new ChatGoogleGenerativeAI, so newly-created instances start on whichever
    key is currently active rather than always the first one."""
    return _KEYS[_current_index] if _KEYS else ""


def rotate_gemini_key(llm) -> bool:
    """Advances to the next configured Gemini key and rebuilds llm's internal
    client to use it, in place.

    llm may be a bare ChatGoogleGenerativeAI or a bind_tools()-wrapped
    RunnableBinding (supervisor.py, researcher.py) — unwraps via .bound in
    the latter case.

    Returns True if a fallback key was available and the client was rebuilt
    (the caller should retry), False if there's no key left to switch to
    (the caller should let the original error propagate).
    """
    global _current_index
    if _current_index + 1 >= len(_KEYS):
        return False

    _current_index += 1
    next_key = _KEYS[_current_index]

    target = getattr(llm, "bound", llm)
    target.google_api_key = next_key
    target.client = Client(api_key=next_key)

    logger.warning("api_key_rotation: switched to Gemini key #%d after a quota/error failure", _current_index + 1)
    return True
