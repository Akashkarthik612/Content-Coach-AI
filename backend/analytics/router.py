from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from backend.analytics.repository import AnalyticsRepository
from backend.analytics.schemas import (
    AnalyticsRankingsResponse,
    ExternalPostLogCreate,
    ExternalPostLogResponse,
    KPIResponse,
    LoggablePostOption,
    PeriodEnum,
)
from backend.analytics.service import AnalyticsService
from backend.auth.models import User
from backend.core.cache import sync_invalidate_user_analytics_cache
from backend.core.dependencies import get_current_user, get_db, get_db_async
from backend.vault.service import create_external_post

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

_service = AnalyticsService(AnalyticsRepository())


@router.get("/kpis", response_model=KPIResponse)
async def get_kpis(
    period: PeriodEnum = Query(...),
    db: AsyncSession = Depends(get_db_async),
    user: User = Depends(get_current_user),
):
    return await _service.get_kpis(db, user.id, period)


@router.get("/rankings", response_model=AnalyticsRankingsResponse)
async def get_rankings(
    period: PeriodEnum = Query(...),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db_async),
    user: User = Depends(get_current_user),
):
    return await _service.get_rankings_dashboard(db, user.id, period, limit)


@router.get("/loggable-posts", response_model=list[LoggablePostOption])
async def get_loggable_posts(
    db: AsyncSession = Depends(get_db_async),
    user: User = Depends(get_current_user),
):
    return await _service.get_loggable_posts(db, user.id)


@router.post("/external-posts", response_model=ExternalPostLogResponse, status_code=201)
def log_external_post(
    data: ExternalPostLogCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Sync (unlike the read endpoints above) — this is a vault-domain write
    (create_external_post uses the existing sync ORM models), not an
    analytics read."""
    post = create_external_post(db, user.id, data)
    background_tasks.add_task(sync_invalidate_user_analytics_cache, str(user.id))
    return ExternalPostLogResponse(post_id=post.id, title=post.title)
