import json
import logging
import uuid

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel

from backend.ai.graph import assistant
from backend.auth.models import User
from backend.core.dependencies import get_current_user

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

    Streams writer_node and analytics_node tokens in real time.
    Supervisor direct answers are buffered (routing signals filtered) then emitted.
    """
    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="Prompt cannot be empty.")

    thread_id     = str(uuid.uuid4())
    config        = {"configurable": {"thread_id": thread_id}}
    initial_state = _build_initial_state(body.prompt, str(user.id))

    async def generate():
        has_writer_output  = False
        supervisor_buffer  = []   # buffer supervisor tokens until we know if it's a handoff
        in_supervisor_llm  = False

        try:
            async for event in assistant.astream_events(initial_state, config=config, version="v2"):
                kind = event["event"]
                node = event.get("metadata", {}).get("langgraph_node", "")

                # ── LLM call starts ──────────────────────────────────────────
                if kind == "on_chat_model_start" and node == "supervisor_node":
                    in_supervisor_llm = True
                    supervisor_buffer = []

                # ── Token arrives ────────────────────────────────────────────
                elif kind == "on_chat_model_stream":
                    chunk   = event["data"]["chunk"]
                    content = chunk.content
                    if not content:
                        continue

                    if node == "writer_node":
                        has_writer_output = True
                        yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"

                    elif node == "analytics_node":
                        yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"

                    elif node == "supervisor_node" and in_supervisor_llm:
                        supervisor_buffer.append(content)

                # ── Supervisor LLM call ends ─────────────────────────────────
                elif kind == "on_chat_model_end" and node == "supervisor_node":
                    in_supervisor_llm = False
                    full = "".join(supervisor_buffer)
                    if not full:
                        # non-streaming LLM call: on_chat_model_stream may not fire;
                        # extract full content from the end-event output object
                        output = event.get("data", {}).get("output")
                        output_content = getattr(output, "content", "") if output is not None else ""
                        if isinstance(output_content, str) and output_content:
                            full = output_content
                            supervisor_buffer = [full]
                    # Only stream to user if this is a direct answer (no routing signal)
                    if "[HANDOFF:" not in full and full.strip():
                        for token in supervisor_buffer:
                            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
                    supervisor_buffer = []

            # ── Stream complete ──────────────────────────────────────────────
            if has_writer_output:
                # Graph is paused at human_approval_node interrupt
                yield f"data: {json.dumps({'type': 'done', 'status': 'awaiting_approval', 'thread_id': thread_id})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'done', 'status': 'complete'})}\n\n"

        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx/proxy buffering
            "Connection":       "keep-alive",
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
