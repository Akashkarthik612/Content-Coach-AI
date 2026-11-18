"""Per-user Google Docs OAuth and membership-scoped report results."""

import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.agent_tools.documents import document_json, generate_document, list_documents
from backend.agent_tools.models import AgentDocument, DocsOAuthAttempt, GoogleDocsConnection
from backend.agent_tools.providers import DOCS_SCOPE, GoogleDocuments, ToolServiceError
from backend.ai.tools.registry import TOOL_CATALOG
from backend.auth.models import User
from backend.auth.services import get_current_user
from backend.core.config import settings
from backend.core.database import get_db
from backend.knowledge.connectors.google_oauth import GoogleOAuth
from backend.knowledge.credentials import TokenCipher, state_fernet
from backend.workspaces.service import fail, member

router = APIRouter(prefix="/api/workspaces", tags=["agent-tools"])


def require_config():
    if not GoogleOAuth.is_configured():
        fail(503, "google_docs_not_configured")


def docs_status(db, user_id):
    row = db.get(GoogleDocsConnection, user_id)
    return {
        "configured": GoogleOAuth.is_configured(),
        "connected": bool(row and row.status == "connected"),
        "email": row.email if row else None,
        "status": row.status if row else "not_connected",
    }


@router.get("/{workspace_id}/tools")
def catalog(workspace_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    member(db, workspace_id, user.id)
    status = docs_status(db, user.id)
    return {
        "tools": [
            {
                **tool,
                "configured": bool(settings.TAVILY_API_KEY)
                if tool["connection"] == "tavily"
                else status["configured"]
                if tool["connection"] == "google_docs"
                else settings.KNOWLEDGE_TOOLS_ENABLED,
            }
            for tool in TOOL_CATALOG
        ],
        "google_docs": status,
    }


@router.get("/{workspace_id}/google-docs/connect")
def connect(workspace_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    member(db, workspace_id, user.id)
    require_config()
    nonce = uuid4()
    db.add(
        DocsOAuthAttempt(
            id=nonce,
            user_id=user.id,
            workspace_id=workspace_id,
            expires_at=datetime.now(UTC) + timedelta(minutes=10),
        )
    )
    db.commit()
    sealed = (
        state_fernet()
        .encrypt(
            json.dumps(
                {
                    "purpose": "google-docs",
                    "u": str(user.id),
                    "workspace": str(workspace_id),
                    "nonce": str(nonce),
                }
            ).encode()
        )
        .decode()
    )
    return {"auth_url": GoogleOAuth.auth_url("docs." + sealed, scope=DOCS_SCOPE)}


class CompleteDocs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    state: str = Field(max_length=3000)
    code: str | None = Field(default=None, max_length=4000)
    error: str | None = Field(default=None, max_length=100)


@router.post("/{workspace_id}/google-docs/complete")
async def complete(
    workspace_id: UUID,
    body: CompleteDocs,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member(db, workspace_id, user.id)
    require_config()
    try:
        if not body.state.startswith("docs."):
            raise ValueError("wrong flow")
        payload = json.loads(state_fernet().decrypt(body.state[5:].encode(), ttl=600))
        if (
            payload["purpose"] != "google-docs"
            or UUID(payload["u"]) != user.id
            or UUID(payload["workspace"]) != workspace_id
        ):
            raise ValueError("state mismatch")
        nonce = UUID(payload["nonce"])
    except (InvalidToken, ValueError, KeyError, TypeError):
        fail(400, "invalid_state")
    attempt = db.scalar(select(DocsOAuthAttempt).where(DocsOAuthAttempt.id == nonce).with_for_update())
    if (
        not attempt
        or attempt.user_id != user.id
        or attempt.workspace_id != workspace_id
        or attempt.used_at
        or attempt.expires_at < datetime.now(UTC)
    ):
        fail(400, "invalid_state")
    attempt.used_at = datetime.now(UTC)
    db.commit()  # consume once before contacting the provider
    if body.error:
        fail(400, "consent_denied")
    if not body.code:
        fail(400, "missing_code")
    try:
        grant = await GoogleOAuth().exchange(body.code)
        if DOCS_SCOPE not in grant.scope.split():
            fail(400, "docs_scope_not_granted")
        if not grant.refresh_token:
            fail(400, "no_refresh_token")
        account = await GoogleDocuments(grant.access_token).account()
        email = account.get("emailAddress", "").lower()
        if not email:
            raise ToolServiceError("google_docs_unavailable")
    except Exception as exc:
        from fastapi import HTTPException

        if isinstance(exc, HTTPException):
            raise
        fail(502, exc.code if isinstance(exc, ToolServiceError) else "google_docs_connection_failed")
    # Membership is checked again after OAuth network calls.
    member(db, workspace_id, user.id)
    row = db.get(GoogleDocsConnection, user.id)
    if row is None:
        row = GoogleDocsConnection(user_id=user.id)
        db.add(row)
    row.refresh_token_enc, row.scope, row.email = (
        TokenCipher().encrypt(grant.refresh_token),
        grant.scope,
        email,
    )
    row.status, row.updated_at = "connected", datetime.now(UTC)
    db.commit()
    return {"workspace_id": str(workspace_id), **docs_status(db, user.id)}


@router.delete("/{workspace_id}/google-docs/connection")
def disconnect(workspace_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    member(db, workspace_id, user.id)
    row = db.get(GoogleDocsConnection, user.id)
    if row:
        db.delete(row)
        db.commit()
    # Do not revoke the entire Google OAuth grant: it can also power Drive retrieval.
    return {"connected": False}


@router.get("/{workspace_id}/documents/generated")
def documents(workspace_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    member(db, workspace_id, user.id)
    return list_documents(db, workspace_id)


async def retry_job(report_id, user_id):
    try:
        await generate_document(report_id, user_id)
    except ToolServiceError:
        pass  # persisted status is returned by the existing polling endpoints


@router.post("/{workspace_id}/documents/generated/{report_id}/retry", status_code=202)
def retry(
    workspace_id: UUID,
    report_id: UUID,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from backend.agent_tools.documents import _authorized

    member(db, workspace_id, user.id)
    row = db.get(AgentDocument, report_id)
    if not row or row.workspace_id != workspace_id:
        fail(404, "document_not_found")
    if row.created_by != user.id:
        fail(403, "document_owner_required")
    try:
        _authorized(db, row)
    except ToolServiceError as exc:
        fail(409, exc.code)
    if row.lease_until and row.lease_until > datetime.now(UTC):
        fail(409, "document_busy")
    if row.status != "ready":
        background.add_task(retry_job, row.id, user.id)
    return document_json(row)
