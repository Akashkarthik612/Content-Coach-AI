from typing import Literal

from pydantic import BaseModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage

from backend.core.config import settings
from backend.ai.state import AgentState
from backend.ai.agents.tools import (
    search_vault_posts,
    get_style_samples,
    get_topic_inventory,
    analyze_publish_history,
    get_post_analytics,
)


# ── LLM instances (module-level — avoids cold-start cost on every graph call) ──
_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.2,
    max_output_tokens=2048,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

_all_tools = [search_vault_posts, get_style_samples, get_topic_inventory, analyze_publish_history, get_post_analytics]
_llm_agent  = _llm.bind_tools(_all_tools)


# ── Structured classification schema ──────────────────────────────────────────
class ClassificationResult(BaseModel):
    task_type: Literal["general", "research", "write", "analytics", "suggest"]


_classifier = _llm.with_structured_output(ClassificationResult)


# ── System prompts ─────────────────────────────────────────────────────────────

_CLASSIFY_SYSTEM = """\
You are a routing agent for a LinkedIn content coach AI assistant.

Classify the user's prompt into EXACTLY ONE task_type.

CLASSIFICATION RULES — apply the FIRST rule that fits:

  task_type "general"
    ↳ Greetings, factual questions about LinkedIn/writing/marketing, general how-to advice.
      Does NOT require looking at the user's own post history.
      Examples: "What is LinkedIn's algorithm?", "How long should a LinkedIn post be?", "Hello"

  task_type "research"
    ↳ Questions about what the user HAS ALREADY written; searching their own vault.
      Examples: "What have I written about machine learning?", "Find my posts about leadership"

  task_type "write"
    ↳ Requests to DRAFT or CREATE a new LinkedIn post matching the user's style.
      Examples: "Write a post about Python in my style", "Draft a post about productivity"

  task_type "suggest"
    ↳ Topic brainstorming, content gap analysis, recommendations on what to write next.
      Examples: "What topics should I write about?", "Suggest 5 LinkedIn post ideas for me."

  task_type "analytics"
    ↳ Engagement prediction, best posting times, performance analysis based on publish history.
      Examples: "When is the best time for me to post?", "Analyse my posting patterns."
"""

_SYNTHESIZE_SYSTEM = """\
You are a LinkedIn content coach AI assistant.

You have just retrieved data from the user's personal content vault using a tool.
The tool result is in your message history as a ToolMessage.

Use it to answer the user's question precisely and helpfully.
Be specific: reference actual post titles, dates, or patterns from the context when relevant.
Speak naturally as a coach — do not mention databases, queries, or system internals.

If the tool result contains "[NO_CONTEXT_FOUND]" or "[NO_ANALYTICS_CONTEXT]", tell the user
honestly that you found no relevant data yet, and offer practical general advice instead.
"""


# Maps task_type to which tool to call (shown in system prompt for the tool-calling LLM)
_TOOL_HINT = {
    "research":  "search_vault_posts (pass user_id and the user's query text as query)",
    "write":     "get_style_samples (pass user_id only)",
    "suggest":   "get_topic_inventory (pass user_id only)",
    "analytics": "get_post_analytics (pass user_id only)",
}


# ── Supervisor node ────────────────────────────────────────────────────────────
async def supervisor_node(state: AgentState) -> dict:
    """
    Two-pass node.

    Pass 1 (task_type == ""):
        Classify intent. For "general": answer inline → route="direct" → END.
        For all others: instruct llm_agent to call the right tool.
        The AIMessage with tool_calls is appended to messages; graph routes to tool_node.

    Pass 2 (task_type set, last message is ToolMessage from tool_node):
        For "write": route to writer_node (style samples are in messages).
        For all others: synthesize answer from tool result → route="direct" → END.
    """

    # ── Pass 2: tool has executed, result is in messages ─────────────────────
    if state.get("task_type"):
        task_type = state["task_type"]

        if task_type == "write":
            return {"route": "write"}

        if task_type == "analytics":
            # Offloaded to analytics_node — dedicated small model with tight prompt
            return {"route": "analytics"}

        response = await _llm.ainvoke([
            SystemMessage(content=_SYNTHESIZE_SYSTEM),
            *state["messages"],
        ])
        return {
            "route":    "direct",
            "answer":   response.content,
            "messages": [response],
        }

    # ── Pass 1: classify then trigger tool call ───────────────────────────────
    result: ClassificationResult = await _classifier.ainvoke([
        SystemMessage(content=_CLASSIFY_SYSTEM),
        *state["messages"],
    ])

    if result.task_type == "general":
        response = await _llm.ainvoke(state["messages"])
        return {
            "task_type": "general",
            "route":     "direct",
            "messages":  [response],
            "answer":    response.content,
        }

    tool_hint = _TOOL_HINT.get(result.task_type, "the appropriate tool")
    tool_system = (
        f"You are a data retrieval agent for a LinkedIn content coach.\n"
        f"The user's request is a '{result.task_type}' task.\n"
        f"Call exactly one tool: {tool_hint}.\n"
        f"Always pass user_id='{state['user_id']}' to the tool."
    )

    tool_call_msg = await _llm_agent.ainvoke([
        SystemMessage(content=tool_system),
        *state["messages"],
    ])
    return {
        "task_type": result.task_type,
        "messages":  [tool_call_msg],
    }
