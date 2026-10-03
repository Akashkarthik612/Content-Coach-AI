"""X independent agent — one LLM call that writes one X post or thread.

Standalone by design (see day_3.md): no supervisor, no graph, no tools. Its
request/response state lives in this file so it shares nothing with the
LinkedIn and Reddit agents.
"""

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from backend.ai.independent_agents.limits import GEMINI_ATTEMPTS, GEMINI_TIMEOUT_S
from backend.core.config import settings

MODEL_NAME = "gemini-3.5-flash"
MAX_CHARS = 280

SYSTEM_PROMPT = f"""You write posts for X (formerly Twitter).

Rules:
- Every post must be at most {MAX_CHARS} characters, counting spaces.
- Single post by default. Only write a thread (2-6 posts) if the user asks for
  one or the idea genuinely cannot fit in one post.
- Punchy, direct, opinionated. Cut filler words. One idea per post.
- First post is the hook; it must stand alone.
- At most 1-2 hashtags in total, only if they add reach. No emoji walls.
- Do not number thread posts unless it helps readability.
- Write only the post(s). No preamble, no explanation."""


class XPostRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=4000)
    thread: bool = False
    tone: str | None = Field(default=None, max_length=200)
    extra_context: str | None = Field(default=None, max_length=8000)


class XPostResponse(BaseModel):
    posts: list[str] = Field(
        min_length=1,
        description=f"One entry for a single post, several for a thread. Each at most {MAX_CHARS} characters.",
    )


class XAgent:
    @staticmethod
    async def run(req: XPostRequest) -> XPostResponse:
        llm = ChatGoogleGenerativeAI(
            model=MODEL_NAME,
            google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
            thinking_level="low",
            max_retries=GEMINI_ATTEMPTS,
            timeout=GEMINI_TIMEOUT_S,
        ).with_structured_output(XPostResponse)

        user_msg = f"Topic: {req.topic}\nFormat: {'thread' if req.thread else 'single post'}"
        if req.tone:
            user_msg += f"\nTone: {req.tone}"
        if req.extra_context:
            user_msg += f"\nContext:\n{req.extra_context}"

        return await llm.ainvoke([SystemMessage(SYSTEM_PROMPT), HumanMessage(user_msg)])
