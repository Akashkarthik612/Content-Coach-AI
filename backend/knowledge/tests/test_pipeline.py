"""IngestionPipeline against real Postgres with FakeEmbedder (I1-I8, plus the
metadata-only touch for hash-equal files). No Gemini calls."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from backend.knowledge.errors import EmbeddingUnavailableError, StaleDiffError
from backend.knowledge.models import KnowledgeChunk
from backend.knowledge.pipeline import IngestionPipeline
from backend.knowledge.records import ChunkDiff, FetchedDocument, FileMeta
from backend.knowledge.repository import KnowledgeRepository as Repo

pytestmark = pytest.mark.integration

T0 = datetime(2026, 10, 1, tzinfo=timezone.utc)


def section(i: int, word: str = "topic") -> str:
    # ~330 tokens: two sections never fit in one 512-token chunk, so each
    # section is exactly one chunk and the diff is easy to read.
    return f"# Section {i}\n" + f"Sentence {i} about {word} number {i} in this document. " * 30 + "\n"


def doc(
    *sections: str, title: str = "Plan", modified: datetime = T0, external_id: str = "f1"
) -> FetchedDocument:
    meta = FileMeta(external_id=external_id, title=title, mime_type="text/markdown", modified_at=modified)
    return FetchedDocument(meta=meta, text="".join(sections), kind="markdown")


FOUR = [section(i) for i in range(1, 5)]


@pytest.fixture
def user(make_user):
    return make_user()


@pytest.fixture
def source(db, user):
    return Repo.create_source(db, user, "gdrive", "perm-1", "a@x.com", {"folder_ids": ["root"]})


@pytest.fixture
def embedder():
    from backend.knowledge.embedder import FakeEmbedder

    return FakeEmbedder()


@pytest.fixture
def pipe(embedder):
    return IngestionPipeline(Repo, embedder)


def chunk_rows(db, user):
    return db.execute(
        select(KnowledgeChunk.id, KnowledgeChunk.ordinal, KnowledgeChunk.content)
        .where(KnowledgeChunk.user_id == user)
        .order_by(KnowledgeChunk.ordinal)
    ).all()


async def test_i1_new_document(db, user, source, pipe, embedder):
    result = await pipe.ingest(db, user, source.id, doc(*FOUR))
    assert (result.status, result.embedded) == ("created", 4)
    assert len(embedder.embedded_texts) == 4
    rows = chunk_rows(db, user)
    assert [r.ordinal for r in rows] == [0, 1, 2, 3]
    assert all(r.content.startswith("$title: Plan\n# Section") for r in rows)
    assert Repo.get_document(db, user, source.id, "f1").chunk_count == 4


async def test_i2_same_document_again_embeds_nothing(db, user, source, pipe, embedder):
    await pipe.ingest(db, user, source.id, doc(*FOUR))
    before = Repo.get_document(db, user, source.id, "f1")
    embedder.calls.clear()
    result = await pipe.ingest(db, user, source.id, doc(*FOUR))
    assert result.status == "unchanged"
    assert embedder.calls == []
    assert Repo.get_document(db, user, source.id, "f1").updated_at == before.updated_at  # no write at all


async def test_hash_equal_but_newer_modified_time_is_recorded_without_embedding(
    db, user, source, pipe, embedder
):
    await pipe.ingest(db, user, source.id, doc(*FOUR))
    embedder.calls.clear()
    later = T0 + timedelta(hours=1)
    result = await pipe.ingest(db, user, source.id, doc(*FOUR, modified=later))
    assert result.status == "unchanged"
    assert embedder.calls == []
    assert Repo.get_document(db, user, source.id, "f1").source_modified_at == later


async def test_i3_one_word_edit_embeds_one_chunk(db, user, source, pipe, embedder):
    await pipe.ingest(db, user, source.id, doc(*FOUR))
    before = {r.ordinal: r.id for r in chunk_rows(db, user)}
    embedder.calls.clear()
    edited = [FOUR[0], section(2, word="subject"), FOUR[2], FOUR[3]]
    result = await pipe.ingest(db, user, source.id, doc(*edited))
    assert (result.status, result.embedded, result.kept, result.deleted) == ("updated", 1, 3, 1)
    assert len(embedder.embedded_texts) == 1
    after = {r.ordinal: r.id for r in chunk_rows(db, user)}
    assert [after[i] == before[i] for i in range(4)] == [True, False, True, True]


async def test_i4_deleted_section_embeds_nothing_and_ordinals_stay_contiguous(
    db, user, source, pipe, embedder
):
    await pipe.ingest(db, user, source.id, doc(*FOUR))
    embedder.calls.clear()
    result = await pipe.ingest(db, user, source.id, doc(FOUR[0], FOUR[1], FOUR[3]))
    assert (result.embedded, result.deleted) == (0, 1)
    assert [r.ordinal for r in chunk_rows(db, user)] == [0, 1, 2]
    assert Repo.get_document(db, user, source.id, "f1").chunk_count == 3


async def test_i5_rename_reembeds_everything(db, user, source, pipe, embedder):
    await pipe.ingest(db, user, source.id, doc(*FOUR))
    embedder.calls.clear()
    result = await pipe.ingest(db, user, source.id, doc(*FOUR, title="Plan v2"))
    assert result.embedded == 4  # the title is in every chunk: accepted trade-off (BE9)
    assert Repo.get_document(db, user, source.id, "f1").title == "Plan v2"


@pytest.mark.parametrize("text", ["", "  \n\n", "x" * 750_001], ids=["empty", "blank", "huge"])
async def test_i6_empty_or_huge_text_fails_and_keeps_old_chunks(db, user, source, pipe, text):
    await pipe.ingest(db, user, source.id, doc(*FOUR))
    before = chunk_rows(db, user)
    result = await pipe.ingest(db, user, source.id, doc(text))
    assert result.status == "failed"
    stored = Repo.get_document(db, user, source.id, "f1")
    assert stored.sync_status == "failed"
    assert chunk_rows(db, user) == before


async def test_i6_new_empty_file_fails_without_a_row(db, user, source, pipe):
    result = await pipe.ingest(db, user, source.id, doc("   "))
    assert result.status == "failed"
    assert Repo.get_document(db, user, source.id, "f1") is None


async def test_failed_document_recovers_when_text_returns(db, user, source, pipe):
    await pipe.ingest(db, user, source.id, doc(*FOUR))
    await pipe.ingest(db, user, source.id, doc(""))
    result = await pipe.ingest(db, user, source.id, doc(*FOUR))
    assert result.status == "unchanged"
    assert Repo.get_document(db, user, source.id, "f1").sync_status == "synced"


async def test_i7_embedding_outage_writes_nothing(db, user, source, pipe, embedder):
    embedder.fail_with = EmbeddingUnavailableError("down")
    with pytest.raises(EmbeddingUnavailableError):
        await pipe.ingest(db, user, source.id, doc(*FOUR))
    assert Repo.get_document(db, user, source.id, "f1") is None
    assert db.execute(select(func.count()).select_from(KnowledgeChunk)).scalar_one() == 0


async def test_i8_stale_diff_writes_nothing(db, user, source, embedder):
    pipe = IngestionPipeline(Repo, embedder)
    await pipe.ingest(db, user, source.id, doc(*FOUR))

    class RacingEmbedder(type(embedder)):
        async def embed_documents(self, title, texts):
            # Another sync lands a new version between our diff and our apply.
            stored = Repo.get_document(db, user, source.id, "f1")
            meta = doc(*FOUR).meta.to_document_meta()
            Repo.apply_document_version(
                db, user, source.id, meta, "other-hash", ChunkDiff(), stored.content_hash
            )
            return await super().embed_documents(title, texts)

    racing = IngestionPipeline(Repo, RacingEmbedder())
    with pytest.raises(StaleDiffError):
        await racing.ingest(db, user, source.id, doc(FOUR[0], section(2, word="x"), FOUR[2], FOUR[3]))
    stored = Repo.get_document(db, user, source.id, "f1")
    assert stored.content_hash == "other-hash"
    assert stored.chunk_count == 4
