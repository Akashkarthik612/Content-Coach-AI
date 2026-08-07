# This file contains the backbne of teh application which is the API skeleton for various services.
# so completely if there is a problem in routing or data flow between various services this is the place to be checkeed.

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.analytics.router import router as analytics_router
from backend.vault.router import router as vault_router
from backend.ai.router import router as ai_router
from backend.ai.graph import build_assistant
from backend.ai.assistant_registry import set_assistant
from backend.ai.checkpointing.factory import create_pool, create_checkpointer, create_store
from backend.linkedin.router import router as linkedin_router
from backend.profile.router import router as profile_router
from backend.core.config import settings
from backend.core.database import SessionLocal
from backend.scheduler.service import SchedulerService

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = create_pool(settings.DATABASE_URL)
    async with pool:
        checkpointer = create_checkpointer(pool)
        store = create_store(pool)
        await checkpointer.setup()  # idempotent — creates checkpoints/checkpoint_blobs/checkpoint_writes
        await store.setup()  # idempotent — creates store/store_migrations + vector tables (chat_sessions.title index)
        await store.start_ttl_sweeper()  # sweeps expired chat_sessions rows (7-day TTL) every 60 min

        app.state.assistant = build_assistant(checkpointer, store)
        app.state.store = store
        set_assistant(app.state.assistant)  # lets tools.py's get_session_context call aget_state() without a circular import
        logger.info("LangGraph assistant compiled with AsyncPostgresSaver checkpointer + AsyncPostgresStore (pooled, max_size=20)")

        if settings.SCHEDULER_ENABLED:
            app.state.scheduler = SchedulerService.start(SessionLocal)

        try:
            yield
        finally:
            if settings.SCHEDULER_ENABLED:
                SchedulerService.stop(app.state.scheduler)
            await store.stop_ttl_sweeper()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost",        # Docker nginx (port 80)
        "http://localhost:80",
        "https://dav1fcmwl68t0.cloudfront.net",   # deployed frontend
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vault_router)
app.include_router(ai_router)
app.include_router(linkedin_router, prefix="/api/linkedin")
app.include_router(profile_router)
app.include_router(analytics_router)

if settings.AUTH_PROVIDER == "local":
    # Dev-only password auth (bcrypt + X-User-Id) — see backend/auth_local/. Never
    # mounted unless AUTH_PROVIDER=local is explicitly set (default is "supabase").
    from backend.auth_local.router import router as local_auth_router

    app.include_router(local_auth_router)
    logger.warning("AUTH_PROVIDER=local — mounting dev-only password auth endpoints")


@app.get("/health")
def health_check():
    return {"status": "ok"}
