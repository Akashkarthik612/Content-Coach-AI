import logging

from langchain_core.messages import HumanMessage
from langgraph.types import interrupt

from backend.ai.agents.researcher import ResearcherDecisionError, expand_research_angle, modify_angle_summary
from backend.ai.schemas.research import FlatResearchBrief
from backend.ai.state import AgentState

logger = logging.getLogger(__name__)

_ACTIONS = ["pick", "expand", "modify", "none_fit"]


async def angle_review_node(state: AgentState) -> dict:
    """
    INTERRUPT node — pauses after researcher_node so the frontend can show the
    5 angles and let the user act on them, mirroring human_approval_node's
    interrupt()/resume pattern.

    Loops on interrupt() rather than pausing once: "expand" and "modify"
    re-surface the same angle set with extra context and interrupt again, all
    within this single node invocation. Only "pick" and "none_fit" end the
    loop and let the graph move on — pick to map_chosen_angle_node, none_fit
    back to supervisor_node (see graph.py's _angle_review_router).

    working_sections tracks each angle's current (post expand/modify) sections
    in plain local memory, keyed by angle_id — NOT part of AgentState. This
    node's loop replays its entire body from the top on every resume (LangGraph
    only re-pauses at the *next* unresolved interrupt() — every earlier one
    just hands back its recorded answer instantly), so expand_research_angle()
    and modify_angle_summary() are both @task-decorated (see researcher.py):
    without that, every prior expand/modify call in this thread's history
    would be re-invoked for real on each later resume instead of reusing its
    checkpointed result.
    """
    angles = state["research_result"]["angles"]
    search_context = state["research_result"].get("search_context", "")
    # Personalized 2-4 line intro from researcher_node — kept in every re-interrupt
    # payload below so an "expand"/"modify"/invalid-pick round-trip never drops the
    # intro text the frontend is already showing.
    summary = state["research_result"].get("summary", "")

    working_sections: dict[int, list[dict]] = {}

    payload = {"angles": angles, "actions": _ACTIONS, "summary": summary}

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
            if working_sections.get(angle_id):
                # User expanded/modified this specific angle before picking it —
                # the writer should work from that, not the pristine original.
                result["final_angle_sections"] = working_sections[angle_id]
            hook_input = (decision.get("content") or "").strip()[:500]
            if hook_input:
                result["personal_hook_input"] = hook_input
            return result

        if action == "expand":
            angle_id = decision.get("angle_id")
            if not isinstance(angle_id, int) or not (0 <= angle_id < len(angles)):
                logger.warning("angle_review_node: invalid angle_id=%r on expand — re-prompting", angle_id)
                payload = {"angles": angles, "actions": _ACTIONS, "summary": summary, "error": "Invalid angle_id."}
                continue
            try:
                sections = await expand_research_angle(angles[angle_id], search_context)
            except ResearcherDecisionError as exc:
                logger.warning("angle_review_node: expand failed for angle_id=%d — %s", angle_id, exc)
                payload = {"angles": angles, "actions": _ACTIONS, "summary": summary, "error": "Couldn't expand that angle — try again."}
                continue
            working_sections[angle_id] = sections
            payload = {
                "angles": angles,
                "actions": _ACTIONS,
                "summary": summary,
                "expanded_angle_id": angle_id,
                "expanded_sections": sections,
            }
            continue

        if action == "modify":
            angle_id = decision.get("angle_id")
            instruction = (decision.get("content") or "").strip()
            if not isinstance(angle_id, int) or not (0 <= angle_id < len(angles)):
                logger.warning("angle_review_node: invalid angle_id=%r on modify — re-prompting", angle_id)
                payload = {"angles": angles, "actions": _ACTIONS, "summary": summary, "error": "Invalid angle_id."}
                continue
            if not instruction:
                logger.warning("angle_review_node: empty instruction on modify for angle_id=%d — re-prompting", angle_id)
                payload = {
                    "angles": angles, "actions": _ACTIONS, "summary": summary,
                    "expanded_angle_id": angle_id, "expanded_sections": working_sections.get(angle_id, []),
                    "error": "Tell me what to change first.",
                }
                continue
            current_sections = working_sections.get(angle_id, [])
            try:
                sections = await modify_angle_summary(angles[angle_id], current_sections, instruction, search_context)
            except ResearcherDecisionError as exc:
                logger.warning("angle_review_node: modify failed for angle_id=%d — %s", angle_id, exc)
                # Keep whatever was already there — never lose a good version
                # to a failed edit attempt.
                payload = {
                    "angles": angles, "actions": _ACTIONS, "summary": summary,
                    "expanded_angle_id": angle_id, "expanded_sections": current_sections,
                    "error": "Couldn't apply that edit — try rephrasing it.",
                }
                continue
            working_sections[angle_id] = sections
            payload = {
                "angles": angles,
                "actions": _ACTIONS,
                "summary": summary,
                "expanded_angle_id": angle_id,
                "expanded_sections": sections,
            }
            continue

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

    If the user expanded/modified this angle before picking it,
    final_angle_sections (set by angle_review_node's "pick" branch) holds
    their final, edited version — that's what the writer works from instead
    of the angle's original argument/glimpse.
    """
    angles = state["research_result"]["angles"]
    search_context = state["research_result"].get("search_context", "")
    angle = angles[state["picked_angle_id"]]
    final_sections = state.get("final_angle_sections")

    talking_points = (
        [f"{s['heading']}: {s['body']}" for s in final_sections]
        if final_sections
        else [
            angle["argument"],
            f"Audience: {angle['audience']}",
            f"Engineered to provoke {angle['provokes_type']}: {angle['provokes_reason']}",
        ]
    )

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
