"""KnowledgeRepository against real Postgres + pgvector (CI only).

Vectors live in a 2-D slice of the 768-dim space: vec(a) points at angle a,
so cosine distance is 1 - cos(a - b) and the expected order is obvious."""

import hashlib
import math
import threading

import pytest
from sqlalchemy import create_engine, delete, func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from backend.auth.models import User
from backend.core.config import settings
from backend.core.database import SessionLocal, engine
from backend.knowledge import repository, search_mode
from backend.knowledge.errors import InvalidVectorError, SourceNotFoundError, StaleDiffError
from backend.knowledge.models import KnowledgeChunk, KnowledgeDocument, KnowledgeSource
from backend.knowledge.records import ChunkDiff, DocumentMeta, NewChunk
from backend.knowledge.repository import KnowledgeRepository as Repo

pytestmark = pytest.mark.integration

TAG = settings.EMBEDDING_MODEL_TAG


def vec(angle: float) -> list[float]:
    v = [0.0] * settings.EMBEDDING_DIM
    v[0], v[1] = math.cos(angle), math.sin(angle)
    return v


def sha(text_: str) -> str:
    return hashlib.sha256(text_.encode()).hexdigest()


def chunk(ordinal: int, content: str = "text", angle: float = 0.0, model: str = TAG) -> NewChunk:
    return NewChunk(
        ordinal=ordinal,
        heading=None,
        content=content,
        chunk_hash=sha(content),
        token_count=len(content.split()),
        embedding=vec(angle),
        embedding_model=model,
    )


def meta(external_id: str = "file-1") -> DocumentMeta:
    return DocumentMeta(external_id=external_id, title=f"Doc {external_id}", mime_type="text/plain")


def put(db, user_id, source_id, external_id, chunks, content_hash="h1", base=None):
    return Repo.apply_document_version(
        db, user_id, source_id, meta(external_id), content_hash, ChunkDiff(to_insert=chunks), base, body=f"body {content_hash}"
    )


def count(db, model, *where) -> int:
    return db.execute(select(func.count()).select_from(model).where(*where)).scalar_one()


@pytest.fixture
def user(make_user):
    return make_user()


@pytest.fixture
def drive(db, user):
    return Repo.create_source(db, user, "gdrive", "akash@gmail.com", "Drive", {"folders": ["f1"]})


@pytest.fixture
def uploads(db, user):
    return Repo.create_source(db, user, "upload", "", "Uploads", {})


# ── sources and documents ─────────────────────────────────────────────────────


def test_02_create_same_source_twice_is_one_row(db, user, drive):
    again = Repo.create_source(db, user, "gdrive", "akash@gmail.com", "Other name", {})
    assert again.id == drive.id
    assert again.display_name == "Drive"  # unchanged; update_source_config changes it
    assert count(db, KnowledgeSource, KnowledgeSource.user_id == user) == 1


def test_03_upsert_same_document_twice_is_one_row(db, user, drive):
    put(db, user, drive.id, "f", [chunk(0, "a")], content_hash="h1")
    second = put(db, user, drive.id, "f", [], content_hash="h2", base="h1")
    assert second.content_hash == "h2"
    assert second.chunk_count == 1
    assert count(db, KnowledgeDocument, KnowledgeDocument.source_id == drive.id) == 1


def test_04_same_external_id_under_two_sources(db, user, drive, uploads):
    put(db, user, drive.id, "same", [chunk(0)])
    put(db, user, uploads.id, "same", [chunk(0)])
    assert count(db, KnowledgeDocument, KnowledgeDocument.external_id == "same") == 2


def test_05_chunk_with_another_users_id_is_rejected(db, user, drive, make_user):
    doc = put(db, user, drive.id, "f", [chunk(0)])
    other = make_user()
    with pytest.raises(IntegrityError, match="fk_knowledge_chunks_document"):
        db.execute(
            KnowledgeChunk.__table__.insert().values(
                document_id=doc.id,
                user_id=other,
                source_id=drive.id,
                ordinal=9,
                content="x",
                chunk_hash=sha("x"),
                token_count=1,
                embedding=vec(0),
                embedding_model=TAG,
            )
        )
    db.rollback()


def test_06_delete_source_cascades_and_spares_other_sources(db, user, drive, uploads):
    put(db, user, drive.id, "d", [chunk(0), chunk(1)])
    put(db, user, uploads.id, "u", [chunk(0)])
    assert Repo.delete_source(db, user, drive.id) is True
    assert count(db, KnowledgeDocument, KnowledgeDocument.source_id == drive.id) == 0
    assert count(db, KnowledgeChunk, KnowledgeChunk.source_id == drive.id) == 0
    assert count(db, KnowledgeChunk, KnowledgeChunk.source_id == uploads.id) == 1
    assert Repo.delete_source(db, user, drive.id) is False


def test_07_delete_user_cascades(db, user, drive, make_user):
    put(db, user, drive.id, "d", [chunk(0)])
    other = make_user()
    other_src = Repo.create_source(db, other, "upload", "", "Uploads", {})
    put(db, other, other_src.id, "o", [chunk(0)])

    db.execute(delete(User).where(User.id == user))
    db.commit()

    assert count(db, KnowledgeSource, KnowledgeSource.user_id == user) == 0
    assert count(db, KnowledgeDocument, KnowledgeDocument.user_id == user) == 0
    assert count(db, KnowledgeChunk, KnowledgeChunk.user_id == user) == 0
    assert count(db, KnowledgeChunk, KnowledgeChunk.user_id == other) == 1


def test_08_failure_after_delete_rolls_everything_back(db, user, drive, monkeypatch):
    doc = put(db, user, drive.id, "f", [chunk(0, "a"), chunk(1, "b")])
    before = Repo.list_chunk_refs(db, user, doc.id)

    def boom(*args, **kwargs):
        raise RuntimeError("embedding store down")

    monkeypatch.setattr(repository, "_insert_chunks", boom)
    diff = ChunkDiff(to_insert=[chunk(0, "c")], to_delete_ids=[before[0].id])
    with pytest.raises(RuntimeError):
        Repo.apply_document_version(db, user, drive.id, meta("f"), "h2", diff, "h1", body="b2")

    assert Repo.list_chunk_refs(db, user, doc.id) == before
    assert Repo.get_document(db, user, drive.id, "f").content_hash == "h1"


def test_08b_ordinal_clash_fails_at_commit_and_rolls_back(db, user, drive):
    doc = put(db, user, drive.id, "f", [chunk(0, "a")])
    before = Repo.list_chunk_refs(db, user, doc.id)
    diff = ChunkDiff(to_insert=[chunk(5, "x"), chunk(5, "y")], to_delete_ids=[before[0].id])
    with pytest.raises(IntegrityError, match="uq_knowledge_chunks_doc_ordinal"):
        Repo.apply_document_version(db, user, drive.id, meta("f"), "h2", diff, "h1", body="b2")
    assert Repo.list_chunk_refs(db, user, doc.id) == before


def test_09_reorder_permutation_needs_no_temporary_ordinals(db, user, drive):
    doc = put(db, user, drive.id, "f", [chunk(0, "a"), chunk(1, "b"), chunk(2, "c")])
    a, b, c = Repo.list_chunk_refs(db, user, doc.id)
    diff = ChunkDiff(reorder={a.id: 2, b.id: 0, c.id: 1})
    Repo.apply_document_version(db, user, drive.id, meta("f"), "h2", diff, "h1", body="b2")
    assert [r.chunk_hash for r in Repo.list_chunk_refs(db, user, doc.id)] == [sha("b"), sha("c"), sha("a")]


def test_10_identical_chunks_in_one_document_are_both_stored(db, user, drive):
    doc = put(db, user, drive.id, "f", [chunk(0, "same"), chunk(1, "same")])
    assert doc.chunk_count == 2
    assert [r.chunk_hash for r in Repo.list_chunk_refs(db, user, doc.id)] == [sha("same")] * 2


def test_15_wrong_dimension_raises_and_writes_nothing(db, user, drive):
    bad = NewChunk(0, None, "x", sha("x"), 1, [1.0, 0.0, 0.0], TAG)
    with pytest.raises(InvalidVectorError):
        Repo.apply_document_version(db, user, drive.id, meta("f"), "h1", ChunkDiff(to_insert=[bad]), None, body="b1")
    assert Repo.get_document(db, user, drive.id, "f") is None
    with pytest.raises(InvalidVectorError):
        Repo.search(db, user, [0.0] * settings.EMBEDDING_DIM, k=3)  # zero vector: no direction


def test_16_unknown_provider_is_rejected_by_check(db, user):
    with pytest.raises(IntegrityError, match="ck_knowledge_sources_provider"):
        Repo.create_source(db, user, "notion", "ws-1", "Notion", {})


def test_17_concurrent_applies_one_wins_one_is_stale(db, user, drive):
    doc = put(db, user, drive.id, "f", [chunk(0, "v0")], content_hash="h0")
    (ref,) = Repo.list_chunk_refs(db, user, doc.id)
    db.commit()

    barrier = threading.Barrier(2)
    results: list[tuple[str, str]] = []

    def run(content: str, content_hash: str) -> None:
        diff = ChunkDiff(to_insert=[chunk(0, content)], to_delete_ids=[ref.id])
        with SessionLocal() as session:
            barrier.wait()
            try:
                Repo.apply_document_version(session, user, drive.id, meta("f"), content_hash, diff, "h0", body=content)
                results.append(("ok", content_hash))
            except StaleDiffError:
                results.append(("stale", content_hash))
            except Exception as exc:  # noqa: BLE001 — surfaced by the assert below
                results.append((repr(exc), content_hash))

    threads = [threading.Thread(target=run, args=args) for args in (("v1", "h1"), ("v2", "h2"))]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert sorted(status for status, _ in results) == ["ok", "stale"], results
    winner = next(h for status, h in results if status == "ok")
    final = Repo.get_document(db, user, drive.id, "f")
    assert final.content_hash == winner
    assert final.chunk_count == 1
    (only,) = Repo.list_chunk_refs(db, user, doc.id)
    assert only.chunk_hash == sha({"h1": "v1", "h2": "v2"}[winner])


def test_18_mark_failed_keeps_chunks(db, user, drive):
    doc = put(db, user, drive.id, "f", [chunk(0, "a")])
    before = Repo.list_chunk_refs(db, user, doc.id)
    assert Repo.mark_failed(db, user, drive.id, "f", "too large") is True
    stored = db.execute(select(KnowledgeDocument).where(KnowledgeDocument.id == doc.id)).scalar_one()
    db.refresh(stored)
    assert (stored.sync_status, stored.last_error) == ("failed", "too large")
    assert Repo.list_chunk_refs(db, user, doc.id) == before
    assert Repo.mark_failed(db, user, drive.id, "never-stored", "x") is False


def test_apply_to_another_users_source_is_source_not_found(db, user, make_user):
    other = make_user()
    theirs = Repo.create_source(db, other, "upload", "", "Uploads", {})
    with pytest.raises(SourceNotFoundError):
        put(db, user, theirs.id, "f", [chunk(0)])
    assert count(db, KnowledgeDocument, KnowledgeDocument.source_id == theirs.id) == 0


def test_21_source_config_and_cursor_rules(db, user, drive):
    Repo.update_source_cursor(db, user, drive.id, "token-1", ok=True)
    assert Repo.get_source(db, user, drive.id).cursor == "token-1"

    Repo.update_source_cursor(db, user, drive.id, "token-2", ok=False, error="drive 500")
    failed = Repo.get_source(db, user, drive.id)
    assert (failed.cursor, failed.status, failed.last_error) == ("token-1", "error", "drive 500")

    Repo.update_source_cursor(db, user, drive.id, "token-2", ok=True)
    healed = Repo.get_source(db, user, drive.id)
    assert (healed.cursor, healed.status, healed.last_error) == ("token-2", "active", None)

    changed = Repo.update_source_config(db, user, drive.id, "Drive (work)", {"folders": ["f2"]})
    assert (changed.cursor, changed.config, changed.display_name) == (
        None,
        {"folders": ["f2"]},
        "Drive (work)",
    )


def test_list_document_external_ids_for_garbage_collection(db, user, drive, uploads):
    put(db, user, drive.id, "a", [chunk(0)])
    put(db, user, drive.id, "b", [chunk(0)])
    put(db, user, uploads.id, "c", [chunk(0)])
    assert Repo.list_document_external_ids(db, user, drive.id) == {"a", "b"}


# ── search ────────────────────────────────────────────────────────────────────


def test_11_search_only_returns_the_users_own_chunks(db, user, drive, make_user):
    put(db, user, drive.id, "mine", [chunk(i, f"mine {i}", angle=1.0 + i * 0.1) for i in range(3)])
    other = make_user()
    theirs = Repo.create_source(db, other, "gdrive", "b@gmail.com", "Drive", {})
    put(db, other, theirs.id, "theirs", [chunk(i, f"theirs {i}", angle=0.001 * i) for i in range(5)])

    hits = Repo.search(db, user, vec(0.0), k=10)
    assert len(hits) == 3
    assert {h.source_id for h in hits} == {drive.id}


def test_12_source_filter(db, user, drive, uploads):
    put(db, user, drive.id, "d", [chunk(0, "drive", angle=0.5)])
    put(db, user, uploads.id, "u", [chunk(0, "upload", angle=0.0)])
    hits = Repo.search(db, user, vec(0.0), k=5, source_ids=[drive.id])
    assert [h.content for h in hits] == ["drive"]


def test_13_foreign_source_id_returns_nothing(db, user, drive, make_user):
    other = make_user()
    theirs = Repo.create_source(db, other, "upload", "", "Uploads", {})
    put(db, other, theirs.id, "t", [chunk(0)])
    assert Repo.search(db, user, vec(0.0), k=5, source_ids=[theirs.id]) == []


def test_14_top_k_ordered_by_cosine_distance(db, user, drive):
    angles = [0.9, 0.1, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 1.0]
    put(db, user, drive.id, "f", [chunk(i, f"c{a}", angle=a) for i, a in enumerate(angles)])
    hits = Repo.search(db, user, vec(0.0), k=3)
    assert [h.content for h in hits] == ["c0.1", "c0.2", "c0.3"]
    assert [h.distance for h in hits] == sorted(h.distance for h in hits)
    assert hits[0].title == "Doc f"


def test_20_empty_filter_paused_source_and_other_model(db, user, drive, uploads):
    put(
        db,
        user,
        drive.id,
        "d",
        [chunk(0, "current", angle=0.2), chunk(1, "old model", angle=0.0, model="old@768")],
    )
    put(db, user, uploads.id, "u", [chunk(0, "paused", angle=0.1)])
    db.execute(update(KnowledgeSource).where(KnowledgeSource.id == uploads.id).values(status="paused"))
    db.commit()

    assert Repo.search(db, user, vec(0.0), k=5, source_ids=[]) == []
    assert [h.content for h in Repo.search(db, user, vec(0.0), k=5)] == ["current"]
    with pytest.raises(ValueError):
        Repo.search(db, user, vec(0.0), k=0)


def test_ci_runs_iterative_mode(db):
    # pgvector/pgvector:pg17 ships >= 0.8, so test 19 below exercises the HNSW path.
    assert search_mode.detect_search_mode(db) == search_mode.ITERATIVE


@pytest.fixture
def index_preferring_session():
    """A session whose connection refuses seq/bitmap scans when it can, so the
    planner reaches for the HNSW index. NullPool: the SET dies with the
    connection instead of leaking into the shared pool."""
    private = create_engine(engine.url, poolclass=NullPool)
    conn = private.connect()
    conn.execute(text("SET enable_seqscan = off"))
    conn.execute(text("SET enable_bitmapscan = off"))
    conn.commit()
    session = Session(bind=conn)
    try:
        yield session
    finally:
        session.close()
        conn.close()
        private.dispose()


def _crowded(db, make_user, user, drive):
    """User A: 5 chunks far from the query. User B: 200 chunks right on it."""
    put(db, user, drive.id, "mine", [chunk(i, f"mine {i}", angle=1.2 + i * 0.01) for i in range(5)])
    other = make_user()
    theirs = Repo.create_source(db, other, "gdrive", "b@gmail.com", "Drive", {})
    put(db, other, theirs.id, "theirs", [chunk(i, f"theirs {i}", angle=0.0001 * i) for i in range(200)])
    db.execute(text("ANALYZE knowledge_chunks"))
    db.commit()


@pytest.mark.parametrize("mode", [search_mode.ITERATIVE, search_mode.EXACT])
def test_19_filtered_search_returns_k_when_others_are_closer(
    db, user, drive, make_user, index_preferring_session, monkeypatch, mode
):
    _crowded(db, make_user, user, drive)
    monkeypatch.setattr(search_mode, "_mode", mode)
    hits = Repo.search(index_preferring_session, user, vec(0.0), k=5)
    assert len(hits) == 5
    assert {h.source_id for h in hits} == {drive.id}
