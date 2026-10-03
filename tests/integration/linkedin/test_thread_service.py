"""AgentThreadService against real Postgres: the SQL that the unit tests'
FakeThreads only imitates — ownership, the turn cap, the lease, retention."""

import threading
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import func, insert, select, update
from sqlalchemy.exc import IntegrityError

from backend.ai.independent_agents.limits import LEASE
from backend.ai.independent_agents.models import AgentThread
from backend.ai.independent_agents.threads import (
    TITLE_MAX_CHARS,
    AgentThreadService,
    ThreadBusyError,
    ThreadLimitReachedError,
    ThreadNotFoundError,
)
from backend.auth.models import User
from backend.core.config import settings
from backend.core.database import SessionLocal

LI = "linkedin"


def _row(db, thread_id) -> AgentThread | None:
    db.expire_all()
    return db.get(AgentThread, thread_id)


def _set(db, thread_id, **values) -> None:
    db.execute(update(AgentThread).where(AgentThread.id == thread_id).values(**values))
    db.commit()


def _now(db):
    return db.scalar(select(func.now()))


def _idle():
    """A last_message_at just past the retention window."""
    return func.now() - timedelta(days=settings.THREAD_RETENTION_DAYS, hours=1)


def _thread(db, user_id, agent=LI, message="hello", leased=False) -> uuid.UUID:
    thread_id = AgentThreadService.create(db, user_id, agent, message)
    if not leased:
        _set(db, thread_id, busy_until=None)
    return thread_id


# ── create ────────────────────────────────────────────────────────────────────


def test_create_inserts_thread_leased_for_its_first_turn(db, make_user):
    user = make_user()
    before = _now(db)

    thread_id = AgentThreadService.create(db, user, LI, "x" * 100)

    row = _row(db, thread_id)
    assert (row.user_id, row.agent, row.turn_count) == (user, LI, 0)
    assert len(row.title) == TITLE_MAX_CHARS and row.title.endswith("…")
    assert before + LEASE - timedelta(seconds=5) <= row.busy_until <= _now(db) + LEASE


def test_title_collapses_whitespace(db, make_user):
    thread_id = AgentThreadService.create(db, make_user(), LI, "  launch \n\n  notes  ")
    assert _row(db, thread_id).title == "launch notes"


# ── acquire ───────────────────────────────────────────────────────────────────


def test_acquire_free_thread_takes_the_lease(db, make_user):
    user = make_user()
    thread_id = _thread(db, user)

    AgentThreadService.acquire(db, thread_id, user, LI)

    assert _row(db, thread_id).busy_until > _now(db)


def test_acquire_leased_thread_is_busy(db, make_user):
    user = make_user()
    thread_id = _thread(db, user, leased=True)

    with pytest.raises(ThreadBusyError):
        AgentThreadService.acquire(db, thread_id, user, LI)


def test_expired_lease_frees_itself(db, make_user):
    """A process that died mid-turn leaves busy_until behind; once it passes,
    the thread is usable again without any cleanup."""
    user = make_user()
    thread_id = _thread(db, user)
    _set(db, thread_id, busy_until=func.now() - timedelta(seconds=1))

    AgentThreadService.acquire(db, thread_id, user, LI)


@pytest.mark.parametrize("who", ["other_user", "other_agent", "unknown_id", "idle_expired"])
def test_acquire_not_found(db, make_user, who):
    user = make_user()
    thread_id = _thread(db, user)
    if who == "other_user":
        user = make_user()
    elif who == "other_agent":
        _set(db, thread_id, agent="reddit")
    elif who == "unknown_id":
        thread_id = uuid.uuid4()
    else:
        _set(db, thread_id, last_message_at=_idle())

    with pytest.raises(ThreadNotFoundError):
        AgentThreadService.acquire(db, thread_id, user, LI)


def test_acquire_at_turn_limit_is_refused(db, make_user):
    user = make_user()
    thread_id = _thread(db, user)
    _set(db, thread_id, turn_count=settings.THREAD_TURN_LIMIT)

    with pytest.raises(ThreadLimitReachedError):
        AgentThreadService.acquire(db, thread_id, user, LI)
    assert _row(db, thread_id).busy_until is None  # a refused acquire takes no lease


def test_concurrent_acquire_exactly_one_wins(db, make_user):
    """Two tabs sending at once: the single UPDATE ... WHERE lease-free must
    let exactly one through, on separate connections."""
    user = make_user()
    thread_id = _thread(db, user)
    barrier = threading.Barrier(2)
    results = []

    def attempt():
        with SessionLocal() as session:
            barrier.wait()
            try:
                AgentThreadService.acquire(session, thread_id, user, LI)
                results.append("acquired")
            except ThreadBusyError:
                results.append("busy")

    workers = [threading.Thread(target=attempt) for _ in range(2)]
    for w in workers:
        w.start()
    for w in workers:
        w.join(timeout=10)

    assert sorted(results) == ["acquired", "busy"]


# ── finish / release ──────────────────────────────────────────────────────────


def test_finish_counts_turn_bumps_recency_and_releases(db, make_user):
    user = make_user()
    thread_id = _thread(db, user, leased=True)
    _set(db, thread_id, last_message_at=func.now() - timedelta(hours=1))
    old = _row(db, thread_id).last_message_at

    assert AgentThreadService.finish(db, thread_id) == 1

    row = _row(db, thread_id)
    assert row.turn_count == 1
    assert row.busy_until is None
    assert row.last_message_at > old


def test_finish_on_deleted_thread_is_not_found(db, make_user):
    thread_id = _thread(db, make_user(), leased=True)
    AgentThreadService.delete_row(db, thread_id)

    with pytest.raises(ThreadNotFoundError):
        AgentThreadService.finish(db, thread_id)


def test_release_frees_the_lease_without_counting(db, make_user):
    thread_id = _thread(db, make_user(), leased=True)

    AgentThreadService.release(db, thread_id)

    row = _row(db, thread_id)
    assert (row.busy_until, row.turn_count) == (None, 0)


# ── reads ─────────────────────────────────────────────────────────────────────


def test_list_threads_only_own_active_linkedin_newest_first(db, make_user):
    me, someone = make_user(), make_user()
    older = _thread(db, me, message="older")
    newer = _thread(db, me, message="newer")
    _set(db, older, last_message_at=func.now() - timedelta(hours=2))
    _set(db, newer, last_message_at=func.now() - timedelta(hours=1))
    _thread(db, me, agent="reddit")
    expired = _thread(db, me)
    _set(db, expired, last_message_at=_idle())
    _thread(db, someone)

    assert [t.id for t in AgentThreadService.list_threads(db, me, LI)] == [newer, older]
    assert [t.id for t in AgentThreadService.list_threads(db, me, LI, limit=1)] == [newer]


def test_get_is_scoped_to_owner_and_agent(db, make_user):
    me = make_user()
    thread_id = _thread(db, me)

    assert AgentThreadService.get(db, thread_id, me, LI).id == thread_id
    assert AgentThreadService.get(db, thread_id, make_user(), LI) is None
    assert AgentThreadService.get(db, thread_id, me, "x") is None


# ── delete lock ───────────────────────────────────────────────────────────────


def test_lock_for_delete(db, make_user):
    me = make_user()
    thread_id = _thread(db, me)

    AgentThreadService.lock_for_delete(db, thread_id, me, LI)
    assert _row(db, thread_id).busy_until > _now(db)

    with pytest.raises(ThreadBusyError):  # a turn (or another delete) holds it
        AgentThreadService.lock_for_delete(db, thread_id, me, LI)
    with pytest.raises(ThreadNotFoundError):
        AgentThreadService.lock_for_delete(db, thread_id, make_user(), LI)
    with pytest.raises(ThreadNotFoundError):
        AgentThreadService.lock_for_delete(db, uuid.uuid4(), me, LI)


# ── retention ─────────────────────────────────────────────────────────────────


def test_expired_ids_skips_active_and_leased_threads(db, make_user):
    me = make_user()
    expired = _thread(db, me)
    expired_but_running = _thread(db, me, leased=True)
    _thread(db, me)  # active
    _set(db, expired, last_message_at=_idle())
    _set(db, expired_but_running, last_message_at=_idle())

    assert AgentThreadService.expired_ids(db) == [expired]


# ── schema ────────────────────────────────────────────────────────────────────


def test_unknown_agent_is_rejected_by_check_constraint(db, make_user):
    with pytest.raises(IntegrityError):
        db.execute(insert(AgentThread).values(id=uuid.uuid4(), user_id=make_user(), agent="facebook"))
        db.commit()


def test_deleting_user_deletes_their_threads(db, make_user):
    me = make_user()
    thread_id = _thread(db, me)

    db.delete(db.get(User, me))
    db.commit()

    assert _row(db, thread_id) is None
