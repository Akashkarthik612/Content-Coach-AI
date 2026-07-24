import logging

from langchain_core.messages import HumanMessage
from langgraph.types import interrupt

from backend.ai.agents.researcher import expand_research_angle
from backend.ai.schemas.research import FlatResearchBrief
from backend.ai.state import AgentState

logger = logging.getLogger(__name__)

_ACTIONS = ["pick", "expand", "modify", "none_fit"]


async def angle_review_node(state: AgentState) -> dict:
    """
    INTERRUPT node — pauses after researcher_node so the frontend can show the
    5 angles and let the user act on them, mirroring human_approval_node's
    interrupt()/resume pattern.

    Loops on interrupt() rather than pausing once: "expand" (and, minimally,
    "modify") re-surface the same angle set with extra context and interrupt
    again, all within this single node invocation. Only "pick" and "none_fit"
    end the loop and let the graph move on — pick to map_chosen_angle_node,
    none_fit back to supervisor_node (see graph.py's _angle_review_router).
    """
    angles = state["research_result"]["angles"]
    search_context = state["research_result"].get("search_context", "")

    payload = {"angles": angles, "actions": _ACTIONS}

    while True:
        decision: dict = interrupt(payload)
        action = decision.get("action", "none_fit")

        if action == "pick":
            angle_id = decision.get("angle_id")
            if not isinstance(angle_id, int) or not (0 <= angle_id < len(angles)):
                logger.warning("angle_review_node: invalid angle_id=%r on pick — re-prompting", angle_id)
                payload = {"angles": angles, "actions": _ACTIONS, "error": "Invalid angle_id."}
                continue
            return {"picked_angle_id": angle_id, "entry_point": "angle_review"}

        if action == "expand":
            angle_id = decision.get("angle_id")
            if not isinstance(angle_id, int) or not (0 <= angle_id < len(angles)):
                logger.warning("angle_review_node: invalid angle_id=%r on expand — re-prompting", angle_id)
                payload = {"angles": angles, "actions": _ACTIONS, "error": "Invalid angle_id."}
                continue
            summary = await expand_research_angle(angles[angle_id], search_context)
            payload = {
                "angles": angles,
                "actions": _ACTIONS,
                "expanded_angle_id": angle_id,
                "expanded_summary": summary,
            }
            continue

        if action == "modify":
            # Not implemented yet — no defined transform for "change angle N
            # like this". Re-prompt instead of crashing or silently ignoring.
            logger.info("angle_review_node: 'modify' requested but not implemented yet")
            payload = {
                "angles": angles,
                "actions": _ACTIONS,
                "error": "Modify isn't supported yet — pick an angle, expand one, or say none of these fit.",
            }
            continue

        # none_fit (or any unrecognized action) — loop back to supervisor_node.
        # If the frontend sent fresh guidance with the decision, feed it in as
        # a new turn so re-classification has something new to work with;
        # otherwise the same query would likely just route back to research
        # again (steps_taken's cap in supervisor.py is the backstop either way).
        result: dict = {"picked_angle_id": None, "entry_point": "angle_review"}
        fresh_guidance = (decision.get("content") or "").strip()
        if fresh_guidance:
            result["messages"] = [HumanMessage(content=fresh_guidance)]
        return result


async def map_chosen_angle_node(state: AgentState) -> dict:
    """
    Pure Python, no LLM call. Reshapes the picked ResearchAngle
    ({title, argument, audience, provokes_type, provokes_reason}) into the
    FlatResearchBrief shape writer_node already reads. Deliberately not a
    reuse of schemas/research.py's topic_to_flat — that maps a different
    shape (ResearchTopic, from /draft-from-topic) that doesn't line up
    field-for-field with a ResearchAngle.
    """
    angles = state["research_result"]["angles"]
    search_context = state["research_result"].get("search_context", "")
    angle = angles[state["picked_angle_id"]]

    brief = FlatResearchBrief(
        recommended_angle=f"{angle['title']} — {angle['argument']}",
        talking_points=[
            angle["argument"],
            f"Audience: {angle['audience']}",
            f"Engineered to provoke {angle['provokes_type']}: {angle['provokes_reason']}",
        ],
        supporting_evidence=[{"point": search_context[:600]}] if search_context else [],
        suggested_length="medium",
    )
    return {"research_brief": brief.model_dump()}
