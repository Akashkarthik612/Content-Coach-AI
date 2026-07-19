from contextlib import AbstractAsyncContextManager

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver


def create_checkpointer(database_url: str) -> AbstractAsyncContextManager[AsyncPostgresSaver]:
    """Single seam for the checkpointer backend — swap implementations here only."""
    return AsyncPostgresSaver.from_conn_string(database_url)
