"""Reddit independent agent — one LLM call that writes one Reddit post.

Standalone by design (see day_3.md): no supervisor, no graph, no tools. Its
request/response state lives in this file so it shares nothing with the
LinkedIn and X agents.
"""

from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from backend.ai.independent_agents.limits import GEMINI_ATTEMPTS, GEMINI_TIMEOUT_S
from backend.ai.independent_agents.prompts.builder import SystemPromptBuilder, log_prompt_built
from backend.ai.independent_agents.prompts.platform_specs import REDDIT_PROMPT
from backend.core.config import settings

MODEL_NAME = "gemini-3.5-flash"

# Reddit's own limits for a text post.
REDDIT_TITLE_MAX_CHARS = 300
REDDIT_BODY_MAX_CHARS = 40_000
# A revision sends the whole current draft (instruction line + title + body)
# as extra_context, so it must fit a maximum-size Reddit post.
EXTRA_CONTEXT_MAX_CHARS = REDDIT_BODY_MAX_CHARS + REDDIT_TITLE_MAX_CHARS + 500


class RedditPostRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=4000)
    subreddit: str | None = Field(default=None, max_length=100)
    tone: str | None = Field(default=None, max_length=200)
    extra_context: str | None = Field(default=None, max_length=EXTRA_CONTEXT_MAX_CHARS)


class RedditPostResponse(BaseModel):
    title: str = Field(description="Post title, under 120 characters.")
    content: str = Field(description="Post body in Reddit markdown.")
    suggested_subreddit: str = Field(description="Best-fit subreddit name, without 'r/'.")
    note: str | None = Field(default=None, description="Short message to the user, shown apart from the post.")


class RedditAgent:
    @staticmethod
    async def run(req: RedditPostRequest, user_id: UUID) -> RedditPostResponse:
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

        prompt = SystemPromptBuilder.build(REDDIT_PROMPT)
        log_prompt_built(prompt, user_id=user_id)
        return await llm.ainvoke([SystemMessage(prompt.text), HumanMessage(user_msg)])
