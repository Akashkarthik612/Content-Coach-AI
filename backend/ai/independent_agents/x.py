"""X independent agent — writes one X post or thread per request.

Standalone by design (see day_3.md): no supervisor, no graph. With the
knowledge tools on (Day 7) the turn is a tool loop; off, one structured call.
Its request/response state lives in this file so it shares nothing with the
LinkedIn and Reddit agents.
"""

import logging
from uuid import UUID, uuid4

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from backend.ai.independent_agents.limits import GEMINI_ATTEMPTS, GEMINI_TIMEOUT_S, X_POST_MAX_CHARS
from backend.ai.independent_agents.prompts.builder import SystemPromptBuilder, log_prompt_built
from backend.ai.independent_agents.prompts.platform_specs import X_PROMPT
from backend.ai.independent_agents.schemas import SourceRefOut
from backend.ai.tools.access import KnowledgeAccess, sources_json
from backend.ai.tools.context import ToolContext
from backend.core.config import settings

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-3.5-flash"
MAX_CHARS = X_POST_MAX_CHARS


class XPostTooLongError(Exception):
    """The model returned a post X would reject. Raised, never truncated."""

    def __init__(self, index: int, length: int):
        super().__init__(f"X post {index} is {length} chars (limit {MAX_CHARS})")
        self.index = index
        self.length = length


class XPostRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=4000)
    thread: bool = False
    tone: str | None = Field(default=None, max_length=200)
    extra_context: str | None = Field(default=None, max_length=8000)


class XPostResponse(BaseModel):
    """What the model fills (structured output, or submit_post's arguments).
    Keep server-side fields out of it: the model would invent them."""

    # maxLength is a hint in the schema sent to Gemini only. It is not a
    # parse-time check, so a too-long post reaches XAgent.check_lengths and
    # fails there with a specific, logged error.
    posts: list[str] = Field(
        min_length=1,
        description=f"One entry for a single post, several for a thread. Each at most {MAX_CHARS} characters.",
        json_schema_extra={"items": {"type": "string", "maxLength": MAX_CHARS}},
    )
    note: str | None = Field(default=None, description="Short message to the user, shown apart from the post.")


class XDraftResponse(XPostResponse):
    """The API response: the model's post plus the documents its tools showed it."""

    sources: list[SourceRefOut] = []


class XAgent:
    @staticmethod
    async def run(req: XPostRequest, user_id: UUID, knowledge: KnowledgeAccess | None = None) -> XDraftResponse:
        llm = ChatGoogleGenerativeAI(
            model=MODEL_NAME,
            google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
            base_url=settings.GEMINI_BASE_URL or None,
            thinking_level="low",
            max_retries=GEMINI_ATTEMPTS,
            timeout=GEMINI_TIMEOUT_S,
        )

        user_msg = f"Topic: {req.topic}\nFormat: {'thread' if req.thread else 'single post'}"
        if req.tone:
            user_msg += f"\nTone: {req.tone}"
        if req.extra_context:
            user_msg += f"\nContext:\n{req.extra_context}"

        prompt = SystemPromptBuilder.build(X_PROMPT, tools_bound=knowledge is not None)
        log_prompt_built(prompt, user_id=user_id)
        request = [SystemMessage(prompt.text), HumanMessage(user_msg)]
        if knowledge is None:
            post: XPostResponse = await llm.with_structured_output(XPostResponse).ainvoke(request)
            sources: list[dict] = []
        else:
            ctx = ToolContext(user_id=user_id, agent="x", correlation_id=str(uuid4()))
            result = await knowledge.write(llm, request, XPostResponse, ctx)
            post, sources = result.output, sources_json(result.sources)
        XAgent.check_lengths(post, user_id)
        return XDraftResponse(**post.model_dump(), sources=sources)

    @staticmethod
    def check_lengths(result: XPostResponse, user_id: UUID) -> None:
        # len() counts code points; X weights URLs (23) and emoji/CJK (2). The
        # X prompt bans links and emoji, so len() is close enough for now.
        for index, post in enumerate(result.posts):
            if len(post) > MAX_CHARS:
                logger.warning(
                    "x.post_too_long index=%d length=%d limit=%d user_id=%s",
                    index, len(post), MAX_CHARS, user_id,
                )
                raise XPostTooLongError(index, len(post))
