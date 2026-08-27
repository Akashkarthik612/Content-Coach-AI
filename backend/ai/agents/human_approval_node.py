import asyncio

from langgraph.types import interrupt

from backend.ai.activity import emit_node_activity
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
        { "action": "edited",     "content": "<edited post text>" }
        { "action": "rejected" }
        { "action": "regenerate", "content": "<edited post text>", "template": {...}|None }
            Loops back through writer_node instead of saving/ending: draft is
            set to the edited text and writer_task.action is switched to
            "rewrite", so writer_node's existing rewrite branch (writer_node.py)
            treats it as the new base to redraft. "template", when present
            (resolved server-side by router.py via TemplateService), is
            carried into state["template"] so writer_node restructures the
            draft to match a newly picked template ("Change template" button).
            The writer_node ->
            human_approval_node edge then re-pauses on a fresh interrupt() —
            same HITL checkpoint, new draft to review. See graph.py's
            _approval_router for the conditional edge this relies on.
    """
    emit_node_activity("human_approval_node", "completed")
    decision: dict = interrupt({"draft": state["draft"]})

    action = decision.get("action", "rejected")

    if action == "approved":
        post_id, saved_title = await asyncio.to_thread(
            save_draft_to_vault, state["user_id"], state["draft"], state["query"]
        )
        return {
            "approval_status": "approved",
            "post_id": post_id,
            "answer": (
                f'Draft approved and saved to your vault as "{saved_title}". '
                "You can find it in My Work."
            ),
        }

    if action == "edited":
        edited = decision.get("content", state["draft"])
        post_id, saved_title = await asyncio.to_thread(
            save_draft_to_vault, state["user_id"], edited, state["query"]
        )
        return {
            "approval_status": "edited",
            "draft":  edited,
            "post_id": post_id,
            "answer": (
                f'Edited draft saved to your vault as "{saved_title}". '
                "You can find it in My Work."
            ),
        }

    if action == "regenerate":
        edited = decision.get("content", state["draft"])
        out = {
            "approval_status": "regenerate",
            "draft": edited,
            "writer_task": {"action": "rewrite", "topic": state["query"], "constraints": []},
        }
        if decision.get("template"):
            out["template"] = decision["template"]
        return out

    # rejected — nothing saved
    return {
        "approval_status": "rejected",
        "answer": "Draft rejected. Please refine your request and try again.",
    }
