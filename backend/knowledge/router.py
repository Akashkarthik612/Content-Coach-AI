"""Knowledge-source endpoints (/api/knowledge). HTTP only: every route
delegates to the repository, connectors or SyncService.

Connecting Drive is two calls, both with the user's JWT:
  GET  /sources/gdrive/connect   -> Google consent URL with a sealed state
  POST /sources/gdrive/complete  -> {code, state} from the frontend callback page
The second call only accepts a state sealed for the same user, so a consent
link can't attach someone else's Drive to the sender's account.

A foreign source id is always 404, never 403, so ids don't leak.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import UUID

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, StringConstraints, model_validator
from sqlalchemy.orm import Session

from backend.auth.models import User
from backend.auth.services import get_current_user
from backend.core.database import get_db
from backend.knowledge.connectors.base import AuthRevokedError, TransientConnectorError
from backend.knowledge.connectors.factory import ConnectorFactory
from backend.knowledge.connectors.gdrive import (
    DriveClient,
    GDriveConnector,
    StaticTokenProvider,
    drive_account,
)
from backend.knowledge.connectors.google_oauth import (
    GoogleOAuth,
    InvalidStateError,
    OAuthExchangeError,
    sign_state,
    verify_state,
)
from backend.knowledge.credentials import CredentialStore, MissingTokenKeyError
from backend.knowledge.errors import SourceNotFoundError
from backend.knowledge.records import DocumentRecord, SourceRecord
from backend.knowledge.repository import KnowledgeRepository as Repo
from backend.knowledge.sync import run_sync_in_background

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

MAX_SELECTED = 200
# Drive ids are URL-safe base64-ish. Anything else is rejected before it can
# reach a Drive query string ("'<id>' in parents").
DriveId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,200}$")]


# ── schemas ───────────────────────────────────────────────────────────────────


class SourceOut(BaseModel):
    id: UUID
    provider: str
    display_name: str
    status: str
    config: dict[str, Any]
    last_success_at: datetime | None
    last_run_at: datetime | None
    last_error: str | None
    needs_reconnect: bool
    syncing: bool  # a sync run holds the source right now ("Sync now" or the poller)

    @classmethod
    def of(cls, s: SourceRecord) -> "SourceOut":
        return cls(
            id=s.id,
            provider=s.provider,
            display_name=s.display_name,
            status=s.status,
            config=s.config,
            last_success_at=s.last_success_at,
            last_run_at=s.last_run_at,
            last_error=s.last_error,
            needs_reconnect=s.status == "needs_reauth",
            syncing=s.sync_lease_until is not None and s.sync_lease_until > datetime.now(timezone.utc),
        )


class DocumentOut(BaseModel):
    id: UUID
    source_id: UUID
    title: str
    mime_type: str
    source_url: str | None
    chunk_count: int
    sync_status: str
    last_error: str | None
    updated_at: datetime

    @classmethod
    def of(cls, d: DocumentRecord) -> "DocumentOut":
        return cls(
            id=d.id,
            source_id=d.source_id,
            title=d.title,
            mime_type=d.mime_type,
            source_url=d.source_url,
            chunk_count=d.chunk_count,
            sync_status=d.sync_status,
            last_error=d.last_error,
            updated_at=d.updated_at,
        )


class CompleteIn(BaseModel):
    state: str = Field(max_length=2000)
    code: str | None = Field(default=None, max_length=2000)
    error: str | None = Field(default=None, max_length=200)  # Google's ?error=, e.g. access_denied


class SelectionIn(BaseModel):
    folder_ids: list[DriveId] = Field(default_factory=list)
    file_ids: list[DriveId] = Field(default_factory=list)

    @model_validator(mode="after")
    def _bounded(self) -> "SelectionIn":
        if len(self.folder_ids) + len(self.file_ids) > MAX_SELECTED:
            raise ValueError(f"select at most {MAX_SELECTED} folders and files")
        return self


# ── helpers ───────────────────────────────────────────────────────────────────


def _fail(code: int, reason: str) -> HTTPException:
    return HTTPException(status_code=code, detail={"reason": reason})


async def _own_source(db: Session, user: User, source_id: UUID) -> SourceRecord:
    source = await asyncio.to_thread(Repo.get_source, db, user.id, source_id)
    if source is None:
        raise _fail(status.HTTP_404_NOT_FOUND, "source_not_found")
    return source


def _require_oauth() -> None:
    if not GoogleOAuth.is_configured():
        raise _fail(status.HTTP_503_SERVICE_UNAVAILABLE, "drive_not_configured")


# ── connect ───────────────────────────────────────────────────────────────────


@router.get("/sources/gdrive/connect")
async def connect_gdrive(user: User = Depends(get_current_user)) -> dict[str, str]:
    _require_oauth()
    return {"auth_url": GoogleOAuth.auth_url(sign_state(user.id))}


@router.post("/sources/gdrive/complete", response_model=SourceOut)
async def complete_gdrive(
    body: CompleteIn,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SourceOut:
    _require_oauth()
    try:
        state_user = verify_state(body.state)
    except InvalidStateError:
        raise _fail(status.HTTP_400_BAD_REQUEST, "invalid_state") from None
    if state_user != user.id:
        # Someone else's consent link: never attach this Drive to their account.
        logger.warning("knowledge gdrive complete: state user mismatch user_id=%s", user.id)
        raise _fail(status.HTTP_400_BAD_REQUEST, "invalid_state")
    if body.error:
        raise _fail(
            status.HTTP_400_BAD_REQUEST, "consent_denied" if body.error == "access_denied" else "oauth_error"
        )
    if not body.code:
        raise _fail(status.HTTP_400_BAD_REQUEST, "missing_code")

    oauth = GoogleOAuth()
    try:
        grant = await oauth.exchange(body.code)
        if not grant.has_drive_scope:
            await oauth.revoke(grant.access_token)
            raise _fail(status.HTTP_400_BAD_REQUEST, "scope_not_granted")
        if not grant.refresh_token:
            raise _fail(status.HTTP_400_BAD_REQUEST, "no_refresh_token")
        account = await drive_account(DriveClient(StaticTokenProvider(grant.access_token)))
    except OAuthExchangeError:
        raise _fail(status.HTTP_400_BAD_REQUEST, "exchange_failed") from None
    except (TransientConnectorError, AuthRevokedError):
        raise _fail(status.HTTP_502_BAD_GATEWAY, "google_unavailable") from None

    # Same Google account again -> same source; the tokens are replaced.
    source = await asyncio.to_thread(
        Repo.create_source, db, user.id, "gdrive", account["permission_id"], account["email"], {}
    )
    await CredentialStore(Repo).save(
        db, user.id, source.id, grant.refresh_token, grant.access_token, grant.expires_at, grant.scope
    )
    logger.info("knowledge gdrive connected user_id=%s source_id=%s", user.id, source.id)
    if source.config.get("folder_ids") or source.config.get("file_ids"):
        # A reconnect (same Google account, folders already picked): resume now
        # instead of waiting up to 5 minutes for the poller.
        background.add_task(run_sync_in_background, user.id, source.id)
    return SourceOut.of(await _own_source(db, user, source.id))


# ── sources ───────────────────────────────────────────────────────────────────


@router.get("/sources", response_model=list[SourceOut])
async def list_sources(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[SourceOut]:
    return [SourceOut.of(s) for s in await asyncio.to_thread(Repo.list_sources, db, user.id)]


@router.get("/documents", response_model=list[DocumentOut])
async def list_documents(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[DocumentOut]:
    return [DocumentOut.of(d) for d in await asyncio.to_thread(Repo.list_documents, db, user.id)]


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    """Removes one document and its vectors, and keeps later syncs from
    re-adding it. The file in Drive is not touched."""
    if not await asyncio.to_thread(Repo.exclude_document, db, user.id, document_id):
        raise _fail(status.HTTP_404_NOT_FOUND, "document_not_found")
    logger.info("knowledge document deleted user_id=%s document_id=%s", user.id, document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sources/{source_id}/folders")
async def browse_folders(
    source_id: UUID,
    parent_id: Annotated[str, Query(pattern=r"^[A-Za-z0-9_-]{1,200}$")] = "root",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    source = await _own_source(db, user, source_id)
    if source.provider != "gdrive":
        raise _fail(status.HTTP_400_BAD_REQUEST, "not_browsable")
    connector = ConnectorFactory.create(source, db)
    assert isinstance(connector, GDriveConnector)
    try:
        items = await connector.browse(parent_id)
    except AuthRevokedError:
        raise _fail(status.HTTP_409_CONFLICT, "auth_revoked") from None
    except TransientConnectorError:
        raise _fail(status.HTTP_502_BAD_GATEWAY, "google_unavailable") from None
    return {"parent_id": parent_id, "items": items}


@router.put("/sources/{source_id}/selection", response_model=SourceOut)
async def set_selection(
    source_id: UUID, body: SelectionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> SourceOut:
    source = await _own_source(db, user, source_id)
    config = {
        "folder_ids": list(dict.fromkeys(body.folder_ids)),
        "file_ids": list(dict.fromkeys(body.file_ids)),
        # Documents the user deleted stay deleted across selection changes.
        **({"excluded_ids": source.config["excluded_ids"]} if source.config.get("excluded_ids") else {}),
    }
    try:
        # Also clears the cursor: the next sync lists the new selection and GCs the rest.
        updated = await asyncio.to_thread(
            Repo.update_source_config, db, user.id, source_id, source.display_name, config
        )
    except SourceNotFoundError:
        raise _fail(status.HTTP_404_NOT_FOUND, "source_not_found") from None
    return SourceOut.of(updated)


@router.post("/sources/{source_id}/sync", status_code=status.HTTP_202_ACCEPTED)
async def sync_now(
    source_id: UUID,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    await _own_source(db, user, source_id)
    # A run already in progress makes this one a no-op (the sync lease).
    background.add_task(run_sync_in_background, user.id, source_id)
    return {"status": "started"}


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(
    source_id: UUID,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    await _own_source(db, user, source_id)
    creds = None
    try:
        creds = await CredentialStore(Repo).load(db, user.id, source_id)
    except (InvalidToken, MissingTokenKeyError):  # a key rotation must not block deleting
        logger.warning("knowledge delete: could not read credentials source_id=%s", source_id)
    # Cascades documents, chunks and credentials.
    if not await asyncio.to_thread(Repo.delete_source, db, user.id, source_id):
        raise _fail(status.HTTP_404_NOT_FOUND, "source_not_found")
    if creds is not None:
        background.add_task(GoogleOAuth().revoke, creds.refresh_token)  # best effort
    return Response(status_code=status.HTTP_204_NO_CONTENT)
