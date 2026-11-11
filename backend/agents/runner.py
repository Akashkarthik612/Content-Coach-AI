"""One turn of any custom agent: the shared loop that runs every config row
(Dust's model, Day_8.md §1). Adding an agent adds a row, never code here.

The config's prompt goes into the system message; with the knowledge tools on
the turn is the Day 7 tool loop ending in submit_answer, off it's one
structured call. Takes a message list, so thread memory (next) can call it
with a conversation instead of one message.
"""

from collections.abc import Sequence
from functools import lru_cache
from typing import TypeVar

from langchain_core.messages import AnyMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from backend.agents.models import AgentModel
from backend.agents.prompt import CustomAgentPromptBuilder, escape
from backend.agents.records import AgentAnswer, AgentConfig
from backend.agents.schemas import AgentChatResponse
from backend.ai.independent_agents.limits import GEMINI_ATTEMPTS, GEMINI_TIMEOUT_S
from backend.ai.independent_agents.prompts.builder import log_prompt_built
from backend.ai.tools.access import KnowledgeAccess, sources_json
from backend.ai.tools.context import ToolContext
from backend.ai.tools.records import ToolLoopResult
from backend.ai.tools.tool_loop import SUBMIT_ANSWER
from backend.core.config import settings

AGENT = "custom"
T = TypeVar("T", bound=BaseModel)


@lru_cache
def chat_model(model: AgentModel) -> ChatGoogleGenerativeAI:
    """One client per model, same limits as the platform agents, so a turn's
    worst case stays inside the Day 7 caps."""
    return ChatGoogleGenerativeAI(
        model=model.value,
        google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
        base_url=settings.GEMINI_BASE_URL or None,
        thinking_level="low",
        max_retries=GEMINI_ATTEMPTS,
        timeout=GEMINI_TIMEOUT_S,
    )


class CustomAgentRunner:
    @staticmethod
    async def run(
        config: AgentConfig,
        messages: Sequence[AnyMessage],
        knowledge: KnowledgeAccess,
        ctx: ToolContext,
        output_schema: type[T] = AgentAnswer,
        platform_rules: str = "",
    ) -> ToolLoopResult[T]:
        """Shared bounded runtime for personal/workspace agents and structured handoffs.

        The caller builds the trusted scope and immutable config, never the model.
        The submit tool's schema is authoritative for workflow outputs.
        """
        prompt = CustomAgentPromptBuilder.build(config, tools_bound=True)
        tools = ctx.enabled_tools
        contract = (
            "\nThe submit_answer tool declaration defines the complete output contract for this turn. "
            "Populate all required fields in that schema, including structured facts or issues when present."
        )
        context = f"\nAgent responsibility: {escape(config.responsibility)}"
        if tools is not None:
            context += "\nAvailable data tools: " + (", ".join(tools) or "none")
        request = [SystemMessage(platform_rules + context + "\n\n" + prompt.text + contract), *messages]
        return await knowledge.write(chat_model(config.model), request, output_schema, ctx, SUBMIT_ANSWER)

    @staticmethod
    async def answer(
        config: AgentConfig,
        messages: Sequence[AnyMessage],
        knowledge: KnowledgeAccess | None,
        correlation_id: str,
    ) -> AgentChatResponse:
        """`config` was loaded scoped to its owner, so config.user_id is the
        user the tools read for. Errors propagate; the route logs and maps them."""
        prompt = CustomAgentPromptBuilder.build(config, tools_bound=knowledge is not None)
        log_prompt_built(
            prompt, user_id=config.user_id, agent_config_id=config.id, correlation_id=correlation_id
        )
        request = [SystemMessage(prompt.text), *messages]
        llm = chat_model(config.model)

        if knowledge is None:
            answer: AgentAnswer = await llm.with_structured_output(AgentAnswer).ainvoke(request)
            return AgentChatResponse(content=answer.content, note=answer.note)
        ctx = ToolContext(user_id=config.user_id, agent=AGENT, correlation_id=correlation_id)
        result = await knowledge.write(llm, request, AgentAnswer, ctx, SUBMIT_ANSWER)
        return AgentChatResponse(
            content=result.output.content, note=result.output.note, sources=sources_json(result.sources)
        )
