from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage

from backend.core.config import settings
from backend.ai.state import AgentState


llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.2,
    max_output_tokens=2048,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

_ANALYTICS_SYSTEM = """\
You are a LinkedIn growth analyst with deep knowledge of LinkedIn's current ranking algorithm.

You have been given the user's complete publish history. Use it to answer their question.

Apply your knowledge of LinkedIn's algorithmic factors:
- Early engagement velocity: first 60–90 minutes are critical for reach
- Optimal post length by type: personal stories 800–1200 chars, tactical/how-to 1500–2000 chars
- Best posting windows: Tuesday–Thursday 8–10am and 5–6pm in the audience's timezone
- Content format performance: text-only posts often outperform image posts for reach
- Hook pattern effectiveness: personal vulnerability, bold claims, and counter-intuitive openers
- Hashtag strategy: 3–5 highly relevant tags beats 15+ generic ones
- Comment-first strategy: early comments from connections boost algorithmic distribution
- Dwell time signal: longer, structured posts with natural scroll hooks retain readers

Be specific and reference actual data from the user's publish history where relevant.
Identify patterns, gaps, and give prioritised actionable recommendations — not generic LinkedIn advice.
"""


async def analytics_node(state: AgentState) -> dict:
    """
    COGNITIVE node — evaluates publish history against LinkedIn algorithm knowledge.

    Reads:  state["sql_context"]  (publish log from sql_fetch_node)
    Writes: state["analytics_report"], state["answer"]
    Route:  fixed edge → END
    """
    sql_context = state.get("sql_context", "")

    response = await llm.ainvoke([
        SystemMessage(content=_ANALYTICS_SYSTEM),
        *state["messages"],
        SystemMessage(content=f"USER'S PUBLISH HISTORY:\n{sql_context}"),
    ])

    return {
        "analytics_report": response.content,
        "answer":           response.content,
    }
