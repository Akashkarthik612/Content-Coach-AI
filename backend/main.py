"""API skeleton. Routers are added here as each backend module is rebuilt —
see CLAUDE.md and Day_1.md for the rebuild order."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.ai.independent_agents.checkpointer import create_checkpointer, create_pool
from backend.ai.independent_agents.limits import MAX_TOOL_CALLS, MAX_TOOL_ROUNDS, TOOL_TIMEOUT_S
from backend.ai.independent_agents.linkedin import build_linkedin_graph
from backend.ai.independent_agents.router import router as independent_agents_router
from backend.ai.independent_agents.threads import AgentThreadService
from backend.ai.tools.access import KnowledgeAccess
from backend.ai.tools.tool_loop import ToolCallingRunner
from backend.auth.router import router as auth_router
from backend.core.config import settings
from backend.core.database import SessionLocal
from backend.knowledge.credentials import TokenCipher
from backend.knowledge.embedder import GeminiEmbedder
from backend.knowledge.repository import KnowledgeRepository
from backend.knowledge.retrieval import KnowledgeRetrievalService
from backend.knowledge.router import router as knowledge_router
from backend.knowledge.search_mode import detect_search_mode
from backend.knowledge.sync_poller import PollerSettings, start_sync_poller, stop_sync_poller

logger = logging.getLogger(__name__)


def _configure_logging() -> None:
    """Uvicorn only sets up its own loggers, so without this every backend.*
    INFO line (sync runs, poller ticks, per-file chunk counts) is dropped and
    only warnings reach Render's log stream. Scoped to `backend` so library
    INFO chatter (httpx logs every request) stays out."""
    backend_logger = logging.getLogger("backend")
    if not backend_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        backend_logger.addHandler(handler)
    backend_logger.setLevel(settings.LOG_LEVEL.upper())


_configure_logging()

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


# Without these every request fails, and the browser can't even read the
# error: a crash response skips the CORS middleware. The Google/token
# settings make "Connect Drive" and every sync fail instead.
_REQUIRED_ON_RENDER = (
    "LANGCHAIN_API_KEY_GEMINI",
    "SUPABASE_URL",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_DRIVE_REDIRECT_URI",
    "KNOWLEDGE_TOKEN_KEY",
)


def _check_production_config() -> None:
    """Render sets RENDER=true on every service. Failing the boot there turns a
    missing setting into a failed deploy instead of broken requests."""
    if not os.getenv("RENDER"):
        return
    missing = [name for name in _REQUIRED_ON_RENDER if not getattr(settings, name)]
    if missing:
        raise RuntimeError(f"{', '.join(missing)} not set; refusing to start on Render")
    if settings.GOOGLE_BASE_URL:
        # Would send real users' Google tokens to a test fake.
        raise RuntimeError("GOOGLE_BASE_URL is test-only; refusing to start on Render with it set")
    try:
        TokenCipher()  # a malformed key would only surface at the first Drive connect
    except ValueError as exc:
        raise RuntimeError("KNOWLEDGE_TOKEN_KEY is not a valid Fernet key; refusing to start on Render") from exc


def build_knowledge_access() -> KnowledgeAccess | None:
    """The agents' knowledge tools, or None when KNOWLEDGE_TOOLS_ENABLED is
    off (then every agent makes one structured call, as before Day 7)."""
    logger.info("knowledge_tools_enabled=%s", settings.KNOWLEDGE_TOOLS_ENABLED)
    if not settings.KNOWLEDGE_TOOLS_ENABLED:
        return None
    t = settings.KNOWLEDGE_QUERY_EMBED_TIMEOUT_S
    query_embedder = GeminiEmbedder(
        attempts=settings.KNOWLEDGE_QUERY_EMBED_ATTEMPTS,
        timeout=httpx.Timeout(connect=min(t, 10.0), read=t, write=t, pool=min(t, 10.0)),
    )
    return KnowledgeAccess(
        service=KnowledgeRetrievalService(
            KnowledgeRepository, query_embedder, SessionLocal, statement_timeout_s=TOOL_TIMEOUT_S
        ),
        runner=ToolCallingRunner(
            max_rounds=MAX_TOOL_ROUNDS, max_calls=MAX_TOOL_CALLS, tool_timeout_s=TOOL_TIMEOUT_S
        ),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _check_production_config()
    # Read the pgvector version once and log which filtered-search mode is active.
    with SessionLocal() as db:
        await asyncio.to_thread(detect_search_mode, db)
    # Pool opens on startup and closes on shutdown (Render sends SIGTERM on deploy).
    async with create_pool(settings.DATABASE_URL) as pool:
        checkpointer = create_checkpointer(pool)
        await checkpointer.setup()  # official + idempotent: creates/migrates the checkpoint tables
        app.state.knowledge = build_knowledge_access()
        app.state.linkedin_graph = build_linkedin_graph(checkpointer, app.state.knowledge)
        purge_task = asyncio.create_task(_purge_expired_threads_forever(checkpointer))
        # Every 5 min, sync the knowledge sources that are due (off in tests/CI).
        sync_poller = start_sync_poller(PollerSettings.from_settings(settings))
        try:
            yield
        finally:
            purge_task.cancel()
            await stop_sync_poller(sync_poller)


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
app.include_router(knowledge_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
