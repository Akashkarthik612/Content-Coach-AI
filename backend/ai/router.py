import json
import logging
import uuid

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel

from backend.ai._log_setup import setup_ai_file_logging
from backend.ai.graph import assistant
from backend.auth.models import User
from backend.core.dependencies import get_current_user

setup_ai_file_logging()

router = APIRouter(prefix="/api/ai", tags=["ai"])


# ── Request / Response schemas ────────────────────────────────────────────────

class QueryRequest(BaseModel):
    prompt: str


class QueryResponse(BaseModel):
    answer:    str
    draft:     str  = ""
    thread_id: str  = ""
    status:    str  = "complete"  # "complete" | "awaiting_approval"


class ResumeRequest(BaseModel):
    thread_id: str
    action:    str   # "approved" | "edited" | "rejected"
    content:   str = ""


class RefineDraftRequest(BaseModel):
    draft: str
    note:  str


def _build_initial_state(prompt: str, user_id: str) -> dict:
    return {
        "query":           prompt,
        "user_id":         user_id,
        "messages":        [HumanMessage(content=prompt)],
        "task_type":       "",
        "route":           "",
        "style_json":      {},
        "research_brief":  {},
        "writer_task":     {"action": "write", "topic": prompt, "constraints": []},
        "draft":           "",
        "approval_status": "",
        "answer":          "",
    }


# ── /stream — SSE streaming endpoint (primary) ────────────────────────────────

@router.post("/stream")
async def stream_query(body: QueryRequest, user: User = Depends(get_current_user)):
    """
    SSE endpoint. Emits newline-delimited JSON events:
      {"type": "token",  "content": "..."}          — one per LLM token
      {"type": "done",   "status": "awaiting_approval", "thread_id": "..."}
      {"type": "done",   "status": "complete"}
      {"type": "error",  "message": "..."}

    Uses stream_mode="messages" — LangGraph yields (AIMessageChunk, metadata) tuples
    as tokens arrive from each node's LLM call.
    Supervisor tokens are buffered so routing signals ([HANDOFF:*]) are filtered before
    anything reaches the client.
    """
    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="Prompt cannot be empty.")

    thread_id     = str(uuid.uuid4())
    config        = {"configurable": {"thread_id": thread_id}}
    initial_state = _build_initial_state(body.prompt, str(user.id))

    async def generate():
        has_writer_output = False
        supervisor_buffer = []

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

                elif node in ("analytics_node", "research_digest_node"):
                    yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"

                elif node == "supervisor_node":
                    # Buffer — only forward to client once we know it's a direct answer,
                    # not a routing signal. Flushed after the loop below.
                    supervisor_buffer.append(content)

            # Flush supervisor direct answer (drop routing sentinels)
            full_sup = "".join(supervisor_buffer)
            if not has_writer_output and "[HANDOFF:" not in full_sup and full_sup.strip():
                yield f"data: {json.dumps({'type': 'token', 'content': full_sup})}\n\n"

            if has_writer_output:
                yield f"data: {json.dumps({'type': 'done', 'status': 'awaiting_approval', 'thread_id': thread_id})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'done', 'status': 'complete'})}\n\n"

        except Exception as exc:
            logger.error("stream_query: unhandled exception in graph — %s: %s", type(exc).__name__, exc, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

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
async def query(body: QueryRequest, user: User = Depends(get_current_user)):
    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="Prompt cannot be empty.")

    thread_id     = str(uuid.uuid4())
    config        = {"configurable": {"thread_id": thread_id}}
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

    return QueryResponse(answer=state["answer"])


# ── /resume — HITL approval ────────────────────────────────────────────────────

@router.post("/resume", response_model=QueryResponse)
async def resume(body: ResumeRequest, user: User = Depends(get_current_user)):
    config   = {"configurable": {"thread_id": body.thread_id}}
    decision = {"action": body.action, "content": body.content}
    state    = await assistant.ainvoke(Command(resume=decision), config=config)
    return QueryResponse(answer=state["answer"])


# ── /refine — single-call writer refinement (no graph traversal) ──────────────

@router.post("/refine")
async def refine_draft(payload: RefineDraftRequest, user: User = Depends(get_current_user)):
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
    return {"refined_draft": response.content}
