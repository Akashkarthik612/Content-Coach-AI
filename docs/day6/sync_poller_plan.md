# Day 6 — Knowledge Sync Poller: LLD plan

> Implements `Day_6.md` (Part C) as **`backend/knowledge/sync_poller.py`**. The brief calls it `poller.py`; the module is
> renamed and the class is `SyncPoller`. Every place below where the code disagrees with the brief follows the code
> (brief §0) and says so.

---

## 1. Where the brief and the code disagree

| # | Brief assumes | Code actually does | Effect on the plan |
|---|---|---|---|
| G1 | `sync_source(user_id, source_id)` is synchronous, so the poller wraps it in `to_thread` | `async def sync_source(self, db, user_id, source_id)`, and every repository call inside already goes through `asyncio.to_thread` (`_db`). The connector uses `httpx.AsyncClient`; the pipeline puts the splitter in a thread | **No `to_thread` around it.** The poller `await`s it directly and opens one `SessionLocal()` per source. C3-D1's "stop and report" clause doesn't apply: the loop is never blocked |
| G2 | The worker thread can't be killed, so `wait_for` just moves on | Because `sync_source` is a coroutine, `wait_for` **cancels** it. If the cancel lands while a `to_thread` DB call is still running, the `finally` (`release_sync_lease`) runs on the **same `Session` from a second thread** | **Don't cancel on timeout.** Run each sync as its own task and use `asyncio.wait({task}, timeout=…)`. A run that times out is counted `timed_out` and keeps running as a tracked straggler (§4.3) |
| G3 | `AuthRevokedError` may already map to a separate status | It maps to outcome `auth_revoked`, then `update_source_cursor(ok=False)` sets `status='error'` | **C3-D2 applies.** We need migration `0027` (`needs_reauth`) and a small change in `SyncService` |
| G4 | — | ~~Reconnect leaves `needs_reauth` stuck~~ **Wrong, found while implementing:** `save_credentials` already sets every non-paused source back to `active` on reconnect | No router change and no `reactivate_source`. `needs_reconnect` in `SourceOut` now reads `status == 'needs_reauth'` |
| G5 | Every outcome updates `last_run_at` | `nothing_selected`, `paused`, `already_running`, `lease_lost` and `source_missing` return **without** `_record`, so `last_run_at` isn't touched | A freshly connected source with no folders picked stays `last_run_at IS NULL`. It sorts first **every tick** and can fill the batch. **The due query filters out sources with nothing selected** (§5.1) |
| G6 | Outcomes are only `ok` / `already_running` / `failed` | `SyncOutcome` has 9 values | Explicit mapping table (§4.4), plus a `skipped` counter on `TickReport` |

---

## 2. Scope

| In | Out |
|---|---|
| `backend/knowledge/sync_poller.py`: `SyncPoller`, `PollerSettings`, `build_sync_poller`, `start_sync_poller` | Retrieval / `search_knowledge`, agent wiring, UI |
| `records.py`: `TickReport`, `DueSource`, `TickOutcome` | Any change to the pipeline, connector, lease or cursor logic |
| `repository.py`: `list_due_sources`, `mark_needs_reauth` (+ the `KnowledgeStore` protocol) | Retry backoff for `error` sources, webhooks, Redis, Temporal |
| `sync.py`: `auth_revoked` → `mark_needs_reauth` (G3) | Render keep-alive pinging |
| `router.py`: `needs_reconnect` from the status | |
| Migration `0027_add_needs_reauth_status.py` (CHECK + due index) | |
| `main.py` lifespan start/stop; 6 settings in `config.py`; CI env; root `conftest.py` default | |
| Tests T1–T15 in `backend/knowledge/tests/` | |

---

## 3. Classes

### 3.1 Creational: how the parts get built

| Class / function | File | Pattern | Responsibility | Key members |
|---|---|---|---|---|
| `PollerSettings` (frozen dataclass) | `sync_poller.py` | Value object + factory classmethod | Freezes the six `KNOWLEDGE_SYNC_*` settings once, so tests pass plain values instead of patching global `settings` | `interval_s`, `max_concurrency`, `source_timeout_s`, `batch_size`, `first_run_delay_s`, `enabled`; `from_settings(settings) -> PollerSettings` |
| `build_sync_poller()` | `sync_poller.py` | Factory function (same style as `default_sync_service()`) | Assembles the production poller: `SessionLocal`, `KnowledgeRepository`, `default_sync_service()`, `PollerSettings.from_settings(settings)` | `-> SyncPoller` |
| `start_sync_poller(cfg, build=build_sync_poller)` / `stop_sync_poller(started)` | `sync_poller.py` | Factory function with a guard | Returns `None` when `enabled=False`; otherwise builds the poller and returns `(poller, asyncio.create_task(poller.poll_forever()))`. `stop_sync_poller` cancels the loop, then `poller.stop()`. Keeps `lifespan` to two lines and lets T8 test the wiring without booting the app | `-> tuple[SyncPoller, Task] \| None` |
| `default_sync_service()` (exists) | `sync.py` | Factory function | Reused unchanged | `-> SyncService` |

### 3.2 Structural: data shapes and the seams between parts

| Class / member | File | Pattern | Responsibility | Fields / signature |
|---|---|---|---|---|
| `DueSource` (`NamedTuple`) | `records.py` | ID-only projection | The only thing the cross-user query returns: no content, config or tokens (C3-D3) | `user_id: UUID`, `source_id: UUID` |
| `TickOutcome` (`Literal`) | `records.py` | Closed set | What the poller made of one source | `"ok" \| "skipped_locked" \| "skipped" \| "failed" \| "timed_out"` |
| `TickReport` (frozen dataclass) | `records.py` | Value object | One per tick, logged as one line, asserted in tests | `tick_id: UUID`, `started_at: datetime`, `duration_ms: int`, `due`, `ran`, `ok`, `skipped_locked`, `skipped`, `failed`, `timed_out`, `stragglers: int` |
| `KnowledgeRepository.list_due_sources(db, interval_s, limit)` | `repository.py` | Repository; **the only method without `user_id`** | Due rule + ordering + cap (§5.1). The docstring says why it's cross-user and that it returns IDs only | `-> list[DueSource]` |
| `KnowledgeRepository.mark_needs_reauth(db, user_id, source_id, error)` | `repository.py` | Repository | Sets `status='needs_reauth'` (paused stays paused), `last_error`, `last_run_at=now()`. The cursor is kept | `-> None`; raises `SourceNotFoundError` |
| `KnowledgeStore` protocol | `repository.py` | Port | Gains the two methods above, so fakes keep type-checking | — |

### 3.3 Behavioral: who decides what, and when

| Class / member | File | Pattern | Behaviour |
|---|---|---|---|
| `SyncPoller` | `sync_poller.py` | Scheduler over the existing coordinator (thin; decides **when** and **which**, never **what**) | Holds `_session_factory`, `_store`, `_sync`, `_cfg`, `_slots: asyncio.Semaphore`, `_stragglers: set[Task]` |
| `SyncPoller.run_tick() -> TickReport` | ″ | Template method (one testable pass) | 1. `due = await to_thread(_list_due)` in a short session. 2. `gather(*(_run_one(d) for d in due))`. 3. Count outcomes, log one line, return the report. Ticks never overlap |
| `SyncPoller._run_one(due) -> TickOutcome` | ″ | Bulkhead + timeout without cancelling | `await _slots.acquire()` → `task = create_task(_sync_with_session(due))` → `task.add_done_callback(release slot)` → `done, _ = await asyncio.wait({task}, timeout)`. Done → `_classify(task)`. Not done → add to `_stragglers`, return `timed_out` (§4.3) |
| `SyncPoller._sync_with_session(due) -> SyncReport` | ″ | Unit of work | `with self._session_factory() as db: return await self._sync.sync_source(db, due.user_id, due.source_id)`. One session per source, never shared |
| `SyncPoller._classify(task) -> TickOutcome` | ″ | Mapping table (§4.4) | An exception from the task becomes `failed` and is logged with `user_id`, `source_id` and the error class. It is never re-raised |
| `SyncPoller.poll_forever()` | ″ | Fixed-rate loop (same shape as `_purge_expired_threads_forever`) | `sleep(first_run_delay)`, then loop: `try: run_tick() except Exception: log`, then `sleep(max(0, interval − elapsed))`. `CancelledError` propagates |
| `SyncPoller.stop(grace_s=5)` | ″ | Graceful shutdown | Cancel the stragglers, `wait(…, timeout=grace_s)`. Called from `lifespan`'s `finally` after `poller_task.cancel()` |
| `SyncService` (existing; one change) | `sync.py` | Coordinator | In `_run`, when the outcome is `auth_revoked`, call `mark_needs_reauth` instead of `_record(ok=False)`. Nothing else changes |
| Run lease (existing) | `repository.py` | Mutual exclusion | Unchanged. It is what makes multi-instance, "Sync now" + poller, and straggler overlap safe |

---

## 4. Runtime behaviour

### 4.1 Tick flow

```
lifespan ── start_sync_poller() ──► poll_forever()
                                       │ sleep 30 s
                                       ▼
                                ┌─ run_tick() ─────────────────────────────────────────┐
                                │ to_thread(list_due_sources)  ── 1 indexed query       │
                                │ gather(_run_one × due)                                │
                                │    ├─ acquire slot (≤ 2)                              │
                                │    ├─ task: new Session → await sync_source(db,u,s)   │
                                │    └─ wait(task, 600 s) → ok / skipped / failed / ⏱   │
                                │ log 1 TickReport line                                 │
                                └───────────────────────────────────────────────────────┘
                                       │ sleep(max(0, 300 − elapsed))
                                       └─► next tick          (shutdown: cancel + stop())
```

### 4.2 Concurrency invariants

| # | Invariant | Enforced by |
|---|---|---|
| I1 | At most `max_concurrency` (2) poller-started syncs are alive at once, **stragglers included** | The slot is released by the task's done-callback, not when the tick stops waiting |
| I2 | At most one sync run per source, across instances and "Sync now" | Existing lease (`acquire_sync_lease`) |
| I3 | Ticks never overlap | `poll_forever` awaits `run_tick` before sleeping |
| I4 | A `Session` is only used by one task, and never from two threads at once | One session per `_sync_with_session`; no cancellation on timeout (G2) |
| I5 | Time comparisons use the database clock | `now()` in SQL; `time.monotonic()` only for `duration_ms` and the sleep calculation |

### 4.3 Timeout and stragglers

When `asyncio.wait` returns with the task still pending, the outcome is `timed_out`. The task keeps running in `_stragglers` and still holds its slot (I1), so the next tick may get fewer slots. That is the safe direction: memory and the DB pool stay bounded. The lease (renewed after every file) blocks a second run of that source. When the straggler finishes, its own `sync_source` records the result and logs it. Each Drive/Gemini HTTP call has its own timeout, so a straggler can't hang forever.

### 4.4 Outcome mapping

| `SyncReport.outcome` | `TickOutcome` | Note |
|---|---|---|
| `ok` | `ok` | |
| `already_running`, `lease_lost` | `skipped_locked` | Another run owns the source |
| `paused`, `nothing_selected`, `source_missing`, `source_deleted` | `skipped` | Rare, since the due query already filters these. Happens when state changed between the query and the run |
| `transient_error`, `auth_revoked` | `failed` | `sync_source` already logged the details and recorded them on the source |
| exception escapes `sync_source` | `failed` | Logged here with `user_id`, `source_id`, error class |
| still running at timeout | `timed_out` | Becomes a straggler (§4.3) |

Log line (WARNING if `failed` or `timed_out` > 0, else INFO; matches the `knowledge sync …` style):
`knowledge poll tick_id=… due=… ran=… ok=… skipped_locked=… skipped=… failed=… timed_out=… stragglers=… duration_ms=…`

---

## 5. Data layer

### 5.1 `list_due_sources` (C3-D6/D7, plus the G5 filter)

```sql
-- The ONLY knowledge query without user_id. Returns IDs only; each run is
-- then scoped by sync_source(user_id, source_id).
SELECT user_id, id
  FROM knowledge_sources
 WHERE status IN ('active', 'error')
   AND (jsonb_array_length(coalesce(config->'folder_ids', '[]')) > 0
        OR jsonb_array_length(coalesce(config->'file_ids', '[]')) > 0)
   AND (last_run_at IS NULL OR last_run_at < now() - make_interval(secs => :interval_s))
   AND (sync_lease_until IS NULL OR sync_lease_until < now())
 ORDER BY last_run_at NULLS FIRST, id          -- id: stable tie-break for tests
 LIMIT :limit;
```

### 5.2 Migration `0027_add_needs_reauth_status`

| Step | Upgrade | Downgrade |
|---|---|---|
| CHECK | Drop `ck_knowledge_sources_status`, recreate with `('active','paused','error','needs_reauth')` | `UPDATE … SET status='error' WHERE status='needs_reauth'`, then restore the 3-value CHECK |
| Index | `ix_knowledge_sources_due ON knowledge_sources (status, last_run_at)` | Drop it |
| Model | Mirror both in `models.py` `__table_args__` | — |

### 5.3 Status transitions (after this build)

| From | Event | To |
|---|---|---|
| `active` / `error` | Successful run | `active` (existing) |
| `active` / `error` | Transient failure | `error`, retried next tick (existing) |
| `active` / `error` | `AuthRevokedError` | **`needs_reauth`**, no longer due |
| `needs_reauth` | User reconnects the same Google account (`/sources/gdrive/complete`) | **`active`** (existing `save_credentials`); due once the interval since its last run has passed |
| `needs_reauth` | "Sync now" with a still-revoked token, or any failed run | Stays `needs_reauth` (`update_source_cursor` keeps it on failure) |
| `paused` | Anything | `paused` (existing `case` guards, kept in `mark_needs_reauth`) |

---

## 6. Settings and wiring

| Setting (`config.py`) | Default | Notes |
|---|---|---|
| `KNOWLEDGE_SYNC_ENABLED` | `True` | `false` in CI workflow `env` and as a `setdefault` in the root `conftest.py` (CE5) |
| `KNOWLEDGE_SYNC_INTERVAL_SECONDS` | `300` | Dust's Drive incremental interval |
| `KNOWLEDGE_SYNC_MAX_CONCURRENCY` | `2` | Small Render instance, shared Supabase pool |
| `KNOWLEDGE_SYNC_SOURCE_TIMEOUT_SECONDS` | `600` | How long a tick waits for one run. Not tied to the lease: a timed-out run isn't cancelled, and the lease is renewed after every file |
| `KNOWLEDGE_SYNC_BATCH_SIZE` | `50` | |
| `KNOWLEDGE_SYNC_FIRST_RUN_DELAY_SECONDS` | `30` | Let startup finish |

`lifespan`: `sync_poller = start_sync_poller(PollerSettings.from_settings(settings))` next to `purge_task`. In `finally`: `purge_task.cancel()`, then `await stop_sync_poller(sync_poller)`.

HTTP timeouts (added while implementing): `DriveClient` and `GeminiEmbedder` both use `httpx.Timeout(connect=10, read=60, write=60, pool=10)` explicitly (they had a flat 30 s before; neither ever disabled the default). `read` is per chunk received, not the whole call.

---

## 7. Edge cases

| # | Case | Handling |
|---|---|---|
| CE1 | Deploy (SIGTERM) during a sync | `stop()` cancels the run. At worst the lease release fails, and it expires in ≤ 15 min. The cursor wasn't advanced, so the next run replays cheaply (unchanged files skip on `modifiedTime`) |
| CE2 | "Sync now" and the poller at the same moment | One gets the lease; the other reports `already_running` → `skipped_locked`. Note: "Sync now" runs outside the poller's slots, so total runs can briefly reach 3 |
| CE3 | Thousands of sources | Batch cap + `last_run_at` ordering give round-robin fairness; each tick is bounded. Scaling out comes later |
| CE4 | Source stuck in `error` (Drive keeps returning 5xx) | Retried every tick with `last_error` visible. Its `last_run_at` moves to the back of the queue, so it can't starve the others |
| CE5 | Tests start the real poller by accident | `KNOWLEDGE_SYNC_ENABLED=false` in CI env + root conftest default |
| CE6 | Revoked Google token | `needs_reauth`, so it stops being polled. Reconnecting brings it back (G3, G4) |
| CE7 | Source connected, no folders picked yet | Filtered out of the due query, so it never fills the batch (G5) |
| CE8 | Source deleted between the query and the run | `source_missing` / `source_deleted` → `skipped` |
| CE9 | Selection changed mid-run | Existing logic keeps the cursor cleared, so the next tick does a full listing + GC |
| CE10 | A slow tick (> 300 s) | Fixed-rate sleep `max(0, interval − elapsed)`; the next tick starts right away and still never overlaps (I3) |
| CE11 | Sync hangs past the timeout | Straggler keeps its slot and lease, the tick finishes, and stragglers are counted in the report (§4.3) |
| CE12 | `list_due_sources` itself fails (DB blip) | `run_tick` raises, `poll_forever` logs it and tries again next interval |
| CE13 | Two app instances / multiple workers | Both may list the same source; the lease admits one (C3-D9) |
| CE14 | Render free tier asleep | Nothing polls while asleep. On wake, the saved cursor catches up with every change. Delayed, not lost (C3-D10) |

---

## 8. Tests (CI only, colocated in `backend/knowledge/tests/`)

Unit tests use a `FakeSyncService` (records calls; result, delay or exception per source) and a fake session factory. Integration tests use the `db` / `make_user` fixtures. No Google or Gemini calls.

| # | File | Type | Test | Proves |
|---|---|---|---|---|
| T1 | `test_due_sources.py` | Integration | Due `active`, due `error`, not-due, `paused`, `needs_reauth`, leased → only the first two | Due rule |
| T2 | ″ | Integration | Never-synced before old; `LIMIT` respected | Ordering + cap |
| T3 | `test_sync_poller.py` | Unit | 3 due, one raises → `ok=2, failed=1` | Isolation |
| T4 | ″ | Unit | 5 due, slow fake → never more than 2 alive at once (stragglers included) | Semaphore (I1) |
| T5 | ″ | Unit | Fake exceeds timeout → `timed_out=1`, tick returns, task **not cancelled**, slot freed when it ends | Timeout (G2) |
| T6 | ″ | Unit | `already_running` / `lease_lost` → `skipped_locked` | Lease respected |
| T7 | ″ | Unit | `run_tick` raises once → `poll_forever` logs and runs tick 2 (patched sleep) | Loop survives |
| T8 | ″ | Unit | `enabled=False` → `start_sync_poller` returns `None`; `True` → task created, then cancelled + `stop()` | Wiring |
| T9 | `test_due_sources.py` | Integration | Two users due → results are `DueSource` IDs only; fake `sync_source` gets the matching `user_id` | Cross-user query is ID-only |
| T10 | `test_sync.py` | Integration | `AuthRevokedError` → `needs_reauth`, not due next tick | Revoked access stops retries |
| T11 | `test_due_sources.py` | Integration | Active source with empty `config` → not due | G5 |
| T12 | `test_router.py` | Integration | Existing reconnect test, now starting from `mark_needs_reauth`: `needs_reconnect` true, then `active` after reconnect | G4 |
| T13 | `test_sync_poller.py` | Unit | Tick taking 200 s → next sleep is 100 s; taking 400 s → 0 | Fixed rate (CE10) |
| T14 | `test_migration.py` | Integration | `0027` up/down round-trip; `needs_reauth` rows become `error` on downgrade | Migration |
| T15 | `test_sync_poller.py` | Unit | Real `SyncService` + `DriveClient` against a local socket that never answers (read timeout patched to 0.2 s) → `TransientConnectorError`, run recorded as failed, lease released, slot freed, no straggler | HTTP timeout ends a hung run |

---

## 9. Files

| File | Change |
|---|---|
| `backend/knowledge/sync_poller.py` | **New**: `PollerSettings`, `SyncPoller`, `build_sync_poller`, `start_sync_poller` |
| `backend/knowledge/records.py` | + `DueSource`, `TickOutcome`, `TickReport` |
| `backend/knowledge/repository.py` | + `list_due_sources`, `mark_needs_reauth` (+ protocol); failed runs keep `needs_reauth` |
| `backend/knowledge/models.py` | CHECK + due index mirrored |
| `backend/knowledge/sync.py` | `auth_revoked` → `mark_needs_reauth` |
| `backend/knowledge/router.py` | `needs_reconnect` from the status |
| `backend/knowledge/connectors/gdrive.py`, `embedder.py` | Explicit `httpx.Timeout` (connect 10 s, read 60 s) |
| `tests/smoke/serve.py` | `KNOWLEDGE_SYNC_ENABLED=false` |
| `backend/alembic/versions/0027_add_needs_reauth_status.py` | **New** |
| `backend/core/config.py` | + 6 settings |
| `backend/main.py` | Start/stop in `lifespan` |
| `conftest.py`, `.github/workflows/ci.yml` | `KNOWLEDGE_SYNC_ENABLED=false` |
| `backend/knowledge/tests/test_sync_poller.py`, `test_due_sources.py` (+ additions to `test_sync`, `test_router`, `test_migration`) | T1–T15 |
| `CLAUDE.md` | Head `0027`; `needs_reauth`; one line: "`SyncPoller` in `lifespan` calls `sync_source` every 5 min for due sources"; Step 2 status |

Frontend follow-up (not this build): `KnowledgeView`'s status type is `'active'|'paused'|'error'`. Add `needs_reauth` → "Reconnect" when the UI is wired.

---

## Done when

- [ ] T1–T15 pass in CI; results table in the job summary
- [ ] Existing Part A/B and older tests still pass; scoped lint clean
- [ ] Production: edit a doc in a selected folder; within ≤ 5 min (instance awake) the change is in `knowledge_chunks` without "Sync now", and the logs show one `knowledge poll` line per tick
