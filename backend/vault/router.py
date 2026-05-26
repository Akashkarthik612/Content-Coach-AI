from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.auth.models import User
from backend.core.dependencies import get_current_user, get_db
from backend.vault import service
from backend.vault.schemas import (
    FolderCreate,
    FolderRename,
    FolderResponse,
    PostCreate,
    PostListResponse,
    PostPin,
    PostRename,
    PostResponse,
    SearchResult,
    VersionListResponse,
    VersionRename,
    VersionResponse,
    VersionSave,
)

router = APIRouter(prefix="/api/vault", tags=["vault"])


# ── Folder ────────────────────────────────────────────────────────────────────

@router.post("/folders", response_model=FolderResponse, status_code=201)
def create_folder(
    data: FolderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.create_folder(db, user_id=user.id, data=data)


@router.get("/folders", response_model=list[FolderResponse])
def list_folders(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.list_folders(db, user_id=user.id)


@router.patch("/folders/{folder_id}", response_model=FolderResponse)
def rename_folder(
    folder_id: UUID,
    data: FolderRename,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.rename_folder(db, user_id=user.id, folder_id=folder_id, data=data)


@router.delete("/folders/{folder_id}", status_code=204)
def delete_folder(
    folder_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service.delete_folder(db, user_id=user.id, folder_id=folder_id)


# ── Post ──────────────────────────────────────────────────────────────────────

@router.post("/folders/{folder_id}/posts", response_model=PostResponse, status_code=201)
def create_post(
    folder_id: UUID,
    data: PostCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.create_post(db, user_id=user.id, folder_id=folder_id, data=data)


@router.get("/folders/{folder_id}/posts", response_model=list[PostListResponse])
def list_posts(
    folder_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.list_posts(db, user_id=user.id, folder_id=folder_id)


@router.get("/posts/{post_id}", response_model=PostResponse)
def get_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.get_post(db, user_id=user.id, post_id=post_id)


@router.patch("/posts/{post_id}", response_model=PostResponse)
def rename_post(
    post_id: UUID,
    data: PostRename,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.rename_post(db, user_id=user.id, post_id=post_id, data=data)


@router.delete("/posts/{post_id}", status_code=204)
def delete_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service.delete_post(db, user_id=user.id, post_id=post_id)


@router.patch("/posts/{post_id}/pin", response_model=PostResponse)
def pin_post(
    post_id: UUID,
    data: PostPin,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.pin_post(db, user_id=user.id, post_id=post_id, pinned=data.is_pinned)


# ── Version ───────────────────────────────────────────────────────────────────

@router.post("/posts/{post_id}/versions", response_model=VersionResponse, status_code=201)
def save_version(
    post_id: UUID,
    data: VersionSave,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.save_version(db, user_id=user.id, post_id=post_id, data=data)


@router.get("/posts/{post_id}/versions", response_model=list[VersionListResponse])
def list_versions(
    post_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.list_versions(db, user_id=user.id, post_id=post_id)


@router.get("/versions/{version_id}", response_model=VersionResponse)
def get_version(
    version_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.get_version(db, user_id=user.id, version_id=version_id)


@router.patch("/versions/{version_id}", response_model=VersionResponse)
def rename_version(
    version_id: UUID,
    data: VersionRename,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.rename_version(db, user_id=user.id, version_id=version_id, data=data)


@router.delete("/versions/{version_id}", status_code=204)
def delete_version(
    version_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service.delete_version(db, user_id=user.id, version_id=version_id)


# ── Search ────────────────────────────────────────────────────────────────────

@router.get("/search", response_model=list[SearchResult])
def search(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.search_posts(db, user_id=user.id, query=q)
