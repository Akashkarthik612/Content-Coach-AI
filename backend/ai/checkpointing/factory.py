from contextlib import AbstractAsyncContextManager

from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres import AsyncPostgresStore

from backend.core.config import settings

# 7-day retention for the chat_sessions namespace (Step: long-term chat memory).
# default_ttl applies to every put() in every namespace unless overridden per-call
# (see SessionMemoryService — namespaces without an explicit ttl= inherit this).
_SESSION_TTL_MINUTES = 60 * 24 * 7

# Embeds only chat_sessions.title (one short string per session, never message/draft
# content) for semantic recall across sessions. Separate singleton from
# backend/ai/embeddings.py's — module-singleton-per-file is this codebase's existing
# convention, not a shared cross-module instance.
_session_title_embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    task_type="retrieval_document",
    output_dimensionality=768,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)


def create_checkpointer(database_url: str) -> AbstractAsyncContextManager[AsyncPostgresSaver]:
    """Single seam for the checkpointer backend — swap implementations here only."""
    return AsyncPostgresSaver.from_conn_string(database_url)


def create_store(database_url: str) -> AbstractAsyncContextManager[AsyncPostgresStore]:
    """Single seam for the long-term (cross-thread/cross-session) store backend.

    TTL sweeper must be started explicitly (store.start_ttl_sweeper()) after
    store.setup() — this factory only constructs the configured instance.
    """
    return AsyncPostgresStore.from_conn_string(
        database_url,
        ttl={
            "default_ttl": _SESSION_TTL_MINUTES,
            "refresh_on_read": True,
            "sweep_interval_minutes": 60,
        },
        index={
            "dims": 768,
            "embed": _session_title_embeddings,
            "fields": ["title"],
        },
    )
