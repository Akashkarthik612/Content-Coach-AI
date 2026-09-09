from psycopg_pool import AsyncConnectionPool

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


def create_pool(database_url: str) -> AsyncConnectionPool:
    """Shared connection pool — AsyncPostgresSaver.from_conn_string() opens a
    single raw psycopg connection, which isn't safe to use from more than one
    coroutine at once. A pool gives each concurrent request its own
    connection (max_size=20) instead of every request fighting over one.

    prepare_threshold=None disables psycopg's server-side prepared statements
    entirely — required against a pgbouncer transaction-mode pooler (e.g.
    Supabase's), which can route a connection to a different backend per
    transaction; a prepared statement name from one backend can then collide
    with another (psycopg.errors.DuplicatePreparedStatement). Note 0 is NOT
    "disabled" — in psycopg3 it means "prepare on the very first execution,"
    the opposite of what's needed here.
    """
    return AsyncConnectionPool(
        conninfo=database_url,
        max_size=20,
        kwargs={"autocommit": True, "prepare_threshold": None},
        open=False,
    )


def create_checkpointer(pool: AsyncConnectionPool) -> AsyncPostgresSaver:
    """Single seam for the checkpointer backend — swap implementations here only."""
    return AsyncPostgresSaver(pool)


def create_store(pool: AsyncConnectionPool) -> AsyncPostgresStore:
    """Single seam for the long-term (cross-thread/cross-session) store backend.

    TTL sweeper must be started explicitly (store.start_ttl_sweeper()) after
    store.setup() — this factory only constructs the configured instance.
    """
    return AsyncPostgresStore(
        pool,
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
