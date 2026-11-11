"""Persistence for custom agents. SQL only; the rules live in service.py.

Tenant rule (as in KnowledgeRepository): every method takes `user_id` right
after the session and every statement filters on it, and on
`archived_at IS NULL`. Another user's agent, or an archived one, is simply
not found. Each write method is one transaction and commits on success; on
failure it rolls back and re-raises (the service logs and maps the error).
"""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from uuid import UUID

from sqlalchemy import func, insert, select, update
from sqlalchemy.orm import Session

from backend.agents.models import AgentConfiguration, AgentModel
from backend.agents.records import AgentConfig
from backend.auth.models import User

_A = AgentConfiguration.__table__
_COLS = (
    _A.c.id,
    _A.c.user_id,
    _A.c.handle,
    _A.c.model,
    _A.c.system_prompt,
    _A.c.guardrails,
    _A.c.created_at,
    _A.c.updated_at,
)


def _record(row: Any) -> AgentConfig:
    return AgentConfig(
        id=row.id,
        user_id=row.user_id,
        handle=row.handle,
        model=AgentModel(row.model),
        system_prompt=row.system_prompt,
        guardrails=row.guardrails,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _active(user_id: UUID):
    return (_A.c.user_id == user_id, _A.c.workspace_id.is_(None), _A.c.archived_at.is_(None))


@contextmanager
def _transaction(db: Session) -> Iterator[None]:
    try:
        yield
        db.commit()
    except Exception:
        db.rollback()
        raise


class AgentConfigRepository:
    @staticmethod
    def insert_within_cap(db: Session, user_id: UUID, values: dict[str, Any], max_active: int) -> AgentConfig | None:
        """Insert unless the user already has `max_active` active agents
        (then None, nothing written). The user's row is locked for the count
        and the insert, so two concurrent creates can't both pass the cap.
        A duplicate active handle raises IntegrityError."""
        with _transaction(db):
            db.execute(select(User.id).where(User.id == user_id).with_for_update())
            active = db.execute(select(func.count()).select_from(_A).where(*_active(user_id))).scalar_one()
            if active >= max_active:
                return None
            row = db.execute(insert(_A).values(user_id=user_id, **values).returning(*_COLS)).one()
        return _record(row)

    @staticmethod
    def get_active(db: Session, user_id: UUID, agent_id: UUID) -> AgentConfig | None:
        row = db.execute(select(*_COLS).where(_A.c.id == agent_id, *_active(user_id))).one_or_none()
        return None if row is None else _record(row)

    @staticmethod
    def list_active(db: Session, user_id: UUID) -> list[AgentConfig]:
        rows = db.execute(select(*_COLS).where(*_active(user_id)).order_by(_A.c.handle)).all()
        return [_record(r) for r in rows]

    @staticmethod
    def update(db: Session, user_id: UUID, agent_id: UUID, values: dict[str, Any]) -> AgentConfig | None:
        """None if the agent isn't active or isn't this user's. A duplicate
        active handle raises IntegrityError."""
        with _transaction(db):
            row = db.execute(
                update(_A)
                .where(_A.c.id == agent_id, *_active(user_id))
                .values(**values, updated_at=func.now())
                .returning(*_COLS)
            ).one_or_none()
        return None if row is None else _record(row)

    @staticmethod
    def archive(db: Session, user_id: UUID, agent_id: UUID) -> AgentConfig | None:
        with _transaction(db):
            row = db.execute(
                update(_A)
                .where(_A.c.id == agent_id, *_active(user_id))
                .values(archived_at=func.now(), updated_at=func.now())
                .returning(*_COLS)
            ).one_or_none()
        return None if row is None else _record(row)
