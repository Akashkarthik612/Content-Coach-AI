"""Postgres checkpointer for the independent agents' thread memory.

Official langgraph-checkpoint-postgres only. The saver owns its four tables
(checkpoints, checkpoint_blobs, checkpoint_writes, checkpoint_migrations),
created and migrated by `checkpointer.setup()` — never edit them by hand.
"""

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

# Kept small: shares Supabase's session-pooler budget with the SQLAlchemy
# engine in backend/core/database.py.
POOL_MAX_SIZE = 5


def create_pool(conninfo: str) -> AsyncConnectionPool:
    return AsyncConnectionPool(
        conninfo=conninfo,
        min_size=1,
        max_size=POOL_MAX_SIZE,
        kwargs={
            "autocommit": True,  # required by AsyncPostgresSaver (setup() runs CREATE INDEX CONCURRENTLY)
            "row_factory": dict_row,  # required by AsyncPostgresSaver
            "prepare_threshold": None,  # no server-side prepared statements: safe on any Supavisor mode
        },
        check=AsyncConnectionPool.check_connection,  # drop connections the pooler closed while idle
        open=False,
    )


def create_checkpointer(pool: AsyncConnectionPool) -> AsyncPostgresSaver:
    return AsyncPostgresSaver(pool)
