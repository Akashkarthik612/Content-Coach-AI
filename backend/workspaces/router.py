"""Authenticated /api/workspaces API. Every workspace operation checks current membership."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from langchain_core.messages import HumanMessage
from langsmith import tracing_context
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.agents.models import AgentConfiguration
from backend.agents.records import AgentConfig
from backend.agents.runner import CustomAgentRunner
from backend.ai.tools.access import sources_json as tool_sources_json
from backend.ai.tools.context import ToolContext
from backend.auth.models import User
from backend.auth.services import get_current_user
from backend.core.database import get_db
from backend.knowledge.models import KnowledgeDocument, KnowledgeSource
from backend.knowledge.permissions import WorkspaceKnowledgeScope
from backend.knowledge.sync import run_sync_in_background
from backend.workspaces import chat, service, workflow
from backend.workspaces.models import (
    AgentVersion,
    Conversation,
    WorkflowReview,
    WorkflowRun,
    WorkflowStep,
    Workspace,
    WorkspaceMember,
    WorkspaceSource,
)
from backend.workspaces.runtime import AGENT_TIMEOUT_S, PLATFORM_RULES, error_code
from backend.workspaces.schemas import (
    AgentEdit,
    AgentIn,
    ConversationIn,
    MemberIn,
    MessageIn,
    PreviewIn,
    ReviewIn,
    ShareIn,
    WorkflowIn,
    WorkspaceIn,
)

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


def commit(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        service.fail(409, "workspace_configuration_conflict")


def knowledge(request):
    value = getattr(request.app.state, "knowledge", None)
    if value is None:
        service.fail(503, "knowledge_tools_disabled")
    return value


def graph(request):
    value = getattr(request.app.state, "workspace_graph", None)
    if value is None:
        service.fail(503, "workspace_workflow_unavailable")
    return value


@router.get("")
def list_workspaces(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [
        {"id": w.id, "name": w.name, "role": m.role, "created_at": w.created_at}
        for w, m in db.execute(
            select(Workspace, WorkspaceMember)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(WorkspaceMember.user_id == user.id)
            .order_by(Workspace.created_at)
        )
    ]


@router.post("", status_code=201)
def create_workspace(
    body: WorkspaceIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    row = Workspace(name=body.name, created_by=user.id)
    db.add(row)
    db.flush()
    db.add(WorkspaceMember(workspace_id=row.id, user_id=user.id, role="admin"))
    commit(db)
    return {"id": row.id, "name": row.name, "role": "admin", "created_at": row.created_at}


@router.get("/{workspace_id}")
def get_workspace(workspace_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    membership = service.member(db, workspace_id, user.id)
    row = db.get(Workspace, workspace_id)
    return {
        "id": row.id,
        "name": row.name,
        "role": membership.role,
        "user_id": user.id,
        "members": service.members_json(db, workspace_id),
        "sources": service.sources_json(db, workspace_id, user.id),
    }


@router.get("/{workspace_id}/members")
def list_members(workspace_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service.member(db, workspace_id, user.id)
    return service.members_json(db, workspace_id)


@router.post("/{workspace_id}/members", status_code=201)
def add_member(
    workspace_id: UUID, body: MemberIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    service.member(db, workspace_id, user.id, admin=True)
    employee = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if employee is None:
        service.fail(404, "registered_employee_not_found")
    if db.get(WorkspaceMember, (workspace_id, employee.id)):
        service.fail(409, "employee_already_member")
    db.add(WorkspaceMember(workspace_id=workspace_id, user_id=employee.id, role=body.role))
    commit(db)
    return service.members_json(db, workspace_id)


@router.get("/{workspace_id}/knowledge")
def list_knowledge(workspace_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service.member(db, workspace_id, user.id)
    docs = service.visible_documents(db, workspace_id, user.id)
    return {
        "sources": service.sources_json(db, workspace_id, user.id),
        "documents": [
            {
                "id": d.id,
                "source_id": d.source_id,
                "title": d.title,
                "source_url": d.source_url,
                "sync_status": d.sync_status,
                "updated_at": d.updated_at,
                "chunk_count": d.chunk_count,
            }
            for d in docs
        ],
    }


@router.post("/{workspace_id}/knowledge/sources", status_code=201)
def share_source(
    workspace_id: UUID, body: ShareIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    service.member(db, workspace_id, user.id, admin=True)
    source = db.scalar(
        select(KnowledgeSource).where(
            KnowledgeSource.id == body.source_id, KnowledgeSource.user_id == user.id
        )
    )
    if source is None:
        service.fail(404, "own_source_not_found")
    if body.document_ids:
        found = set(
            db.scalars(
                select(KnowledgeDocument.id).where(
                    KnowledgeDocument.source_id == source.id,
                    KnowledgeDocument.user_id == user.id,
                    KnowledgeDocument.id.in_(body.document_ids),
                )
            ).all()
        )
        if found != set(body.document_ids):
            service.fail(422, "document_not_in_source")
    from sqlalchemy.dialects.postgresql import insert

    db.execute(
        insert(WorkspaceSource)
        .values(
            workspace_id=workspace_id,
            source_id=source.id,
            owner_id=user.id,
            shared_by=user.id,
            document_ids=None if body.document_ids is None else [str(v) for v in body.document_ids],
        )
        .on_conflict_do_update(
            index_elements=[WorkspaceSource.workspace_id, WorkspaceSource.source_id],
            set_={
                "document_ids": None if body.document_ids is None else [str(v) for v in body.document_ids],
                "shared_by": user.id,
            },
        )
    )
    commit(db)
    return {"shared": True, "source_id": source.id}


@router.delete("/{workspace_id}/knowledge/sources/{source_id}", status_code=204)
def unshare_source(
    workspace_id: UUID, source_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    service.member(db, workspace_id, user.id, admin=True)
    row = db.get(WorkspaceSource, (workspace_id, source_id))
    if row is None:
        service.fail(404, "shared_source_not_found")
    db.delete(row)
    commit(db)
    return Response(status_code=204)


@router.post("/{workspace_id}/knowledge/sources/{source_id}/sync", status_code=202)
def sync_shared_source(
    workspace_id: UUID,
    source_id: UUID,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.member(db, workspace_id, user.id, admin=True)
    share = db.get(WorkspaceSource, (workspace_id, source_id))
    if share is None:
        service.fail(404, "shared_source_not_found")
    # Resolve the connector owner on the server; do not accept an owner/token from the caller.
    background.add_task(run_sync_in_background, share.owner_id, source_id)
    return {"status": "sync_requested", "source_id": source_id}


@router.get("/{workspace_id}/agents")
def list_agents(workspace_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service.member(db, workspace_id, user.id)
    return [
        service.agent_json(row)
        for row in db.scalars(
            select(AgentConfiguration)
            .where(AgentConfiguration.workspace_id == workspace_id, AgentConfiguration.archived_at.is_(None))
            .order_by(AgentConfiguration.handle)
        )
    ]


@router.post("/{workspace_id}/agents", status_code=201)
def create_agent(
    workspace_id: UUID, body: AgentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    try:
        row = service.save_agent(db, workspace_id, user.id, body)
        commit(db)
    except IntegrityError:
        db.rollback()
        service.fail(409, "agent_handle_taken")
    return service.agent_json(row)


@router.put("/{workspace_id}/agents/{agent_id}")
def edit_agent(
    workspace_id: UUID,
    agent_id: UUID,
    body: AgentEdit,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        row = service.save_agent(db, workspace_id, user.id, body, agent_id, body.expected_version)
        commit(db)
    except IntegrityError:
        db.rollback()
        service.fail(409, "agent_handle_taken")
    return service.agent_json(row)


@router.delete("/{workspace_id}/agents/{agent_id}", status_code=204)
def archive_agent(
    workspace_id: UUID, agent_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    service.member(db, workspace_id, user.id, admin=True)
    row = service.get_agent(db, workspace_id, agent_id, lock=True)
    row.archived_at, row.updated_at = datetime.now(UTC), datetime.now(UTC)
    commit(db)
    return Response(status_code=204)


@router.post("/{workspace_id}/agents/preview")
async def preview_agent(
    workspace_id: UUID,
    body: PreviewIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import asyncio

    service.member(db, workspace_id, user.id, admin=True)
    cfg = body.configuration
    service.validate_permissions(db, workspace_id, user.id, cfg)
    user_id = user.id
    db.rollback()  # release the connection before making model calls
    current = datetime.now(UTC)
    config = AgentConfig(
        id=uuid4(),
        user_id=user_id,
        handle=cfg.handle,
        model=cfg.model,
        system_prompt=cfg.system_prompt,
        guardrails=cfg.guardrails,
        created_at=current,
        updated_at=current,
        responsibility=cfg.responsibility,
    )
    ctx = ToolContext(
        user_id=user_id,
        agent="custom",
        correlation_id=str(config.id),
        knowledge_scope=WorkspaceKnowledgeScope(workspace_id, tuple(cfg.source_ids), tuple(cfg.document_ids)),
        enabled_tools=tuple(cfg.enabled_tools),
    )
    try:
        with tracing_context(enabled=False):
            result = await asyncio.wait_for(
                CustomAgentRunner.run(
                    config,
                    [HumanMessage(body.message)],
                    knowledge(request),
                    ctx,
                    platform_rules=PLATFORM_RULES,
                ),
                AGENT_TIMEOUT_S,
            )
        return {
            **result.output.model_dump(),
            "sources": tool_sources_json(result.sources),
            "steps": [
                {"tool_name": c.name, "ok": c.ok, "result_count": c.result_count, "error_code": c.error_code}
                for c in result.calls
            ],
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - never expose provider prompts/documents through HTTP errors
        service.fail(502, error_code(exc))


@router.post("/{workspace_id}/conversations", status_code=201)
def create_conversation(
    workspace_id: UUID,
    body: ConversationIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.member(db, workspace_id, user.id)
    row = Conversation(workspace_id=workspace_id, title=body.title, created_by=user.id)
    db.add(row)
    commit(db)
    return {"id": row.id, "title": row.title, "created_by": row.created_by, "updated_at": row.updated_at}


@router.get("/{workspace_id}/conversations")
def list_conversations(
    workspace_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    service.member(db, workspace_id, user.id)
    return [
        {"id": r.id, "title": r.title, "created_by": r.created_by, "updated_at": r.updated_at}
        for r in db.scalars(
            select(Conversation)
            .where(Conversation.workspace_id == workspace_id)
            .order_by(Conversation.updated_at.desc())
            .limit(100)
        )
    ]


@router.get("/{workspace_id}/conversations/{conversation_id}")
def get_conversation(
    workspace_id: UUID,
    conversation_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.member(db, workspace_id, user.id)
    row = chat.conversation(db, workspace_id, conversation_id)
    chat.expire_messages(db, conversation_id)
    commit(db)
    return {
        "id": row.id,
        "title": row.title,
        "messages": [
            {**chat.message_json(m), "agent_version": version}
            for m, version in db.execute(
                select(chat.ChatMessage, AgentVersion.version)
                .outerjoin(AgentVersion, AgentVersion.id == chat.ChatMessage.agent_version_id)
                .where(chat.ChatMessage.conversation_id == row.id)
                .order_by(chat.ChatMessage.seq)
            )
        ],
    }


@router.post("/{workspace_id}/conversations/{conversation_id}/messages", status_code=202)
def post_message(
    workspace_id: UUID,
    conversation_id: UUID,
    body: MessageIn,
    request: Request,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    access = knowledge(request)
    message_id, attempt_id = chat.start_turn(db, workspace_id, user.id, conversation_id, body.message)
    commit(db)
    background.add_task(chat.run_turn, access, message_id, attempt_id)
    return {"message_id": message_id, "status": "running"}


@router.post("/{workspace_id}/conversations/{conversation_id}/retry", status_code=202)
def retry_message(
    workspace_id: UUID,
    conversation_id: UUID,
    request: Request,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    access = knowledge(request)
    message_id, attempt_id = chat.retry_turn(db, workspace_id, user.id, conversation_id)
    commit(db)
    background.add_task(chat.run_turn, access, message_id, attempt_id)
    return {"message_id": message_id, "status": "running"}


@router.post("/{workspace_id}/workflows", status_code=202)
def start_workflow(
    workspace_id: UUID,
    body: WorkflowIn,
    request: Request,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    coordinator = graph(request)
    run_id, attempt_id = workflow.start_run(db, workspace_id, user.id, body)
    commit(db)
    background.add_task(workflow.run_workflow, coordinator, run_id, attempt_id)
    return {"id": run_id, "status": "queued"}


def run_json(run, full=False):
    result = {
        k: getattr(run, k)
        for k in (
            "id",
            "workspace_id",
            "initiated_by",
            "request",
            "status",
            "agents",
            "revision",
            "error_code",
            "created_at",
            "started_at",
            "finished_at",
        )
    }
    if full:
        result["state"] = run.state
    return result


@router.get("/{workspace_id}/workflows")
def list_workflows(workspace_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service.member(db, workspace_id, user.id)
    runs = db.scalars(
        select(WorkflowRun)
        .where(WorkflowRun.workspace_id == workspace_id)
        .order_by(WorkflowRun.created_at.desc())
        .limit(50)
    ).all()
    for row in runs:
        workflow.expire_run(db, row)
    commit(db)
    return [run_json(r) for r in runs]


@router.get("/{workspace_id}/workflows/{run_id}")
def get_workflow(
    workspace_id: UUID, run_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    service.member(db, workspace_id, user.id)
    row = workflow.get_run(db, workspace_id, run_id)
    workflow.expire_run(db, row)
    commit(db)
    steps = db.scalars(
        select(WorkflowStep)
        .where(WorkflowStep.run_id == row.id)
        .order_by(WorkflowStep.created_at, WorkflowStep.id)
    ).all()
    reviews = db.scalars(
        select(WorkflowReview).where(WorkflowReview.run_id == row.id).order_by(WorkflowReview.created_at)
    ).all()
    return {
        **run_json(row, full=True),
        "steps": [
            {
                k: getattr(s, k)
                for k in (
                    "id",
                    "revision",
                    "event",
                    "agent_id",
                    "agent_version",
                    "tool_name",
                    "details",
                    "created_at",
                )
            }
            for s in steps
        ],
        "reviews": [
            {k: getattr(r, k) for k in ("id", "revision", "reviewed_by", "action", "feedback", "created_at")}
            for r in reviews
        ],
        "duration_ms": sum(
            s.details.get("duration_ms", 0) for s in steps if s.event in ("agent_completed", "agent_failed")
        ),
    }


@router.post("/{workspace_id}/workflows/{run_id}/review", status_code=202)
def review_workflow(
    workspace_id: UUID,
    run_id: UUID,
    body: ReviewIn,
    request: Request,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    coordinator = graph(request)
    attempt_id = workflow.review_run(db, workspace_id, user.id, run_id, body)
    commit(db)
    background.add_task(
        workflow.run_workflow,
        coordinator,
        run_id,
        attempt_id,
        decision={"action": body.action, "feedback": body.feedback.strip()},
    )
    return {"id": run_id, "status": "queued"}


@router.post("/{workspace_id}/workflows/{run_id}/retry", status_code=202)
def retry_workflow(
    workspace_id: UUID,
    run_id: UUID,
    request: Request,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    coordinator = graph(request)
    attempt_id = workflow.retry_run(db, workspace_id, user.id, run_id)
    commit(db)
    background.add_task(workflow.run_workflow, coordinator, run_id, attempt_id, retry=True)
    return {"id": run_id, "status": "queued"}
