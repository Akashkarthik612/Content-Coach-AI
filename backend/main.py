# This file contains the backbne of teh application which is the API skeleton for various services.
# so completely if there is a problem in routing or data flow between various services this is the place to be checkeed.

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.vault.router import router as vault_router
from backend.ai.router import router as ai_router
from backend.ai.graph import build_assistant
from backend.ai.assistant_registry import set_assistant
from backend.ai.checkpointing.factory import create_checkpointer
from backend.linkedin.router import router as linkedin_router
from backend.profile.router import router as profile_router
from backend.core.config import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with create_checkpointer(settings.DATABASE_URL) as checkpointer:
        await checkpointer.setup()  # idempotent — creates checkpoints/checkpoint_blobs/checkpoint_writes
        app.state.assistant = build_assistant(checkpointer)
        set_assistant(app.state.assistant)  # lets tools.py's get_session_context call aget_state() without a circular import
        logger.info("LangGraph assistant compiled with AsyncPostgresSaver checkpointer")
        yield


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


@app.get("/health")
def health_check():
    return {"status": "ok"}
