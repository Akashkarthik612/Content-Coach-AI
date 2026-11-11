"""Rules for custom agents: reserved handles, the per-user cap, one active
agent per handle, no-op edits. SQL is in repository.py; HTTP is in router.py.

Handle uniqueness is never pre-checked (that would race): the partial unique
index rejects the duplicate and its IntegrityError becomes HandleTakenError.
Logs carry ids, handles and lengths, never prompt or guardrail text.
"""

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.agents.errors import (
    AgentError,
    AgentLimitReachedError,
    AgentNotFoundError,
    HandleTakenError,
    ReservedHandleError,
)
from backend.agents.records import AgentConfig
from backend.agents.repository import AgentConfigRepository as Repo
from backend.agents.schemas import AgentCreate, AgentUpdate
from backend.core.config import settings

logger = logging.getLogger(__name__)

UNIQUE_HANDLE_INDEX = "uq_agent_configurations_user_handle_active"
# System and mention words a user's agent can't take (D8-D8). O(1) lookup.
RESERVED_HANDLES: frozenset[str] = frozenset({"auto", "honne", "all", "here", "everyone"})


def _log(event: str, c: AgentConfig) -> None:
    fields = {
        "user_id": c.user_id,
        "agent_config_id": c.id,
        "handle": c.handle,
        "model": c.model.value,
        "prompt_chars": len(c.system_prompt),
        "guardrails_chars": len(c.guardrails or ""),
    }
    logger.info("%s %s", event, " ".join(f"{k}={v}" for k, v in fields.items()), extra=fields)


def _rejected(user_id: UUID, error: AgentError) -> AgentError:
    logger.warning("agent_config.rejected user_id=%s code=%s", user_id, error.code)
    return error


def _is_handle_conflict(exc: IntegrityError) -> bool:
    diag = getattr(exc.orig, "diag", None)
    return getattr(diag, "constraint_name", None) == UNIQUE_HANDLE_INDEX


class AgentConfigService:
    @staticmethod
    def create(db: Session, user_id: UUID, req: AgentCreate) -> AgentConfig:
        AgentConfigService._check_reserved(user_id, req.handle)
        values = {
            "handle": req.handle,
            "model": req.model.value,
            "system_prompt": req.system_prompt,
            "guardrails": req.guardrails,
        }
        try:
            config = Repo.insert_within_cap(db, user_id, values, settings.MAX_CUSTOM_AGENTS_PER_USER)
        except IntegrityError as exc:
            if _is_handle_conflict(exc):
                raise _rejected(user_id, HandleTakenError()) from exc
            raise
        if config is None:
            raise _rejected(user_id, AgentLimitReachedError())
        _log("agent_config.created", config)
        return config

    @staticmethod
    def get(db: Session, user_id: UUID, agent_id: UUID) -> AgentConfig:
        config = Repo.get_active(db, user_id, agent_id)
        if config is None:
            raise AgentNotFoundError
        return config

    @staticmethod
    def list(db: Session, user_id: UUID) -> list[AgentConfig]:
        return Repo.list_active(db, user_id)

    @staticmethod
    def update(db: Session, user_id: UUID, agent_id: UUID, req: AgentUpdate) -> AgentConfig:
        """Only changed fields are written. An edit that changes nothing
        returns the agent as it is: no write, no updated_at bump, no log."""
        current = AgentConfigService.get(db, user_id, agent_id)
        changes = {k: v for k, v in _columns(req.changes()).items() if getattr(current, k) != v}
        if not changes:
            return current
        if "handle" in changes:
            AgentConfigService._check_reserved(user_id, changes["handle"])
        try:
            config = Repo.update(db, user_id, agent_id, changes)
        except IntegrityError as exc:
            if _is_handle_conflict(exc):
                raise _rejected(user_id, HandleTakenError()) from exc
            raise
        if config is None:  # archived between the read and the write
            raise AgentNotFoundError
        _log("agent_config.updated", config)
        return config

    @staticmethod
    def archive(db: Session, user_id: UUID, agent_id: UUID) -> None:
        config = Repo.archive(db, user_id, agent_id)
        if config is None:
            raise AgentNotFoundError
        _log("agent_config.archived", config)

    @staticmethod
    def _check_reserved(user_id: UUID, handle: str) -> None:
        if handle in RESERVED_HANDLES:
            raise _rejected(user_id, ReservedHandleError())


def _columns(changes: dict[str, Any]) -> dict[str, Any]:
    """AgentUpdate values as stored: the enum compares and saves as its value."""
    return {k: (v.value if k == "model" else v) for k, v in changes.items()}
