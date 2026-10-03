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
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.graph.state import CompiledStateGraph
from pydantic import BaseModel, Field

from backend.ai.independent_agents.limits import GEMINI_ATTEMPTS, GEMINI_TIMEOUT_S
from backend.core.config import settings

AGENT = "linkedin"
MODEL_NAME = "gemini-3.5-flash"

SYSTEM_PROMPT = """You write LinkedIn posts.

Rules:
- Open with a hook line that makes someone stop scrolling. No "I'm excited to announce".
- Short paragraphs (1-2 sentences), generous line breaks, readable on mobile.
- Concrete over generic: specific details, numbers, lessons learned.
- 120-250 words unless the user asks otherwise.
- End with a question or clear takeaway that invites comments.
- At most 3 relevant hashtags, on the last line. No emoji walls.
- When the user asks to change a post from earlier in this conversation, revise
  that post instead of starting over.
- Write only the post. No preamble, no explanation."""


class LinkedInState(TypedDict):
    # The whole chat; add_messages appends, never trims. Length is bounded by
    # the per-thread turn cap enforced in threads.py, not by cutting history.
    messages: Annotated[list[AnyMessage], add_messages]
    # Owner of the thread; Step 2 uses it to search the user's knowledge source.
    user_id: str


class LinkedInPost(BaseModel):
    """Structured output of the one LLM call."""

    content: str = Field(description="The full LinkedIn post, ready to paste.")


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


async def generate(state: LinkedInState) -> dict:
    messages = state["messages"]
    # Gemini rejects a request ending on a model turn. The route always appends
    # the user's message before this node runs, so this only fires on a bug.
    if not messages or not isinstance(messages[-1], HumanMessage):
        raise ValueError("LinkedIn agent: conversation must end on a user message")

    post: LinkedInPost = await _structured_llm().ainvoke([SystemMessage(SYSTEM_PROMPT), *messages])
    return {"messages": [AIMessage(content=post.content)]}


def build_linkedin_graph(checkpointer: BaseCheckpointSaver) -> CompiledStateGraph:
    graph = StateGraph(LinkedInState)
    graph.add_node("generate", generate)
    graph.add_edge(START, "generate")
    graph.add_edge("generate", END)
    return graph.compile(checkpointer=checkpointer)
