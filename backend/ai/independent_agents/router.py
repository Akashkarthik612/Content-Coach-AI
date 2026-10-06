"""Endpoints for the three independent platform agents (day_3.md).

One endpoint per platform, each calling only its own agent. Every endpoint
returns a draft — nothing is persisted to `posts` here.

LinkedIn has thread memory (Step 1b): a chat is a thread in agent_threads,
its conversation lives in the LangGraph checkpointer. Reddit and X are still
stateless until they get the same treatment.
"""

import logging
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from langchain_core.messages import HumanMessage, RemoveMessage
from langgraph.graph.state import CompiledStateGraph
from sqlalchemy.orm import Session

from backend.ai.independent_agents.limits import X_POST_MAX_CHARS, is_transient_llm_error
from backend.ai.independent_agents.linkedin import AGENT as LINKEDIN
from backend.ai.independent_agents.reddit import RedditAgent, RedditPostRequest, RedditPostResponse
from backend.ai.independent_agents.schemas import (
    ChatRequest,
    LinkedInChatResponse,
    ThreadDetail,
    ThreadMessage,
    ThreadStatus,
    ThreadSummary,
)
from backend.ai.independent_agents.threads import (
    AgentThreadService,
    ThreadBusyError,
    ThreadLimitReachedError,
    ThreadNotFoundError,
)
from backend.ai.independent_agents.x import XAgent, XPostRequest, XPostResponse, XPostTooLongError
from backend.auth.models import User
from backend.auth.services import get_current_user
from backend.core.config import settings
from backend.core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/independent-agents", tags=["independent-agents"])


def _llm_failed(platform: str, exc: Exception) -> HTTPException:
    logger.exception("%s agent failed", platform, exc_info=exc)
    if is_transient_llm_error(exc):
        # All GEMINI_ATTEMPTS timed out or were rate-limited/overloaded.
        return HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Request timed out. Please try again.",
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"The {platform} agent could not generate a post. Please try again.",
    )


def _thread_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ThreadNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, "Chat not found. Start a new chat.")
    if isinstance(exc, ThreadLimitReachedError):
        return HTTPException(
            status.HTTP_409_CONFLICT,
            f"This chat has reached its {settings.THREAD_TURN_LIMIT}-message limit. Start a new chat.",
        )
    return HTTPException(status.HTTP_409_CONFLICT, "Still working on your last message.")


def _thread_status(thread_id: UUID, turn_count: int) -> ThreadStatus:
    return ThreadStatus(
        thread_id=thread_id,
        turn_count=turn_count,
        turn_limit=settings.THREAD_TURN_LIMIT,
        limit_reached=turn_count >= settings.THREAD_TURN_LIMIT,
    )


def _config(thread_id: UUID) -> dict:
    return {"configurable": {"thread_id": str(thread_id)}}


def _linkedin_graph(request: Request) -> CompiledStateGraph:
    return request.app.state.linkedin_graph


# ── LinkedIn (thread memory) ──────────────────────────────────────────────────


@router.post("/linkedin", response_model=LinkedInChatResponse)
async def chat_linkedin(
    req: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    graph: CompiledStateGraph = Depends(_linkedin_graph),
) -> LinkedInChatResponse:
    is_new = req.thread_id is None
    try:
        if is_new:
            thread_id = await run_in_threadpool(AgentThreadService.create, db, user.id, LINKEDIN, req.message)
        else:
            thread_id = req.thread_id
            await run_in_threadpool(AgentThreadService.acquire, db, thread_id, user.id, LINKEDIN)
    except (ThreadNotFoundError, ThreadBusyError, ThreadLimitReachedError) as exc:
        raise _thread_error(exc) from exc

    # Own id so a failed turn's message can be removed again (see below).
    human = HumanMessage(content=req.message, id=str(uuid.uuid4()))
    try:
        # durability="exit": one checkpoint write per turn — a one-node graph
        # has no intermediate state worth saving.
        result = await graph.ainvoke(
            {"messages": [human], "user_id": str(user.id)},
            _config(thread_id),
            durability="exit",
        )
    except Exception as exc:
        await _undo_failed_turn(graph, db, thread_id, human.id, is_new)
        raise _llm_failed("LinkedIn", exc) from exc

    try:
        turn_count = await run_in_threadpool(AgentThreadService.finish, db, thread_id)
    except ThreadNotFoundError as exc:
        # Deleted while this turn ran: the turn just re-saved checkpoints for a
        # thread with no registry row, which the retention sweep would never
        # find — remove them now.
        await graph.checkpointer.adelete_thread(str(thread_id))
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This chat was deleted while replying. Start a new chat."
        ) from exc
    reply = result["messages"][-1]
    return LinkedInChatResponse(
        content=reply.content,
        note=reply.additional_kwargs.get("note"),
        thread=_thread_status(thread_id, turn_count),
    )


async def _undo_failed_turn(
    graph: CompiledStateGraph, db: Session, thread_id: UUID, human_id: str, is_new: bool
) -> None:
    """LangGraph still saves the input when a run fails, which would leave an
    unanswered user message in the thread. Put the thread back as it was so
    the user can simply resend."""
    try:
        if is_new:
            await graph.checkpointer.adelete_thread(str(thread_id))
            await run_in_threadpool(AgentThreadService.delete_row, db, thread_id)
            return
        await graph.aupdate_state(_config(thread_id), {"messages": [RemoveMessage(id=human_id)]})
    except Exception:
        logger.exception("Could not undo failed turn on thread %s", thread_id)
    if not is_new:
        await run_in_threadpool(AgentThreadService.release, db, thread_id)


@router.get("/linkedin/threads", response_model=list[ThreadSummary])
def list_linkedin_threads(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[ThreadSummary]:
    return [ThreadSummary.model_validate(t) for t in AgentThreadService.list_threads(db, user.id, LINKEDIN)]


@router.get("/linkedin/threads/{thread_id}", response_model=ThreadDetail)
async def get_linkedin_thread(
    thread_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    graph: CompiledStateGraph = Depends(_linkedin_graph),
) -> ThreadDetail:
    thread = await run_in_threadpool(AgentThreadService.get, db, thread_id, user.id, LINKEDIN)
    if thread is None:
        raise _thread_error(ThreadNotFoundError())
    snapshot = await graph.aget_state(_config(thread_id))
    messages = [
        ThreadMessage(
            role="user" if m.type == "human" else "assistant",
            content=m.content,
            note=m.additional_kwargs.get("note"),
        )
        for m in snapshot.values.get("messages", [])
        if m.type in ("human", "ai")
    ]
    return ThreadDetail(
        id=thread.id,
        title=thread.title,
        messages=messages,
        thread=_thread_status(thread.id, thread.turn_count),
    )


@router.delete("/linkedin/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_linkedin_thread(
    thread_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    graph: CompiledStateGraph = Depends(_linkedin_graph),
) -> Response:
    try:
        await run_in_threadpool(AgentThreadService.lock_for_delete, db, thread_id, user.id, LINKEDIN)
    except (ThreadNotFoundError, ThreadBusyError) as exc:
        raise _thread_error(exc) from exc
    # Checkpoints first: if this fails the row (and its lease, which expires)
    # remains, so the delete or the retention sweep can be retried.
    await graph.checkpointer.adelete_thread(str(thread_id))
    await run_in_threadpool(AgentThreadService.delete_row, db, thread_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Reddit and X (stateless until they get thread memory) ────────────────────


@router.post("/reddit", response_model=RedditPostResponse)
async def generate_reddit_post(
    req: RedditPostRequest, user: User = Depends(get_current_user)
) -> RedditPostResponse:
    try:
        return await RedditAgent.run(req, user.id)
    except Exception as exc:
        raise _llm_failed("Reddit", exc) from exc


@router.post("/x", response_model=XPostResponse)
async def generate_x_post(req: XPostRequest, user: User = Depends(get_current_user)) -> XPostResponse:
    try:
        return await XAgent.run(req, user.id)
    except XPostTooLongError as exc:
        # Already logged with index and length in XAgent.check_lengths.
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"The X agent wrote a post over {X_POST_MAX_CHARS} characters. Please try again.",
        ) from exc
    except Exception as exc:
        raise _llm_failed("X", exc) from exc
