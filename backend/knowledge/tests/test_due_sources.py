"""KnowledgeRepository.list_due_sources against real Postgres (Day 6: T1,
T2, T9, T11). Times are set with the database clock, like the query uses."""

import pytest
from sqlalchemy import text

from backend.knowledge.records import DueSource
from backend.knowledge.repository import KnowledgeRepository as Repo

pytestmark = pytest.mark.integration

CONFIG = {"folder_ids": ["F"], "file_ids": []}
INTERVAL = 300


def source(db, user, ref, config=CONFIG, status="active", ran_ago_s=None, lease_in_s=None):
    """A source with its run/lease state set relative to the DB's now()."""
    src = Repo.create_source(db, user, "gdrive", ref, f"{ref}@x.com", config)
    db.execute(
        text(
            """
            UPDATE knowledge_sources SET
              status = :status,
              last_run_at = CASE WHEN CAST(:ran AS int) IS NULL THEN NULL
                                 ELSE now() - make_interval(secs => :ran) END,
              sync_lease_until = CASE WHEN CAST(:lease AS int) IS NULL THEN NULL
                                      ELSE now() + make_interval(secs => :lease) END
            WHERE id = :id
            """
        ),
        {"status": status, "ran": ran_ago_s, "lease": lease_in_s, "id": src.id},
    )
    db.commit()
    return src.id


def due_ids(db, limit=50):
    return [d.source_id for d in Repo.list_due_sources(db, INTERVAL, limit)]


def test_t1_due_rule(db, make_user):
    u = make_user()
    due_active = source(db, u, "a", ran_ago_s=600)
    due_error = source(db, u, "b", status="error", ran_ago_s=600)
    expired_lease = source(db, u, "c", lease_in_s=-60)
    source(db, u, "d", ran_ago_s=10)  # ran within the interval
    source(db, u, "e", status="paused")
    source(db, u, "f", status="needs_reauth")
    source(db, u, "g", lease_in_s=600)  # a run holds the lease
    assert set(due_ids(db)) == {due_active, due_error, expired_lease}


def test_t2_never_run_first_then_oldest_and_limit(db, make_user):
    u = make_user()
    old = source(db, u, "a", ran_ago_s=900)
    older = source(db, u, "b", ran_ago_s=3600)
    never = source(db, u, "c")
    assert due_ids(db) == [never, older, old]
    assert due_ids(db, limit=2) == [never, older]


def test_t9_cross_user_scan_returns_ids_only(db, make_user):
    u1, u2 = make_user(), make_user()
    s1, s2 = source(db, u1, "a"), source(db, u2, "b")
    result = Repo.list_due_sources(db, INTERVAL, 50)
    assert set(result) == {DueSource(u1, s1), DueSource(u2, s2)}
    assert all(type(d) is DueSource and len(d) == 2 for d in result)


def test_t11_source_with_nothing_selected_is_never_due(db, make_user):
    u = make_user()
    source(db, u, "a", config={})
    source(db, u, "b", config={"folder_ids": [], "file_ids": []})
    files_only = source(db, u, "c", config={"folder_ids": [], "file_ids": ["X"]})
    assert due_ids(db) == [files_only]
