"""Durable, permission-checked Google document creation and recovery."""

import asyncio
import hashlib
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from backend.agent_tools.models import AgentDocument, GoogleDocsConnection
from backend.agent_tools.providers import GoogleDocuments, ToolServiceError, access_token
from backend.agent_tools.rendering import render_report
from backend.ai.tools.sources import sources_allowed
from backend.core.database import SessionLocal
from backend.knowledge.credentials import TokenCipher
from backend.workspaces.service import fail, member


def document_json(row):
    return {
        "id": str(row.id),
        "title": row.title,
        "status": row.status,
        "url": f"https://docs.google.com/document/d/{row.google_document_id}/edit"
        if row.status == "ready" and row.google_document_id
        else None,
        "error_code": row.error_code,
        "created_by": str(row.created_by),
        "message_id": str(row.message_id) if row.message_id else None,
        "run_id": str(row.run_id) if row.run_id else None,
        "revision": int(row.revision),
        "workflow_role": row.workflow_role,
        "sources": row.sources,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


async def database(fn, *args):
    def work():
        with SessionLocal() as db:
            result = fn(db, *args)
            db.commit()
            return result

    return await asyncio.to_thread(work)


def _authorized(db, row):
    from backend.agents.models import AgentConfiguration
    from backend.workspaces.models import AgentVersion
    from backend.workspaces.runtime import configuration_context

    member(db, row.workspace_id, row.created_by)
    version = db.get(AgentVersion, row.agent_version_id)
    agent = db.get(AgentConfiguration, version.agent_id) if version else None
    if not agent or "create_google_doc" not in agent.enabled_tools:
        raise ToolServiceError("document_tool_not_enabled")
    _, _, enabled, allowed, _ = configuration_context(
        db, row.workspace_id, row.created_by, row.agent_version_id
    )
    if "create_google_doc" not in enabled or not sources_allowed(row.sources, allowed, enabled):
        raise ToolServiceError("document_sources_no_longer_permitted")


def _prepare(db, ctx, payload, sources):
    if not ctx.knowledge_scope or not ctx.execution_id or not ctx.agent_version_id:
        raise ToolServiceError("document_execution_required")
    workspace_id = ctx.knowledge_scope.workspace_id
    member(db, workspace_id, ctx.user_id)
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    request_key = hashlib.sha256(
        (ctx.execution_id + ":" + str(ctx.agent_version_id) + ":" + canonical).encode()
    ).hexdigest()
    db.execute(
        insert(AgentDocument)
        .values(
            id=uuid4(),
            workspace_id=workspace_id,
            created_by=ctx.user_id,
            agent_version_id=ctx.agent_version_id,
            message_id=ctx.message_id,
            run_id=ctx.run_id,
            revision=str(ctx.revision),
            workflow_role=ctx.workflow_role,
            request_key=request_key,
            title=payload["title"],
            payload=payload,
            sources=sources,
            status="draft",
        )
        .on_conflict_do_nothing(constraint="uq_agent_document_request")
    )
    row = db.scalar(
        select(AgentDocument).where(
            AgentDocument.workspace_id == workspace_id,
            AgentDocument.created_by == ctx.user_id,
            AgentDocument.request_key == request_key,
        )
    )
    return row.id


def _claim(db, report_id, user_id):
    row = db.scalar(select(AgentDocument).where(AgentDocument.id == report_id).with_for_update())
    if not row or row.created_by != user_id:
        fail(404, "document_not_found")
    _authorized(db, row)
    if row.status == "ready":
        return document_json(row), None
    if row.lease_until and row.lease_until > datetime.now(UTC):
        raise ToolServiceError("document_busy")
    prior = row.status
    row.lease_id, row.lease_until = uuid4(), datetime.now(UTC) + timedelta(seconds=90)
    row.status, row.error_code = "working", None
    row.updated_at = datetime.now(UTC)
    return {
        **document_json(row),
        "payload": row.payload,
        "prior_status": prior,
        "google_document_id": row.google_document_id,
        "google_account_id": row.google_account_id,
    }, row.lease_id


def _update(db, report_id, lease_id, values):
    row = db.scalar(select(AgentDocument).where(AgentDocument.id == report_id).with_for_update())
    if not row or row.lease_id != lease_id:
        raise ToolServiceError("document_attempt_expired")
    for key, value in values.items():
        setattr(row, key, value)
    row.updated_at = datetime.now(UTC)
    return document_json(row)


def _connection(db, user_id):
    connection = db.get(GoogleDocsConnection, user_id)
    if not connection or connection.status != "connected":
        raise ToolServiceError("google_docs_not_connected")
    return TokenCipher().decrypt(connection.refresh_token_enc), connection.email


def _recheck(db, report_id):
    row = db.get(AgentDocument, report_id)
    if row is None:
        raise ToolServiceError("document_not_found")
    _authorized(db, row)
    connection = db.get(GoogleDocsConnection, row.created_by)
    if not connection or connection.status != "connected":
        raise ToolServiceError("google_docs_not_connected")
    if row.google_account_id and row.google_account_id != connection.email:
        raise ToolServiceError("google_docs_account_changed")


def _mark_reconnect(db, user_id, refresh):
    connection = db.get(GoogleDocsConnection, user_id)
    if connection and refresh and TokenCipher().decrypt(connection.refresh_token_enc) == refresh:
        connection.status = "needs_reauth"


async def generate_document(report_id, user_id):
    value, lease = await database(_claim, report_id, user_id)
    if lease is None:
        return value
    document_id = value.get("google_document_id")
    creation_pending = False
    refresh = None
    try:
        refresh, account = await database(_connection, user_id)
        if value.get("google_account_id") and value["google_account_id"] != account:
            raise ToolServiceError("google_docs_account_changed")
        client = GoogleDocuments(await access_token(refresh))
        await database(_recheck, report_id)
        if not document_id:
            # Recovery always checks the app-owned marker before creating a file.
            document_id = await client.find(report_id)
            if not document_id and value.get("google_account_id"):
                raise ToolServiceError("google_creation_uncertain")
            if not document_id:
                await database(
                    _update, report_id, lease, {"status": "creating", "google_account_id": account}
                )
                creation_pending = True
                await database(_recheck, report_id)
                document_id = await client.create(report_id, value["title"])
            await database(
                _update,
                report_id,
                lease,
                {"google_document_id": document_id, "google_account_id": account, "status": "formatting"},
            )
            creation_pending = False
        text, requests = render_report(value["payload"], value["sources"])
        await database(_recheck, report_id)
        await client.populate(document_id, text, requests)
        return await database(
            _update, report_id, lease, {"status": "ready", "error_code": None, "lease_until": None}
        )
    except (Exception, asyncio.CancelledError) as exc:
        code = exc.code if isinstance(exc, ToolServiceError) else "google_docs_unavailable"
        if code == "google_docs_reconnect_required":
            await database(_mark_reconnect, user_id, refresh)
        uncertain = code == "google_creation_uncertain" or (
            creation_pending and code == "google_docs_unavailable"
        )
        if uncertain:
            code = "google_creation_uncertain"
        # A lost create response must never cause an automatic duplicate on retry.
        changes = {
            "status": "creation_uncertain" if uncertain else "failed",
            "error_code": code,
            "lease_until": None,
        }
        if creation_pending and not uncertain and not document_id:
            changes["google_account_id"] = None
        await asyncio.shield(database(_update, report_id, lease, changes))
        if isinstance(exc, asyncio.CancelledError):
            raise
        raise ToolServiceError(code) from exc


async def create_document(ctx, payload):
    used = {key for block in payload["blocks"] for key in block.get("source_ids", [])}
    if not used <= ctx.sources.keys():
        raise ToolServiceError("unknown_source_reference")
    sources = [ctx.sources[key] for key in ctx.sources if key in used]
    if ctx.preview:
        return {
            "preview_only": True,
            "title": payload["title"],
            "message": "Report content validated. Preview does not create Google documents.",
        }
    report_id = await database(_prepare, ctx, payload, sources)
    try:
        result = await generate_document(report_id, ctx.user_id)
    except ToolServiceError:
        row = await database(lambda db, rid: document_json(db.get(AgentDocument, rid)), report_id)
        ctx.artifacts.append(row)
        raise
    ctx.artifacts.append(result)
    return result


def list_documents(db, workspace_id, message_ids=None, run_id=None):
    query = select(AgentDocument).where(AgentDocument.workspace_id == workspace_id)
    if message_ids is not None:
        if not message_ids:
            return []
        query = query.where(AgentDocument.message_id.in_(message_ids))
    if run_id is not None:
        query = query.where(AgentDocument.run_id == run_id)
    query = query.order_by(AgentDocument.created_at.desc())
    if message_ids is None and run_id is None:
        query = query.limit(100)
    return [document_json(row) for row in db.scalars(query)]
