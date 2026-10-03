"""API skeleton. Routers are added here as each backend module is rebuilt —
see CLAUDE.md and Day_1.md for the rebuild order."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.ai.independent_agents.checkpointer import create_checkpointer, create_pool
from backend.ai.independent_agents.linkedin import build_linkedin_graph
from backend.ai.independent_agents.router import router as independent_agents_router
from backend.ai.independent_agents.threads import AgentThreadService
from backend.auth.router import router as auth_router
from backend.core.config import settings

logger = logging.getLogger(__name__)

PURGE_INTERVAL_SECONDS = 24 * 60 * 60
PURGE_FIRST_RUN_DELAY_SECONDS = 60  # let startup finish before the first sweep


async def _purge_expired_threads_forever(checkpointer) -> None:
    """Daily retention sweep for independent-agent threads. Idempotent, so it
    is safe if more than one instance runs it."""
    await asyncio.sleep(PURGE_FIRST_RUN_DELAY_SECONDS)
    while True:
        try:
            purged = await AgentThreadService.purge_expired(checkpointer)
            if purged:
                logger.info("Purged %d expired agent threads", purged)
        except Exception:
            logger.exception("Agent thread purge failed; retrying next cycle")
        await asyncio.sleep(PURGE_INTERVAL_SECONDS)


def _check_production_config() -> None:
    """Render sets RENDER=true on every service. Failing the boot there turns a
    missing Gemini key into a failed deploy instead of a 502 on the first chat."""
    if os.getenv("RENDER") and not settings.LANGCHAIN_API_KEY_GEMINI:
        raise RuntimeError("LANGCHAIN_API_KEY_GEMINI is not set; refusing to start on Render")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _check_production_config()
    # Pool opens on startup and closes on shutdown (Render sends SIGTERM on deploy).
    async with create_pool(settings.DATABASE_URL) as pool:
        checkpointer = create_checkpointer(pool)
        await checkpointer.setup()  # official + idempotent: creates/migrates the checkpoint tables
        app.state.linkedin_graph = build_linkedin_graph(checkpointer)
        purge_task = asyncio.create_task(_purge_expired_threads_forever(checkpointer))
        try:
            yield
        finally:
            purge_task.cancel()


app = FastAPI(lifespan=lifespan)

_extra_origins = [o.strip() for o in settings.EXTRA_ALLOWED_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost",  # Docker nginx (port 80)
        "http://localhost:80",
        "https://dav1fcmwl68t0.cloudfront.net",  # deployed frontend
        *_extra_origins,
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(independent_agents_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
