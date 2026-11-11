"""Custom-agent endpoints (/api/agents). HTTP only: rules are in service.py,
the turn is in runner.py.

Agents are addressed by id, which survives a rename. A missing, archived or
someone else's agent is always 404 with the same message, so ids don't leak.
Errors carry {"code", "message"} so the UI can map `handle_taken` and
`reserved` to the Name field.
"""

import logging
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from langchain_core.messages import HumanMessage
from sqlalchemy.orm import Session

from backend.agents.errors import (
    AgentError,
    AgentLimitReachedError,
    AgentNotFoundError,
    HandleTakenError,
    ReservedHandleError,
)
from backend.agents.runner import CustomAgentRunner
from backend.agents.schemas import (
    AgentChatRequest,
    AgentChatResponse,
    AgentCreate,
    AgentListItem,
    AgentOut,
    AgentUpdate,
)
from backend.agents.service import AgentConfigService as Service
from backend.ai.independent_agents.limits import is_transient_llm_error
from backend.ai.tools.access import KnowledgeAccess
from backend.auth.models import User
from backend.auth.services import get_current_user
from backend.core.config import settings
from backend.core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agents"])

NOT_FOUND_MESSAGE = "This agent was deleted or doesn't exist."


def _http(exc: AgentError) -> HTTPException:
    status_code, message = {
        AgentNotFoundError: (status.HTTP_404_NOT_FOUND, NOT_FOUND_MESSAGE),
        HandleTakenError: (status.HTTP_409_CONFLICT, "You already have an agent with this name."),
        # 422 as a literal: Starlette renamed the constant, and FastAPI is unpinned.
        ReservedHandleError: (422, "This name is reserved. Pick another one."),
        AgentLimitReachedError: (
            status.HTTP_409_CONFLICT,
            f"You can have up to {settings.MAX_CUSTOM_AGENTS_PER_USER} agents. Delete one to create another.",
        ),
    }[type(exc)]
    return HTTPException(status_code, {"code": exc.code, "message": message})


def _knowledge(request: Request) -> KnowledgeAccess | None:
    """Built in main.py's lifespan; None when KNOWLEDGE_TOOLS_ENABLED is off."""
    return request.app.state.knowledge


# ── configuration ─────────────────────────────────────────────────────────────


@router.post("", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
def create_agent(req: AgentCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> AgentOut:
    try:
        return AgentOut.of(Service.create(db, user.id, req))
    except AgentError as exc:
        raise _http(exc) from exc


@router.get("", response_model=list[AgentListItem])
def list_agents(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[AgentListItem]:
    """The @ picker: the user's active agents, by handle."""
    return [AgentListItem.of(c) for c in Service.list(db, user.id)]


@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(agent_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> AgentOut:
    try:
        return AgentOut.of(Service.get(db, user.id, agent_id))
    except AgentError as exc:
        raise _http(exc) from exc


@router.patch("/{agent_id}", response_model=AgentOut)
def update_agent(
    agent_id: UUID, req: AgentUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AgentOut:
    try:
        return AgentOut.of(Service.update(db, user.id, agent_id, req))
    except AgentError as exc:
        raise _http(exc) from exc


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_agent(agent_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    try:
        Service.archive(db, user.id, agent_id)
    except AgentError as exc:
        raise _http(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── calling an agent ──────────────────────────────────────────────────────────


@router.post("/{agent_id}/chat", response_model=AgentChatResponse)
async def chat_with_agent(
    agent_id: UUID,
    req: AgentChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    knowledge: KnowledgeAccess | None = Depends(_knowledge),
) -> AgentChatResponse:
    """Load the agent's row (404 before any model call), then run one turn
    with it. Stateless for now: one message in, one answer out. The config is
    read per call, so an edit applies from the next call."""
    try:
        config = await run_in_threadpool(Service.get, db, user.id, agent_id)
    except AgentError as exc:
        raise _http(exc) from exc

    correlation_id = str(uuid.uuid4())
    try:
        return await CustomAgentRunner.answer(config, [HumanMessage(req.message)], knowledge, correlation_id)
    except Exception as exc:
        transient = is_transient_llm_error(exc)
        logger.exception(
            "agent.custom_failed user_id=%s agent_config_id=%s correlation_id=%s error_type=%s transient=%s",
            user.id,
            config.id,
            correlation_id,
            type(exc).__name__,
            transient,
        )
        if transient:
            raise HTTPException(
                status.HTTP_504_GATEWAY_TIMEOUT,
                {"code": "timeout", "message": "Request timed out. Please try again."},
            ) from exc
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            {"code": "agent_failed", "message": f"@{config.handle} could not answer. Please try again."},
        ) from exc
