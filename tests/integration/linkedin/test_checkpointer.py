"""The LinkedIn graph on the real AsyncPostgresSaver: what InMemorySaver in
the unit tests can't show — memory surviving a restart, one checkpoint row per
turn, deletes leaving nothing behind, and the retention sweep."""

from datetime import timedelta

from langchain_core.messages import HumanMessage
from sqlalchemy import func, text, update

from backend.ai.independent_agents import linkedin
from backend.ai.independent_agents.models import AgentThread
from backend.ai.independent_agents.threads import AgentThreadService
from backend.core.config import settings

CHECKPOINT_TABLES = ("checkpoints", "checkpoint_blobs", "checkpoint_writes")


def _config(thread_id) -> dict:
    return {"configurable": {"thread_id": str(thread_id)}}


async def _turn(graph, thread_id, message: str) -> dict:
    return await graph.ainvoke(
        {"messages": [HumanMessage(message)], "user_id": "u"}, _config(thread_id), durability="exit"
    )


def _rows(db, table: str, thread_id) -> int:
    return db.scalar(text(f"SELECT count(*) FROM {table} WHERE thread_id = :t"), {"t": str(thread_id)})


async def test_memory_survives_backend_restart(db, open_saver, llm):
    saver, pool = await open_saver()
    await _turn(linkedin.build_linkedin_graph(saver), "t1", "write about launches")
    await pool.close()  # the process goes away

    saver, pool = await open_saver()  # a new process, new pool, same database
    try:
        await _turn(linkedin.build_linkedin_graph(saver), "t1", "make it shorter")
    finally:
        await pool.close()

    sent = [m.content for m in llm.calls[1][1:]]  # skip the system prompt
    assert sent == ["write about launches", "post 1", "make it shorter"]


async def test_threads_are_isolated(db, saver, llm):
    graph = linkedin.build_linkedin_graph(saver)
    await _turn(graph, "a", "chat A")
    await _turn(graph, "b", "chat B")

    assert [m.content for m in llm.calls[1][1:]] == ["chat B"]


async def test_one_checkpoint_row_per_turn(db, saver, llm):
    graph = linkedin.build_linkedin_graph(saver)
    for message in ("one", "two", "three"):
        await _turn(graph, "t", message)

    assert _rows(db, "checkpoints", "t") == 3


async def test_delete_thread_leaves_no_rows(db, saver, llm):
    graph = linkedin.build_linkedin_graph(saver)
    await _turn(graph, "gone", "hello")
    await _turn(graph, "kept", "hello")

    await saver.adelete_thread("gone")

    assert all(_rows(db, table, "gone") == 0 for table in CHECKPOINT_TABLES)
    assert _rows(db, "checkpoints", "kept") == 1


async def test_purge_removes_expired_threads_and_their_checkpoints(db, make_user, saver, llm):
    me = make_user()
    graph = linkedin.build_linkedin_graph(saver)
    expired = AgentThreadService.create(db, me, "linkedin", "old")
    running = AgentThreadService.create(db, me, "linkedin", "old but mid-turn")
    active = AgentThreadService.create(db, me, "linkedin", "recent")
    for thread_id in (expired, running, active):
        await _turn(graph, thread_id, "hello")
    idle = func.now() - timedelta(days=settings.THREAD_RETENTION_DAYS, hours=1)
    db.execute(update(AgentThread).where(AgentThread.id.in_([expired, active])).values(busy_until=None))
    db.execute(update(AgentThread).where(AgentThread.id.in_([expired, running])).values(last_message_at=idle))
    db.commit()

    assert await AgentThreadService.purge_expired(saver) == 1

    db.expire_all()
    assert db.get(AgentThread, expired) is None
    assert _rows(db, "checkpoints", expired) == 0
    for kept in (running, active):
        assert db.get(AgentThread, kept) is not None
        assert _rows(db, "checkpoints", kept) == 1
