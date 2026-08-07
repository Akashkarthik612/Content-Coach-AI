from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from backend.core.cache import sync_invalidate_user_analytics_cache
from backend.core.config import settings
from backend.core.dependencies import get_current_user, get_db
from backend.linkedin.schemas import AuthUrlResponse, ConnectionStatusResponse, PublishResponse
from backend.linkedin.service import LinkedInConnectService

router = APIRouter(tags=["linkedin"])


@router.get("/connection-status", response_model=ConnectionStatusResponse)
def get_connection_status(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return whether the current user has a valid LinkedIn token."""
    return LinkedInConnectService.get_connection_status(db, user.id)


@router.get("/auth/url", response_model=AuthUrlResponse)
def get_auth_url(user=Depends(get_current_user)):
    """Return the LinkedIn OAuth authorization URL.

    state is set to user.id so the callback can identify the user
    without needing an X-User-Id header (browser redirect — can't set headers).
    """
    return AuthUrlResponse(auth_url=LinkedInConnectService.get_auth_url(str(user.id)))


@router.get("/auth/callback")
def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
):
    """LinkedIn redirects here after user grants (or denies) permission.

    No X-User-Id header — identity comes from the state param we set.
    On success: redirect to frontend with ?linkedin_connected=true.
    On error: redirect with ?linkedin_error=<message>.
    """
    try:
        LinkedInConnectService.handle_oauth_callback(db, code, state)
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/mywork?linkedin_connected=true",
            status_code=302,
        )
    except HTTPException as exc:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/mywork?linkedin_error=true&reason={exc.detail}",
            status_code=302,
        )


@router.post("/publish/{post_id}", response_model=PublishResponse)
def publish_post(
    post_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Publish the latest saved version of a post to LinkedIn.

    If the user hasn't connected LinkedIn (or token expired/revoked),
    returns needs_auth=True + auth_url for the frontend to redirect.
    On success: inserts PostPublishLog, updates post status to published,
    fires style_memory background check.
    """
    from backend.vault.models import PostStatus, PostVersion
    from backend.vault.schemas import PostStatusUpdate
    from backend.vault.service import update_post_status

    # Get latest version content
    latest = (
        db.query(PostVersion)
        .filter(PostVersion.post_id == post_id)
        .order_by(PostVersion.version_number.desc())
        .first()
    )
    if not latest:
        raise HTTPException(status_code=400, detail="Post has no saved versions to publish")

    result = LinkedInConnectService.publish_or_auth(
        db=db,
        user_id=user.id,
        post_id=post_id,
        version_id=latest.id,
        content=latest.content,
    )

    # If actually published (not needs_auth, not duplicate), update post status
    if result.published and not result.needs_auth and not result.duplicate:
        update_post_status(
            db, user.id, post_id, PostStatusUpdate(status=PostStatus.published)
        )
        # Mirror the style_memory trigger that vault router fires on publish
        from backend.ai.style_memory import sync_check_and_refresh_style_memory
        background_tasks.add_task(sync_check_and_refresh_style_memory, str(user.id))
        background_tasks.add_task(sync_invalidate_user_analytics_cache, str(user.id))

    return result


@router.delete("/disconnect", status_code=204)
def disconnect(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Remove the user's LinkedIn OAuth token. They'll need to reconnect to publish."""
    LinkedInConnectService.disconnect(db, user.id)
