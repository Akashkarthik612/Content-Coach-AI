"""LinkedIn agent thread memory — graph + router, no DB and no Gemini.

The graph runs on LangGraph's official InMemorySaver; the LLM is a fake that
records what it was sent; AgentThreadService is replaced by an in-memory
registry with the same contract (tests/fakes.py). The real SQL and the
Postgres checkpointer are covered in tests/integration/.
"""

import uuid

import httpx
import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver

from backend.ai.independent_agents import linkedin
from backend.ai.independent_agents import router as router_module
from backend.auth.services import get_current_user
from backend.core.config import settings
from backend.core.database import get_db
from backend.main import app
from tests.fakes import FakeLLM, FakeThreads


class FakeUser:
    def __init__(self):
        self.id = uuid.uuid4()


@pytest.fixture
def llm(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(linkedin, "_structured_llm", lambda: fake)
    return fake


@pytest.fixture
def client(llm, monkeypatch):
    FakeThreads.reset()
    monkeypatch.setattr(router_module, "AgentThreadService", FakeThreads)
    user = FakeUser()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: None
    # No `with TestClient(...)`: lifespan (real Postgres pool) must not run.
    app.state.linkedin_graph = linkedin.build_linkedin_graph(InMemorySaver())
    test_client = TestClient(app)
    test_client.user = user
    yield test_client
    app.dependency_overrides.clear()


def _send(client, message, thread_id=None):
    body = {"message": message}
    if thread_id:
        body["thread_id"] = str(thread_id)
    return client.post("/api/independent-agents/linkedin", json=body)


# ── Graph ─────────────────────────────────────────────────────────────────────


async def test_second_turn_sees_first_turn(llm):
    graph = linkedin.build_linkedin_graph(InMemorySaver())
    config = {"configurable": {"thread_id": "t1"}}
    await graph.ainvoke(
        {"messages": [HumanMessage("write about X")], "user_id": "u"}, config, durability="exit"
    )
    await graph.ainvoke(
        {"messages": [HumanMessage("make it shorter")], "user_id": "u"}, config, durability="exit"
    )

    sent = [m.content for m in llm.calls[1][1:]]  # skip the system prompt
    assert sent == ["write about X", "post 1", "make it shorter"]


async def test_new_thread_starts_empty(llm):
    graph = linkedin.build_linkedin_graph(InMemorySaver())
    await graph.ainvoke(
        {"messages": [HumanMessage("first chat")], "user_id": "u"},
        {"configurable": {"thread_id": "a"}},
        durability="exit",
    )
    await graph.ainvoke(
        {"messages": [HumanMessage("second chat")], "user_id": "u"},
        {"configurable": {"thread_id": "b"}},
        durability="exit",
    )

    assert [m.content for m in llm.calls[1][1:]] == ["second chat"]


async def test_one_checkpoint_per_turn(llm):
    saver = InMemorySaver()
    graph = linkedin.build_linkedin_graph(saver)
    config = {"configurable": {"thread_id": "t"}}
    for msg in ("one", "two"):
        await graph.ainvoke({"messages": [HumanMessage(msg)], "user_id": "u"}, config, durability="exit")

    assert len([c async for c in saver.alist(config)]) == 2


async def test_generate_rejects_conversation_not_ending_on_user(llm):
    with pytest.raises(ValueError):
        await linkedin.generate({"messages": [], "user_id": "u"})


# ── Router ────────────────────────────────────────────────────────────────────


def test_chat_remembers_within_thread(client, llm):
    first = _send(client, "write about launches").json()
    second = _send(client, "make it shorter", first["thread"]["thread_id"]).json()

    assert second["content"] == "post 2"
    assert second["thread"]["turn_count"] == 2
    assert [m.content for m in llm.calls[1][1:]] == ["write about launches", "post 1", "make it shorter"]


def test_note_is_returned_and_kept_out_of_the_post(client, llm):
    llm.note = "Left out the hashtags you asked for."
    first = _send(client, "write about launches").json()
    assert first["note"] == llm.note
    assert first["content"] == "post 1"

    # Stored beside the post in the checkpoint, so a reloaded thread can show it.
    tid = first["thread"]["thread_id"]
    reply = app.state.linkedin_graph.get_state({"configurable": {"thread_id": tid}}).values["messages"][-1]
    assert reply.content == "post 1"
    assert reply.additional_kwargs["note"] == llm.note


def test_next_turn_model_sees_its_note_but_checkpoint_stays_clean(client, llm):
    llm.note = "What was the latency drop?"
    tid = _send(client, "write about our migration").json()["thread"]["thread_id"]
    llm.note = None
    _send(client, "about 40%", tid)

    sent = [m.content for m in llm.calls[1][1:]]
    assert sent == [
        "write about our migration",
        "post 1\n\n[Note to user: What was the latency drop?]",
        "about 40%",
    ]
    stored = app.state.linkedin_graph.get_state({"configurable": {"thread_id": tid}}).values["messages"]
    assert stored[1].content == "post 1"


def test_no_thread_id_starts_new_empty_chat(client, llm):
    a = _send(client, "chat A").json()
    b = _send(client, "chat B").json()

    assert a["thread"]["thread_id"] != b["thread"]["thread_id"]
    assert [m.content for m in llm.calls[1][1:]] == ["chat B"]


def test_other_users_thread_is_404(client):
    tid = _send(client, "mine").json()["thread"]["thread_id"]
    FakeThreads.rows[uuid.UUID(tid)]["user_id"] = uuid.uuid4()  # now owned by someone else

    assert _send(client, "hijack", tid).status_code == 404


def test_reddit_thread_on_linkedin_endpoint_is_404(client):
    tid = _send(client, "mine").json()["thread"]["thread_id"]
    FakeThreads.rows[uuid.UUID(tid)]["agent"] = "reddit"

    assert _send(client, "wrong agent", tid).status_code == 404


def test_busy_thread_is_409(client):
    tid = _send(client, "first").json()["thread"]["thread_id"]
    FakeThreads.rows[uuid.UUID(tid)]["busy"] = True

    assert _send(client, "second tab", tid).status_code == 409


def test_turn_limit_ends_chat(client, monkeypatch):
    monkeypatch.setattr(settings, "THREAD_TURN_LIMIT", 2)
    first = _send(client, "one").json()
    tid = first["thread"]["thread_id"]
    assert first["thread"]["limit_reached"] is False

    second = _send(client, "two", tid).json()
    assert second["thread"]["limit_reached"] is True

    third = _send(client, "three", tid)
    assert third.status_code == 409
    assert "Start a new chat" in third.json()["detail"]


def test_failed_turn_leaves_thread_unchanged(client, llm):
    tid = _send(client, "first").json()["thread"]["thread_id"]
    llm.fail = True
    assert _send(client, "this fails", tid).status_code == 502

    llm.fail = False
    _send(client, "retry", tid)
    assert [m.content for m in llm.calls[-1][1:]] == ["first", "post 1", "retry"]
    assert FakeThreads.rows[uuid.UUID(tid)]["turns"] == 2


def test_failed_first_turn_leaves_no_thread(client, llm):
    llm.fail = True
    assert _send(client, "this fails").status_code == 502
    assert FakeThreads.rows == {}


def test_timeout_after_all_attempts_is_504(client, llm):
    tid = _send(client, "first").json()["thread"]["thread_id"]
    llm.fail = True
    llm.error = httpx.ReadTimeout("gemini slow")

    res = _send(client, "this times out", tid)
    assert res.status_code == 504
    assert res.json()["detail"] == "Request timed out. Please try again."
    assert FakeThreads.rows[uuid.UUID(tid)]["busy"] is False  # user can resend immediately


def test_chat_deleted_mid_turn_is_409_and_leaves_no_checkpoint(client, llm):
    tid = _send(client, "first").json()["thread"]["thread_id"]
    llm.on_call = lambda: FakeThreads.rows.pop(uuid.UUID(tid))  # deleted while Gemini runs

    res = _send(client, "second", tid)
    assert res.status_code == 409
    graph = app.state.linkedin_graph
    assert "messages" not in graph.get_state({"configurable": {"thread_id": tid}}).values
