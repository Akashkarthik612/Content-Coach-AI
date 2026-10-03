"""Reddit independent agent — one LLM call that writes one Reddit post.

Standalone by design (see day_3.md): no supervisor, no graph, no tools. Its
request/response state lives in this file so it shares nothing with the
LinkedIn and X agents.
"""

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from backend.ai.independent_agents.limits import GEMINI_ATTEMPTS, GEMINI_TIMEOUT_S
from backend.core.config import settings

MODEL_NAME = "gemini-3.5-flash"

# Reddit's own limits for a text post.
REDDIT_TITLE_MAX_CHARS = 300
REDDIT_BODY_MAX_CHARS = 40_000
# A revision sends the whole current draft (instruction line + title + body)
# as extra_context, so it must fit a maximum-size Reddit post.
EXTRA_CONTEXT_MAX_CHARS = REDDIT_BODY_MAX_CHARS + REDDIT_TITLE_MAX_CHARS + 500

SYSTEM_PROMPT = """You write Reddit posts.

Rules:
- Reddit punishes marketing. Write like a community member sharing something
  genuinely useful, not a brand. No hype words, no calls to "check out my product".
- Title: specific and honest, under 120 characters, no clickbait, no emoji.
- Body: plain conversational tone, markdown allowed (short paragraphs, lists).
  Lead with value — the story, data, or lesson — before any mention of what you built.
- If self-promotion is unavoidable, be transparent about it in one line.
- End with a genuine question to start discussion.
- Suggest the single best-fit subreddit (name only, without "r/").
- Write only the post. No preamble, no explanation."""


class RedditPostRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=4000)
    subreddit: str | None = Field(default=None, max_length=100)
    tone: str | None = Field(default=None, max_length=200)
    extra_context: str | None = Field(default=None, max_length=EXTRA_CONTEXT_MAX_CHARS)


class RedditPostResponse(BaseModel):
    title: str = Field(description="Post title, under 120 characters.")
    content: str = Field(description="Post body in Reddit markdown.")
    suggested_subreddit: str = Field(description="Best-fit subreddit name, without 'r/'.")


class RedditAgent:
    @staticmethod
    async def run(req: RedditPostRequest) -> RedditPostResponse:
        llm = ChatGoogleGenerativeAI(
            model=MODEL_NAME,
            google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
            thinking_level="low",
            max_retries=GEMINI_ATTEMPTS,
            timeout=GEMINI_TIMEOUT_S,
        ).with_structured_output(RedditPostResponse)

        user_msg = f"Topic: {req.topic}"
        if req.subreddit:
            user_msg += f"\nTarget subreddit: r/{req.subreddit.removeprefix('r/')}"
        if req.tone:
            user_msg += f"\nTone: {req.tone}"
        if req.extra_context:
            user_msg += f"\nContext:\n{req.extra_context}"

        return await llm.ainvoke([SystemMessage(SYSTEM_PROMPT), HumanMessage(user_msg)])
