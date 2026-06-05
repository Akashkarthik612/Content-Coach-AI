import uuid

from fastapi import APIRouter, Depends
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
    draft:     str  = ""       # populated when status == "awaiting_approval"
    thread_id: str  = ""       # returned so frontend can resume after HITL
    status:    str  = "complete"  # "complete" | "awaiting_approval"


class ResumeRequest(BaseModel):
    thread_id: str
    action:    str   # "approved" | "edited" | "rejected"
    content:   str = ""  # required only when action == "edited"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/query", response_model=QueryResponse)
async def query(body: QueryRequest, user: User = Depends(get_current_user)):
    thread_id = str(uuid.uuid4())
    config    = {"configurable": {"thread_id": thread_id}}

    initial_state = {
        "query":           body.prompt,
        "user_id":         str(user.id),
        "messages":        [HumanMessage(content=body.prompt)],
        "task_type":       "",
        "route":           "",
        "draft":           "",
        "approval_status": "",
        "answer":          "",
    }

    state = await assistant.ainvoke(initial_state, config=config)

    # Detect HITL interrupt: writer_node produced a draft but human_approval_node
    # paused before setting answer — return the draft for frontend review
    if state.get("draft") and not state.get("answer"):
        return QueryResponse(
            answer="",
            draft=state["draft"],
            thread_id=thread_id,
            status="awaiting_approval",
        )

    return QueryResponse(answer=state["answer"])


@router.post("/resume", response_model=QueryResponse)
async def resume(body: ResumeRequest, user: User = Depends(get_current_user)):
    """
    Resume a paused write-path graph after the user reviews the draft.

    The frontend sends the thread_id received from /query along with
    the user's decision (approved / edited / rejected).
    """
    config   = {"configurable": {"thread_id": body.thread_id}}
    decision = {"action": body.action, "content": body.content}

    state = await assistant.ainvoke(Command(resume=decision), config=config)

    return QueryResponse(answer=state["answer"])
