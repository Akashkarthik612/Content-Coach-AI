# Day 5 (Part B) — Google Drive Connector \+ Incremental Ingestion

> Task brief for Claude Code. Read `CLAUDE.md` and `project_requirements.md` first. **Part A (knowledge store) is already built and merged.** Do not re-implement or change it, except the small additions listed in §0.2. Its contract is summarised in §0 so you don't need the old brief. **Not in this build:** 5-minute polling loop, retrieval tool for agents, agent wiring, UI (see "Next").

---

# 0\. What already exists (Part A) — reference only

### 0.1 Tables (migration `0025`, Postgres \+ pgvector)

| Table | Key columns used by Part B |
| :---- | :---- |
| `knowledge_sources` | `id`, `user_id`, `provider` (`'gdrive'`,`'upload'`), `account_ref`, `display_name`, `config` (JSONB: `folder_ids`, `file_ids`), `cursor`, `status` (`active`/`paused`/`error`), `last_run_at`, `last_success_at`, `last_error`. Unique `(user_id, provider, account_ref)` |
| `knowledge_documents` | `id`, `user_id`, `source_id`, `external_id` (Drive file ID), `title`, `mime_type`, `source_url`, `content_hash`, `chunk_count`, `source_modified_at`, `sync_status` (`synced`/`failed`), `last_error`. Unique `(source_id, external_id)` |
| `knowledge_chunks` | `id`, `document_id`, `user_id`, `source_id`, `ordinal`, `heading`, `content`, `chunk_hash`, `token_count`, `embedding VECTOR(768)`, `embedding_model` (`'gemini-embedding-2@768'`) |

Composite FKs keep `user_id`/`source_id` consistent; deletes cascade source → documents → chunks.

### 0.2 `KnowledgeRepository` methods Part B calls

Every method takes `user_id` first and filters by it. Read the real signatures in `backend/knowledge/repository.py` before coding; if anything below differs, **the code wins** — report the difference, don't change Part A to match this table.

| Method | Used for |
| :---- | :---- |
| `create_source(...)`, `get_source(user_id, source_id)`, `list_sources(user_id)`, `delete_source(...)` | OAuth callback, endpoints |
| `update_source_config(user_id, source_id, display_name, config)` | Selection changes (also clears the cursor) |
| `update_source_cursor(user_id, source_id, cursor, ok, error)` | End of a sync run. `ok=False` never moves the cursor |
| `get_document(user_id, source_id, external_id)` | Hash / `modifiedTime` check |
| `list_chunk_refs(user_id, document_id)` | `(id, chunk_hash, ordinal)` for the diff, no vectors |
| `apply_document_version(user_id, source_id, meta, content_hash, diff, base_content_hash)` | One transaction; raises `StaleDiffError` if the stored hash ≠ base |
| `mark_failed(user_id, source_id, external_id, error)` | Permanent per-file failure; keeps old chunks |
| `delete_document(user_id, source_id, external_id)` | Removed files |
| `list_document_external_ids(user_id, source_id)` | Garbage collection after a full listing |

Errors already defined: `SourceNotFoundError`, `StaleDiffError`, `InvalidVectorError`.

**Additions Part B makes to Part A's files:** a `KnowledgeSourceCredential` model (§B5) and three credential methods on the repository (§B7). Nothing else in Part A changes.

### 0.3 Test setup already in place

| Rule | Detail |
| :---- | :---- |
| CI only | Owner is on Windows; all tests run in GitHub Actions on `pgvector/pgvector:pg17`. Don't ask for local runs |
| Colocated | Tests live in `backend/knowledge/tests/` |
| Markers | DB tests set `pytestmark = pytest.mark.integration`; shared fixtures `db`, `make_user` come from the root `conftest.py` |
| Safety | Tests never touch Supabase (root `conftest.py` guards \+ `current_database() = 'honne_test'` check) |
| Results | CI posts a pass/fail table to the job summary |

---

> Builds on §0. Ports Dust's proven pipeline to Python, with two deliberate improvements (§B2). **Out of scope today:** the 5-minute background polling loop, retrieval for agents (`search_knowledge` tool), agent wiring, any UI, Google Sheets/CSV, Word/PowerPoint, Apache Tika, the upload connector.

## B1. Goal

A user connects their Google Drive, picks folders/files, and a **"Sync now"** call ingests them: each supported file is fetched, turned into sections, split into ≤512-token chunks, hashed, diffed against what is stored, and **only new chunks are embedded**. Re-running the sync re-embeds nothing that didn't change. The background timer that calls the same `sync_source()` every 5 minutes is the next step, not today.

| In | Out (next steps) |
| :---- | :---- |
| Drive OAuth ("Connect Drive", `drive.readonly`), encrypted token storage | 5-minute polling loop in `lifespan` |
| Folder/file selection API | Retrieval tool for agents, agent wiring |
| `BaseConnector`, `ConnectorFactory`, `GDriveConnector` (all 4 contract methods) | `UploadConnector`, Notion |
| Sections → splitter → hashing → diff → embed → `apply_document_version` | Sheets/CSV (tables), docx/pptx, Tika |
| `SyncService.sync_source()` (one run) \+ `POST …/sync` ("Sync now") | UI |

---

## B2. What we port from Dust (MIT) and what we change

All links pinned to Dust commit `b92c73c`. Ported files carry the header `# Adapted from dust-tt/dust (MIT License, Copyright (c) 2022 Stanislas Polu)`, and the MIT text goes in `THIRD_PARTY_NOTICES.md`.

| Dust | Honne (Python) | Change |
| :---- | :---- | :---- |
| `Section { prefix, content, sections }` — [`data_source.rs#L37`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/core/src/data_sources/data_source.rs#L37) | `Section` dataclass | Same shape |
| `base_v0` splitter: `TokenizedSection.from`, balanced `split_text`, greedy `chunks()` merge, prefixes ≤ ½ max — [`splitter.rs`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/core/src/data_sources/splitter.rs) | `splitter.py` | Straight port. Tokenizer \= `tiktoken` `cl100k_base` (the tokenizer Dust's own tests use), so Dust's splitter tests port as golden tests |
| `MAX_CHUNK_SIZE = 512` — [`core_api.ts#L42`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/front/types/core/core_api.ts#L42) | `CHUNK_MAX_TOKENS = 512` | Same |
| `renderDocumentTitleAndContent`: root prefix `$title:` **plus `$updatedAt`, `$author`, `$lastEditor`** — [`connectors/src/lib/data_sources.ts`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/connectors/src/lib/data_sources.ts) | `render_document()` | **Improvement 1:** prefix is `$title:` **only**. Dust copies the root prefix into every chunk, so `$updatedAt` changes on every edit and changes *every* chunk's hash → whole file re-embedded. Dates/authors stay as columns, not chunk text |
| Document hash (blake3 over id \+ text \+ timestamp \+ tags) — [`#L777`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/core/src/data_sources/data_source.rs#L777) | `content_hash()` \= SHA-256 of normalized rendered text | Text only, so it means "content changed" |
| Chunk hash \+ embedding cache \+ embed misses — [`#L916`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/core/src/data_sources/data_source.rs#L916), [`#L934`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/core/src/data_sources/data_source.rs#L934), [`#L1004`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/core/src/data_sources/data_source.rs#L1004) | `build_diff()` \+ pipeline | Same idea |
| Delete all points, re-insert all — [`#L1086`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/core/src/data_sources/data_source.rs#L1086) | `apply_document_version()` (§0.2) | **Improvement 2:** unchanged rows stay; only orphans deleted, only new chunks inserted |
| Embed batches of 128 — [`#L1027`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/core/src/data_sources/data_source.rs#L1027) | `GeminiEmbedder` | Batch size per Gemini's batch limit |
| `MIME_TYPES_TO_EXPORT` (Docs → `text/plain`) — `google_drive/temporal/mime_types.ts` | `GDriveConnector.fetch()` | Docs exported as **`text/markdown`** (supported by Drive export) so headings become sections |
| `MAX_DOCUMENT_TXT_LEN = 750000`, `MAX_FILE_SIZE_TO_DOWNLOAD` — `connectors/src/lib/data_sources.ts` | `MAX_DOCUMENT_CHARS = 750_000`, `MAX_DOWNLOAD_BYTES = 20 MB` | Download cap lowered for Render's memory |
| `changes.list`, removed/trashed → delete, changed → sync, token saved after processing — [`incremental_sync.ts#L136`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/connectors/src/connectors/google_drive/temporal/activities/incremental_sync.ts#L136) | `GDriveConnector.list_changes()` \+ `SyncService` | Same |
| `getStartPageToken` before full sync — [`utils.ts#L94`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/connectors/src/connectors/google_drive/temporal/activities/common/utils.ts#L94) | `initial_cursor()` called **before** `full_listing()` | Same |
| `objectIsInFolderSelection` (file or any ancestor selected, parents memoized) — `utils.ts#L140` | `_in_selection()` | Same, memoized per run |
| 403 rate limit re-thrown for retry, not "lost access" — after [`#L363`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/connectors/src/connectors/google_drive/temporal/activities/incremental_sync.ts#L363) | `RateLimitedError` (transient) | Same |
| Garbage collector workflow — [`workflows.ts#L68`](https://github.com/dust-tt/dust/blob/b92c73c0a5a9e36de668e0b9377f3ccf6749a082/connectors/src/connectors/google_drive/temporal/workflows.ts#L68) | GC step inside full-listing runs | Inline, no separate workflow |
| `stripNullBytes` | `normalize()` | Same |

---

## B3. Decisions

| \# | Decision | Choice |
| :---- | :---- | :---- |
| B-D1 | Drive auth | Separate "Connect Drive" OAuth consent, scope `https://www.googleapis.com/auth/drive.readonly`, `access_type=offline`, `prompt=consent` (to receive a refresh token). Not Supabase's sign-in tokens. Reusable pattern for Notion later |
| B-D2 | Token storage | New table `knowledge_source_credentials` (1:1 with a source), tokens **encrypted** with Fernet (`cryptography`), key in `KNOWLEDGE_TOKEN_KEY`. Kept out of `knowledge_sources` so normal queries never load secrets |
| B-D3 | Drive HTTP client | Plain `httpx.AsyncClient` against the Drive v3 REST endpoints (already a dependency, async-native, easy to fake with `httpx.MockTransport`). No `google-api-python-client` |
| B-D4 | File types v1 | Google Docs (export `text/markdown`), PDF (`pypdf`), `.md`, `.txt`. Everything else is skipped with a logged reason |
| B-D5 | Tokenizer | `tiktoken` `cl100k_base` for counting/splitting. Gemini has no local tokenizer; 512 cl100k tokens is far below Gemini's 8,192-token input limit, so the approximation is safe |
| B-D12 | Chunking library | **None.** `splitter.py` is our own port of Dust's `base_v0`; `sections.py` is a small hand-written Markdown heading parser. **Do not use LangChain text splitters** (`MarkdownHeaderTextSplitter`, `RecursiveCharacterTextSplitter`) or `markdown-it-py`: they split by characters by default, keep headings in metadata instead of in each chunk's text, don't merge small sibling sections, and would break the Dust golden tests (U4–U6) |
| B-D6 | Chunk prefix | Root prefix `$title: <title>\n` \+ heading path. No dates/authors in chunk text (Improvement 1\) |
| B-D7 | Embedding | `gemini-embedding-2`, `output_dimensionality=768`, task type `RETRIEVAL_DOCUMENT` for chunks (`RETRIEVAL_QUERY` reserved for search). Model ID and parameters verified against the live API before merge. Base URL honors `GEMINI_BASE_URL` so CI fakes it |
| B-D8 | Trigger today | `POST /api/knowledge/sources/{id}/sync` runs one `sync_source()` as a FastAPI background task. The 5-min loop reuses this exact method next |
| B-D9 | Concurrency | One run per source at a time: `pg_try_advisory_lock(hashtext(source_id))`; a second run returns `already_running` |
| B-D10 | Error policy | **Transient** (network, 429/403-rate-limit, 5xx, embedding API down) → stop the run, keep the old cursor, retry next run. **Permanent** for one file (unsupported, too large, unparseable, empty) → `mark_failed`, continue, cursor advances. Never silent: every skip/failure is one structured log line and appears in the `SyncReport` |
| B-D11 | OAuth CSRF | `state` \= HMAC-signed `{user_id, nonce, exp}` (10 min). The callback has no user JWT (browser redirect), so the user is identified **only** by a valid state |

---

## B4. Ingestion flow

flowchart TB

  A\["FetchedDocument\<br/\>(meta \+ raw text \+ kind)"\] \--\> N\["1. normalize()\<br/\>strip NUL, unify newlines,\<br/\>trim trailing spaces"\]

  N \--\> L{"2. \> 750k chars\<br/\>or empty?"}

  L \-- yes \--\> F\["mark\_failed (permanent)"\]

  L \-- no \--\> R\["3. render\_document()\<br/\>Section tree with \$title prefix\<br/\>(markdown headings \-\> nested sections)"\]

  R \--\> H{"4. content\_hash \==\<br/\>stored hash?"}

  H \-- yes \--\> S\["skip: unchanged\<br/\>(0 embeddings)"\]

  H \-- no \--\> SP\["5. splitter: \<= 512 tokens per chunk\<br/\>prefixes repeated in each chunk"\]

  SP \--\> CH\["6. sha256 each chunk"\]

  CH \--\> D\["7. build\_diff(stored refs, new chunks)\<br/\>multiset: keep / insert / delete / reorder"\]

  D \--\> E\["8. embed ONLY to\_insert\<br/\>(batched, RETRIEVAL\_DOCUMENT)"\]

  E \--\> W\["9. apply\_document\_version(base\_content\_hash)\<br/\>one transaction"\]

  W \-- StaleDiffError \--\> X\["stop; next run recomputes"\]

  W \--\> OK\["IngestResult: created / updated\<br/\>embedded n, kept m, deleted k"\]

### B4.1 Worked example (one word changed in section 2 of 4\)

| Step | Result |
| :---- | :---- |
| Document hash | Different → continue |
| New chunks | `[h1, h2', h3, h4]` (title prefix unchanged, so `h1/h3/h4` are identical to before) |
| Stored refs | `[h1, h2, h3, h4]` |
| Diff | keep `h1,h3,h4` (same rows, same IDs) · insert `h2'` · delete `h2` |
| Embedding calls | **1 chunk** (Dust's Drive path would re-embed all 4, because its prefix contains `$updatedAt`) |
| DB writes | 1 delete \+ 1 insert \+ ordinal check, one transaction |

---

## B5. Schema addition — migration `0026_add_knowledge_source_credentials.py`

CREATE TABLE knowledge\_source\_credentials (

    source\_id                UUID PRIMARY KEY,

    user\_id                  UUID NOT NULL,

    refresh\_token\_enc        BYTEA NOT NULL,          \-- Fernet-encrypted

    access\_token\_enc         BYTEA,                   \-- Fernet-encrypted, short-lived cache

    access\_token\_expires\_at  TIMESTAMPTZ,

    scope                    TEXT NOT NULL,

    created\_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    updated\_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk\_knowledge\_source\_credentials\_source FOREIGN KEY (source\_id, user\_id)

        REFERENCES knowledge\_sources (id, user\_id) ON DELETE CASCADE

);

Deleting a source (or user) deletes its credentials. Revision `0026`, revises `0025`.

---

## B6. LLD

### B6.1 Data classes (`backend/knowledge/records.py`, added next to the existing ones)

| Class | Fields | Purpose |
| :---- | :---- | :---- |
| `Section` | `prefix: str | None, content: str | None, sections: list[Section]` | Document tree (Dust's shape) |
| `FileMeta` | `external_id, title, mime_type, source_url, modified_at, size, parents` | What Drive reports about a file |
| `FetchedDocument` | `meta: FileMeta, text: str, kind: Literal["markdown","plain"]` | Output of `fetch()` |
| `ChangeBatch` | `changed: list[FileMeta], removed: list[str], next_cursor: str` | Output of `list_changes()` |
| `ChunkText` | `ordinal, heading, text, token_count, chunk_hash` | Splitter output, before embedding |
| `DiffPlan` | `keep: dict[UUID,int]` (row → new ordinal), `insert: list[ChunkText]`, `delete: list[UUID]` | Pure diff result |
| `IngestResult` | `status: created|updated|unchanged|failed, embedded, kept, deleted, reason` | Per-file outcome |
| `SyncReport` | `source_id, mode: full|incremental, files_seen, ingested, unchanged, failed, deleted, embedded, transient_error, cursor_saved` | Per-run outcome (logged \+ returned by API) |

### B6.2 Modules and operation classes

All under `backend/knowledge/`. Each class depends on Protocols, not concrete classes (DIP), so tests swap in fakes.

| Module | Class / function | Responsibility (SRP) | Pattern |
| :---- | :---- | :---- | :---- |
| `text.py` | `normalize(text) -> str`, `content_hash(text) -> str` | Strip `\x00`, `\r\n`→`\n`, strip trailing spaces per line, collapse 3+ blank lines to 2\. SHA-256 hex | Pure functions |
| `sections.py` | `markdown_to_section(md)`, `plain_to_section(text)`, `render_document(title, body) -> Section` | Markdown: `#`…`###` headings become nested `Section(prefix="## Heading\n")`; deeper headings stay in content. A line is a heading only if it matches `^#{1,3} \S` **and is outside a fenced code block** (track ```` ``` ```` / `~~~` fences). Root `Section(prefix="$title: …\n", sections=[body])` | Builder |
| `splitter.py` | `Tokenizer` Protocol; `TiktokenTokenizer`; `split(section, max_tokens=512) -> list[ChunkText]` | Port of Dust `base_v0`: tokenize tree, enforce prefixes \< ½ max (else raise `PrefixTooLongError` → permanent failure), balanced `split_text` for oversize content, greedy merge of sibling subtrees, drop whitespace-only chunks, UTF-8-safe decode with remainder | Composite (section tree) |
| `diff.py` | `build_diff(stored: list[StoredChunkRef], new: list[ChunkText]) -> DiffPlan` | Multiset match by hash in document order: each new chunk takes the first unused stored row with the same hash (→ `keep` with new ordinal), else `insert`; unused stored rows → `delete` | Pure function |
| `embedder.py` | `Embedder` Protocol (`embed_documents(texts) -> list[list[float]]`, `embed_query(text)`); `GeminiEmbedder`; `FakeEmbedder` (tests: deterministic vector from text hash) | Batching, retries on 429/5xx with backoff (max 3), validates 768 dims, raises `EmbeddingUnavailableError` (transient) | Strategy |
| `pipeline.py` | `IngestionPipeline(store: KnowledgeStore, embedder: Embedder, tokenizer)` → `ingest(user_id, source_id, doc: FetchedDocument) -> IngestResult` | Steps 1–9 of §B4 | Template method |
| `credentials.py` | `TokenCipher` (Fernet), `CredentialStore` (save/load/update access token via repository) | Encrypt at rest, never log tokens | Repository |
| `connectors/base.py` | `BaseConnector` ABC; errors `TransientConnectorError`, `RateLimitedError(Transient)`, `CursorExpiredError`, `AuthRevokedError`, `PermanentFileError` | The contract | Template / Strategy |
| `connectors/factory.py` | `ConnectorFactory.register(provider)` (class decorator), `create(source) -> BaseConnector` | Registry; unknown provider → `UnknownProviderError` | Factory \+ Registry |
| `connectors/google_oauth.py` | `GoogleOAuth`: `auth_url(state)`, `exchange(code)`, `refresh(refresh_token)`, `sign_state/verify_state` | OAuth only | — |
| `connectors/gdrive.py` | `DriveClient` (thin httpx wrapper, auto-refresh on 401 once) \+ `GDriveConnector` (`provider="gdrive"`) | Drive API only; knows nothing about chunks or DB | Adapter |
| `sync.py` | `SyncService(repo, factory, pipeline)` → `sync_source(user_id, source_id) -> SyncReport` | One sync run (§B6.4) | Coordinator |
| `router.py` | FastAPI routes (§B6.6) | HTTP only; delegates to services | — |

#### Class diagram

classDiagram

  direction TB

  class BaseConnector {

    \<\<abstract\>\>

    \+provider: str

    \+initial\_cursor(source) str

    \+full\_listing(source) list\~FileMeta\~

    \+list\_changes(source, cursor) ChangeBatch

    \+fetch(source, meta) FetchedDocument

  }

  class GDriveConnector {

    \+provider \= "gdrive"

    \-client: DriveClient

  }

  class DriveClient {

    \+get(path, params)

    \-refresh\_on\_401()

  }

  class ConnectorFactory {

    \-\_registry: dict\~str, type\~

    \+register(provider)

    \+create(source) BaseConnector

  }

  class SyncService {

    \+sync\_source(user\_id, source\_id) SyncReport

  }

  class IngestionPipeline {

    \+ingest(user\_id, source\_id, doc) IngestResult

  }

  class Splitter {

    \+split(section, max\_tokens) list\~ChunkText\~

  }

  class Embedder {

    \<\<protocol\>\>

    \+embed\_documents(texts)

    \+embed\_query(text)

  }

  class KnowledgeRepository

  BaseConnector \<|-- GDriveConnector

  GDriveConnector \--\> DriveClient

  ConnectorFactory ..\> BaseConnector : creates

  SyncService \--\> ConnectorFactory

  SyncService \--\> IngestionPipeline

  SyncService \--\> KnowledgeRepository

  IngestionPipeline \--\> Splitter

  IngestionPipeline \--\> Embedder

  IngestionPipeline \--\> KnowledgeRepository

### B6.3 `GDriveConnector` — the 4 contract methods

| Method | Drive calls | Notes |
| :---- | :---- | :---- |
| `initial_cursor(source)` | `GET changes/startPageToken?supportsAllDrives=true` | Always called **before** `full_listing` |
| `full_listing(source)` | For each selected folder: BFS `GET files?q='<id>' in parents and trashed=false` (paged, `pageSize=1000`); plus each selected file by `GET files/<id>` | Returns supported files only. Fields: `id,name,mimeType,modifiedTime,size,webViewLink,parents` |
| `list_changes(source, cursor)` | `GET changes?pageToken=…&includeRemoved=true&includeItemsFromAllDrives=true&supportsAllDrives=true&pageSize=100`, follow `nextPageToken` until `newStartPageToken` | `removed` or `trashed` → `removed`; folder → ignored; unsupported mime → ignored; not in selection → `removed` (handles "moved out of selected folder"); else → `changed`. HTTP 410 / invalid token → `CursorExpiredError` |
| `fetch(source, meta)` | Google Doc → `GET files/<id>/export?mimeType=text/markdown`; PDF/`.md`/`.txt` → `GET files/<id>?alt=media` | `size > 20 MB` → `PermanentFileError` before download. PDF via `pypdf` (text only). Empty text → `PermanentFileError("no extractable text")` |

Selection check `_in_selection(meta)`: true if the file ID or any ancestor ID is in `config.folder_ids`/`config.file_ids`; ancestors resolved with `GET files/<id>?fields=parents`, memoized in a dict for the run (Dust's `getFileParentsMemoized`).

HTTP status mapping:

| Status | Meaning | Error |
| :---- | :---- | :---- |
| 401 | Access token expired | Refresh once, retry; second 401 → `AuthRevokedError` (source → `status='error'`) |
| 403 with `rateLimitExceeded`/`userRateLimitExceeded` | Rate limit | `RateLimitedError` (transient) |
| 403 other, 404 on a file | No access / gone | File → `removed` |
| 410 on `changes` | Cursor expired | `CursorExpiredError` |
| 5xx, timeouts | Google trouble | `TransientConnectorError` |

### B6.4 `SyncService.sync_source()` — one run

| Step | Action |
| :---- | :---- |
| 1 | `pg_try_advisory_lock(hashtext(source_id))`; not acquired → return `already_running` |
| 2 | `get_source(user_id, source_id)`; missing or `status='paused'` → stop |
| 3 | `connector = factory.create(source)` |
| 4a | **Cursor empty (first run / selection changed / expired):** `start = initial_cursor()` → `files = full_listing()` → `removed = list_document_external_ids() − {f.id for f in files}` (GC) → `next_cursor = start` |
| 4b | **Cursor set:** `batch = list_changes(cursor)`; on `CursorExpiredError` → switch to 4a in the same run |
| 5 | For each changed file: if stored `source_modified_at == meta.modified_at` → unchanged, skip download. Else `fetch()` → `pipeline.ingest()` |
| 6 | For each removed ID: `delete_document()` |
| 7 | No transient error → `update_source_cursor(ok=True, cursor=next_cursor)`. Any transient error → `update_source_cursor(ok=False, error=…)`, **cursor unchanged** |
| 8 | Release lock; log one `SyncReport` line; return it |

### B6.5 Updated sequence (trigger \= "Sync now" today; timer next)

sequenceDiagram

  autonumber

  participant UI as POST /sources/{id}/sync

  participant Sync as SyncService

  participant Repo as KnowledgeRepository

  participant Fac as ConnectorFactory

  participant Con as GDriveConnector

  participant API as Google Drive API

  participant Pipe as IngestionPipeline

  participant Emb as GeminiEmbedder

  UI-\>\>Sync: sync\_source(user\_id, source\_id) \[background task\]

  Sync-\>\>Repo: advisory lock \+ get\_source

  Sync-\>\>Fac: create(source)

  Fac--\>\>Sync: GDriveConnector

  alt cursor empty

    Sync-\>\>Con: initial\_cursor() (BEFORE listing)

    Con-\>\>API: changes/startPageToken

    Sync-\>\>Con: full\_listing()

    Con-\>\>API: files.list (BFS selected folders)

    Sync-\>\>Repo: list\_document\_external\_ids() (GC diff)

  else cursor set

    Sync-\>\>Con: list\_changes(cursor)

    Con-\>\>API: changes.list (pages)

    Con--\>\>Sync: ChangeBatch

  end

  loop each changed file (modifiedTime differs)

    Sync-\>\>Con: fetch(meta)

    Con-\>\>API: export text/markdown or download

    Sync-\>\>Pipe: ingest(doc)

    Pipe-\>\>Repo: get\_document \+ list\_chunk\_refs

    Pipe-\>\>Emb: embed\_documents(only new chunks)

    Pipe-\>\>Repo: apply\_document\_version(base\_content\_hash)

  end

  loop each removed id

    Sync-\>\>Repo: delete\_document

  end

  Sync-\>\>Repo: update\_source\_cursor (saved last, only if no transient error)

### B6.6 Endpoints (`backend/knowledge/router.py`, prefix `/api/knowledge`)

All use the existing Supabase JWT auth dependency, except the OAuth callback (identified by signed `state`).

| Method \+ path | Does |
| :---- | :---- |
| `GET /sources/gdrive/connect` | Returns `{auth_url}` with signed `state` |
| `GET /sources/gdrive/callback?code&state` | Verify state → exchange code → read account email (`GET about?fields=user`) → `create_source(provider='gdrive', account_ref=email)` → save encrypted tokens → redirect to `FRONTEND_URL` |
| `GET /sources` | List the user's sources with status, `last_success_at`, `last_error` |
| `GET /sources/{id}/folders?parent_id=root` | Browse Drive folders/files for the picker |
| `PUT /sources/{id}/selection` | `{folder_ids, file_ids}` → `update_source_config()` (also clears the cursor → next run is a full listing \+ GC) |
| `POST /sources/{id}/sync` | 202 \+ starts `sync_source()` in the background |
| `DELETE /sources/{id}` | `delete_source()` (cascades documents, chunks, credentials) |

A foreign `source_id` always returns 404 (never 403), so IDs don't leak.

### B6.7 Cost and complexity per operation

| Operation | Time | External cost |
| :---- | :---- | :---- |
| `normalize`, `content_hash` | O(n) chars, µs–ms | — |
| Splitter | O(n) tokens | — |
| `build_diff` | O(c) with a hash→rows dict | — |
| Unchanged file (modifiedTime equal) | O(1) DB read | 0 Drive downloads, 0 embeddings |
| Unchanged text (hash equal) | 1 download | 0 embeddings |
| Edited file | 1 download | Embeddings for **changed chunks only** (billed per input token) |
| `list_changes` | O(changes) | 1 Drive call per 100 changes |
| Full listing | O(files) | 1 call per 1,000 files per folder \+ ancestor lookups (memoized) |

---

## B7. Files (Part B)

| File | Change |
| :---- | :---- |
| `backend/alembic/versions/0026_add_knowledge_source_credentials.py` | Credentials table (§B5) |
| `backend/knowledge/models.py` | \+ `KnowledgeSourceCredential` model |
| `backend/knowledge/records.py` | \+ §B6.1 classes |
| `backend/knowledge/repository.py` | \+ credential methods (`save_credentials`, `get_credentials`, `update_access_token`) |
| `backend/knowledge/text.py`, `sections.py`, `splitter.py`, `diff.py`, `embedder.py`, `pipeline.py`, `credentials.py`, `sync.py`, `router.py` | New (§B6.2) |
| `backend/knowledge/connectors/__init__.py`, `base.py`, `factory.py`, `google_oauth.py`, `gdrive.py` | New |
| `backend/knowledge/tests/…` | Tests from §B8, colocated |
| `backend/knowledge/tests/fixtures/` | Small `.md`, `.txt`, `.pdf` fixtures \+ recorded Drive JSON responses |
| `backend/main.py` | Include the knowledge router; add `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `KNOWLEDGE_TOKEN_KEY` to `_REQUIRED_ON_RENDER` |
| `backend/core/config.py` | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_DRIVE_REDIRECT_URI`, `KNOWLEDGE_TOKEN_KEY`, `CHUNK_MAX_TOKENS=512`, `MAX_DOCUMENT_CHARS=750_000`, `MAX_DOWNLOAD_BYTES=20*1024*1024`. **Delete** the dead `SCHEDULER_*` settings (their `backend/scheduler/` no longer exists) |
| `requirements.txt` | `tiktoken`, `pypdf`, `cryptography` (no chunking/Markdown library, per B-D12) |
| `THIRD_PARTY_NOTICES.md` | Dust MIT license text \+ list of ported modules |
| `CLAUDE.md` | Knowledge section: credentials table, ingestion pipeline in 5 lines, Alembic head `0026` (stay ≤ 200 lines) |

---

## B8. Tests (CI only, colocated in `backend/knowledge/tests/`)

Same rules as §0.3. Unit tests need no DB; integration tests use the `db` fixture, `FakeEmbedder` and a fake connector or `httpx.MockTransport`. **No test calls Google or Gemini.**

### Unit

| \# | Test | Proves |
| :---- | :---- | :---- |
| U1 | `normalize` strips `\x00`, unifies newlines, idempotent | Clean, stable input |
| U2 | `content_hash` equal for cosmetic whitespace changes, different for a one-word change | Hash means "content changed" |
| U3 | Markdown → sections: `#`/`##`/`###` nest correctly; text before the first heading kept | Structure preserved |
| U3b | `# comment` inside a ```` ``` ```` fenced code block is **not** a heading; `#hashtag` (no space) is not a heading | Code and hashtags don't create fake sections |
| U4 | **Dust golden test** `test_splitter_v0_sections_normal` ported with `cl100k_base`, `max=18` → the same two chunks Dust asserts | Faithful port |
| U5 | Dust golden: `"🔥🔥"`, `max=4` → 2 chunks, joined text equals input | UTF-8-safe split |
| U6 | Dust golden: basic text cases → same chunk counts; joined chunks \== input | Lossless, balanced |
| U7 | Prefixes ≥ ½ max → `PrefixTooLongError` | Same guard as Dust |
| U8 | Every chunk ≤ 512 tokens and contains `$title:` and its heading path | Context on every chunk |
| U9 | Changing `$updatedAt`\-like metadata does **not** change any chunk hash | Improvement 1 |
| U10 | `build_diff`: identical → all keep; one edited → 1 insert \+ 1 delete; reordered → keep with new ordinals; duplicates `[h,h]→[h]` → 1 keep \+ 1 delete | Multiset diff |
| U11 | `ConnectorFactory`: registered provider created; unknown → `UnknownProviderError` | Factory |
| U12 | `GDriveConnector.list_changes` (MockTransport): 2 pages; trashed → removed; folder ignored; unsupported mime ignored; outside selection → removed; ancestor in selection → changed | Dust's change rules |
| U13 | 410 → `CursorExpiredError`; 403 rate limit → `RateLimitedError`; 401 → one refresh then success; second 401 → `AuthRevokedError` | Error mapping |
| U14 | `fetch`: Doc → export `text/markdown`; PDF fixture → text; \> 20 MB → `PermanentFileError` without downloading | File handling |
| U15 | OAuth `state`: valid round-trip; tampered → rejected; expired → rejected | CSRF safety |
| U16 | `TokenCipher` round-trip; ciphertext ≠ plaintext; wrong key → error | Encryption |

### Integration (DB)

| \# | Test | Proves |
| :---- | :---- | :---- |
| I1 | Ingest a new 4-section doc | 4 chunks stored, `FakeEmbedder` called with 4 texts |
| I2 | Ingest the same doc again | `unchanged`, **0** embed calls, no writes |
| I3 | Edit one word in section 2 | **1** embed call; 3 chunk IDs unchanged; 1 deleted, 1 inserted |
| I4 | Delete section 3 | 0 embed calls; 1 chunk deleted; ordinals contiguous |
| I5 | Rename the document | All chunks re-embedded (title is in every chunk) — documented trade-off |
| I6 | Text over 750k chars / empty text | `mark_failed`, old chunks untouched |
| I7 | Embedder raises `EmbeddingUnavailableError` | Nothing written; result reports transient failure |
| I8 | Stale diff (stored hash changed between diff and apply) | `StaleDiffError`, nothing written |
| I9 | `sync_source` first run (fake connector) | `initial_cursor` called **before** `full_listing` (call order recorded); cursor saved |
| I10 | First run with a stored doc not in the listing | GC deletes it |
| I11 | Incremental run with a transient error on file 2 | File 1 ingested; cursor **not** advanced; source `last_error` set |
| I12 | Incremental run with a permanent error on file 2 | File 2 `failed`; others ingested; cursor advanced |
| I13 | `CursorExpiredError` mid-run | Falls back to full listing \+ GC in the same run |
| I14 | Same `modifiedTime` | `fetch` never called |
| I15 | Two concurrent `sync_source` on one source | Second returns `already_running` |
| I16 | Endpoints: user A cannot read/sync/delete user B's source | 404 |
| I17 | `PUT /selection` | Config saved, cursor cleared |
| I18 | `DELETE /sources/{id}` | Documents, chunks and credentials gone |

---

## B9. Manual setup (owner, before deploy — not Claude Code)

| \# | Step |
| :---- | :---- |
| 1 | Google Cloud console: enable the **Google Drive API** |
| 2 | OAuth consent screen: app in **Testing** mode, add yourself (and testers) as test users. `drive.readonly` is a restricted scope; Testing mode avoids Google's verification for a prototype |
| 3 | Create an OAuth client (Web): redirect URIs for local and Render (`…/api/knowledge/sources/gdrive/callback`) |
| 4 | Generate the Fernet key: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| 5 | Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_DRIVE_REDIRECT_URI`, `KNOWLEDGE_TOKEN_KEY` in `.env` and on Render |
| 6 | After CI is green: `alembic upgrade head` on Supabase (0025 \+ 0026\) |

---

## B10. Second-brain check

| \# | Edge case | Handling |
| :---- | :---- | :---- |
| BE1 | Huge Drive (thousands of files) on first sync | Background task; files processed one at a time; a crash keeps the old (empty) cursor so the next run redoes the listing — cheap thanks to the hash skip |
| BE2 | Render instance restarts mid-run | Advisory lock is session-scoped and released on disconnect; cursor not advanced; next run resumes |
| BE3 | Google Doc with no headings | One content section → balanced token splits (same as Dust's plain-text path) |
| BE4 | Scanned PDF (images only) | No text → `PermanentFileError("no extractable text")`, logged. OCR out of scope |
| BE5 | File moved out of a selected folder | Reported as `removed` → document deleted |
| BE6 | User revokes access in Google | `AuthRevokedError` → source `status='error'`, `last_error` explains; UI later shows "Reconnect" |
| BE7 | Same Google account connected twice | The unique key `(user_id, provider, account_ref)` → callback updates tokens on the existing source |
| BE8 | Shared drives | `supportsAllDrives` / `includeItemsFromAllDrives` set on every call |
| BE9 | Title rename re-embeds everything | Accepted: renames are rare, and the title in every chunk improves retrieval |
| BE10 | Token approximation (cl100k vs Gemini) | 512 approximate tokens ≪ 8,192 model limit |
| BE11 | Google Docs Markdown export quirks (escaped characters, `**bold**` headings) | Only `#`\-style headings create sections; everything else stays as content. Capture one real export as a test fixture before merge |

---

---

# Done when

- [ ] `0026` migrates clean in CI  
- [ ] Unit U1–U16 (incl. U3b) and integration I1–I18 pass in CI; no test calls Google or Gemini  
- [ ] Dust golden splitter tests (U4–U6) pass with `cl100k_base`  
- [ ] Existing Part A and older tests still pass  
- [ ] Scoped lint clean (`backend/knowledge`)  
- [ ] `THIRD_PARTY_NOTICES.md` present; ported modules carry the Dust MIT header  
- [ ] Dead `SCHEDULER_*` settings removed  
- [ ] Manual (owner): §B9 steps done, then one real "Connect Drive" → select a folder → "Sync now" on production; re-running "Sync now" shows `embedded: 0`

---

# Next (not today)

| Step | What |
| :---- | :---- |
| Polling | `_sync_sources_forever()` in `lifespan`, every 5 min, calling the same `sync_source()` for every active source |
| Retrieval | `search_knowledge(user_id, query, k, source_ids)` tool: query embedding (`RETRIEVAL_QUERY`), Dust-style grouping by document, MMR for diversity |
| Wiring | LinkedIn / Reddit / X agents call the tool |
| UI | Connect Drive button, folder picker, sync status |

