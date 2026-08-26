# Content Coach — Project State
> Living reference for Claude. This file describes only the current state of the code — no changelog, no history. When architecture, decisions, or status change, edit the relevant section in place; do not append a dated entry.
> **UI/Frontend state:** see [claude_ui.md](claude_ui.md) for the frontend component map, design tokens, and page-by-page breakdown.
> Last updated: 2026-08-26

---

## Operational Guardrails & Architecture Rules

> **Strict Rules for Claude Code Architecture:**
> * **LLD & SOLID:** Adhere strictly to SDE-grade Low-Level Design. Every module must follow the Single Responsibility Principle (SRP). No monolithic service functions.
> * **Dependency Inversion:** Always pass dependencies (like `db: Session` or config objects) explicitly via constructors or FastAPI dependency injection — never import globals mid-function.
> * **Encapsulation & Typing:** Enforce strict Python type hinting throughout. Use Pydantic schemas at all data boundaries; keep internal domain logic encapsulated in service classes.
> * **Design Patterns over Nested Logic:** When scaling `helper.py` or managing complex post states, favor clean patterns (Strategy, Factory) over deeply nested if/else.

---

## What This Product Is

"Git for writing" — version-controlled LinkedIn/Medium post library. Users create folders, write posts, save named versions. An AI layer of specialized agents performs independent tasks to help users research, draft, and refine content, querying the user's own post history along the way.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router v6, Axios |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) + inline styles/JS-const design tokens (see [claude_ui.md](claude_ui.md)) |
| Icons | lucide-react |
| Backend | FastAPI + Uvicorn |
| ORM | SQLAlchemy |
| Database | PostgreSQL + pgvector |
| Migrations | Alembic (head: `0020_add_weekly_post_target_to_profile`) |
| Auth | Supabase JWT (default, `AUTH_PROVIDER=supabase`) — prod. Isolated local dev fallback (`AUTH_PROVIDER=local`, `backend/auth_local/`) — bcrypt direct (`bcrypt.hashpw`/`checkpw`), **no passlib** (incompatible with bcrypt ≥ 4.0), `X-User-Id` header. See Authentication Flow. |
| AI / RAG | LangChain, LangGraph, Google Gemini API |
| Embeddings | `models/gemini-embedding-001` — 768 dims (`output_dimensionality=768`) |
| LLM (supervisor) | `gemini-3.5-flash-lite` · temp `0.0` · `thinking_level="low"` · `max_output_tokens=2048` |
| LLM (writer) | `gemini-3.6-flash` · temp `0.7` · `thinking_level="low"` · `max_output_tokens=8192` · `streaming=True` |
| LLM (researcher — angle generation) | `gemini-3.6-flash` · temp `0.7` · `thinking_level="high"` (deliberate — needs real reasoning depth) · `max_output_tokens=8192` |
| LLM (style analyzer) | `gemini-3.1-flash-lite` · temp `0.1` · `thinking_level` not set · `max_output_tokens=1024` |
| LLM resilience | `backend/ai/llm_retry.py` — `invoke_with_retry`/`invoke_with_retry_sync`, tenacity exponential backoff (1–10s, up to 3 attempts) on Gemini 429/503/504 `ClientError`/`ServerError` only; other failures raise immediately. No key-rotation fallback exists in the codebase. |
| Web search (researcher) | Tavily (`tavily-python`) — `tools.py`'s `web_search`, `search_depth="basic"`, 4 results max, no per-user rate limit (see Known Gaps) |
| Checkpointing | `AsyncPostgresSaver` (`langgraph-checkpoint-postgres`) — durable per-thread state, survives a process restart; ownership tracked in a separate `thread_registry` table |
| Long-term memory | `AsyncPostgresStore` — backs the `chat_sessions` namespace (7-day TTL, `refresh_on_read=True`, hourly sweep) via `session_memory_store.py`'s `SessionMemoryService`; semantically indexes session titles only (`gemini-embedding-001`, 768 dims), never message/draft content |
| Tracing | LangSmith (`linkedin-coach-rag` project) — `backend/core/config.py` calls `load_dotenv()` before constructing `Settings()`, so `.env`'s `LANGCHAIN_TRACING_V2`/`LANGSMITH_API_KEY`/`LANGCHAIN_PROJECT` reach `os.environ`, which is what LangSmith's SDK reads directly |

---

## Directory Map

```
f:\My_first_product\
├── .env                          ← NEVER COMMIT
├── .env.example
├── requirements.txt · alembic.ini
├── CLAUDE.md · claude_ui.md · DEVELOPMENT.md
│
├── backend/
│   ├── main.py                   ← FastAPI app. CORS `allow_origins` (hardcoded): localhost:5173, localhost, localhost:80, the deployed CloudFront URL. Mounts vault/ai/linkedin/profile/analytics/auth routers always; `auth_local.router` only when `AUTH_PROVIDER=="local"`. `lifespan`: opens `AsyncPostgresSaver` + `AsyncPostgresStore`, calls `.setup()` on both + `store.start_ttl_sweeper()`, compiles the graph once via `build_assistant(checkpointer, store)` onto `app.state.assistant`, stashes the store on `app.state.store`, registers the compiled graph with `assistant_registry.set_assistant()`; also starts/stops `scheduler.service.SchedulerService` (`app.state.scheduler`) when `settings.SCHEDULER_ENABLED`. `GET /health` (no auth).
│   ├── auth/                     ← Supabase-backed (prod default)
│   │   ├── base_auth.py          ← `BaseAuthProvider` ABC (`verify_token(token) -> AuthenticatedUser`); `AuthenticatedUser` dataclass
│   │   ├── models.py              ← `User` (id UUID PK, username/email nullable unique, password_hash nullable, created_at)
│   │   ├── schemas.py             ← `AvailabilityResponse{username_available, email_available}`
│   │   ├── service.py             ← `SupabaseAuth(BaseAuthProvider)` — JWKS verify via `PyJWKClient` (module-level singleton, `cache_keys=True`), ES256, audience `"authenticated"`. `UserSyncService.get_or_create()` — shadow-provisions a `User` row on first sight of a Supabase identity, and self-heals `email`/`username` from the JWT on every subsequent call (diffs against the stored row, commits email/username separately so one colliding field can never block the other). Never lets a `uq_users_username` collision raise upward — on insert it retries with `username=None`, on self-heal it rolls back and keeps the previously-stored username — because this runs inside `get_current_user()`, a dependency resolved before *every* authenticated route, so a raised exception here 500s the user's entire session, not just one endpoint. `AuthAvailabilityService.check(db, username, email)` — two existence `SELECT`s, backs the pre-signup availability check
│   │   └── router.py              ← `GET /api/auth/availability?username=&email=` → `AvailabilityResponse` — public, no auth dependency. Mounted unconditionally (unlike `auth_local`'s router, coexists under the same `/api/auth` prefix since paths don't overlap)
│   ├── auth_local/                ← Dev-only, isolated from `auth/`; mounted only when `AUTH_PROVIDER=local`
│   │   ├── schemas.py             ← RegisterRequest, LoginRequest, AuthResponse
│   │   ├── service.py             ← `PasswordAuth` (bcrypt `hashpw`/`checkpw`, standalone — not a `BaseAuthProvider`) · `LocalUserService(db)` — register (409 on taken username/email) / login (matches `username` OR `email`, mints its own `uuid.uuid4()` id)
│   │   └── router.py              ← POST /api/auth/register · /login
│   ├── vault/
│   │   ├── models.py              ← Folder, Post, PostVersion, PostTag, PostPublishLog
│   │   ├── schemas.py             ← All Pydantic request/response models
│   │   ├── service.py             ← Business logic; all queries scoped to user_id
│   │   └── router.py              ← /api/vault/* — all require auth
│   ├── profile/
│   │   ├── models.py              ← UserProfile
│   │   ├── schemas.py             ← ProfileCreate, ProfileUpdate, OnboardingSubmit (all fields optional), ProfileResponse, AccountSettingsResponse
│   │   ├── service.py             ← `ProfileService(db)` — `_own_profile()` ownership guard; `upsert_from_onboarding()` (get-or-create + `exclude_unset`, never 409s); `get_account_settings(user)` (reads the already-loaded `User` ORM object, zero extra query)
│   │   └── router.py              ← POST/GET/PATCH /api/profile + POST /onboarding + GET /settings — all require auth
│   ├── ai/
│   │   ├── router.py              ← POST /query · /stream (SSE) · /resume · /draft-from-topic · /refine · GET /threads/{id} · GET /sessions · GET /sessions/{id}/threads · DELETE /sessions/{id}
│   │   ├── activity.py            ← SSE "activity" event emitter — translates node/tool execution into a user-facing label stream
│   │   ├── assistant_registry.py  ← module-level singleton holding the compiled graph (breaks a circular import for tools.py's `get_session_context`)
│   │   ├── _log_setup.py          ← file logging setup (ai_debug.log / errors.log / style_debug.log / research_debug.log)
│   │   ├── embeddings.py          ← `embed_and_store_version()` — BackgroundTask, chunks + embeds + writes `post_embeddings`
│   │   ├── style_memory.py        ← Style memory lifecycle: window trigger, DB UPSERT, Redis cache
│   │   ├── llm_retry.py           ← `invoke_with_retry`/`invoke_with_retry_sync` — see Tech Stack
│   │   ├── thread_state.py        ← `shape_thread_state()` — single source of truth for "is this thread paused on a draft / paused on angles / done"; used by `/stream`, `/query`, `/resume`, and the two thread-read routes
│   │   ├── checkpointing/
│   │   │   ├── factory.py         ← `create_pool()` → `AsyncConnectionPool` (`max_size=20`, `autocommit=True`, `prepare_threshold=0`) — shared by both, so concurrent requests each get their own connection instead of fighting over one; `create_checkpointer(pool)` → `AsyncPostgresSaver(pool)`; `create_store(pool)` → `AsyncPostgresStore(pool, ...)` (7-day TTL, `refresh_on_read=True`, hourly sweep, title-only semantic index). `main.py`'s lifespan opens the pool once and passes it to both factories
│   │   │   ├── models.py          ← `ThreadRegistry` (`thread_registry` table) — thread ownership only, never conversation content
│   │   │   ├── service.py         ← `ThreadRegistryService(db)` (CRUD: register/is_owner/list_for_session/delete_for_session/touch/mark_completed) + `ThreadSessionService` facade (`.start()`/`.resume_config()`/`.complete()`/`.delete_session()` — the last cascades `checkpointer.adelete_thread()` + the Store record); `router.py` depends on the facade only
│   │   │   └── session_memory_store.py ← `SessionMemoryService(store)` — all `chat_sessions` Store reads/writes: `get`/`start_or_touch`/`touch_existing`/`list_active`/`delete`/`search`. `ChatSessionRecord{title, last_active_at, thread_ids}` is the only value shape stored. Untitled ("new chat") sessions are excluded from semantic indexing
│   │   ├── schemas/
│   │   │   └── research.py        ← `ResearchTopic`, `SupportingEvidence`, `FlatResearchBrief`, `topic_to_flat()` (consumed by `/draft-from-topic`). `ResearchBrief`/`fallback_brief` are defined but unused — dead
│   │   ├── state.py               ← `AgentState` TypedDict — see AgentState table below. Note: several of this file's own inline field comments are stale relative to the code (the `route` comment lists `"tools"` as a state value when it's actually only an internal router return key; `steps_taken`'s comment says capped at 6 when `_MAX_STEPS=4`; `research_brief`'s comment calls it dormant when `map_chosen_angle_node` writes it on every angle pick) — trust the code in `supervisor.py`/`angle_review_node.py`, not these comments
│   │   ├── worker_states.py       ← `WriterState`, `ResearcherState` TypedDicts. `WriterState.style_json` is declared but unused as an input — `writer_node` resolves style itself via `context_loaders.StyleContextLoader`
│   │   └── agents/
│   │       ├── supervisor.py            ← `supervisor_node` — binds 5 tools, loops (`_MAX_STEPS=4`), emits `SupervisorClassification{route: Literal["research","write","direct"], direct_answer}` via `model_validate_json()`
│   │       ├── context_loaders.py       ← `ProfileContextLoader`, `StyleContextLoader` — stateless read helpers used by `writer_node`/`researcher_node`
│   │       ├── writer_node.py           ← Style-aware LinkedIn post drafter; Strategy pattern (cold-start vs. onboarding-profile vs. style-aware prompt); `writer_task.action` (`"write"`/`"rewrite"`) picks the branch; weaves in `research_brief` when present
│   │       ├── human_approval_node.py   ← `interrupt()` HITL checkpoint; saves via `save_draft_to_vault()` on approve/edit, discards on reject
│   │       ├── researcher.py            ← `researcher_linkedin()` — manual `bind_tools()` loop (`_MAX_TOOL_LOOP_ROUNDS=6`) over `web_search` + `search_vault_posts`, grounded in `user_profile` context when available. Its system prompt (`ResearchPromptBuilder.RESEARCH_SYSTEM`) now asks the LLM to choose per-turn between `MODE: CLARIFY` (a single batched question, used when there's too little to work with) and `MODE: ANGLES` with `REQUEST_TYPE: SINGLE_POST` (5 angles, unchanged from before) or `REQUEST_TYPE: SERIES` (N≤5 angles titled `"Part {i} of {N} — {Title}"`, one per part). `ResearchArtifactParser`/`researcher_node()` were **not** updated to match — see Known Gaps. `ResearchArtifactParser` parses the final turn into a mode-agnostic `ResearchArtifact` (`ResearchArtifactItem`s with a generic `attributes` bag); only `"strategic_angles"` has a registered regex/format today (still the single hardcoded mode argument passed into `.parse()`), any other mode raises `ResearcherDecisionError`. `researcher_node()` is the Send-dispatched graph wrapper — adapts the artifact back to the existing `{angles, search_context, summary}` wire shape via `ResearchArtifactParser.to_wire_dicts()`, so the review pipeline/frontend are untouched by the mode-agnostic internals
		│       ├── angle_review_node.py   ← `angle_review_node` — INTERRUPT node, loops on `interrupt()` within one invocation for `pick`/`none_fit` (`expand`/`modify` — per-angle refine-before-picking — existed only for the old multi-card angle picker UI and were removed along with it). `map_chosen_angle_node` — pure Python, reshapes the picked angle wire dict into `FlatResearchBrief`, writes `research_brief`
│   │       ├── sql_fetch_node.py        ← Write-only: `save_draft_to_vault()`
│   │       ├── style_agent.py           ← `analyze_style()` LLM fn + `_fetch_posts_and_count()` DB helper. There is no separate `style_retriever_node` graph node — style resolution is folded into `writer_node` via `context_loaders.StyleContextLoader`
│   │       ├── tools.py                 ← 7 async `@tool` functions — see Tools table below. `get_style_samples` is defined but not bound anywhere — dead
│   │       ├── base.py                  ← `BaseResearcher` ABC (`research(query) -> dict`) — no subclass anywhere; structurally dead
│   │       └── vector_search_node.py    ← Dead — zero imports outside itself; logic is duplicated live inside `tools.py`'s `search_vault_posts`
│   ├── linkedin/
│   │   ├── models.py              ← `LinkedInAuth` (`linkedin_auth` table)
│   │   ├── schemas.py             ← ConnectionStatusResponse, AuthUrlResponse, PublishResponse
│   │   ├── service.py             ← `LinkedInConnectService` (static): get_auth_url, handle_oauth_callback, publish_or_auth, disconnect
│   │   ├── api_client.py          ← `LinkedInAPIClient` (static): exchange_code, get_userinfo, create_post — httpx sync client
│   │   └── router.py              ← GET /connection-status · GET /auth/url · GET /auth/callback · POST /publish/{id} · DELETE /disconnect
│   ├── core/
│   │   ├── config.py              ← `Settings` — see fields below. Calls `load_dotenv()` before construction
│   │   ├── aws_secrets.py         ← boto3 Secrets Manager fetch, used only in the prod `ENV` branch of settings loading
│   │   ├── cache.py               ← Redis client (sync + async), tool/embed/style/search cache helpers — degrades silently when Redis is unreachable
│   │   ├── database.py            ← SQLAlchemy engine, SessionLocal, Base
│   │   └── dependencies.py        ← `get_db()`, `get_current_user()` — branches on `settings.AUTH_PROVIDER` at call time: `"local"` → `_get_current_user_local()` (X-User-Id header); else → `_get_current_user_supabase()` (Bearer/JWKS). Single choke point — no router depends on either helper directly
│   ├── scheduler/                 ← Background auto-publish for scheduled posts; started/stopped in `main.py`'s lifespan (`settings.SCHEDULER_ENABLED`, default true)
│   │   ├── jobs.py                ← `ScheduledPublishJob` (static methods, mirrors `LinkedInConnectService`'s style) — `due_post_ids()` snapshots due posts once per tick; `claim_post()` locks one via Postgres `FOR UPDATE SKIP LOCKED` (safe under multiple app processes); `publish_one()` reuses `LinkedInConnectService.publish_or_auth` (no new LinkedIn code) + `update_post_status()`, never raises — records failures onto the post itself; `_record_failure()` increments `schedule_attempts`, flips status to `failed` at `SCHEDULER_MAX_ATTEMPTS` (default 3); `run_tick()` is what APScheduler calls on its timer
│   │   └── service.py             ← `SchedulerService` (static `start`/`stop`) — wraps APScheduler's `BackgroundScheduler`, one interval job (`SCHEDULER_POLL_INTERVAL_SECONDS`, default 60s) on `run_tick`, `max_instances=1` + `coalesce=True` so a slow tick can't overlap the next
│   ├── scripts/
│   │   ├── backfill_embeddings.py ← one-off re-embed script
│   │   ├── smoke_researcher.py    ← manual live smoke test for `researcher_linkedin`
│   │   └── smoke_web_search.py    ← manual live smoke test for the `web_search` tool
│   └── alembic/versions/          ← 0001–0020, linear chain, head = 0020 (adds `user_profile.weekly_post_target`; 0019 adds `post_status.failed` + `posts.schedule_attempts`/`last_schedule_error`)
│
└── frontend/                      ← see claude_ui.md for the full component/page map, design tokens, and real-vs-mock status
```

**Confirmed absent from disk entirely** (not just unused — deleted): `backend/ai/agents/helper.py`, `backend/ai/rag_chain.py`, `backend/ai/api_key_rotation.py`.

---

## Route Map

→ Full route table in [claude_ui.md § Page Map](claude_ui.md). Post-login/post-onboarding redirect is `/chat` — Chat is the app's home page; there is no Dashboard.

---

## Database Schema

Migration head: `0020_add_weekly_post_target_to_profile`. Chain is linear (`0001→…→0020`), no branches.

```sql
users(id UUID PK default gen_random_uuid(), username TEXT UNIQUE nullable, email TEXT UNIQUE nullable,
      password_hash TEXT nullable, created_at TIMESTAMPTZ NOT NULL default now())
folders(id UUID PK, user_id UUID NOT NULL FK→users, name TEXT NOT NULL, description TEXT nullable,
        created_at TIMESTAMPTZ NOT NULL default now())
posts(id UUID PK, user_id UUID NOT NULL FK→users, folder_id UUID nullable FK→folders, title TEXT NOT NULL,
      status post_status_enum NOT NULL default 'draft' (draft|published|archived|scheduled|failed),
      is_pinned BOOLEAN NOT NULL default false, current_version INT NOT NULL default 1,
      scheduled_at TIMESTAMPTZ nullable, schedule_attempts INT NOT NULL default 0, last_schedule_error TEXT nullable,
      created_at TIMESTAMPTZ NOT NULL default now(), updated_at TIMESTAMPTZ NOT NULL default now())
post_versions(id UUID PK, post_id UUID NOT NULL FK→posts ON DELETE CASCADE, version_number INT NOT NULL,
              content TEXT NOT NULL, source TEXT nullable, change_summary TEXT nullable (API-aliased "version_label"),
              char_count INT nullable, created_at TIMESTAMPTZ NOT NULL default now(),
              UNIQUE(post_id, version_number))
post_tags(id UUID PK, post_id UUID NOT NULL FK→posts ON DELETE CASCADE, tag TEXT NOT NULL)
post_publish_log(id UUID PK, post_id UUID NOT NULL FK→posts ON DELETE CASCADE, version_id UUID NOT NULL FK→post_versions,
                  platform TEXT NOT NULL default 'linkedin', published_at TIMESTAMPTZ NOT NULL default now())
post_embeddings(id UUID PK, post_id UUID NOT NULL FK→posts ON DELETE CASCADE,
                 version_id UUID NOT NULL FK→post_versions ON DELETE CASCADE, user_id UUID NOT NULL FK→users,
                 chunk_index INT NOT NULL, content TEXT NOT NULL, embedding vector(768) NOT NULL)
user_style_memory(id UUID PK, user_id UUID UNIQUE NOT NULL FK→users ON DELETE CASCADE,
                   long_term JSONB nullable, long_term_post_count INT NOT NULL default 0, long_term_updated_at TIMESTAMPTZ nullable,
                   short_term JSONB nullable, short_term_post_count INT NOT NULL default 0, short_term_updated_at TIMESTAMPTZ nullable)
post_analytics(id UUID PK, post_id UUID UNIQUE NOT NULL FK→posts ON DELETE CASCADE, user_id UUID NOT NULL FK→users ON DELETE CASCADE,
                impressions INT NOT NULL default 0, reactions INT NOT NULL default 0, updated_at TIMESTAMPTZ NOT NULL default now())
linkedin_auth(id UUID PK, user_id UUID UNIQUE NOT NULL FK→users ON DELETE CASCADE,
               linkedin_id TEXT NOT NULL, linkedin_urn TEXT NOT NULL, access_token TEXT NOT NULL,
               token_type VARCHAR(32) NOT NULL default 'Bearer', expires_at TIMESTAMPTZ NOT NULL, scope TEXT NOT NULL,
               display_name TEXT NOT NULL, email TEXT nullable, profile_image_url TEXT nullable,
               created_at TIMESTAMPTZ NOT NULL default now(), updated_at TIMESTAMPTZ NOT NULL default now())
user_profile(id UUID PK, user_id UUID UNIQUE NOT NULL FK→users ON DELETE CASCADE,
             profession TEXT nullable, industry TEXT nullable, role TEXT nullable, target_audience TEXT nullable,
             writing_style TEXT nullable, goals JSONB NOT NULL default '[]', topics JSONB NOT NULL default '[]',
             formatting_prefs JSONB NOT NULL default '{}', linkedin_headline TEXT nullable, linkedin_about TEXT nullable,
             weekly_post_target INT nullable,
             created_at TIMESTAMPTZ NOT NULL default now(), updated_at TIMESTAMPTZ NOT NULL default now())
thread_registry(thread_id UUID PK, user_id UUID NOT NULL FK→users ON DELETE CASCADE (indexed),
                 session_id UUID nullable (indexed), status TEXT NOT NULL default 'active',
                 created_at TIMESTAMPTZ NOT NULL default now(), updated_at TIMESTAMPTZ NOT NULL default now())
```

No `chat_sessions`/`chat_messages` SQL tables exist. The "chat_sessions" concept in the AI layer is an `AsyncPostgresStore` **namespace** (`checkpointing/session_memory_store.py`), not a table.

**Indexes:** `idx_folders_user_id`, `idx_posts_user_id`, `idx_post_embeddings_user_id`, `idx_post_embeddings_hnsw` (HNSW cosine), `idx_user_style_memory_user_id`, `idx_post_analytics_user_id`, `ix_linkedin_auth_user_id`, `ix_user_profile_user_id`, index on `thread_registry.user_id` + `thread_registry.session_id`.

---

## API Endpoints

### Auth — `/api/auth`
| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/availability?username=&email=` | — | `{username_available, email_available}` | Mounted unconditionally (both auth providers write to the same `users` table). Public, no auth. Frontend calls this before `supabase.auth.signUp()`/local register() to reject a taken username/email up front, showing "Username already exists" / "Email already exists" |
| POST | `/register` | `{username, email, password}` | `{user_id, username, email}` | **Local only** (`AUTH_PROVIDER=local`, dev/test). bcrypt hash; 409 "Username already exists" / "Email already exists" |
| POST | `/login` | `{username, password}` | `{user_id, username, email}` | **Local only**. `username` field matches either the `username` OR `email` column |

In prod (`AUTH_PROVIDER=supabase`, the default) `/register` and `/login` don't exist server-side — register/login happen client-side via `supabase-js`; the backend only verifies the resulting JWT. `/availability` is the one `/api/auth` route that exists in both modes.

### Vault — `/api/vault` (all require auth)
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/folders` | List / Create |
| PATCH/DELETE | `/folders/{id}` | Rename / Delete (cascades posts + embeddings) |
| GET/POST | `/folders/{id}/posts` | List / Create posts in folder |
| GET | `/posts/recent?limit=N` | Must be declared before `/posts/{post_id}` in router |
| GET | `/posts/calendar?start=&end=` | `CalendarService.get_calendar_posts()` — real data: unions scheduled/failed posts (keyed off `scheduled_at`) with `post_publish_log` rows (keyed off `published_at`, one entry per publish, not deduped). Must be declared before `/posts/{post_id}` in router |
| GET | `/posts/weekly-history?weeks=12` | `CalendarService.get_weekly_history()` — one point/week, distinct Mon–Fri days with a post; past weeks count published-only, current week also counts scheduled/failed. Must be declared before `/posts/{post_id}` in router |
| GET/PATCH/DELETE | `/posts/{id}` | Get / Rename / Delete |
| PATCH | `/posts/{id}/pin` | `{is_pinned: bool}` |
| PATCH | `/posts/{id}/folder` | `{folder_id}` — moves a post; invalidates tool cache |
| PATCH | `/posts/{id}/status` | `{status, scheduled_at?}` — fires style-memory refresh BackgroundTask only when status is `published`/`scheduled` |
| POST | `/posts/{id}/versions` | `{content, version_label?, source, is_final}` — **embedding + tool-cache-invalidate BackgroundTasks fire only when `is_final=True`**; a regular draft save is never embedded |
| GET | `/posts/{id}/versions` | List versions |
| GET/PATCH/DELETE | `/versions/{id}` | Get / Rename label / Delete (recomputes `post.current_version`) |
| GET | `/search?q=` | Keyword search (`ILIKE`, distinct on post) |
| PATCH | `/posts/{id}/analytics` | `{impressions, reactions}` — upsert |
| GET | `/analytics/summary` | `AnalyticsSummaryResponse` |

### Profile — `/api/profile` (all require auth)
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/settings` | — | `AccountSettingsResponse{email, username}` — reads the already-loaded `User` row, zero extra query |
| POST | `` | `ProfileCreate` (industry/role/target_audience/writing_style required) | 201; 409 if a profile already exists |
| GET | `` | — | 404 if none created yet |
| PATCH | `` | `ProfileUpdate` (all optional) | `exclude_unset` partial update; 404 if none exists |
| POST | `/onboarding` | `OnboardingSubmit` (all 7 fields optional) | `upsert_from_onboarding()` — get-or-create + `exclude_unset` merge, never 409s |
| PATCH | `/weekly-target` | `WeeklyTargetUpdate{target: int}` | `ProfileService.set_weekly_target()` — get-or-create (unlike the onboarding-gated `PATCH /api/profile`, this never 404s); persists the Schedule page's weekly momentum target server-side |

### AI — `/api/ai` (all require auth)
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/stream` | `{prompt, session_id?}` | SSE. Mints/registers a thread via `ThreadSessionService.start()`. Event types: `token`, `activity`, `done`, `error`. `done` payload: `{status: "awaiting_approval"\|"awaiting_angle_selection"\|"complete", thread_id, session_id, ...}` |
| POST | `/query` | `{prompt, session_id?}` | Non-streaming `ainvoke()` equivalent of `/stream` |
| POST | `/draft-from-topic` | `{topic, platform="linkedin", session_id?}` | Bypasses the supervisor (`pre_routed=True`), pre-seeds `research_brief` via `topic_to_flat()` |
| POST | `/resume` | `{thread_id, action, content="", angle_id?}` | `action` is a `human_approval_node` decision (`approved`\|`edited`\|`rejected`\|`regenerate`) or an `angle_review_node` decision (`pick`\|`none_fit`). 403 if the caller isn't the thread's registered owner. A `pick` can chain into a second interrupt (the new draft's own approval pause) |
| GET | `/threads/{thread_id}` | — | Read-only rehydration via `aget_state()` + `shape_thread_state()`; owner-only, no `.touch()` side effect |
| GET | `/sessions` | — | The caller's live (not-yet-expired) `chat_sessions` Store records, most-recently-active first |
| GET | `/sessions/{session_id}/threads` | — | Every `thread_id` grouped under this session, shaped via `shape_thread_state()` |
| DELETE | `/sessions/{session_id}` | — | 204. Permanently deletes the session's Store record + every grouped `thread_registry` row + each thread's checkpoint (`checkpointer.adelete_thread()`). Silent no-op if unowned/unknown |
| POST | `/refine` | `{draft, note}` | Single `_llm.ainvoke()` call — no graph traversal |

### LinkedIn — `/api/linkedin` (all except `/auth/callback` require auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/connection-status` | `{connected, display_name?, profile_image_url?, expires_at?}` |
| GET | `/auth/url` | `{auth_url}` — frontend does `window.location.href = auth_url` |
| GET | `/auth/callback?code=&state=` | `state` = user_id (carries identity through the OAuth redirect, no header needed). Redirects to `FRONTEND_URL/mywork?linkedin_connected=true` or `?linkedin_error=true&reason=…` |
| POST | `/publish/{post_id}` | Publishes the latest saved version. `{published, needs_auth, auth_url?, reason?, linkedin_post_id?, duplicate?}`. On success: upserts `PostPublishLog`, sets post status `published`, fires style-memory BackgroundTask |
| DELETE | `/disconnect` | 204 |

---

## Frontend API Layer

Full per-module export tables and page-by-page wiring live in [claude_ui.md](claude_ui.md). Summary:

- **`vault.js`** — folders/posts/versions/analytics/search CRUD, resolves `.data` directly (no `.data` at call site).
- **`ai.js`** — `queryAI`, `resumeAI`, `refineAI`, `draftFromTopic`, `getSessionThreads`, `getSessions`, `deleteSession` (all through the shared axios instance) and `streamQuery` (raw `fetch()`, manually reads `X-User-Id` from `localStorage` — does not go through `attachAuthHeader.js`'s `VITE_AUTH_MODE` branch like every other call in this file).
- **`auth.js`** — `login`/`register`/`googleSignIn`; branches on `VITE_AUTH_MODE` (`"local"` delegates to `localAuth.js`).
- **`account.js`** — `updateEmail`, `sendPasswordResetEmail`, `updatePassword` — all call `supabase-js` directly, no backend route.
- **`localAuth.js`** — dev-only, plain axios against `/api/auth/*`.
- **`profile.js`** — `submitOnboarding`, `getProfile` (resolves `null` on 404), `getAccountSettings`.
- **`linkedin.js`** — connection status / auth URL / publish / disconnect.
- **`publishing.js`** — `sendToReview()` (stub) and `publishPost()` (delegates to `publishToLinkedIn()` for LinkedIn; stubs X/Reddit).
- **`chat.js`** — unimported, all-stub module; dead code (see Known Gaps).

---

## Authentication Flow

Two providers, switched by `AUTH_PROVIDER`/`VITE_AUTH_MODE` (both default `"supabase"`). Only one is active per environment — `get_current_user()` branches on the setting at call time.

**Supabase (default — prod):**
1. Frontend: `login()`/`register()` in `api/auth.js` call `supabase-js` directly — no backend round-trip for credential checks.
2. `lib/authSession.js` mirrors the Supabase session into `localStorage` (`user_id`/`username`).
3. `attachAuthHeader.js` attaches `Authorization: Bearer <supabase_access_token>` on every vault/AI/profile/linkedin call.
4. `get_current_user()` → `_get_current_user_supabase()`: verifies the JWT via `SupabaseAuth.verify_token()` (JWKS, ES256), then `UserSyncService.get_or_create()` shadow-provisions a `users` row and self-heals `email`/`username` from the JWT on every call.
5. All service functions receive `user_id` and enforce ownership.

**Local (dev/test opt-in, `AUTH_PROVIDER=local` + `VITE_AUTH_MODE=local`)** — isolated in `backend/auth_local/` + `frontend/src/api/localAuth.js`:
1. `POST /api/auth/register` → `LocalUserService.register()` → bcrypt hash → store (mints its own `uuid.uuid4()` id).
2. `POST /api/auth/login` → matches `username` OR `email` → `PasswordAuth.validate()` (bcrypt `checkpw`).
3. Frontend: `localAuth.js` stores `user_id`/`username` in `localStorage` directly.
4. `attachAuthHeader.js` sends `X-User-Id: <uuid>` instead of a bearer token.
5. `get_current_user()` → `_get_current_user_local()`: parses the header as a UUID, `db.get(User, user_id)`, 401 if missing/invalid.
6. Both providers resolve to the same `users` table — downstream code never branches on which one authenticated the request.

**Auth pattern:** `BaseAuthProvider` ABC (`verify_token(token) -> AuthenticatedUser`) → `SupabaseAuth` (current default). `PasswordAuth` deliberately does **not** implement this ABC — a password-against-DB-row check doesn't fit a stateless token-verification contract.
**Limitation:** local mode is header-based with no token expiry — dev-grade only. Supabase mode's token expiry/refresh is handled entirely by `supabase-js` client-side.

---

## Agent Architecture

### Node Catalogue

| Node | Category | File | Responsibility |
|---|---|---|---|
| `supervisor_node` | COGNITIVE + TOOL CALLER | `agents/supervisor.py` | Binds 5 tools, loops on tool calls (`_MAX_STEPS=4`), then emits a `SupervisorClassification` JSON contract (`route: Literal["research","write","direct"]`). A vault question is answered directly; a redraft/rewrite/shorten/improve request on existing content routes to `"write"` (`writer_task.action="rewrite"`, expects the target content already fetched into `messages` via `search_vault_posts`); every fresh "write a post" request routes to `"research"` |
| `tool_node` | EXECUTOR | `graph.py` (LangGraph `ToolNode`) | Bound to the same 5 tools as `supervisor_node`'s `bind_tools()` call — kept in sync deliberately. Executes the called tool, writes a `ToolMessage`, loops back to `supervisor_node` |
| `researcher_node` | COGNITIVE + TOOL CALLER | `agents/researcher.py` | Send-dispatched with minimal state `{user_id, query}`. Runs its own manual tool loop (`web_search` + `search_vault_posts`, up to 6 rounds, separate from `tool_node`), grounded in `user_profile` when available. Prompt can now ask for `MODE: CLARIFY` or `MODE: ANGLES` (`SINGLE_POST` or `SERIES`), but `ResearchArtifactParser`/`.parse()` still only understands a flat 5-angle Strategic Angles block — a `CLARIFY` response parses to 0 angles and raises `ResearcherDecisionError`; a `SERIES` response parses but each item's `title` comes through as `"Part {i} of {N} — {Title}"`. Adapted via `to_wire_dicts()` into angle wire dicts. Writes `research_result = {angles, search_context, summary}` |
| `angle_review_node` | INTERRUPT | `agents/angle_review_node.py` | Loops on `interrupt()` within one invocation for `pick`/`none_fit`. `pick` sets `picked_angle_id`; `none_fit` clears the pick and can carry fresh user text back to `supervisor_node` |
| `map_chosen_angle_node` | PURE PYTHON | `agents/angle_review_node.py` | No LLM call. Reshapes the picked angle into `FlatResearchBrief`, writes `research_brief` |
| `writer_node` | COGNITIVE | `agents/writer_node.py` | Style-aware LinkedIn post drafter. Strategy pattern: cold-start vs. onboarding-profile vs. `style_json`-driven prompt, built via `context_loaders.StyleContextLoader`/`ProfileContextLoader`. `writer_task.action` (`"write"`/`"rewrite"`) picks the branch; weaves in `research_brief` when present. Writes `draft` |
| `human_approval_node` | INTERRUPT | `agents/human_approval_node.py` | `interrupt()` HITL checkpoint. Saves via `save_draft_to_vault()` on approve/edit; discards on reject |

There is no `analytics_node` and no separate `style_retriever_node` graph node — style resolution happens inline inside `writer_node`.

> **Architecture rule:** all agent nodes and tool functions are `async def` using `await llm.ainvoke()` / `asyncio.to_thread()` — multi-tenant, all LLM + DB calls are I/O-bound. Never use sync `llm.invoke()` inside graph nodes or tools.

### AgentState (`backend/ai/state.py`)

| Field | Type | Set by | Purpose |
|---|---|---|---|
| `query` | str | router | original prompt, never mutated |
| `user_id` | str | router | scopes all DB operations |
| `session_id` | str | router | groups this thread with sibling threads from the same frontend chat; read by `get_session_context` |
| `messages` | list | add_messages reducer | HumanMessage / AIMessage (with tool_calls) / ToolMessage |
| `task_type` | str | router / supervisor | not read by the router — routing reads `route` |
| `route` | str | supervisor_node | edge key: `"research"` \| `"write"` \| `"direct"` (plus `"style_retrieval"`/`"writer_node"` pre-seed used only by `/draft-from-topic`) |
| `steps_taken` | int | supervisor_node | tool-loop budget, capped at `_MAX_STEPS=4`; overrunning forces `route="direct"` |
| `research_result` | dict | researcher_node | `{angles: [5 angle wire dicts], search_context, summary}` |
| `picked_angle_id` | int \| None | angle_review_node | set on `pick`; `None` otherwise |
| `entry_point` | str | angle_review_node | debug marker, not consumed by routing |
| `pre_routed` | bool | router (`/draft-from-topic` only) | bypasses `supervisor_node` via the graph's conditional entry point |
| `style_json` | dict | writer_node (via `StyleContextLoader`) | `{long_term: {...}, short_term: {...}\|None}` |
| `research_brief` | dict | map_chosen_angle_node / router | `FlatResearchBrief` shape; written after an angle pick or pre-seeded by `/draft-from-topic` |
| `research_topics` | list | — | unused — nothing currently writes it |
| `writer_task` | dict | router / supervisor_node | `{action: "write"\|"rewrite", topic, constraints: []}` |
| `draft` | str | writer_node | LinkedIn post draft |
| `approval_status` | str | human_approval_node | `""`/`"approved"`/`"edited"`/`"rejected"` |
| `post_id` | str | human_approval_node | id of the saved vault post, once approved/edited |
| `answer` | str | supervisor_node / human_approval_node | final response returned to the frontend |

### Graph Topology

```
START
  │
  ├─ pre_routed=True (only /draft-from-topic) ──► writer_node directly
  │
  ▼
supervisor_node ── binds 5 tools; loops (capped at 4 steps); emits
  │                 SupervisorClassification{route: "research"|"write"|"direct"}
  │
  ├─ last msg has tool_calls ──► tool_node ──► supervisor_node (loop)
  │
  ├─ route == "write" ──► writer_node directly (rewrite path — writer_task.action="rewrite" already set)
  │
  ├─ route == "research" ──► Send ──► researcher_node
  │                                         │ writes research_result
  │                                         ▼
  │                                angle_review_node  (INTERRUPT: pick/none_fit)
  │                                         │
  │                    picked_angle_id set? ──no──► supervisor_node (re-classify)
  │                                         │
  │                                        yes
  │                                         ▼
  │                                map_chosen_angle_node ──► writer_node
  │
  └─ route == "direct" ──► END   (answer already set by supervisor_node)

writer_node ──► human_approval_node ──► END
```

**Routing rule:** `_supervisor_router` (in `graph.py`) reads `state["route"]` directly. A `SupervisorClassification` parse/validation failure raises `SupervisorDecisionError`, propagated to `router.py`'s exception handler — never silently mis-routed.

### Tools (`backend/ai/agents/tools.py`)

| Tool | Bound on | Data source |
|---|---|---|
| `search_vault_posts(user_id, query)` | supervisor + tool_node + researcher's own loop | pgvector cosine scan (top 6 chunks, 650-char chunks); returns `[NO_CONTEXT_FOUND]` below 1 hit, no fallback |
| `get_topic_inventory(user_id)` | supervisor + tool_node | all post titles + distinct tags |
| `get_style_memory(user_id)` | supervisor + tool_node | `style_memory.get_style_memory()` + `format_style_memory_for_writer()` |
| `get_session_context(question)` | supervisor + tool_node | `Annotated[dict, InjectedState]` for `session_id`/`user_id`; looks up the most recent 6 threads in the SAME session via `assistant_registry`'s singleton + `shape_thread_state()` |
| `recall_past_sessions(question)` | supervisor + tool_node | `Annotated[dict, InjectedState]` + `Annotated[BaseStore, InjectedStore]`; `SessionMemoryService.search()` — semantic search over the user's OTHER session titles (7-day window, top 3 by score) |
| `web_search(query)` | researcher's own loop only | Tavily, `search_depth="basic"`, 4 results max; result cache keyed by query text (global, not user-scoped); **no per-user rate limit** (open TODO) |
| `get_style_samples(user_id)` | not bound anywhere | dead code |

`researcher_node`/`researcher_linkedin` runs its own separate manual loop over `{web_search, search_vault_posts}` — it does not go through `tool_node`.

---

## Design Patterns in Use

| Pattern | Where | How |
|---|---|---|
| **Singleton** | `_llm` in each agent file; `assistant_registry.py` | Module-level instance |
| **Orchestrator-Worker** | `graph.py` + `supervisor.py` | Supervisor dispatches specialist workers via LangGraph Send API; each worker gets only the state slice it needs |
| **Pipeline / Chain of Responsibility** | `graph.py` fixed edges | `writer_node → human_approval_node → END` |
| **State Machine** | `graph.py` `StateGraph` | Nodes are states, edges are transitions; `_supervisor_router`/`_angle_review_router` are the transition functions |
| **Strategy** | `agents/writer_node.py` | Cold-start vs. onboarding-profile vs. style-aware prompt — same `ainvoke` interface, swapped behavior |
| **Cache-Aside** | `agents/tools.py`, `style_memory.py` | Redis check → return on hit; DB query on miss → write back to Redis |
| **Decorator** | `agents/tools.py` | `@tool` wraps plain async functions into LangChain Tool objects |
| **DTO** | `state.py`, `worker_states.py` | TypedDicts as pure data carriers between pipeline stages |
| **Facade** | `checkpointing/service.py` | `ThreadSessionService` is the only thing `router.py` depends on |
| **Structured Output** | `agents/supervisor.py` | `SupervisorClassification(BaseModel)` parsed via `model_validate_json()`, not string-matched tokens |
| **Human-in-the-Loop (Interrupt)** | `agents/human_approval_node.py`, `agents/angle_review_node.py` | `interrupt()` pauses the graph mid-run, serialized to the durable checkpointer, resumed only via `/resume` |
| **Retry** | `llm_retry.py` | `invoke_with_retry()` wraps tenacity exponential backoff around Gemini 429/503/504 |
| **Template Method (ABC, unimplemented)** | `agents/base.py` | `BaseResearcher.research(query)` — no subclass exists; a dead seam, not a finished pattern |

---

## Known Gaps

### Backend
| Gap | Detail |
|---|---|
| No LLM rate limiting | `web_search` (Tavily, costs money per call) has no per-user/per-day cap (`tools.py:333`). No FastAPI-level request throttling exists anywhere in the app |
| Local auth has no token expiry | `AUTH_PROVIDER=local` is header-based, dev-grade only — never enable outside local dev |
| CORS hardcoded | `main.py`'s `allow_origins` is a fixed 4-entry list — any new environment needs a code change, not a config change |
| Dead/unused code | `agents/base.py` (`BaseResearcher` ABC, no subclass), `agents/vector_search_node.py` (unused, duplicated logic lives in `tools.py`), `tools.py`'s `get_style_samples` (unbound), `schemas/research.py`'s `ResearchBrief`/`fallback_brief`, `state.py`'s `research_topics` field, `worker_states.py`'s `WriterState.style_json` field |
| Stale in-code comments | `state.py`'s inline field comments for `route`, `steps_taken`, and `research_brief` describe behavior the code no longer has — see the Directory Map entry for `state.py` |
| Researcher prompt/parser mismatch | `ResearchPromptBuilder.RESEARCH_SYSTEM` (`agents/researcher.py`) now lets the LLM choose `MODE: CLARIFY` or `MODE: ANGLES` (`SINGLE_POST`/`SERIES`), but `ResearchArtifactParser` and `researcher_linkedin`'s hardcoded `.parse("strategic_angles", ...)` call were never updated to match: a `CLARIFY` turn parses to 0 angle blocks and raises `ResearcherDecisionError` instead of surfacing the question, and a `SERIES` turn parses but leaks `"Part {i} of {N} — "` into each item's `title` field since `to_wire_dicts()` still only knows the flat Strategic Angles shape |

### Frontend
| Gap | Detail |
|---|---|
| "Forgot password" not wired | `HomePage.jsx`'s Forgot mode shows a static "not available yet" message — `sendPasswordResetEmail()` + `/reset-password` already exist (built for Settings) and could power it directly, but nothing calls them from `HomePage.jsx` |
| Settings: username / cancel-subscription | Username change is `localStorage`-only; "Cancel subscription" only shows a toast — neither calls a backend endpoint (none exists for either) |
| SchedulePage: X/Reddit publishing still stubbed | Calendar, 12-week momentum history, content-runway rail, and the weekly-post target are all real (`GET /posts/calendar`, `GET /posts/weekly-history`, `PATCH /profile/weekly-target` — see API Endpoints and `backend/scheduler/`), and `backend/scheduler/` auto-publishes due posts. But the scheduler's `publish_one` only ever calls the LinkedIn flow — X/Reddit scheduled publishing has no backend path yet, matching `publishing.js`'s existing stub for those platforms |
| Local dev can't run a live backend on Windows | `uvicorn backend.main:app` fails at startup on this machine — `create_checkpointer`'s async psycopg connection errors with `Psycopg cannot use the 'ProactorEventLoop' to run in async mode`. Blocks live-server/Playwright-against-real-backend verification here; use direct service-layer calls, FastAPI's `TestClient` as a context manager, or a real Linux/WSL environment instead |
| AnalyticsPage is entirely mock | KPIs, best post, topic/type/consistency breakdown, and the content performance table are seeded client-side from the source design's hardcoded arrays; the "Log metrics" form doesn't call `PATCH /posts/{id}/analytics`, and `GET /analytics/summary` exists server-side but nothing on the page reads it yet |
| X/Reddit publish + "send to review" | `publishing.js`'s `sendToReview()` and the non-LinkedIn branch of `publishPost()` are stubs |
| Dead/orphaned frontend code | `api/chat.js` (all-stub, unimported), `components/shared/Button.jsx`/`Badge.jsx`/`Input.jsx`/`ContextMenu.jsx` (unreferenced), `hooks/useIdeas.js`/`useResizableRail.js` (unreferenced), `context/ReviewQueueContext.jsx` (provider wraps the whole app, but `useReviewQueue()` has no call sites), `components/AIAssistant/` (removed from disk entirely) |
| Two unmerged sidebar/palette systems | `HonneSidebar` (green/cream, used by Chat/Schedule/Analytics/Settings) and `AppSidebar` (blue/indigo, used only by `AgentsPage` now — `MyWorkPage` no longer imports it) remain separate, unrelated components |

---

## Design Decisions & Constraints

- **Logical multi-tenancy** — single DB, `user_id` on every table; no schema-per-tenant, no RLS (ownership enforced in the service layer).
- **Two auth providers, switched by env flag** — `AUTH_PROVIDER`/`VITE_AUTH_MODE` (both default `"supabase"`). See Authentication Flow.
- **bcrypt direct** — `passlib` is not used (incompatible with bcrypt ≥ 4.0); relevant only to the local-auth dev path, Supabase owns credential hashing in prod.
- **`UserSyncService.get_or_create()` self-heals every call** — compares `identity.email`/`identity.username` from the current JWT against the stored row and updates+commits only on an actual diff, email and username in separate commits. This is what makes a Supabase-side email/username change eventually land in the local `users` table, on the user's next authenticated request after confirming.
- **Username uniqueness is enforced at signup, not by a DB-blocking guarantee** — `users.email` is effectively unique already (Supabase itself refuses to create a second account against an existing email; `uq_users_email` is just a backstop that should never fire). `users.username` is arbitrary JWT metadata Supabase never deduplicates, so `AuthAvailabilityService`/`GET /api/auth/availability` is the actual enforcement point, checked client-side before `supabase.auth.signUp()`. `UserSyncService.get_or_create()` still can't assume that check always ran (pre-existing bad rows, a signup race) — on a `uq_users_username` collision it degrades instead of raising: provisions with `username=None` on insert, or keeps the previously-stored username on self-heal. It never raises for this, because it runs inside `get_current_user()`, a dependency resolved before every authenticated route — an unhandled collision there previously 500'd a user's *entire* session, not just one endpoint.
- **Email/password changes never touch the backend** — `api/account.js`'s `updateEmail()`/`sendPasswordResetEmail()`/`updatePassword()` call `supabase.auth.*` directly, the same pattern `api/auth.js`'s `login()`/`register()`/`googleSignIn()` already use. No backend route exists for either mutation.
- **Password change is an email-verified reset-link flow, not current-password reauth** — `sendPasswordResetEmail(email)` always targets the account's own registered email (never a user-typed one); the new password is only ever set on `/reset-password` after Supabase's `'PASSWORD_RECOVERY'` auth event confirms a legitimate recovery session.
- **Supabase confirmation-email redirects need an explicit target** — every Supabase call that sends a confirmation email passes `emailRedirectTo`/`redirectTo` explicitly (`register()`→`/onboarding`, `updateEmail()`→`/settings`, `sendPasswordResetEmail()`→`/reset-password`), matching each target being present on the Supabase project's Authentication → URL Configuration → Redirect URLs allow-list. Without both, Supabase silently falls back to the dashboard's default Site URL.
- **Redis cache** — `backend/core/cache.py`; tool results cached per user (30-min TTL, invalidated on save); query embeddings cached 24h; degrades silently (no error) if Redis is unreachable.
- **768-dim embeddings** — `gemini-embedding-001` with `output_dimensionality=768`; HNSW index; `task_type="retrieval_document"` for ingestion, `"retrieval_query"` for search.
- **Embedding fires only on a final save** — `POST /posts/{id}/versions` only triggers `embed_and_store_version()` (BackgroundTask) when the request's `is_final=True`; ordinary draft saves are never embedded.
- **Chunk size 650 / overlap 80** — LinkedIn posts average 700–2500 chars; 650-char chunks keep one coherent idea per chunk.
- **Style Memory system** — `user_style_memory` table; window-based trigger (short-term every 3 new committed posts, long-term every 10); `analyze_style()` outputs a 9-key JSON, stored as JSONB in Postgres (source of truth) and cached in Redis (`style:lt:{uid}` 24h, `style:st:{uid}` 1h) — Redis re-warms on any DB hit.
- **Supervisor routing: structured JSON output, three routes** — `SupervisorClassification.route: Literal["research", "write", "direct"]`, parsed via `model_validate_json()`; a parse/validation failure raises `SupervisorDecisionError` rather than silently mis-routing. `/draft-from-topic`'s `pre_routed=True` bypass is the only way to reach the writer without going through research or write.
- **LLM retry** — `llm_retry.py`'s `invoke_with_retry`/`invoke_with_retry_sync` wrap every agent's Gemini call in tenacity exponential backoff (1–10s, up to 3 attempts) on 429/503/504 codes only; a genuine non-transient failure raises immediately. No key-rotation fallback exists.
- **LinkedIn OAuth** — `backend/linkedin/` follows the same SRP/Strategy pattern as auth: `LinkedInAPIClient` (static HTTP, no state), `LinkedInConnectService` (business logic), `LinkedInAuth` model (storage). OAuth `state` param = `user_id` so the callback can identify the user without headers. UPSERT on callback so reconnecting overwrites the old token. 60s duplicate-publish guard. 3000-char limit enforced server-side.
- **Scheduling reuses the existing vault tables, no separate job-queue table** — `backend/scheduler/` claims due posts directly off `posts`/`post_publish_log` via Postgres `FOR UPDATE SKIP LOCKED`, one post per tick, deliberately: a dedicated queue table would need dual-writes to stay in sync with vault edits/deletes, for no real benefit over row-level locking on the table that's already the source of truth. A post's actual publish history (and therefore analytics like best-day/best-time) should be read from `post_publish_log.published_at`, not `posts.scheduled_at` — the latter is only ever a future intent, not a real outcome.
- **`user_profile` table + `/api/profile`** — `linkedin_headline`/`linkedin_about` are nullable/optional everywhere so a profile is usable without them. `researcher_node` reads it directly via SQLAlchemy (not `ProfileService`) to avoid its 404-on-missing-profile behavior, grounding the angle-generation prompt in the user's actual role/industry/audience when available.
- **Stub user UUID:** `00000000-0000-0000-0000-000000000001` (seeded in migration `0003`).
- **CSS approach:** landing/dashboard-lineage pages → inline styles + JS-const tokens; vault components → CSS modules — see [claude_ui.md](claude_ui.md).
- **Run commands** → see `DEVELOPMENT.md`.
