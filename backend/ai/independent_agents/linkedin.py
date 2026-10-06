"""LinkedIn independent agent — one LLM call per turn, with thread memory.

Standalone by design (see day_3.md): no supervisor, no tools, no routing.
The graph is a single node (START -> generate -> END); it exists only so the
LangGraph checkpointer can load the conversation for a thread_id before the
LLM call and save it after. Its state lives in this file so it shares nothing
with the Reddit and X agents.
"""

from functools import lru_cache
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.graph.state import CompiledStateGraph
from pydantic import BaseModel, Field

from backend.ai.independent_agents.limits import GEMINI_ATTEMPTS, GEMINI_TIMEOUT_S
from backend.ai.independent_agents.prompts.builder import SystemPromptBuilder, log_prompt_built
from backend.ai.independent_agents.prompts.platform_specs import LINKEDIN_PROMPT
from backend.core.config import settings

AGENT = "linkedin"
MODEL_NAME = "gemini-3.5-flash"


class LinkedInState(TypedDict):
    # The whole chat; add_messages appends, never trims. Length is bounded by
    # the per-thread turn cap enforced in threads.py, not by cutting history.
    messages: Annotated[list[AnyMessage], add_messages]
    # Owner of the thread; Step 2 uses it to search the user's knowledge source.
    user_id: str


class LinkedInPost(BaseModel):
    """Structured output of the one LLM call."""

    content: str = Field(description="The full LinkedIn post, ready to paste.")
    note: str | None = Field(
        default=None, description="Short message to the user, shown apart from the post. Usually empty."
    )


@lru_cache
def _structured_llm():
    return ChatGoogleGenerativeAI(
        model=MODEL_NAME,
        google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
        base_url=settings.GEMINI_BASE_URL or None,
        thinking_level="low",
        # Bounded so a turn always finishes inside the thread lease (limits.py).
        max_retries=GEMINI_ATTEMPTS,
        timeout=GEMINI_TIMEOUT_S,
    ).with_structured_output(LinkedInPost)


async def generate(state: LinkedInState, config: RunnableConfig | None = None) -> dict:
    messages = state["messages"]
    # Gemini rejects a request ending on a model turn. The route always appends
    # the user's message before this node runs, so this only fires on a bug.
    if not messages or not isinstance(messages[-1], HumanMessage):
        raise ValueError("LinkedIn agent: conversation must end on a user message")

    prompt = SystemPromptBuilder.build(LINKEDIN_PROMPT)
    thread_id = (config or {}).get("configurable", {}).get("thread_id")
    log_prompt_built(prompt, user_id=state["user_id"], thread_id=thread_id)

    post: LinkedInPost = await _structured_llm().ainvoke(
        [SystemMessage(prompt.text), *_with_notes(messages)]
    )
    # The note rides in additional_kwargs, so `content` stays the clean post
    # for the checkpoint, the UI and the API.
    return {"messages": [AIMessage(content=post.content, additional_kwargs={"note": post.note})]}


def _with_notes(messages: list[AnyMessage]) -> list[AnyMessage]:
    """The request copy of the history: earlier notes appended to their post so
    the model sees what it asked. Gemini only reads `content`; the checkpoint
    is not changed."""
    return [
        AIMessage(content=f"{m.content}\n\n[Note to user: {m.additional_kwargs['note']}]")
        if isinstance(m, AIMessage) and m.additional_kwargs.get("note")
        else m
        for m in messages
    ]


def build_linkedin_graph(checkpointer: BaseCheckpointSaver) -> CompiledStateGraph:
    graph = StateGraph(LinkedInState)
    graph.add_node("generate", generate)
    graph.add_edge(START, "generate")
    graph.add_edge("generate", END)
    return graph.compile(checkpointer=checkpointer)
