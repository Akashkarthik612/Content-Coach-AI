"""KnowledgeRetrievalService against real Postgres (Day_7.md T1-T6).

Documents go in through the real IngestionPipeline with FakeEmbedder, so
chunks, hashes and body are exactly what a sync would store."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from backend.core.database import SessionLocal
from backend.knowledge.embedder import FakeEmbedder
from backend.knowledge.errors import (
    DocumentNotFoundError,
    DocumentTextUnavailableError,
    InvalidToolInputError,
)
from backend.knowledge.pipeline import IngestionPipeline
from backend.knowledge.records import FetchedDocument, FileMeta
from backend.knowledge.repository import KnowledgeRepository as Repo
from backend.knowledge.retrieval import KnowledgeRetrievalService

pytestmark = pytest.mark.integration

T0 = datetime(2026, 10, 1, tzinfo=timezone.utc)


@pytest.fixture
def embedder():
    return FakeEmbedder()


@pytest.fixture
def service(embedder):
    return KnowledgeRetrievalService(Repo, embedder, SessionLocal, statement_timeout_s=20)


@pytest.fixture
def user(make_user):
    return make_user()


def make_source(db, user_id, name="Drive"):
    return Repo.create_source(db, user_id, "gdrive", f"acct-{uuid.uuid4()}", name, {"folder_ids": ["F"]})


async def ingest(db, embedder, user_id, source, external_id, title, body, modified=T0):
    doc = FetchedDocument(
        meta=FileMeta(external_id=external_id, title=title, mime_type="text/markdown", modified_at=modified),
        text=body,
        kind="markdown",
    )
    await IngestionPipeline(Repo, embedder).ingest(db, user_id, source.id, doc)
    return Repo.get_document(db, user_id, source.id, external_id)


# ── T1 search is scoped to the caller ─────────────────────────────────────────


async def test_t1_search_returns_only_the_callers_chunks(db, service, embedder, user, make_user):
    other = make_user()
    mine = await ingest(db, embedder, user, make_source(db, user), "a", "Launch plan", "# Launch\nWe ship v2.\n")
    await ingest(db, embedder, other, make_source(db, other), "a", "Launch plan", "# Launch\nWe ship v2.\n")

    results = await service.search(user, "launch plan")
    assert [r.document_id for r in results] == [mine.id]
    assert results[0].title == "Launch plan"
    assert results[0].chunks and all(c.text for c in results[0].chunks)


async def test_search_groups_chunks_by_document_and_rejects_blank(db, service, embedder, user):
    src = make_source(db, user)
    long_body = "".join(f"# Part {i}\n" + "word " * 400 + "\n" for i in range(3))
    await ingest(db, embedder, user, src, "a", "Big doc", long_body)
    results = await service.search(user, "part")
    assert len(results) == 1  # three chunks, one document
    assert len(results[0].chunks) == 3
    with pytest.raises(InvalidToolInputError):
        await service.search(user, "   ")


# ── T2 find: partial, case-insensitive, wildcards literal, prefix first ──────


async def test_t2_find_matching_escaping_and_ranking(db, service, embedder, user):
    src = make_source(db, user)
    await ingest(db, embedder, user, src, "1", "Roadmap: Q3 launch plan", "x\n", modified=T0 + timedelta(days=2))
    await ingest(db, embedder, user, src, "2", "Q3 Launch Plan", "y\n", modified=T0)
    await ingest(db, embedder, user, src, "3", "100% done_list", "z\n")
    await ingest(db, embedder, user, src, "4", "1000 done list", "w\n")

    found = await service.find(user, "q3 LAUNCH", limit=10)
    # Prefix match first even though the other is newer.
    assert [d.title for d in found] == ["Q3 Launch Plan", "Roadmap: Q3 launch plan"]
    assert found[0].source_name == "Drive"

    assert [d.title for d in await service.find(user, "100%", limit=10)] == ["100% done_list"]
    assert [d.title for d in await service.find(user, "done_", limit=10)] == ["100% done_list"]
    assert await service.find(user, "nothing like this", limit=10) == []
    with pytest.raises(InvalidToolInputError):
        await service.find(user, "", limit=10)
    with pytest.raises(InvalidToolInputError):
        await service.find(user, "q3", limit=0)


# ── T3 visibility = search's rules ────────────────────────────────────────────


async def test_t3_paused_source_is_hidden_failed_document_stays_visible(db, service, embedder, user):
    active, paused = make_source(db, user, "Active"), make_source(db, user, "Paused")
    await ingest(db, embedder, user, active, "ok", "Visible doc", "# A\nvisible\n")
    failed = await ingest(db, embedder, user, active, "bad", "Failed doc", "# B\nold version\n")
    hidden = await ingest(db, embedder, user, paused, "p", "Paused doc", "# C\nhidden\n")
    db.execute(text("UPDATE knowledge_sources SET status = 'paused' WHERE id = :id"), {"id": paused.id})
    db.commit()
    Repo.mark_failed(db, user, active.id, "bad", "unparseable")

    found = {d.title for d in await service.find(user, "doc", limit=10)}
    listed = {d.title for d in (await service.list_documents(user, "title", 10, None)).items}
    searched = {r.title for r in await service.search(user, "doc")}
    assert found == listed == searched == {"Visible doc", "Failed doc"}

    with pytest.raises(DocumentNotFoundError):
        await service.read(user, hidden.id, 0, 100)
    # Its last good version is still stored and searchable, so it can be read.
    assert (await service.read(user, failed.id, 0, 100)).text == "# B\nold version\n"


# ── T4 list pagination ────────────────────────────────────────────────────────


async def test_t4_list_pages_without_duplicates_in_both_orders(db, service, embedder, user):
    src = make_source(db, user)
    for i in range(25):
        await ingest(db, embedder, user, src, f"d{i}", f"Doc {i:02d}", f"text {i}\n", modified=T0 + timedelta(hours=i))

    for sort_by, first in (("title", "Doc 00"), ("modified", "Doc 24")):
        pages, cursor = [], None
        while True:
            page = await service.list_documents(user, sort_by, 10, cursor)
            pages.append(page)
            cursor = page.next_cursor
            if cursor is None:
                break
        titles = [d.title for p in pages for d in p.items]
        assert [len(p.items) for p in pages] == [10, 10, 5]
        assert len(set(titles)) == 25
        assert titles[0] == first

    with pytest.raises(InvalidToolInputError):
        await service.list_documents(user, "modified", 10, "title:10")  # cursor from another order
    with pytest.raises(InvalidToolInputError):
        await service.list_documents(user, "title", 10, "garbage")


# ── T5 read paging ────────────────────────────────────────────────────────────


async def test_t5_read_slices_and_reports_the_end(db, service, embedder, user):
    body = "".join(f"line {i:03d}\n" for i in range(100))  # 900 chars
    doc = await ingest(db, embedder, user, make_source(db, user), "a", "Long", body)

    first = await service.read(user, doc.id, 0, 400)
    assert (first.text, first.total_chars, first.next_offset) == (body[:400], 900, 400)
    last = await service.read(user, doc.id, 800, 400)
    assert (last.text, last.next_offset) == (body[800:], None)
    with pytest.raises(InvalidToolInputError):
        await service.read(user, doc.id, 900, 400)
    with pytest.raises(InvalidToolInputError):
        await service.read(user, doc.id, 0, 12_001)


async def test_read_before_backfill_is_text_unavailable(db, service, embedder, user):
    doc = await ingest(db, embedder, user, make_source(db, user), "a", "Old", "old text\n")
    db.execute(text("UPDATE knowledge_documents SET body = NULL"))
    db.commit()
    with pytest.raises(DocumentTextUnavailableError):
        await service.read(user, doc.id, 0, 100)


# ── T6 read is scoped to the caller ───────────────────────────────────────────


async def test_t6_read_another_users_document_is_not_found(db, service, embedder, user, make_user):
    other = make_user()
    theirs = await ingest(db, embedder, other, make_source(db, other), "a", "Secret", "secret text\n")
    with pytest.raises(DocumentNotFoundError):
        await service.read(user, theirs.id, 0, 100)
    with pytest.raises(DocumentNotFoundError):
        await service.read(user, uuid.uuid4(), 0, 100)


async def test_has_sources(db, service, user):
    assert await service.has_sources(user) is False
    make_source(db, user)
    assert await service.has_sources(user) is True
