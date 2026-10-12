"""Domain records for the knowledge store. Frozen, no DB imports: the
pipeline, connectors and agents pass these around instead of ORM rows."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, NamedTuple
from uuid import UUID


@dataclass(frozen=True)
class SourceRecord:
    """A connection (one row of knowledge_sources)."""

    id: UUID
    user_id: UUID
    provider: str
    account_ref: str
    display_name: str
    config: dict[str, Any]
    cursor: str | None
    status: str
    last_success_at: datetime | None
    last_error: str | None
    created_at: datetime | None = None  # when Drive was connected: start of the auth -> embedded clock
    last_run_at: datetime | None = None
    sync_lease_until: datetime | None = None  # in the future while a sync run holds the source


@dataclass(frozen=True)
class DocumentMeta:
    """What a connector knows about a file before ingesting it."""

    external_id: str
    title: str
    mime_type: str
    source_url: str | None = None
    source_modified_at: datetime | None = None


@dataclass(frozen=True)
class DocumentRecord:
    """A stored document."""

    id: UUID
    user_id: UUID
    source_id: UUID
    external_id: str
    title: str
    mime_type: str
    source_url: str | None
    source_modified_at: datetime | None
    content_hash: str
    chunk_count: int
    sync_status: str
    updated_at: datetime
    last_error: str | None = None  # why the last attempt failed (sync_status='failed')
    has_body: bool = True  # False until a document synced before 0028 is re-synced


@dataclass(frozen=True)
class StoredChunkRef:
    """Lightweight row for diffing: no vector, no content."""

    id: UUID
    chunk_hash: str
    ordinal: int


@dataclass(frozen=True)
class NewChunk:
    """A chunk to insert. embedding_model is e.g. "gemini-embedding-2@768"."""

    ordinal: int
    heading: str | None
    content: str
    chunk_hash: str
    token_count: int
    embedding: list[float]
    embedding_model: str


@dataclass(frozen=True)
class ChunkDiff:
    """Built by the pipeline (Build 2), applied atomically by the repository.
    reorder maps an existing chunk id to its new ordinal."""

    to_insert: list[NewChunk] = field(default_factory=list)
    to_delete_ids: list[UUID] = field(default_factory=list)
    reorder: dict[UUID, int] = field(default_factory=dict)


@dataclass(frozen=True)
class ChunkHit:
    """A search result. distance is cosine distance (0 = same direction)."""

    chunk_id: UUID
    document_id: UUID
    source_id: UUID
    title: str
    source_url: str | None
    heading: str | None
    content: str
    distance: float


# ── ingestion (Day 5 Part B) ──────────────────────────────────────────────────


@dataclass(frozen=True)
class EncryptedCredential:
    """A knowledge_source_credentials row as stored: ciphertext only."""

    source_id: UUID
    user_id: UUID
    refresh_token_enc: bytes
    access_token_enc: bytes | None
    access_token_expires_at: datetime | None
    scope: str


@dataclass(frozen=True)
class CredentialRecord:
    """Decrypted OAuth tokens for one source. Never logged."""

    source_id: UUID
    user_id: UUID
    refresh_token: str = field(repr=False)
    access_token: str | None = field(repr=False)
    access_token_expires_at: datetime | None
    scope: str


@dataclass(frozen=True)
class Section:
    """Document tree, Dust's shape: a prefix (heading) repeated in every chunk
    below it, optional content, and child sections."""

    prefix: str | None = None
    content: str | None = None
    sections: list["Section"] = field(default_factory=list)


@dataclass(frozen=True)
class FileMeta:
    """What the provider reports about a file. size is None for Google Docs."""

    external_id: str
    title: str
    mime_type: str
    source_url: str | None = None
    modified_at: datetime | None = None
    size: int | None = None
    parents: tuple[str, ...] = ()

    def to_document_meta(self) -> DocumentMeta:
        return DocumentMeta(
            external_id=self.external_id,
            title=self.title,
            mime_type=self.mime_type,
            source_url=self.source_url,
            source_modified_at=self.modified_at,
        )


@dataclass(frozen=True)
class FetchedDocument:
    """Output of a connector's fetch(): raw text plus how to parse it."""

    meta: FileMeta
    text: str
    kind: Literal["markdown", "plain"]


@dataclass(frozen=True)
class ChangeBatch:
    """Output of list_changes(). folder_changed means a folder was moved,
    renamed or trashed: its children are not reported, so the caller must
    fall back to a full listing to see them."""

    changed: list[FileMeta]
    removed: list[str]
    next_cursor: str
    folder_changed: bool = False


@dataclass(frozen=True)
class ChunkText:
    """A splitter chunk before embedding."""

    ordinal: int
    heading: str | None
    text: str
    token_count: int
    chunk_hash: str


@dataclass(frozen=True)
class DiffPlan:
    """Pure diff of stored chunks vs new chunks, before embedding. reorder
    holds only kept rows whose ordinal changes."""

    keep: list[UUID] = field(default_factory=list)
    reorder: dict[UUID, int] = field(default_factory=dict)
    insert: list[ChunkText] = field(default_factory=list)
    delete: list[UUID] = field(default_factory=list)


IngestStatus = Literal["created", "updated", "unchanged", "failed"]


@dataclass(frozen=True)
class IngestResult:
    """Per-file outcome."""

    status: IngestStatus
    embedded: int = 0
    kept: int = 0
    deleted: int = 0
    reason: str | None = None


SyncOutcome = Literal[
    "ok", "transient_error", "auth_revoked", "already_running", "lease_lost",
    "source_missing", "source_deleted", "paused", "nothing_selected",
]


@dataclass
class SyncReport:
    """Per-run outcome: logged as one line, and counters for tests."""

    source_id: UUID
    outcome: SyncOutcome = "ok"
    mode: Literal["full", "incremental"] | None = None
    files_seen: int = 0
    ingested: int = 0
    unchanged: int = 0
    failed: int = 0
    deleted: int = 0
    embedded: int = 0
    skipped_over_cap: int = 0
    cursor_saved: bool = False
    error: str | None = None
    failures: list[tuple[str, str]] = field(default_factory=list)
    # Timing, kept in the logs for later diagnosis (background job, not a request path).
    chunks_kept: int = 0  # unchanged chunks reused without re-embedding
    plan_ms: int = 0  # cursor/changes or full listing
    duration_ms: int = 0  # whole run, lease to lease
    first_success: bool = False  # this run was the source's first successful sync
    since_connect_ms: int | None = None  # Drive connected -> first sync done (first success only)


# ── sync poller (Day 6) ───────────────────────────────────────────────────────


class DueSource(NamedTuple):
    """A source the poller should sync now. IDs only: the cross-user due query
    never returns content, config or tokens."""

    user_id: UUID
    source_id: UUID


# What the poller made of one source (SyncReport.outcome mapped, see sync_poller.py).
TickOutcome = Literal["ok", "skipped_locked", "skipped", "failed", "timed_out"]


@dataclass(frozen=True)
class TickReport:
    """One poller pass: logged as one line, and counters for tests.
    stragglers = runs past their timeout that are still going."""

    tick_id: UUID
    started_at: datetime
    duration_ms: int
    due: int
    ran: int
    ok: int
    skipped_locked: int
    skipped: int
    failed: int
    timed_out: int
    stragglers: int


# ── retrieval for agent tools (Day 7) ─────────────────────────────────────────
# What the knowledge tools return: only what a model needs to pick and read a
# document. No user_id, hashes or distances.


@dataclass(frozen=True)
class ChunkSnippet:
    heading: str | None
    text: str


@dataclass(frozen=True)
class DocumentHits:
    """Search hits grouped by document, in rank order: title and url once per
    document, not once per chunk."""

    document_id: UUID
    title: str
    url: str | None
    chunks: tuple[ChunkSnippet, ...]


@dataclass(frozen=True)
class DocumentSummary:
    """One document, enough to choose it and pass its id to read."""

    document_id: UUID
    title: str
    source_name: str
    mime_type: str
    url: str | None
    modified_at: datetime | None


@dataclass(frozen=True)
class DocumentListPage:
    items: tuple[DocumentSummary, ...]
    next_cursor: str | None  # None on the last page


@dataclass(frozen=True)
class DocumentPage:
    """A slice of a document's body. next_offset is None at the end."""

    document_id: UUID
    title: str
    url: str | None
    text: str
    offset: int
    total_chars: int
    next_offset: int | None
