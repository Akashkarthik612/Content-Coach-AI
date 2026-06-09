from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage

from backend.core.config import settings
from backend.ai.state import AgentState


llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.7,
    max_output_tokens=1000,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)
 
 
_WRITER_SYSTEM = """\
You are an expert LinkedIn ghostwriter.

You have been given a compressed Style Profile for this user. It contains two sections:

  "Established Writing Style" — long-term writing DNA: hooks, rhythm, tone, CTA, structure.
  "Recent Style Evolution"    — how they are writing right now (last 5 posts). This section
                                may be absent; if so, rely solely on the established style.

Use the style profile to draft a LinkedIn post on the user's requested topic that is
indistinguishable from their own voice.

When both sections are present, the Recent Evolution takes precedence over the Established
Style wherever they conflict — always reflect the user's current voice, not their past one.

Rules:
- Output ONLY the post content — no preamble, no "Here is your post:", no commentary
- Match the typical post length implied by the style profile
- Apply emoji usage exactly as described (absence is as important as presence)
- Mirror both structural patterns and recurring tone — not just surface vocabulary
"""


async def writer_node(state: AgentState) -> dict:
    # Find the most recent ToolMessage — it contains the style profile (compressed memory
    # or cold-start raw samples, depending on whether style memory has been generated yet)
    style_profile = ""
    for msg in reversed(state["messages"]):
        if hasattr(msg, "type") and msg.type == "tool":
            style_profile = msg.content
            break

    response = await llm.ainvoke([
        SystemMessage(content=_WRITER_SYSTEM),
        *state["messages"],
        SystemMessage(content=f"STYLE PROFILE:\n{style_profile}"),
    ])

    return {"draft": response.content}

