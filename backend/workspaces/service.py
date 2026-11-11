"""Short transactions for workspace membership, source grants and immutable agent versions."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.agents.models import AgentConfiguration
from backend.agents.service import RESERVED_HANDLES
from backend.auth.models import User
from backend.knowledge.models import KnowledgeDocument, KnowledgeSource
from backend.knowledge.permissions import WorkspaceKnowledgeScope, document_access
from backend.workspaces.models import AgentVersion, Workspace, WorkspaceMember, WorkspaceSource
from backend.workspaces.schemas import AgentIn


def fail(code: int, reason: str):
    raise HTTPException(code, detail={"reason": reason})


def member(db: Session, workspace_id: UUID, user_id: UUID, admin=False):
    row = db.get(WorkspaceMember, (workspace_id, user_id))
    if row is None:
        fail(404, "workspace_not_found")
    if admin and row.role != "admin":
        fail(403, "workspace_admin_required")
    return row


def shared_scope(db: Session, workspace_id: UUID):
    ids = db.scalars(
        select(WorkspaceSource.source_id).where(WorkspaceSource.workspace_id == workspace_id)
    ).all()
    return WorkspaceKnowledgeScope(workspace_id, tuple(ids))


def visible_documents(db: Session, workspace_id: UUID, user_id: UUID):
    d = KnowledgeDocument.__table__
    return db.scalars(
        select(KnowledgeDocument)
        .join(KnowledgeSource, KnowledgeSource.id == KnowledgeDocument.source_id)
        .where(
            document_access(d, user_id, shared_scope(db, workspace_id)), KnowledgeSource.status != "paused"
        )
        .order_by(KnowledgeDocument.title)
    ).all()


def validate_permissions(db: Session, workspace_id: UUID, user_id: UUID, config: AgentIn):
    shared = set(shared_scope(db, workspace_id).source_ids)
    if not set(config.source_ids) <= shared:
        fail(422, "agent_source_not_shared")
    allowed_docs = {d.id for d in visible_documents(db, workspace_id, user_id)}
    if not set(config.document_ids) <= allowed_docs:
        fail(422, "agent_document_not_shared")
    if config.handle in RESERVED_HANDLES:
        fail(422, "reserved_handle")


def get_agent(db: Session, workspace_id: UUID, agent_id: UUID, lock=False):
    query = select(AgentConfiguration).where(
        AgentConfiguration.id == agent_id,
        AgentConfiguration.workspace_id == workspace_id,
        AgentConfiguration.archived_at.is_(None),
    )
    if lock:
        query = query.with_for_update()
    row = db.scalar(query)
    if row is None:
        fail(404, "agent_not_found")
    return row


def version_for(db: Session, agent: AgentConfiguration):
    row = db.scalar(
        select(AgentVersion).where(AgentVersion.agent_id == agent.id, AgentVersion.version == agent.version)
    )
    if row is None:
        fail(409, "agent_version_missing")
    return row


def save_agent(
    db: Session,
    workspace_id: UUID,
    user_id: UUID,
    config: AgentIn,
    agent_id: UUID | None = None,
    expected_version: int | None = None,
):
    member(db, workspace_id, user_id, admin=True)
    validate_permissions(db, workspace_id, user_id, config)
    values = config.model_dump(mode="json", exclude={"expected_version"})
    if agent_id is None:
        # Workspace row serializes concurrent creations/count checks.
        db.scalar(select(Workspace).where(Workspace.id == workspace_id).with_for_update())
        count = db.scalar(
            select(func.count())
            .select_from(AgentConfiguration)
            .where(AgentConfiguration.workspace_id == workspace_id, AgentConfiguration.archived_at.is_(None))
        )
        if count >= 50:
            fail(409, "workspace_agent_limit")
        row = AgentConfiguration(user_id=None, workspace_id=workspace_id, version=1, **values)
        db.add(row)
        db.flush()
    else:
        row = get_agent(db, workspace_id, agent_id, lock=True)
        if row.version != expected_version:
            fail(409, "agent_version_conflict")
        row.version += 1
        row.updated_at = datetime.now(UTC)
        for key, value in values.items():
            setattr(row, key, value)
    db.add(AgentVersion(agent_id=row.id, version=row.version, configuration=values, created_by=user_id))
    db.flush()
    return row


def agent_json(row):
    keys = (
        "id",
        "workspace_id",
        "name",
        "handle",
        "description",
        "responsibility",
        "model",
        "workflow_role",
        "system_prompt",
        "guardrails",
        "source_ids",
        "document_ids",
        "enabled_tools",
        "version",
        "created_at",
        "updated_at",
    )
    return {k: getattr(row, k) for k in keys}


def members_json(db: Session, workspace_id: UUID):
    return [
        {
            "user_id": m.user_id,
            "email": u.email,
            "username": u.username,
            "role": m.role,
            "joined_at": m.joined_at,
        }
        for m, u in db.execute(
            select(WorkspaceMember, User)
            .join(User, User.id == WorkspaceMember.user_id)
            .where(WorkspaceMember.workspace_id == workspace_id)
            .order_by(WorkspaceMember.joined_at)
        )
    ]


def sources_json(db: Session, workspace_id: UUID, user_id: UUID):
    rows = db.execute(
        select(WorkspaceSource, KnowledgeSource)
        .join(KnowledgeSource, KnowledgeSource.id == WorkspaceSource.source_id)
        .where(WorkspaceSource.workspace_id == workspace_id)
    ).all()
    current = datetime.now(UTC)
    return [
        {
            "id": s.id,
            "display_name": s.display_name,
            "provider": s.provider,
            "status": s.status,
            "owner_id": share.owner_id,
            "document_ids": share.document_ids,
            "last_success_at": s.last_success_at,
            "last_run_at": s.last_run_at,
            "syncing": bool(s.sync_lease_until and s.sync_lease_until > current),
            "can_manage_connection": s.user_id == user_id,
        }
        for share, s in rows
    ]
