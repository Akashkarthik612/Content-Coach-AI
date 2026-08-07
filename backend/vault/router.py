from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from backend.auth.models import User
from backend.core.cache import sync_invalidate_user_analytics_cache, sync_invalidate_user_tool_cache
from backend.core.dependencies import get_current_user, get_db
from backend.ai.embeddings import embed_and_store_version
from backend.ai.style_memory import sync_check_and_refresh_style_memory
from backend.vault import service
from backend.vault.models import PostStatus
from backend.vault.schemas import (
    AnalyticsSummaryResponse,
    CalendarPostItem,
    FolderCreate,
    FolderRename,
    FolderResponse,
    PostAnalyticsResponse,
    PostAnalyticsUpdate,
    PostCreate,
    PostListResponse,
    PostMove,
    PostPin,
    PostRename,
    PostResponse,
    PostStatusUpdate,
    SearchResult,
    VersionListResponse,
    VersionRename,
    VersionResponse,
    VersionSave,
    WeeklyHistoryPoint,
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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service.delete_folder(db, user_id=user.id, folder_id=folder_id)
    # All posts + embeddings cascade-deleted by FK; invalidate AI tool cache
    background_tasks.add_task(sync_invalidate_user_tool_cache, str(user.id))


# ── Post ──────────────────────────────────────────────────────────────────────

@router.post("/folders/{folder_id}/posts", response_model=PostResponse, status_code=201)
def create_post(
    folder_id: UUID,
    data: PostCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = service.create_post(db, user_id=user.id, folder_id=folder_id, data=data)
    # A new post has no content yet, but its title changes the topic inventory cache
    background_tasks.add_task(sync_invalidate_user_tool_cache, str(user.id))
    return post


@router.get("/folders/{folder_id}/posts", response_model=list[PostListResponse])
def list_posts(
    folder_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.list_posts(db, user_id=user.id, folder_id=folder_id)


# ── Recent posts / calendar (cross-folder) — must come BEFORE /posts/{post_id} ─

@router.get("/posts/recent", response_model=list[PostListResponse])
def get_recent_posts(
    limit: int = 2,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.get_recent_posts(db, user_id=user.id, limit=limit)


@router.get("/posts/calendar", response_model=list[CalendarPostItem])
def get_calendar_posts(
    start: datetime,
    end: datetime,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.CalendarService.get_calendar_posts(db, user_id=user.id, start=start, end=end)


@router.get("/posts/weekly-history", response_model=list[WeeklyHistoryPoint])
def get_weekly_history(
    weeks: int = 12,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.CalendarService.get_weekly_history(db, user_id=user.id, weeks=weeks)


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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service.delete_post(db, user_id=user.id, post_id=post_id)
    # Invalidate tool cache so AI no longer sees the deleted post in search/style results
    background_tasks.add_task(sync_invalidate_user_tool_cache, str(user.id))


@router.patch("/posts/{post_id}/pin", response_model=PostResponse)
def pin_post(
    post_id: UUID,
    data: PostPin,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.pin_post(db, user_id=user.id, post_id=post_id, pinned=data.is_pinned)


@router.patch("/posts/{post_id}/folder", response_model=PostResponse)
def move_post(
    post_id: UUID,
    data: PostMove,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = service.move_post(db, user_id=user.id, post_id=post_id, folder_id=data.folder_id)
    background_tasks.add_task(sync_invalidate_user_tool_cache, str(user.id))
    return post


@router.patch("/posts/{post_id}/status", response_model=PostResponse)
def set_post_status(
    post_id: UUID,
    data: PostStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = service.update_post_status(db, user_id=user.id, post_id=post_id, data=data)
    # Style extraction counts both published + scheduled as "committed" content
    if data.status in (PostStatus.published, PostStatus.scheduled):
        background_tasks.add_task(sync_check_and_refresh_style_memory, str(user.id))
    return post


# ── Analytics Summary ─────────────────────────────────────────────────────────

@router.get("/analytics/summary", response_model=AnalyticsSummaryResponse)
def get_analytics_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.get_analytics_summary(db, user_id=user.id)


# ── Post Analytics ────────────────────────────────────────────────────────────

@router.patch("/posts/{post_id}/analytics", response_model=PostAnalyticsResponse)
def update_post_analytics(
    post_id: UUID,
    data: PostAnalyticsUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = service.upsert_post_analytics(
        db, post_id=post_id, user_id=user.id,
        impressions=data.impressions, reactions=data.reactions, comments=data.comments,
    )
    background_tasks.add_task(sync_invalidate_user_tool_cache, str(user.id))
    background_tasks.add_task(sync_invalidate_user_analytics_cache, str(user.id))
    return result


# ── Version ───────────────────────────────────────────────────────────────────

@router.post("/posts/{post_id}/versions", response_model=VersionResponse, status_code=201)
def save_version(
    post_id: UUID,
    data: VersionSave,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    version = service.save_version(db, user_id=user.id, post_id=post_id, data=data)

    # Vectorise only when the user explicitly marks a version as final.
    # Regular saves skip embedding — no wasted Gemini embedding tokens on
    # in-progress drafts. Only a final version is searchable by the AI.
    if data.is_final:
        background_tasks.add_task(
            embed_and_store_version,
            version_id=str(version.id),
            post_id=str(post_id),
            user_id=str(user.id),
            content=version.content,
        )
        background_tasks.add_task(sync_invalidate_user_tool_cache, str(user.id))

    # Style extraction is triggered only on publish/schedule (PATCH /posts/{id}/status),
    # not on every draft save — saving a draft doesn't change the published-post count.

    return version


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
