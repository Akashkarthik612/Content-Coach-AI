import json
import logging

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.ai._log_setup import setup_ai_file_logging
from backend.ai.checkpointing.service import ThreadRegistryService, ThreadSessionService
from backend.ai.schemas.research import ResearchTopic, topic_to_flat
from backend.auth.models import User
from backend.core.dependencies import get_current_user, get_db

setup_ai_file_logging()

router = APIRouter(prefix="/api/ai", tags=["ai"])


def get_assistant(request: Request):
    """Resolves the LangGraph assistant compiled at startup (see backend/main.py)
    against a durable AsyncPostgresSaver checkpointer — threads survive a process
    restart. Ownership of each thread_id is tracked separately in thread_registry
    (backend/ai/checkpointing/), enforced on /resume."""
    return request.app.state.assistant


# ── Request / Response schemas ────────────────────────────────────────────────

class QueryRequest(BaseModel):
    prompt: str


class QueryResponse(BaseModel):
    answer:            str
    draft:             str = ""
    thread_id:         str = ""
    status:            str = "complete"  # "complete" | "awaiting_approval" | "awaiting_angle_selection"
    angles:            list = []         # awaiting_angle_selection only
    actions:           list = []         # awaiting_angle_selection only
    expanded_angle_id: int | None = None # set after an "expand" resume
    expanded_summary:  str = ""          # set after an "expand" resume
    error:             str = ""          # set on an invalid pick/expand angle_id


class ResumeRequest(BaseModel):
    thread_id: str
    action:    str   # "approved" | "edited" | "rejected" (human_approval_node) |
                      # "pick" | "expand" | "modify" | "none_fit" (angle_review_node)
    content:   str = ""
    angle_id:  int | None = None   # angle_review_node's "pick" / "expand" actions


class RefineDraftRequest(BaseModel):
    draft: str
    note:  str


class TopicPayload(BaseModel):
    title:               str
    preview:             str = ""
    talking_points:      list[str] = []
    supporting_evidence: list[dict] = []   # [{point, source_title, source_url}]
    suggested_hook:      str = ""
    suggested_length:    str = "medium"
    past_coverage:       str = ""
    avoid_repeating:     str = ""


class DraftFromTopicRequest(BaseModel):
    topic:    TopicPayload
    platform: str = "linkedin"   # forward-compat; only linkedin is wired up today


def _build_initial_state(prompt: str, user_id: str) -> dict:
    return {
        "query":           prompt,
        "user_id":         user_id,
        "messages":        [HumanMessage(content=prompt)],
        "task_type":       "",
        "route":           "",
        "pre_routed":      False,
        "steps_taken":     0,
        "research_result": {},
        "picked_angle_id": None,
        "entry_point":     "",
        "style_json":      {},
        "research_brief":  {},
        "research_topics": [],
        "writer_task":     {"action": "write", "topic": prompt, "constraints": []},
        "draft":           "",
        "approval_status": "",
        "answer":          "",
    }


# ── /stream — SSE streaming endpoint (primary) ────────────────────────────────

@router.post("/stream")
async def stream_query(
    body: QueryRequest,
    assistant = Depends(get_assistant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    SSE endpoint. Emits newline-delimited JSON events:
      {"type": "token",  "content": "..."}          — one per LLM token
      {"type": "done",   "status": "awaiting_approval", "thread_id": "..."}
      {"type": "done",   "status": "awaiting_angle_selection", "thread_id": "...", "angles": [...], "actions": [...]}
      {"type": "done",   "status": "complete"}
      {"type": "error",  "message": "..."}

    Uses stream_mode="messages" — LangGraph yields (AIMessageChunk, metadata) tuples
    as tokens arrive from each node's LLM call.

    Mints a fresh thread_id per call, registered in thread_registry via
    ThreadSessionService — durable across a process restart, and scoped to the
    requesting user so /resume can't be used to hijack another user's thread.

    supervisor_node's own raw output (route="direct") is never streamed live either
    — its raw LLM output is a classification JSON contract, not user-facing prose.
    Its answer lives in state["answer"], surfaced via the "nothing streamed live
    this turn" fallback branch below, which fetches final state once via
    aget_state() and yields answer as a single event.
    """
    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="Prompt cannot be empty.")

    session = ThreadSessionService(ThreadRegistryService(db))
    thread_id, config = session.start(str(user.id))
    initial_state = _build_initial_state(body.prompt, str(user.id))

    async def generate():
        has_writer_output = False

        try:
            async for chunk, metadata in assistant.astream(
                initial_state, config=config, stream_mode="messages"
            ):
                node = metadata.get("langgraph_node", "")

                # Normalise content — Gemini sometimes returns list[dict] instead of str
                raw = getattr(chunk, "content", "")
                if not raw:
                    continue
                content = (
                    "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in raw)
                    if isinstance(raw, list) else raw
                )
                if not content:
                    continue

                if node == "writer_node":
                    has_writer_output = True
                    yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"

                # supervisor_node's own raw output is never user-facing — it's the
                # SupervisorClassification JSON contract (backend/ai/agents/supervisor.py),
                # not prose. It's never streamed live; the "nothing streamed live" branch
                # below reads the real answer back from state["answer"] instead, which
                # _classify_and_route() sets explicitly for route="direct".

            if has_writer_output:
                yield f"data: {json.dumps({'type': 'done', 'status': 'awaiting_approval', 'thread_id': thread_id, 'route': 'style_retrieval'})}\n\n"

            else:
                # Nothing streamed live this turn. Either supervisor_node's
                # route="direct" answer (state["answer"]) lands here since its raw
                # LLM chunks are a classification JSON contract, not user-facing
                # text (see docstring above) — or researcher_node ran and
                # angle_review_node is now paused waiting on a decision. Angles are
                # structured data, not prose, so there was nothing to stream
                # token-by-token; the done payload carries them directly instead.
                final_state = await assistant.aget_state(config)
                values      = final_state.values
                route       = values.get("route") or "direct"

                if final_state.interrupts:
                    # Paused mid-graph (angle_review_node) — thread stays active,
                    # no session.complete(), until /resume sends a decision. Same
                    # reason the has_writer_output branch above skips it too.
                    interrupt_value = final_state.interrupts[0].value
                    angle_payload = {
                        "type":      "done",
                        "status":    "awaiting_angle_selection",
                        "thread_id": thread_id,
                        "angles":    interrupt_value.get("angles", []),
                        "actions":   interrupt_value.get("actions", []),
                    }
                    yield f"data: {json.dumps(angle_payload)}\n\n"
                else:
                    digest_answer = values.get("answer") or ""
                    done_payload  = {"type": "done", "status": "complete", "route": route}

                    session.complete(thread_id)

                    if digest_answer:
                        yield f"data: {json.dumps({'type': 'token', 'content': digest_answer})}\n\n"
                    yield f"data: {json.dumps(done_payload)}\n\n"

        except Exception as exc:
            # Full technical detail (vendor error bodies, quota messages, stack
            # info) stays in the server log only — the client only ever sees a
            # clean, generic message, never a raw exception dump.
            logger.error("stream_query: unhandled exception in graph — %s: %s", type(exc).__name__, exc, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': 'Something went wrong. Please try again.'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


# ── /query — non-streaming fallback ───────────────────────────────────────────

@router.post("/query", response_model=QueryResponse)
async def query(
    body: QueryRequest,
    assistant = Depends(get_assistant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="Prompt cannot be empty.")

    session = ThreadSessionService(ThreadRegistryService(db))
    thread_id, config = session.start(str(user.id))
    initial_state = _build_initial_state(body.prompt, str(user.id))

    state = await assistant.ainvoke(initial_state, config=config)
    logger.info("query: state after invoke — draft=%r answer=%r route=%r",
                state.get("draft", "")[:80], state.get("answer", "")[:80], state.get("route"))

    if state.get("draft") and not state.get("answer"):
        return QueryResponse(
            answer="",
            draft=state["draft"],
            thread_id=thread_id,
            status="awaiting_approval",
        )

    # draft/answer both empty can mean angle_review_node just paused (research
    # route) — that state never populates draft/answer, only the interrupt
    # payload, so it needs the same aget_state() check /resume uses.
    if not state.get("answer"):
        final_state = await assistant.aget_state(config)
        if final_state.interrupts:
            interrupt_value = final_state.interrupts[0].value
            return QueryResponse(
                answer="", thread_id=thread_id, status="awaiting_angle_selection",
                angles=interrupt_value.get("angles", []),
                actions=interrupt_value.get("actions", []),
            )

    session.complete(thread_id)
    return QueryResponse(answer=state["answer"])


# ── /draft-from-topic — write a post from ONE picked research topic card ──────

@router.post("/draft-from-topic", response_model=QueryResponse)
async def draft_from_topic(
    body: DraftFromTopicRequest,
    assistant = Depends(get_assistant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Called when the user clicks "Draft Post for LinkedIn" on a single research
    topic card. Only that one topic's data is sent into the writer pipeline —
    not the full multi-topic brief — and supervisor_node's classification LLM
    call is skipped entirely via pre_routed=True (the target pipeline is
    already known: the user picked a specific topic to draft, there's nothing
    left to classify).
    """
    flat_brief = topic_to_flat(ResearchTopic(**body.topic.model_dump())).model_dump()
    user_prompt = f"Write a LinkedIn post about: {body.topic.title}"

    session = ThreadSessionService(ThreadRegistryService(db))
    thread_id, config = session.start(str(user.id))
    initial_state = {
        "query":           body.topic.title,
        "user_id":         str(user.id),
        "messages":        [HumanMessage(content=user_prompt)],
        "task_type":       "write",
        "route":           "style_retrieval",
        "pre_routed":      True,
        "steps_taken":     0,
        "research_result": {},
        "picked_angle_id": None,
        "entry_point":     "",
        "style_json":      {},
        "research_brief":  flat_brief,
        "research_topics": [],
        "writer_task":     {"action": "write", "topic": body.topic.title, "constraints": []},
        "draft":           "",
        "approval_status": "",
        "answer":          "",
    }

    state = await assistant.ainvoke(initial_state, config=config)
    logger.info("draft_from_topic: state after invoke — draft=%r answer=%r",
                state.get("draft", "")[:80], state.get("answer", "")[:80])

    if state.get("draft") and not state.get("answer"):
        return QueryResponse(answer="", draft=state["draft"], thread_id=thread_id, status="awaiting_approval")

    session.complete(thread_id)
    return QueryResponse(answer=state.get("answer", ""))


# ── /resume — HITL approval ────────────────────────────────────────────────────

@router.post("/resume", response_model=QueryResponse)
async def resume(
    body: ResumeRequest,
    assistant = Depends(get_assistant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = ThreadSessionService(ThreadRegistryService(db))
    try:
        config = session.resume_config(body.thread_id, str(user.id))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Forbidden")

    decision = {"action": body.action, "content": body.content, "angle_id": body.angle_id}
    await assistant.ainvoke(Command(resume=decision), config=config)

    # Don't trust the ainvoke() return value alone — a resume can land on a
    # SECOND pause (e.g. a "pick" resume runs angle_review_node ->
    # map_chosen_angle_node -> style_retriever_node -> writer_node ->
    # human_approval_node, which has its own interrupt). Check for that via
    # aget_state(), same as /stream does, before deciding the thread is done.
    final_state = await assistant.aget_state(config)
    values      = final_state.values

    if final_state.interrupts:
        interrupt_value = final_state.interrupts[0].value

        if "draft" in interrupt_value:
            # human_approval_node paused again — e.g. the picked angle just
            # got written up and is now awaiting approval.
            return QueryResponse(
                answer="", draft=interrupt_value["draft"],
                thread_id=body.thread_id, status="awaiting_approval",
            )

        # angle_review_node re-interrupted — bad pick, an "expand" result, or
        # the "modify"/invalid-angle_id error note re-surfacing the same angles.
        return QueryResponse(
            answer="", thread_id=body.thread_id, status="awaiting_angle_selection",
            angles=interrupt_value.get("angles", []),
            actions=interrupt_value.get("actions", []),
            expanded_angle_id=interrupt_value.get("expanded_angle_id"),
            expanded_summary=interrupt_value.get("expanded_summary", ""),
            error=interrupt_value.get("error", ""),
        )

    # No pending interrupt — the graph actually reached END.
    session.complete(body.thread_id)
    return QueryResponse(answer=values.get("answer", ""))


# ── /refine — single-call writer refinement (no graph traversal) ──────────────

@router.post("/refine")
async def refine_draft(
    payload: RefineDraftRequest,
    user: User = Depends(get_current_user),
):
    """
    Lightweight draft refinement endpoint.
    Takes an existing draft + user instruction and returns a revised post in ~1 LLM call.
    Bypasses the full supervisor → style_retriever → writer pipeline — used for iterative
    editing within an active writing session on the frontend.
    """
    if not payload.draft.strip() or not payload.note.strip():
        raise HTTPException(status_code=422, detail="draft and note are required.")

    from backend.ai.agents.writer_node import _llm  # local import avoids circular at module load
    prompt = (
        "You are a professional LinkedIn content writer.\n"
        "The user has a draft post and wants to revise it based on their feedback.\n\n"
        f"CURRENT DRAFT:\n{payload.draft}\n\n"
        f"USER INSTRUCTION:\n{payload.note}\n\n"
        "Rewrite the draft to apply the instruction.\n\n"
        "ABSOLUTE FORMATTING RULES — never break these:\n"
        "- No markdown syntax ever: no **, no *, no __, no #, no >, no backticks\n"
        "- If the user asks for bullet points, use a plain dash (- ) or number (1. ), nothing else\n"
        "- No bold, no italic, no headers — plain text only\n"
        "Output ONLY the revised post, no preamble, no explanation."
    )
    response = await _llm.ainvoke(prompt)
    refined_draft = response.content

    return {"refined_draft": refined_draft}
