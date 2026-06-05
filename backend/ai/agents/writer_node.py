from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage

from backend.core.config import settings
from backend.ai.state import AgentState


llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.7,
    max_output_tokens=4096,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

_WRITER_SYSTEM = """\
You are an expert LinkedIn ghostwriter.

Study the writing style samples provided carefully. Extract:
- How the post opens (hook pattern — question, bold statement, story, statistic)
- Paragraph length and line-break rhythm
- Emoji usage: frequency, placement, or deliberate absence
- Tone: professional, personal, conversational, storytelling, tactical
- Call-to-action style at the end
- Formatting choices: bullets, bold emphasis, numbered lists

Then draft a new LinkedIn post on the topic the user requested that is
indistinguishable from their own voice.

Rules:
- Output ONLY the post content — no preamble, no "Here is your post:", no commentary
- Match the typical length of the style samples (do not over-write)
- If the samples never use emojis, do not add any
- Mirror the structural DNA of the samples, not just the surface tone
"""


async def writer_node(state: AgentState) -> dict:
    # Find the most recent ToolMessage — it contains the style samples
    style_samples = ""
    for msg in reversed(state["messages"]):
        if hasattr(msg, "type") and msg.type == "tool":
            style_samples = msg.content
            break

    response = await llm.ainvoke([
        SystemMessage(content=_WRITER_SYSTEM),
        *state["messages"],
        SystemMessage(content=f"WRITING STYLE SAMPLES:\n{style_samples}"),
    ])

    return {"draft": response.content}
