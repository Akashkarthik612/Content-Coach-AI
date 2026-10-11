# **Day 5 (Part C) — Knowledge Sync Poller (every 5 minutes)**

> Task brief for Claude Code. Read `CLAUDE.md` and `project_requirements.md` first. **Part A (knowledge store) and Part B (Drive connector \+ ingestion \+ "Sync now") are built.** Do not re-implement or redesign them. This build adds **only** the background loop that calls the existing `SyncService.sync_source()` for every due source. **Not in this build:** retrieval / `search_knowledge` tool, agent wiring, UI, new connectors.

---

## **0\. What already exists — reference only**

Read the real code before starting. If anything here differs, **the code wins**: report the difference, don't change Part A/B to match this brief.

| Piece | Where | What the poller relies on |
| ----- | ----- | ----- |
| `SyncService.sync_source(user_id, source_id) -> SyncReport` | `backend/knowledge/sync.py` | One full sync run: cursor → changes → ingest → save cursor last. Returns `already_running` when another run holds the lease |
| Run lease | `knowledge_sources.sync_lease_until`, `sync_lease_owner` | Owner-only acquire / renew / release; expires after 15 min. **The poller does not lock anything itself** |
| Source status | `knowledge_sources.status` | `active`, `paused`, `error` (and `needs_reauth` if Part B added it — see C3-D2) |
| `last_run_at` | `knowledge_sources` | Set at the end of every run |
| Connector \+ tokens | `GDriveConnector`, `CredentialStore` | Loads the encrypted Drive token and refreshes it itself. **The poller never touches tokens** |
| Background loop pattern | `backend/main.py::_purge_expired_threads_forever` | Started in `lifespan` with `asyncio.create_task`, cancelled on shutdown |
| Test rules | — | CI only (owner is on Windows); tests colocated in `backend/knowledge/tests/`; never touch Supabase; results table in the job summary |

---

## **C1. Goal**

Every 5 minutes, find the sources that are due and run `sync_source()` for each, so a change in a selected Drive folder reaches the knowledge store without anyone clicking "Sync now". The poller is a thin scheduler: it decides **when** and **which**; `sync_source()` decides **what changed** and runs the ingestion.

sequenceDiagram  
  participant L as lifespan  
  participant P as KnowledgePoller  
  participant R as KnowledgeRepository  
  participant S as SyncService  
  L-\>\>P: create\_task(poll\_forever()) if KNOWLEDGE\_SYNC\_ENABLED  
  loop every 300 s  
    P-\>\>R: list\_due\_sources(interval, batch)  
    R--\>\>P: \[(user\_id, source\_id), …\]  
    par at most 2 at a time, timeout per source  
      P-\>\>S: asyncio.to\_thread(sync\_source, user\_id, source\_id)  
      S--\>\>P: SyncReport (ok / already\_running / failed)  
    end  
    P-\>\>P: log one TickReport line  
  end  
  L-\>\>P: cancel() on shutdown

---

## **C2. Scope**

| In | Out |
| ----- | ----- |
| `backend/knowledge/poller.py` (`KnowledgePoller`) | Retrieval tool, agents, UI |
| `KnowledgeRepository.list_due_sources()` | Changes to `sync_source()` logic, the lease, the connector or the pipeline |
| `TickReport` record | Webhooks, external schedulers, Redis, Temporal |
| Start/stop in `lifespan` | Keep-alive pinging of Render (owner decides later) |
| Settings in `config.py` | Retry backoff for sources stuck in `error` |
| Migration `0027` **only if** `needs_reauth` doesn't exist yet (C3-D2) |  |
| Tests T1–T10 |  |

---

## **C3. Decisions**

| \# | Decision | Choice |
| ----- | ----- | ----- |
| C3-D1 | **Don't block the event loop.** The repository uses synchronous SQLAlchemy | Each sync runs with `await asyncio.to_thread(sync_service.sync_source, user_id, source_id)`, so API requests keep flowing during a sync. **Check first:** if `sync_source` is `async def` but calls the synchronous repository inside, stop and report it instead of wrapping it — that blocks the loop either way |
| C3-D2 | **Revoked access vs temporary errors** | The poller syncs `active` and `error` sources (transient errors retry next tick) and skips `paused` and `needs_reauth`. If Part B maps `AuthRevokedError` to plain `error`, add status `needs_reauth` (migration `0027`: extend the `status` CHECK) and map `AuthRevokedError` to it in `SyncService`. Otherwise a revoked Google token is retried every 5 minutes forever |
| C3-D3 | **One documented cross-user query** | `list_due_sources` is the only repository method without a `user_id` argument. It returns **IDs only** (no content, config or tokens). Each run then calls the fully scoped `sync_source(user_id, source_id)`. Comment it and test it (T9) |
| C3-D4 | **Concurrency** | `asyncio.Semaphore(KNOWLEDGE_SYNC_MAX_CONCURRENCY)` \= 2: the Render instance is small and Supabase's pool is shared |
| C3-D5 | **Timeout** | `asyncio.wait_for(..., KNOWLEDGE_SYNC_SOURCE_TIMEOUT_SECONDS)` \= 600\. On timeout the tick moves on; the worker thread can't be killed and finishes in the background, and the **lease** stops the next tick from starting a second run on that source |
| C3-D6 | **Due rule** | `status IN ('active','error')` **and** (`last_run_at IS NULL` or older than the interval) **and** (lease free or expired). The lease filter only avoids pointless calls; `sync_source` still enforces it |
| C3-D7 | **Ordering and cap** | `ORDER BY last_run_at NULLS FIRST LIMIT KNOWLEDGE_SYNC_BATCH_SIZE` (= 50): never-synced first, then oldest, bounded per tick |
| C3-D8 | **Time source** | All time comparisons use the database's `now()` (same as the lease SQL), never the app clock, so app/DB clock skew can't matter |
| C3-D9 | **Multiple app instances** | Safe: two pollers may pick the same source, but only one gets the lease; the other gets `already_running` (counted as `skipped_locked`) |
| C3-D10 | **Render free tier sleeping** | Accepted. While asleep, nothing polls; on wake, the next tick reads the saved cursor and catches up on every change. Nothing is lost, only delayed |
| C3-D11 | **No silent failures** | One structured `TickReport` log line per tick. Per-source failures logged with `user_id`, `source_id`, error class. An exception inside a tick is caught and logged; the loop continues |

---

## **C4. LLD**

### **C4.1 Data class (`backend/knowledge/records.py`)**

| Class | Fields |
| ----- | ----- |
| `TickReport` | `tick_id: UUID, started_at, duration_ms, due, ran, ok, skipped_locked, failed, timed_out` |

### **C4.2 `KnowledgePoller` (`backend/knowledge/poller.py`)**

Pattern: thin scheduler over the existing coordinator. `run_tick()` (one pass, fully testable) is separate from `poll_forever()` (the infinite loop), like `_purge_expired_threads_forever`.

| Member | Behaviour |
| ----- | ----- |
| `__init__(session_factory, sync_service, settings)` | `session_factory` opens a short DB session for `list_due_sources` |
| `async run_tick() -> TickReport` | 1\. `due = await to_thread(list_due_sources, …)`. 2\. `asyncio.gather` of `_run_one()` for each, under the semaphore. 3\. Count outcomes, log one line, return the report |
| `async _run_one(user_id, source_id) -> Outcome` | `wait_for(to_thread(sync_source, …), timeout)` → map `SyncReport` to `ok` / `skipped_locked` / `failed`; `TimeoutError` → `timed_out`; any other exception → `failed` (logged, never re-raised) |
| `async poll_forever()` | `sleep(KNOWLEDGE_SYNC_FIRST_RUN_DELAY_SECONDS)`, then loop: `run_tick()` inside `try/except Exception` (log, continue), `sleep(interval)`. `CancelledError` propagates for a clean shutdown |

### **C4.3 Repository addition (`backend/knowledge/repository.py`)**

\-- list\_due\_sources(interval\_seconds, limit) \-\> list\[(user\_id, source\_id)\]  
\-- The ONLY repository query without user\_id. Returns IDs only.  
SELECT user\_id, id  
  FROM knowledge\_sources  
 WHERE status IN ('active', 'error')  
   AND (last\_run\_at IS NULL OR last\_run\_at \< now() \- make\_interval(secs \=\> :interval\_seconds))  
   AND (sync\_lease\_until IS NULL OR sync\_lease\_until \< now())  
 ORDER BY last\_run\_at NULLS FIRST  
 LIMIT :limit;

Index `ix_knowledge_sources_due ON knowledge_sources (status, last_run_at)`: add it in `0027` if that migration is created; otherwise skip (the table is tiny at prototype scale).

### **C4.4 `lifespan` (`backend/main.py`)**

| Step | Change |
| ----- | ----- |
| Startup | If `settings.KNOWLEDGE_SYNC_ENABLED`: build `KnowledgePoller` and `poller_task = asyncio.create_task(poller.poll_forever())` next to the existing `purge_task` |
| Shutdown | Cancel `poller_task` in the existing `finally` block, alongside `purge_task` |

### **C4.5 Settings (`backend/core/config.py`)**

| Setting | Default | Notes |
| ----- | ----- | ----- |
| `KNOWLEDGE_SYNC_ENABLED` | `True` | CI and tests set `False` |
| `KNOWLEDGE_SYNC_INTERVAL_SECONDS` | `300` | Same as Dust's `GDRIVE_INCREMENTAL_SYNC_INTERVAL_MS` |
| `KNOWLEDGE_SYNC_MAX_CONCURRENCY` | `2` |  |
| `KNOWLEDGE_SYNC_SOURCE_TIMEOUT_SECONDS` | `600` | Shorter than the 15-min lease |
| `KNOWLEDGE_SYNC_BATCH_SIZE` | `50` |  |
| `KNOWLEDGE_SYNC_FIRST_RUN_DELAY_SECONDS` | `30` | Let startup finish |

### **C4.6 Cost and complexity**

| Situation | Cost |
| ----- | ----- |
| Tick with nothing due | 1 indexed query, no external calls |
| Due source, no Drive changes | 1 `changes.list` call; 0 downloads; 0 embeddings |
| Due source with changes | As Part B: downloads and embeddings for changed content only |
| Memory | At most 2 syncs at once |

---

## **C5. Files**

| File | Change |
| ----- | ----- |
| `backend/knowledge/poller.py` | New: `KnowledgePoller` |
| `backend/knowledge/records.py` | \+ `TickReport` |
| `backend/knowledge/repository.py` | \+ `list_due_sources` |
| `backend/main.py` | Start/cancel the poller in `lifespan` |
| `backend/core/config.py` | \+ C4.5 settings |
| `backend/alembic/versions/0027_add_needs_reauth_status.py` | **Only if needed** (C3-D2): extend `status` CHECK \+ due index |
| `backend/knowledge/sync.py` | **Only if needed** (C3-D2): map `AuthRevokedError` → `needs_reauth` |
| `backend/knowledge/tests/test_poller.py`, `test_due_sources.py` | Tests from C6 |
| `.github/workflows/ci.yml` | `KNOWLEDGE_SYNC_ENABLED=false` for test jobs |
| `CLAUDE.md` | One line in the knowledge section: "Poller in `lifespan` calls `sync_source` every 5 min for due sources" |

---

## **C6. Tests (CI only, colocated)**

Unit tests use a fake `SyncService` (records calls; configurable result, delay or exception). Integration tests use the `db` fixture. No test calls Google or Gemini.

| \# | Type | Test | Proves |
| ----- | ----- | ----- | ----- |
| T1 | Integration | Sources: due `active`, due `error`, not-due `active`, `paused`, `needs_reauth`, leased → `list_due_sources` returns only the first two | Due rule |
| T2 | Integration | Never-synced source listed before an old one; `LIMIT` respected | Ordering and cap |
| T3 | Unit | 3 due sources, one raises → the other two still run; `failed=1, ok=2` | Isolation |
| T4 | Unit | 5 due sources with a slow fake → never more than 2 running at once | Semaphore |
| T5 | Unit | Fake exceeds the timeout → `timed_out=1`; tick completes | Timeout |
| T6 | Unit | Fake returns `already_running` → `skipped_locked=1` | Lease respected |
| T7 | Unit | `run_tick` raises once → `poll_forever` logs it and runs the next tick (patched sleep, 2 ticks) | Loop survives |
| T8 | Unit | `KNOWLEDGE_SYNC_ENABLED=False` → no poller task; `True` → task created, then cancelled on shutdown | Wiring |
| T9 | Integration | Two users' sources due → result is only `(user_id, source_id)` tuples; `sync_source` called with the matching `user_id` for each | Cross-user query is ID-only and scoped downstream |
| T10 | Integration | `AuthRevokedError` during a sync → source becomes `needs_reauth` and is not due next tick (only if C3-D2 applies) | Revoked access stops retries |

---

## **C7. Second-brain check**

| \# | Edge case | Handling |
| ----- | ----- | ----- |
| CE1 | Deploy during a sync | Task cancelled; the worker thread dies with the process; the lease expires; cursor not advanced → next tick replays cheaply |
| CE2 | "Sync now" and the poller at the same moment | One gets the lease, the other gets `already_running` |
| CE3 | Thousands of sources later | Batch cap \+ ordering keep each tick bounded; scaling out is a later concern |
| CE4 | A source stuck in `error` (e.g. Drive keeps returning 500\) | Retried every 5 min with `last_error` visible; acceptable for the prototype |
| CE5 | Tests accidentally start the real poller | `KNOWLEDGE_SYNC_ENABLED=false` in the CI env and the test settings |

---

# **Done when**

* \[ \] T1–T9 pass in CI (and T10 if C3-D2 applied); results table in the job summary  
* \[ \] Existing Part A/B and older tests still pass  
* \[ \] Scoped lint clean (`backend/knowledge`)  
* \[ \] On production: edit a doc in a selected Drive folder, wait ≤ 5 min (instance awake), and the change is in `knowledge_chunks` without clicking "Sync now"; the log shows one `TickReport` per tick

---

# **Next (not today)**

| Step | What |
| ----- | ----- |
| Retrieval tool | `search_knowledge(user_id, query, k, source_ids)` as a **tool any agent can use** (not only LinkedIn/Reddit/X): query embedding (`RETRIEVAL_QUERY`), per-user vector search, group by document, MMR |
| Wiring | Agents register the tool |
| UI | Connect Drive, folder picker, sync status |

