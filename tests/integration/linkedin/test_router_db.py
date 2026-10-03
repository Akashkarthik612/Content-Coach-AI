"""The LinkedIn endpoints with the real lifespan (psycopg pool + checkpointer
setup) and the real AgentThreadService SQL. Auth is overridden to a seeded
user here; the real JWT path is covered in tests/smoke/."""

import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.ai.independent_agents.models import AgentThread
from backend.auth.services import get_current_user
from backend.core.config import settings
from backend.main import app

URL = "/api/independent-agents/linkedin"


@pytest.fixture
def client(db, make_user, llm):
    user = SimpleNamespace(id=make_user())  # routes only read user.id
    app.dependency_overrides[get_current_user] = lambda: user
    with TestClient(app) as test_client:  # runs the lifespan: real pool, setup(), graph
        yield test_client
    app.dependency_overrides.clear()


def _send(client, message, thread_id=None):
    body = {"message": message} | ({"thread_id": thread_id} if thread_id else {})
    return client.post(URL, json=body)


def _thread(db, thread_id) -> AgentThread | None:
    db.expire_all()
    return db.get(AgentThread, uuid.UUID(thread_id))


def _checkpoints(db, thread_id) -> int:
    return db.scalar(text("SELECT count(*) FROM checkpoints WHERE thread_id = :t"), {"t": thread_id})


def test_two_turn_chat_is_stored_in_postgres(client, db):
    first = _send(client, "write about launches").json()
    tid = first["thread"]["thread_id"]
    second = _send(client, "make it shorter", tid).json()

    assert second["thread"]["turn_count"] == 2
    row = _thread(db, tid)
    assert (row.turn_count, row.busy_until, row.title) == (2, None, "write about launches")

    detail = client.get(f"{URL}/threads/{tid}").json()
    assert [(m["role"], m["content"]) for m in detail["messages"]] == [
        ("user", "write about launches"),
        ("assistant", "post 1"),
        ("user", "make it shorter"),
        ("assistant", "post 2"),
    ]
    assert [t["id"] for t in client.get(f"{URL}/threads").json()] == [tid]


def test_failed_first_turn_leaves_nothing(client, db, llm):
    llm.fail = True

    assert _send(client, "this fails").status_code == 502
    assert db.scalar(text("SELECT count(*) FROM agent_threads")) == 0
    assert db.scalar(text("SELECT count(*) FROM checkpoints")) == 0


def test_failed_later_turn_rolls_back_and_frees_thread(client, db, llm):
    tid = _send(client, "first").json()["thread"]["thread_id"]
    llm.fail = True

    assert _send(client, "this fails", tid).status_code == 502

    row = _thread(db, tid)
    assert (row.turn_count, row.busy_until) == (1, None)
    messages = client.get(f"{URL}/threads/{tid}").json()["messages"]
    assert [m["content"] for m in messages] == ["first", "post 1"]

    llm.fail = False
    assert _send(client, "retry", tid).status_code == 200  # resend works immediately


def test_delete_removes_row_and_checkpoints(client, db):
    tid = _send(client, "hello").json()["thread"]["thread_id"]
    assert _checkpoints(db, tid) == 1

    assert client.delete(f"{URL}/threads/{tid}").status_code == 204

    assert _thread(db, tid) is None
    assert _checkpoints(db, tid) == 0
    assert client.get(f"{URL}/threads/{tid}").status_code == 404
    assert _send(client, "still there?", tid).status_code == 404


def test_turn_limit_is_enforced_by_the_database(client, db, monkeypatch):
    monkeypatch.setattr(settings, "THREAD_TURN_LIMIT", 2)
    tid = _send(client, "one").json()["thread"]["thread_id"]

    second = _send(client, "two", tid).json()
    assert second["thread"]["limit_reached"] is True

    third = _send(client, "three", tid)
    assert third.status_code == 409
    assert "Start a new chat" in third.json()["detail"]
    assert _thread(db, tid).turn_count == 2


def test_another_users_thread_is_not_found(client, db, make_user):
    tid = _send(client, "mine").json()["thread"]["thread_id"]
    db.execute(text("UPDATE agent_threads SET user_id = :u"), {"u": make_user()})
    db.commit()

    assert _send(client, "hijack", tid).status_code == 404
    assert client.get(f"{URL}/threads/{tid}").status_code == 404
    assert client.delete(f"{URL}/threads/{tid}").status_code == 404
