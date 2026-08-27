import logging

from langchain_core.messages import HumanMessage
from langgraph.types import interrupt

from backend.ai.schemas.research import FlatResearchBrief
from backend.ai.state import AgentState

logger = logging.getLogger(__name__)

_ACTIONS = ["pick", "none_fit"]


async def angle_review_node(state: AgentState) -> dict:
    """
    INTERRUPT node — pauses after researcher_node so the frontend can show the
    recommended angle and let the user act on it, mirroring human_approval_node's
    interrupt()/resume pattern.

    Only two actions reach the graph: "pick" (draft from an angle — the
    frontend's single-recommendation UI always picks angles[0]) and
    "none_fit" (the user typed something else instead). "pick" ends the loop
    and moves on to map_chosen_angle_node; "none_fit" ends it and loops back
    to supervisor_node (see graph.py's _angle_review_router). The loop only
    ever repeats itself on an invalid angle_id, re-prompting with the same
    angle set.
    """
    angles = state["research_result"]["angles"]
    # Personalized 2-4 line intro from researcher_node — kept in every re-interrupt
    # payload below so an invalid-pick round-trip never drops the intro text the
    # frontend is already showing.
    summary = state["research_result"].get("summary", "")

    payload = {"angles": angles, "actions": _ACTIONS, "summary": summary, "answer": state.get("answer", "")}

    while True:
        decision: dict = interrupt(payload)
        action = decision.get("action", "none_fit")

        if action == "pick":
            angle_id = decision.get("angle_id")
            if not isinstance(angle_id, int) or not (0 <= angle_id < len(angles)):
                logger.warning("angle_review_node: invalid angle_id=%r on pick — re-prompting", angle_id)
                payload = {"angles": angles, "actions": _ACTIONS, "summary": summary, "error": "Invalid angle_id."}
                continue
            result: dict = {"picked_angle_id": angle_id, "entry_point": "angle_review"}
            hook_input = (decision.get("content") or "").strip()[:500]
            if hook_input:
                result["personal_hook_input"] = hook_input
            if decision.get("template"):
                result["template"] = decision["template"]
            return result

        # none_fit (or any unrecognized action) — loop back to supervisor_node.
        # If the frontend sent fresh guidance with the decision, feed it in as
        # a new turn so re-classification has something new to work with.
        # Also refresh state["query"] itself — a fresh research Send dispatch
        # (graph.py's _supervisor_router) forwards state["query"] verbatim, so
        # leaving it untouched would silently re-search the ORIGINAL request
        # every time, ignoring whatever the user just asked for instead. The
        # "avoid repeating" note is appended even with no typed guidance, so a
        # second blind attempt isn't a rerun of the identical search either.
        result: dict = {"picked_angle_id": None, "entry_point": "angle_review"}
        fresh_guidance = (decision.get("content") or "").strip()
        avoid_note = "Avoid repeating these previously proposed angles: " + "; ".join(a["title"] for a in angles)
        result["query"] = f"{fresh_guidance}\n\n({avoid_note})" if fresh_guidance else f"{state['query']}\n\n({avoid_note})"
        if fresh_guidance:
            result["messages"] = [HumanMessage(content=fresh_guidance)]
        return result


async def map_chosen_angle_node(state: AgentState) -> dict:
    """
    Pure Python, no LLM call. Reshapes the picked angle wire dict
    ({title, argument, glimpse, audience, provokes_type, provokes_reason,
    source_url} — researcher.py's ResearchArtifactParser.to_wire_dicts()
    output for its "strategic_angles" mode) into the FlatResearchBrief shape
    writer_node already reads. Deliberately not a reuse of schemas/research.py's
    topic_to_flat — that maps a different shape (ResearchTopic, from
    /draft-from-topic) that doesn't line up field-for-field with this one.
    """
    angles = state["research_result"]["angles"]
    search_context = state["research_result"].get("search_context", "")
    angle = angles[state["picked_angle_id"]]

    talking_points = [
        angle["argument"],
        f"Audience: {angle['audience']}",
        f"Engineered to provoke {angle['provokes_type']}: {angle['provokes_reason']}",
    ]

    supporting_evidence = []
    if search_context:
        supporting_evidence.append({
            "point": search_context[:600],
            "source_url": angle.get("source_url", ""),
        })

    brief = FlatResearchBrief(
        recommended_angle=f"{angle['title']} — {angle['argument']}",
        talking_points=talking_points,
        supporting_evidence=supporting_evidence,
        suggested_length="medium",
        personal_hook_input=state.get("personal_hook_input") or "",
    )
    return {"research_brief": brief.model_dump()}
