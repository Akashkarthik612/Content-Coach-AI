"""Trusted, server-built access scope. Every retrieval query rechecks membership and sharing."""

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import Text, and_, cast, or_, select


@dataclass(frozen=True)
class WorkspaceKnowledgeScope:
    workspace_id: UUID
    source_ids: tuple[UUID, ...] = ()
    document_ids: tuple[UUID, ...] = ()


def document_access(document, user_id: UUID, scope: WorkspaceKnowledgeScope | None = None):
    if scope is None:
        return document.c.user_id == user_id
    from backend.workspaces.models import WorkspaceMember, WorkspaceSource

    shares = WorkspaceSource.__table__
    members = WorkspaceMember.__table__
    membership = (
        select(members.c.user_id)
        .where(
            members.c.workspace_id == scope.workspace_id,
            members.c.user_id == user_id,
        )
        .exists()
    )
    shared = (
        select(shares.c.source_id)
        .where(
            shares.c.workspace_id == scope.workspace_id,
            shares.c.source_id == document.c.source_id,
            shares.c.owner_id == document.c.user_id,
            or_(shares.c.document_ids.is_(None), shares.c.document_ids.has_key(cast(document.c.id, Text))),
        )
        .exists()
    )
    # Empty selections grant nothing. Selected sources and individual documents form a union.
    configured = or_(document.c.source_id.in_(scope.source_ids), document.c.id.in_(scope.document_ids))
    return and_(membership, shared, configured)
