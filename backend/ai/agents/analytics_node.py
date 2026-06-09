from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage

from backend.core.config import settings
from backend.ai.state import AgentState


_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.0,
    max_output_tokens=1024,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

_ANALYTICS_SYSTEM = """\
You are a LinkedIn growth analyst. You have been given the user's post analytics data via a tool call.
The tool result is in your message history as a ToolMessage.

Your job: answer the user's analytics question using only the data provided.
Be specific — reference actual post titles, dates, impressions, reactions from the data.
Identify patterns and give prioritised, actionable recommendations.

LinkedIn algorithm knowledge to apply where relevant:
- Early engagement velocity (first 60–90 min) is critical for reach
- Optimal length: personal stories 800–1200 chars, tactical/how-to 1500–2000 chars
- Best windows: Tue–Thu 8–10am and 5–6pm in the audience's timezone
- 3–5 targeted hashtags outperform 15+ generic ones
- Text-only posts often outperform image posts for organic reach

If impressions and reactions are all zero, tell the user to log their metrics via the
analytics feature on each post before you can give performance analysis.
Do not give generic LinkedIn advice — always tie recommendations to the user's actual data.
"""


async def analytics_node(state: AgentState) -> dict:
    response = await _llm.ainvoke([
        SystemMessage(content=_ANALYTICS_SYSTEM),
        *state["messages"],
    ])
    return {"answer": response.content, "route": "direct"}
