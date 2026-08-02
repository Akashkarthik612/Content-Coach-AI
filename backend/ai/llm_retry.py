import logging

from google.genai.errors import ClientError, ServerError
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables import Runnable
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

_RETRYABLE_CODES = {429, 503, 504}


def _is_retryable(exc: BaseException) -> bool:
    return isinstance(exc, (ClientError, ServerError)) and getattr(exc, "code", None) in _RETRYABLE_CODES


async def invoke_with_retry(
    llm: Runnable, messages: list[BaseMessage] | str, max_attempts: int = 3
) -> AIMessage:
    """await llm.ainvoke(messages) with exponential backoff on transient Gemini
    429/503/504 errors. Re-raises unchanged after max_attempts or on any
    non-transient error — a genuine failure still surfaces, it just isn't a
    false alarm from a momentary blip."""

    @retry(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception(_is_retryable),
        reraise=True,
    )
    async def _call() -> AIMessage:
        return await llm.ainvoke(messages)

    return await _call()


def invoke_with_retry_sync(
    llm: Runnable, messages: list[BaseMessage] | str, max_attempts: int = 3
) -> AIMessage:
    """Sync counterpart of invoke_with_retry — for call sites (e.g. style_agent.py's
    analyze_style, run via asyncio.to_thread by its caller) that use llm.invoke()."""

    @retry(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception(_is_retryable),
        reraise=True,
    )
    def _call() -> AIMessage:
        return llm.invoke(messages)

    return _call()
