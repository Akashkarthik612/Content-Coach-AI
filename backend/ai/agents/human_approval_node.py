import asyncio

from langgraph.types import interrupt

from backend.ai.state import AgentState
from backend.ai.agents.sql_fetch_node import save_draft_to_vault


async def human_approval_node(state: AgentState) -> dict:
    """
    INTERRUPT node — Human-in-the-loop checkpoint after writer_node.

    First invocation:
        interrupt() pauses graph execution and serialises state to MemorySaver.
        The FastAPI /query endpoint detects the pause (draft set, answer empty)
        and returns the draft to the frontend with status="awaiting_approval".

    Second invocation (after POST /api/ai/resume):
        interrupt() returns the decision sent by the frontend.
        On approve/edit: saves the draft to the vault via save_draft_to_vault()
        (defined in sql_fetch_node — all DB operations live there).
        Fixed edge then routes to END.

    Decision payload expected from frontend:
        { "action": "approved" }
        { "action": "edited",   "content": "<edited post text>" }
        { "action": "rejected" }
    """
    decision: dict = interrupt({"draft": state["draft"]})

    action = decision.get("action", "rejected")

    if action == "approved":
        saved_title = await asyncio.to_thread(
            save_draft_to_vault, state["user_id"], state["draft"], state["query"]
        )
        return {
            "approval_status": "approved",
            "answer": (
                f'Draft approved and saved to your vault as "{saved_title}". '
                "You can find it in My Work."
            ),
        }

    if action == "edited":
        edited = decision.get("content", state["draft"])
        saved_title = await asyncio.to_thread(
            save_draft_to_vault, state["user_id"], edited, state["query"]
        )
        return {
            "approval_status": "edited",
            "draft":  edited,
            "answer": (
                f'Edited draft saved to your vault as "{saved_title}". '
                "You can find it in My Work."
            ),
        }

    # rejected — nothing saved
    return {
        "approval_status": "rejected",
        "answer": "Draft rejected. Please refine your request and try again.",
    }
