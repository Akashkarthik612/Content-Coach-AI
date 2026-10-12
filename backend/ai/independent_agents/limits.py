"""Gemini call limits for the independent agents, the thread lease derived
from them, and platform post limits shared by prompts and validators.

The lease (threads.py) must outlast the slowest possible turn, otherwise a
second turn or a delete could start while the first is still running. So it
is computed from the call limits here, never hardcoded: change the attempts
or the timeout and the lease follows.
"""

from datetime import timedelta

import httpx
from google.genai.errors import APIError

# `max_retries` in ChatGoogleGenerativeAI is the TOTAL number of attempts
# (passed through as google-genai's HttpRetryOptions.attempts).
GEMINI_ATTEMPTS = 3
GEMINI_TIMEOUT_S = 30  # per attempt
BACKOFF_S = 5  # google-genai's exponential backoff between the attempts (~1s + ~2s + jitter)
SAVE_BUFFER_S = 15  # loading/saving the checkpoint + the agent_threads updates

# Knowledge tool loop (backend/ai/tools/tool_loop.py): up to MAX_TOOL_ROUNDS
# lookup rounds, then one more model call that submits (or is forced to).
MAX_TOOL_ROUNDS = 4
# Per turn, across all rounds: a model can ask for several tools in one round,
# so the lease bounds calls, not rounds. Extra calls get a call_limit result.
MAX_TOOL_CALLS = 4
TOOL_TIMEOUT_S = 20  # per tool call; also the DB statement_timeout of that call

LLM_CALL_WORST_S = GEMINI_ATTEMPTS * GEMINI_TIMEOUT_S + BACKOFF_S
TURN_WORST_S = (MAX_TOOL_ROUNDS + 1) * LLM_CALL_WORST_S + MAX_TOOL_CALLS * TOOL_TIMEOUT_S  # 555 s

LEASE = timedelta(seconds=TURN_WORST_S + SAVE_BUFFER_S)  # 570 s

# X rejects longer posts. Used by the X prompt and the post-call check in x.py.
X_POST_MAX_CHARS = 280

# The status codes google-genai retries; still failing after the last attempt
# means "timed out / overloaded", not "bad request".
_TRANSIENT_STATUS = {408, 429, 500, 502, 503, 504}


def is_transient_llm_error(exc: BaseException) -> bool:
    """True if the call failed by timing out or being rate-limited/overloaded.
    Walks the cause chain because langchain-google-genai wraps some errors."""
    seen: set[int] = set()
    while exc is not None and id(exc) not in seen:
        seen.add(id(exc))
        if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
            return True
        if isinstance(exc, APIError) and exc.code in _TRANSIENT_STATUS:
            return True
        exc = exc.__cause__ or exc.__context__
    return False
