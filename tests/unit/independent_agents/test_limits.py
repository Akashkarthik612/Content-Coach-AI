"""Gemini call limits, the lease derived from them, and Reddit's size caps."""

import httpx
from google.genai.errors import APIError
from langchain_google_genai.chat_models import ChatGoogleGenerativeAIError

from backend.ai.independent_agents import limits
from backend.ai.independent_agents.reddit import REDDIT_BODY_MAX_CHARS, RedditPostRequest


def test_lease_outlasts_slowest_possible_turn():
    worst_case_llm_s = limits.GEMINI_ATTEMPTS * limits.GEMINI_TIMEOUT_S + limits.BACKOFF_S
    assert limits.LEASE.total_seconds() > worst_case_llm_s


def test_timeout_is_transient():
    assert limits.is_transient_llm_error(httpx.ReadTimeout("slow"))


def test_rate_limit_wrapped_by_langchain_is_transient():
    try:
        try:
            raise APIError(429, {"error": {"message": "quota"}})
        except APIError as inner:
            raise ChatGoogleGenerativeAIError("wrapped") from inner
    except ChatGoogleGenerativeAIError as outer:
        assert limits.is_transient_llm_error(outer)


def test_bad_request_is_not_transient():
    assert not limits.is_transient_llm_error(APIError(400, {"error": {"message": "bad"}}))
    assert not limits.is_transient_llm_error(ValueError("unparseable"))


def test_reddit_revision_fits_a_max_size_post():
    draft = "Revise this current draft according to the request above.\n\nTitle: " + "t" * 300
    draft += "\n\n" + "b" * REDDIT_BODY_MAX_CHARS
    RedditPostRequest(topic="make it shorter", extra_context=draft)  # must not raise
