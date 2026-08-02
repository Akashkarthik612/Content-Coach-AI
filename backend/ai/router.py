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
from backend.ai.checkpointing.session_memory_store import SessionMemoryService
from backend.ai.schemas.research import ResearchTopic, topic_to_flat
from backend.ai.thread_state import shape_thread_state
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


def get_store(request: Request):
    """Resolves the AsyncPostgresStore opened at startup (see backend/main.py) —
    long-term, cross-session memory (chat_sessions namespace), distinct from the
    per-turn checkpointer resolved by get_assistant()."""
    return request.app.state.store


# ── Request / Response schemas ────────────────────────────────────────────────

class QueryRequest(BaseModel):
    prompt:     str
    session_id: str | None = None  # groups this thread with earlier ones from the same frontend chat


class QueryResponse(BaseModel):
    answer:            str
    draft:             str = ""
    thread_id:         str = ""
    session_id:        str = ""          # echoes back the resolved session_id (minted server-side if omitted)
    status:            str = "complete"  # "complete" | "awaiting_approval" | "awaiting_angle_selection"
    angles:            list = []         # awaiting_angle_selection only
    actions:           list = []         # awaiting_angle_selection only
    summary:           str = ""          # awaiting_angle_selection only — personalized 2-4 line intro
    expanded_angle_id: int | None = None # set after an "expand" or "modify" resume
    expanded_sections: list = []         # set after an "expand" or "modify" resume — [{heading, body}]
    error:             str = ""          # set on an invalid pick/expand angle_id
    post_id:           str = ""          # set once human_approval_node saves a draft (approved/edited)


class ThreadStateResponse(BaseModel):
    """Rehydration shape for GET /threads/{id} and GET /sessions/{id}/threads —
    built by shape_thread_state(), the single source of truth for "what does
    this thread's current pause state mean" (also used by /stream, /query, /resume)."""
    thread_id:       str
    created_at:      str = ""
    user_prompt:     str = ""
    status:          str  # "complete" | "awaiting_approval" | "awaiting_angle_selection"
    answer:          str = ""
    draft:           str = ""
    post_id:         str = ""
    angles:          list = []
    actions:         list = []
    summary:         str = ""
    approval_status: str = ""  # "" | "approved" | "edited" | "rejected" — only meaningful when status=="complete"
    expanded_angle_id: int | None = None  # last expand/modify result, if any — only latest revision, no history
    expanded_sections: list = []          # [{heading, body}]


class SessionThreadsResponse(BaseModel):
    session_id: str
    threads:    list[ThreadStateResponse] = []


class SessionSummary(BaseModel):
    session_id:     str
    title:          str
    last_active_at: str  # ISO 8601


class SessionListResponse(BaseModel):
    sessions: list[SessionSummary] = []


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
    topic:      TopicPayload
    platform:   str = "linkedin"   # forward-compat; only linkedin is wired up today
    session_id: str | None = None


def _build_initial_state(prompt: str, user_id: str, session_id: str) -> dict:
    return {
        "query":           prompt,
        "user_id":         user_id,
        "session_id":      session_id,
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
        "post_id":         "",
        "answer":          "",
    }


# ── /stream — SSE streaming endpoint (primary) ────────────────────────────────

@router.post("/stream")
async def stream_query(
    body: QueryRequest,
    assistant = Depends(get_assistant),
    store = Depends(get_store),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    SSE endpoint. Emits newline-delimited JSON events:
      {"type": "token",    "content": "..."}          — one per LLM token
      {"type": "activity", "id", "parentId", "title", "description", "status"} — semantic
                                                          progress, never a node/tool/agent name
                                                          (see backend/ai/activity.py)
      {"type": "done",     "status": "awaiting_approval", "thread_id": "...", "post_id"?}
      {"type": "done",     "status": "awaiting_angle_selection", "thread_id": "...", "angles": [...], "actions": [...], "summary": "..."}
      {"type": "done",     "status": "complete"}
      {"type": "error",    "message": "..."}

    Subscribes to two stream modes at once — LangGraph yields (mode, data) tuples:
      "messages" -> data is (AIMessageChunk, metadata), as tokens arrive from each
                    node's LLM call.
      "custom"   -> data is whatever a node passed to get_stream_writer() — here,
                    exclusively the {"type": "activity", ...} dicts emitted by
                    backend/ai/activity.py's emit_activity()/emit_node_activity().
                    Forwarded to the client as-is; activity.py already did all the
                    node/tool-name -> user-facing-label translation, so this layer
                    never needs to know what a "researcher_node" or "web_search" is.

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

    session = ThreadSessionService(ThreadRegistryService(db), SessionMemoryService(store))
    thread_id, session_id, config = await session.start(str(user.id), body.session_id, first_prompt=body.prompt)
    initial_state = _build_initial_state(body.prompt, str(user.id), session_id)

    async def generate():
        has_writer_output = False

        try:
            async for mode, data in assistant.astream(
                initial_state, config=config, stream_mode=["messages", "custom"]
            ):
                if mode == "custom":
                    # Already shaped by activity.py — forward verbatim.
                    yield f"data: {json.dumps(data)}\n\n"
                    continue

                # mode == "messages"
                chunk, metadata = data
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
                final_state = await assistant.aget_state(config)
                post_id = final_state.values.get("post_id", "")
                yield f"data: {json.dumps({'type': 'done', 'status': 'awaiting_approval', 'thread_id': thread_id, 'session_id': session_id, 'route': 'style_retrieval', 'post_id': post_id})}\n\n"

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
                shaped      = shape_thread_state(thread_id, final_state)

                if shaped["status"] == "awaiting_angle_selection":
                    # Paused mid-graph (angle_review_node) — thread stays active,
                    # no session.complete(), until /resume sends a decision. Same
                    # reason the has_writer_output branch above skips it too.
                    angle_payload = {
                        "type":       "done",
                        "status":     "awaiting_angle_selection",
                        "thread_id":  thread_id,
                        "session_id": session_id,
                        "angles":     shaped["angles"],
                        "actions":    shaped["actions"],
                        "summary":    shaped["summary"],
                    }
                    yield f"data: {json.dumps(angle_payload)}\n\n"
                else:
                    digest_answer = shaped["answer"]
                    done_payload  = {"type": "done", "status": "complete", "route": route, "session_id": session_id}

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
    store = Depends(get_store),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="Prompt cannot be empty.")

    session = ThreadSessionService(ThreadRegistryService(db), SessionMemoryService(store))
    thread_id, session_id, config = await session.start(str(user.id), body.session_id, first_prompt=body.prompt)
    initial_state = _build_initial_state(body.prompt, str(user.id), session_id)

    state = await assistant.ainvoke(initial_state, config=config)
    logger.info("query: state after invoke — draft=%r answer=%r route=%r",
                state.get("draft", "")[:80], state.get("answer", "")[:80], state.get("route"))

    if state.get("draft") and not state.get("answer"):
        return QueryResponse(
            answer="",
            draft=state["draft"],
            thread_id=thread_id,
            session_id=session_id,
            status="awaiting_approval",
        )

    # draft/answer both empty can mean angle_review_node just paused (research
    # route) — that state never populates draft/answer, only the interrupt
    # payload, so it needs the same aget_state() check /resume uses.
    if not state.get("answer"):
        final_state = await assistant.aget_state(config)
        shaped = shape_thread_state(thread_id, final_state)
        if shaped["status"] == "awaiting_angle_selection":
            return QueryResponse(
                answer="", thread_id=thread_id, session_id=session_id, status="awaiting_angle_selection",
                angles=shaped["angles"], actions=shaped["actions"], summary=shaped["summary"],
            )

    session.complete(thread_id)
    return QueryResponse(answer=state["answer"], session_id=session_id, post_id=state.get("post_id", ""))


# ── /draft-from-topic — write a post from ONE picked research topic card ──────

@router.post("/draft-from-topic", response_model=QueryResponse)
async def draft_from_topic(
    body: DraftFromTopicRequest,
    assistant = Depends(get_assistant),
    store = Depends(get_store),
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

    session = ThreadSessionService(ThreadRegistryService(db), SessionMemoryService(store))
    thread_id, session_id, config = await session.start(
        str(user.id), body.session_id, first_prompt=body.topic.title
    )
    initial_state = {
        "query":           body.topic.title,
        "user_id":         str(user.id),
        "session_id":      session_id,
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
        "post_id":         "",
        "answer":          "",
    }

    state = await assistant.ainvoke(initial_state, config=config)
    logger.info("draft_from_topic: state after invoke — draft=%r answer=%r",
                state.get("draft", "")[:80], state.get("answer", "")[:80])

    if state.get("draft") and not state.get("answer"):
        return QueryResponse(answer="", draft=state["draft"], thread_id=thread_id, session_id=session_id, status="awaiting_approval")

    session.complete(thread_id)
    return QueryResponse(answer=state.get("answer", ""), session_id=session_id, post_id=state.get("post_id", ""))


# ── /resume — HITL approval ────────────────────────────────────────────────────

@router.post("/resume", response_model=QueryResponse)
async def resume(
    body: ResumeRequest,
    assistant = Depends(get_assistant),
    store = Depends(get_store),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = ThreadSessionService(ThreadRegistryService(db), SessionMemoryService(store))
    try:
        config = await session.resume_config(body.thread_id, str(user.id))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Forbidden")

    decision = {"action": body.action, "content": body.content, "angle_id": body.angle_id}
    await assistant.ainvoke(Command(resume=decision), config=config)

    # Don't trust the ainvoke() return value alone — a resume can land on a
    # SECOND pause (e.g. a "pick" resume runs angle_review_node ->
    # map_chosen_angle_node -> writer_node -> human_approval_node, which has
    # its own interrupt). Check for that via aget_state(), same as /stream
    # does, before deciding the thread is done.
    final_state = await assistant.aget_state(config)
    shaped      = shape_thread_state(body.thread_id, final_state)

    if shaped["status"] == "awaiting_approval":
        # human_approval_node paused again — e.g. the picked angle just
        # got written up and is now awaiting approval.
        return QueryResponse(
            answer="", draft=shaped["draft"],
            thread_id=body.thread_id, status="awaiting_approval",
        )

    if shaped["status"] == "awaiting_angle_selection":
        # angle_review_node re-interrupted — bad pick, an "expand"/"modify"
        # result, or an error note re-surfacing the same angles.
        # expanded_angle_id/expanded_sections/error are resume-action-specific,
        # not part of the general thread shape, so they're read separately here.
        interrupt_value = final_state.interrupts[0].value
        return QueryResponse(
            answer="", thread_id=body.thread_id, status="awaiting_angle_selection",
            angles=shaped["angles"], actions=shaped["actions"], summary=shaped["summary"],
            expanded_angle_id=interrupt_value.get("expanded_angle_id"),
            expanded_sections=interrupt_value.get("expanded_sections", []),
            error=interrupt_value.get("error", ""),
        )

    # No pending interrupt — the graph actually reached END.
    session.complete(body.thread_id)
    return QueryResponse(answer=shaped["answer"], post_id=shaped["post_id"])


# ── GET /threads, GET /sessions/{id}/threads — read-back for chat rehydration ─
#
# Both routes are read-only: they use ThreadRegistryService.is_owner() directly
# (no .touch() side effect), unlike /resume's resume_config(). This is the
# "door" that was previously missing entirely — assistant.aget_state() was
# only ever called inline, right after driving that same request's own turn
# forward, with no way for the frontend to read a thread back out afterward.

@router.get("/threads/{thread_id}", response_model=ThreadStateResponse)
async def get_thread(
    thread_id: str,
    assistant = Depends(get_assistant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not ThreadRegistryService(db).is_owner(thread_id, str(user.id)):
        raise HTTPException(status_code=403, detail="Forbidden")
    state = await assistant.aget_state({"configurable": {"thread_id": thread_id}})
    return ThreadStateResponse(**shape_thread_state(thread_id, state))


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    store = Depends(get_store),
    user: User = Depends(get_current_user),
):
    """All of the current user's live (not-yet-expired) chat sessions, most
    recently active first — powers ChatPage.jsx's sidebar. Backed by the
    chat_sessions Store namespace (7-day TTL), not thread_registry — see
    backend/ai/checkpointing/session_memory_store.py."""
    pairs = await SessionMemoryService(store).list_active(str(user.id))
    return SessionListResponse(sessions=[
        SessionSummary(session_id=sid, title=record.title, last_active_at=record.last_active_at.isoformat())
        for sid, record in pairs
    ])


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    assistant = Depends(get_assistant),
    store = Depends(get_store),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently deletes a chat — the chat_sessions Store record, every
    thread_registry row grouped under it, and each thread's checkpoint data
    (assistant.checkpointer.adelete_thread()). Scoped to the requesting user
    by ThreadSessionService.delete_session(); an unowned/unknown session_id is
    a silent no-op (204), mirroring GET .../threads' ownership-by-scope pattern
    rather than 403/404ing."""
    session = ThreadSessionService(ThreadRegistryService(db), SessionMemoryService(store))
    await session.delete_session(session_id, str(user.id), assistant.checkpointer)


@router.get("/sessions/{session_id}/threads", response_model=SessionThreadsResponse)
async def get_session_threads(
    session_id: str,
    assistant = Depends(get_assistant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All threads belonging to one frontend chat, oldest first — powers
    sidebar-switch/reload rehydration on the frontend. Ownership is enforced
    by list_for_session() itself (scoped by user_id), so an unowned/unknown
    session_id just yields an empty list rather than a 403."""
    rows = ThreadRegistryService(db).list_for_session(session_id, str(user.id))
    threads = []
    for row in rows:
        state = await assistant.aget_state({"configurable": {"thread_id": str(row.thread_id)}})
        threads.append(ThreadStateResponse(**shape_thread_state(str(row.thread_id), state, row.created_at)))
    return SessionThreadsResponse(session_id=session_id, threads=threads)


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
