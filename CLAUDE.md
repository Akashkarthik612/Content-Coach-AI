# Content Coach — Project State
> Living reference for Claude. Update when architecture, decisions, or status change.
> **UI/Frontend state:** See [claude_ui.md](claude_ui.md) for component map, design tokens, and UI conventions.
> Last updated: 2026-07-23 (**Workspace document panel rebuilt as a real LinkedIn-preview card, sourced from user_profile** — `ChatPage.jsx`'s `WorkspaceView` right pane previously rendered the draft as a plain rich-text block (Edit mode: serif title + body text, not actually editable despite the tab's name) and a bare preview card with no author info. Replaced with the actual "Honne Chat v3" `.dc.html` markup: a `#fff` card with a 44px circular avatar (initial, accent bg), the real logged-in user's name, and their profession — `frontend/src/api/profile.js` gained `getProfile()` (`GET /api/profile`, resolves `null` on the backend's 404-when-no-profile-row case instead of throwing) and `ChatPage.jsx` calls it once on mount via `useEffect`, computing `professionLine = profile?.profession || profile?.role || 'Creator on Honne'`. Every request already carries `X-User-Id` (same axios interceptor as the rest of the app, see `profile.js`), and the backend's `get_current_user`+`ProfileService.get_profile(user_id)` scope the row to that header — so this can only ever show the requesting user's own name/profession, never another user's. Edit mode is now a genuinely editable `<textarea>` (new `onDocChange` prop, wired to `patchWs({ docText })`) with an "Editable" pill badge; Preview mode is read-only with a Like/Comment/Repost/Send action row (new lucide icons `ThumbsUp`/`MessageCircle`/`Repeat2`). The "2d" fake timestamp from the source mock was deliberately replaced with "Draft preview" since the post hasn't actually been published yet — showing a fabricated age would be misleading. Verified by temporarily forcing `ChatPage`'s initial state into the workspace view and screenshotting both modes with Playwright against the Vite dev server (no backend running — `getProfile()`'s 404/network-error fallback path is what was exercised); reverted after. Sourced from the "Honne Chat v3" Claude Design project (`ff122375-c3bc-4438-aece-706b0bd557b0`, file `Honne Chat v3.dc.html`) via the `claude_design` MCP.)
> Previously (2026-07-23, same day): **Angle cards now scroll horizontally instead of wrapping in a 2-column grid** — `ChatPage.jsx`'s `msg.kind === 'angles'` block (see [claude_ui.md](claude_ui.md)) changed its container from `display:grid;gridTemplateColumns:'1fr 1fr'` to a single `display:flex;flex-direction:row` row with `overflowX:'auto'` and scroll-snap; each `AngleCard` is now wrapped in a fixed `300px`-wide flex item so all 5 research angles sit side by side in one scrollable row instead of stacking into multiple rows. Sourced from the "Honne Chat v3" Claude Design project (`ff122375-c3bc-4438-aece-706b0bd557b0`, file `Honne Chat v3.dc.html`) via the `claude_design` MCP — the design file itself shows angle cards in a vertical stack, but the explicit instruction for this change was to lay them out horizontally instead, so the implementation deliberately deviates from that file on this one point. No backend changes.)
> Previously (2026-07-22): **Model swap + diagnostic session, no other code changes made** — `writer_node.py`/`researcher.py` (main + expand) moved from `gemini-3.5-flash` to `gemini-3.6-flash`; `supervisor.py` moved from `gemini-3.1-flash-lite` to `gemini-3.5-flash-lite`; `style_agent.py` stays on `gemini-3.1-flash-lite`. A live test run (`ai_debug.log`) surfaced `writer_node` invoked twice on the same thread with no completion log and no error log either (`errors.log` is 0 bytes) — root cause not yet fixed, see Known Gaps' `writer_node` silent failure row: most likely a hung Gemini call (no agent LLM has a client-side `timeout` set) combined with `/query`/`/draft-from-topic` having zero exception handling around `assistant.ainvoke()`, unlike `/stream`. Separately diagnosed: LangSmith tracing has likely never been active — `.env`'s `LANGCHAIN_TRACING_V2`/`LANGSMITH_API_KEY`/`LANGCHAIN_PROJECT` are correct, but nothing calls `load_dotenv()` for the live app (only `backend/alembic/env.py` does, for migrations), so those vars never reach `os.environ`, which is what LangSmith's SDK reads directly — independent of `Settings`/pydantic. Also confirmed via the installed `langchain-google-genai` package's own docstring: Gemini 3+ models default to `thinking_level="high"` when unset — `style_agent.py` still has no `thinking_level` set, so it's silently paying full reasoning depth on a mechanical 9-key JSON extraction, and shares `max_output_tokens=1024` between that and its answer, the same shared-budget shape that caused the writer/researcher truncation bug already fixed elsewhere. `supervisor.py` already has `thinking_level="low"` set (pre-existing). **None of these three gaps were fixed in this update — diagnosis only, code changes were explicitly declined.**)
> Previously (2026-07-21): **Onboarding now writes to the DB** — `OnboardingPage.jsx`'s 7-step questionnaire previously wrote only to `localStorage`; `finish()` now also fire-and-forgets `POST /api/profile/onboarding` via a new `frontend/src/api/profile.js`. `user_profile` gained `profession`/`goals`/`topics` columns (migration `0015`) and its 4 original columns (`industry`/`role`/`target_audience`/`writing_style`) were relaxed to nullable, since onboarding is skippable per-question and skippable entirely. New `ProfileService.upsert_from_onboarding()` (get-or-create + `exclude_unset` partial merge, never 409s unlike `create_profile`) backs the new route — this is the first real write path into `user_profile`, which means `researcher_node`'s existing profile read (role/industry/audience grounding) now actually has data to find for onboarded users instead of always hitting its no-profile fallback.)
> Previously (2026-07-20): **Researcher v3 landed and is fully wired** — the previous entry's "unwired stub" (`agents/base.py`/`agents/researcher.py` raising `NotImplementedError`) is now a real, working agent: `researcher_node` is Send-dispatched from `supervisor_node` (`route="research"`), runs its own manual `bind_tools()` loop over `web_search` (Tavily) + `search_vault_posts`, and produces exactly 5 `ResearchAngle`s parsed via regex from a strict text format. Downstream of it, a brand-new interrupt node `angle_review_node` (`agents/angle_review_node.py`) pauses the graph so the frontend can show the 5 angles and let the user `pick`/`expand`/`modify`/`none_fit`; `map_chosen_angle_node` (pure Python, same file) reshapes the picked angle into the existing flat `research_brief` shape and feeds it into the unchanged `style_retriever_node → writer_node → human_approval_node` pipeline. **`supervisor_node`'s only two routes now are `"research"` and `"direct"`** — the earlier `"write"`/vault-redraft classification described in the prior entry does not exist in the current prompt (it explicitly declines redraft requests as unsupported); every fresh "write a post" request now goes through the angle-research step first, except `/draft-from-topic`'s `pre_routed=True` bypass. **Durable checkpointing is back**, reversing the prior entry's removal: `backend/ai/checkpointing/` (`factory.py`'s `create_checkpointer()` → `AsyncPostgresSaver`, `service.py`'s `ThreadRegistryService`/`ThreadSessionService`, `models.py`'s `ThreadRegistry`) plus a new `thread_registry` table (migration `0014`) track thread ownership so `/resume` can 403 a non-owner; `main.py`'s `lifespan` now opens the checkpointer, calls `.setup()`, and compiles the graph once at startup onto `app.state.assistant`. **`analytics_node` and the `"analytics"` route were removed entirely** (dead feature, no product need identified) — along with its dead tool-layer SQL helpers and stale tests; the unrelated vault `post_analytics` dashboard (`AnalyticsPage.jsx`, `GET /api/vault/analytics/summary`) is untouched. **All Gemini calls except `style_agent.py` now run `gemini-3.5-flash`** (`gemini-2.5-flash` itself was deprecated after `gemini-2.5-flash-lite`, confirmed via a fresh 404 in `errors.log`), with `thinking_level="low"` set everywhere to avoid Gemini 3.x's default "thinking" latency tax, especially inside multi-round tool loops; `style_agent.py` stays on `gemini-2.0-flash-lite`. New resilience layer: `backend/ai/llm_retry.py` (`invoke_with_retry`/`invoke_with_retry_sync`, tenacity exponential backoff on 429/503/504) and `backend/ai/api_key_rotation.py` (falls back to `LANGCHAIN_API_KEY_GEMINI_2` by rebuilding the LLM's internal client in place — no-op until that env var is set). Tavily (`tavily-python`) replaced the earlier free DuckDuckGo+trafilatura combo as the researcher's web-search tool; `ddgs`/`trafilatura` were dropped from `requirements.txt`. **This doc had drifted significantly behind the actual tree before this update — always spot-check a surprising architectural claim against the code before relying on it.**)

---

## Operational Guardrails & Architecture Rules

> **Strict Rules for Claude Code Architecture:**
> * **LLD & SOLID:** Adhere strictly to SDE-grade Low-Level Design. Every module must follow the Single Responsibility Principle (SRP). No monolithic service functions.
> * **Dependency Inversion:** Always pass dependencies (like `db: Session` or config objects) explicitly via constructors or FastAPI dependency injection — never import globals mid-function.
> * **Encapsulation & Typing:** Enforce strict Python type hinting throughout. Use Pydantic schemas at all data boundaries; keep internal domain logic encapsulated in service classes.
> * **Design Patterns over Nested Logic:** When scaling `helper.py` or managing complex post states, favor clean patterns (Strategy, Factory) over deeply nested if/else.

---

## What This Product Is

"Git for writing" — version-controlled LinkedIn/Medium post library. Users create folders, write posts, save named versions. AI layer consists of AI agents which performs independant specialised tasks to help users write better content queries post history and gives writing help.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router v6, Axios |
| Styling | Tailwind CSS v4 (@tailwindcss/vite) · inline styles + `var(--cc-*)` (landing/dashboard) |
| Icons | lucide-react |
| Backend | FastAPI + Uvicorn |
| ORM | SQLAlchemy |
| Database | PostgreSQL 18 + pgvector |
| Migrations | Alembic |
| Auth | bcrypt direct (`bcrypt.hashpw/checkpw`) — **no passlib** (incompatible with bcrypt ≥ 4.0) |
| AI / RAG | LangChain, LangGraph, Google Gemini API |
| Embeddings | `models/gemini-embedding-001` — 768 dims (`output_dimensionality=768`) |
| LLM (writer / researcher main + expand) | `gemini-3.6-flash` (`writer_node.py`, `researcher.py` — `gemini-3.5-flash` deprecated server-side after `gemini-2.5-flash`); `thinking_level="low"` on writer + expand, `"high"` on researcher's main angle-generation loop (deliberate — needs real reasoning depth) |
| LLM (supervisor) | `gemini-3.5-flash-lite` (`supervisor.py`), `thinking_level="low"`, `max_output_tokens=2048` |
| LLM (style analyzer) | `gemini-3.1-flash-lite` (`agents/style_agent.py`) — **no `thinking_level` set.** Per the installed `langchain-google-genai` package's own docstring, Gemini 3+ models default to `thinking_level="high"` when unset — the file's comment calling this "a non-thinking model" is incorrect. `max_output_tokens=1024` shared between that unbounded "high" reasoning and a 9-key JSON answer is the same shared-budget shape that caused the writer/researcher truncation bug fixed in the most recent commit — this instance of it is still open, not yet fixed. See Known Gaps. |
| LLM resilience | `backend/ai/llm_retry.py` — tenacity exponential backoff on Gemini 429/503/504; `backend/ai/api_key_rotation.py` — falls back to `LANGCHAIN_API_KEY_GEMINI_2` when configured. **No client-side `timeout` is set on any agent LLM** — a hung call (observed 2026-07-22: `writer_node` invoked per the debug log, then no completion log and no error log, twice) can wait indefinitely with zero visibility. Still open — see Known Gaps. |
| Web search (researcher) | Tavily (`tavily-python`) — `tools.py`'s `web_search`, `search_depth="basic"`, 4 results max |
| Checkpointing | `AsyncPostgresSaver` (`langgraph-checkpoint-postgres` + `psycopg[binary,pool]`) — durable, survives a process restart; ownership tracked in a separate `thread_registry` table, not the checkpointer itself |
| Tracing | LangSmith (`linkedin-coach-rag` project) — **currently not working, root cause diagnosed 2026-07-22, not yet fixed:** `.env` sets `LANGCHAIN_TRACING_V2=true`/`LANGSMITH_API_KEY`/`LANGCHAIN_PROJECT` correctly, but nothing in the running app calls `load_dotenv()` — it's only called in `backend/alembic/env.py` (migrations). `Settings` (`backend/core/config.py`) uses `pydantic_settings`' `env_file=".env"`, which reads `.env` into its own declared fields only; it never copies arbitrary keys into the process's actual `os.environ`. LangSmith's SDK reads `LANGCHAIN_TRACING_V2`/`LANGSMITH_API_KEY`/`LANGCHAIN_PROJECT` directly via `os.environ`, independent of `Settings` entirely — so those vars have likely never reached a live app process, and tracing has never actually been active. Fix (not yet applied): add `load_dotenv()` to `backend/core/config.py` before `Settings()` is constructed. |

---

## Directory Map

```
f:\My_first_product\
├── .env                          ← NEVER COMMIT
├── .env.example
├── requirements.txt · alembic.ini
├── CLAUDE.md · claude_ui.md · DEVELOPMENT.md · supervisor_plan.md   ← supervisor_plan.md: rough LLD notes for the in-progress orchestrator/researcher/distiller/writer redesign — not yet implemented, see Known Gaps
│
├── backend/
│   ├── main.py                   ← FastAPI app, CORS, router registration (auth + vault + ai + linkedin + profile routers); `lifespan` context manager opens a durable `AsyncPostgresSaver` via `checkpointing/factory.py`'s `create_checkpointer()`, calls `.setup()` (idempotent — creates `checkpoints`/`checkpoint_blobs`/`checkpoint_writes`), compiles the graph once at startup and stashes it on `app.state.assistant` (see `ai/graph.py`'s `build_assistant()`) — threads now survive a process restart
│   ├── auth/
│   │   ├── base_auth.py          ← BaseAuthProvider ABC (Strategy pattern — PasswordAuth, future OAuth)
│   │   ├── models.py             ← User (id, username, email, password_hash, created_at)
│   │   ├── schemas.py            ← RegisterRequest, LoginRequest, AuthResponse
│   │   ├── service.py            ← UserService(db) · PasswordAuth(plain, hashed) — all auth logic
│   │   └── router.py             ← POST /api/auth/register · /login
│   ├── vault/
│   │   ├── models.py             ← Folder, Post, PostVersion, PostTag, PostPublishLog
│   │   ├── schemas.py            ← All Pydantic request/response models
│   │   ├── service.py            ← Business logic; all queries scoped to user_id
│   │   └── router.py             ← /api/vault/* — all require X-User-Id
│   ├── profile/
│   │   ├── models.py             ← UserProfile (profession/industry/role/target_audience/writing_style all nullable, goals/topics JSONB string arrays, formatting_prefs JSONB, linkedin_headline/about nullable)
│   │   ├── schemas.py            ← ProfileCreate, ProfileUpdate, OnboardingSubmit (all fields optional — NEW 2026-07-21), ProfileResponse
│   │   ├── service.py            ← ProfileService(db) class (auth-style ctor injection) + vault-style _own_profile(user_id, profile_id) ownership guard; upsert_from_onboarding() (NEW 2026-07-21 — get-or-create + exclude_unset partial merge, never 409s unlike create_profile)
│   │   └── router.py             ← POST/GET/PATCH /api/profile + POST /api/profile/onboarding (NEW 2026-07-21) — all require X-User-Id; onboarding is now wired end-to-end, PATCH/full-CRUD still has no standalone settings-page UI
│   ├── ai/
│   │   ├── router.py             ← POST /api/ai/query + /resume (HITL + angle-pick) + /stream (SSE) + /refine (single-LLM draft edit, no graph) + /draft-from-topic; `ThreadSessionService(ThreadRegistryService(db))` mints + registers each thread's owner on `/query`/`/stream`/`/draft-from-topic` (`.start()`), verifies ownership + touches last-active on `/resume` (`.resume_config()`, raises `PermissionError` → 403 on mismatch), marks a thread `completed` once the graph reaches a terminal state (`.complete()`); resolves the compiled graph via `Depends(get_assistant)` (→ `request.app.state.assistant`, compiled once at startup in `main.py`'s `lifespan`); calls setup_ai_file_logging() at startup
│   │   ├── _log_setup.py         ← file-based log handler setup; log_style_json() + log_research_json() helpers
│   │   ├── logs/                 ← AUTO-CREATED at runtime
│   │   │   ├── ai_debug.log      ← DEBUG+ from all backend.ai.* loggers
│   │   │   ├── errors.log        ← ERROR+ only
│   │   │   └── style_debug.log   ← full style JSON dumps on every style extraction
│   │   ├── embeddings.py         ← embed_and_store_version() — BackgroundTask, writes post_embeddings
│   │   ├── style_memory.py       ← Style memory lifecycle: window trigger, DB UPSERT, Redis cache
│   │   ├── rag_chain.py          ← Legacy RAG chain (reference only — superseded by graph)
│   │   ├── llm_retry.py          ← `invoke_with_retry`/`invoke_with_retry_sync` — tenacity exponential backoff wrapping `llm.ainvoke()`/`llm.invoke()` on Gemini 429/503/504; also calls `api_key_rotation.rotate_gemini_key()` before a retryable retry
│   │   ├── api_key_rotation.py   ← Gemini key fallback — `rotate_gemini_key(llm)` rebuilds the target LLM's internal `google.genai.Client` in place to switch to `LANGCHAIN_API_KEY_GEMINI_2`; no-op (returns False) until that env var is set
│   │   ├── checkpointing/
│   │   │   ├── factory.py        ← `create_checkpointer(database_url)` — single seam returning `AsyncPostgresSaver.from_conn_string(...)`
│   │   │   ├── models.py         ← `ThreadRegistry` (`thread_registry` table) — thread_id PK, user_id FK, status, timestamps; stores ownership only, never conversation content
│   │   │   └── service.py        ← `ThreadRegistryService(db)` (pure CRUD) + `ThreadSessionService(registry)` (facade — `.start()`/`.resume_config()`/`.complete()`); router.py depends on the facade only
│   │   ├── schemas/
│   │   │   └── research.py       ← Pydantic DTOs for the flat `research_brief` shape — `ResearchTopic`, `SupportingEvidence`, `FlatResearchBrief`, `topic_to_flat()` (consumed by `/draft-from-topic`); `ResearchBrief`/`fallback_brief()` are leftovers from the old, already-removed `research_digest_node` and are unused
│   │   ├── state.py              ← AgentState TypedDict — `research_result: dict` (`{"angles": [...], "search_context": str}`, written by `researcher_node`, read by `angle_review_node`/`map_chosen_angle_node`), `picked_angle_id: int|None` (set by `angle_review_node` on `"pick"`), `entry_point: str` (debug marker, unused by routing), `pre_routed: bool` (`/draft-from-topic` only). `research_brief`/`research_topics` are DORMANT per their own inline comments, but note `map_chosen_angle_node` in fact still writes `research_brief` — the state.py comment claiming "no longer written by any node" is stale, code is ground truth
│   │   ├── worker_states.py      ← StyleRetrieverState/ResearcherState ({user_id, query}); WriterState adds `writer_task`. No `AnalyticsState` anymore (removed with `analytics_node`). `ResearcherState` is now actually Send-dispatched to (`researcher_node`) — no longer the "defined but unused" placeholder it once was
│   │   ├── graph.py              ← LangGraph StateGraph, 8 nodes + 1 ToolNode (`supervisor_node`, `tool_node`, `style_retriever_node`, `writer_node`, `human_approval_node`, `researcher_node`, `angle_review_node`, `map_chosen_angle_node` — no `analytics_node`); `build_assistant(checkpointer)` compiles against a caller-supplied checkpointer, kept generic over any `BaseCheckpointSaver` — `main.py` now passes a durable `AsyncPostgresSaver`
│   │   └── agents/
│   │       ├── supervisor.py          ← COGNITIVE: binds 3 tools (`search_vault_posts`, `get_topic_inventory`, `get_style_memory`), then emits a `SupervisorClassification` JSON contract — `route: Literal["research", "direct"]` **only**; a vault-question is answered directly (`route="direct"`), a vault-redraft request is explicitly declined as unsupported (`route="direct"` with an explanatory `direct_answer`), and any fresh "write a post" request routes to `"research"` — there is no path from a fresh chat message straight to the writer anymore
│   │       ├── style_agent.py         ← COGNITIVE: analyze_style() LLM fn + style_retriever_node (MERGED — both are LLM nodes)
│   │       ├── writer_node.py         ← COGNITIVE: style-aware LinkedIn post drafter; Strategy: cold-start vs `_build_system_prompt(style_json, research_brief, writer_task)`; `writer_task.action` selects write-from-scratch vs rewrite-existing-draft; reads `research_brief` (angle/points/evidence/hook) — populated either by `map_chosen_angle_node` (after an angle pick) or `/draft-from-topic`'s manual pre-seed
│   │       ├── human_approval_node.py ← INTERRUPT: HITL checkpoint, saves on approve/edit (docstring still says "MemorySaver" — stale, the real checkpointer is `AsyncPostgresSaver`)
│   │       ├── tools.py               ← 4 async @tool functions — DB reads + Redis cache layer, plus `web_search` (Tavily). `get_post_analytics`/`analyze_publish_history`/`fetch_and_summarize_url` and their SQL helpers were removed with `analytics_node`
│   │       ├── sql_fetch_node.py      ← WRITE ONLY: save_draft_to_vault()
│   │       ├── vector_search_node.py  ← DEAD (kept for reference — logic lives in tools.py)
│   │       ├── helper.py              ← DEAD (superseded — delete when ready)
│   │       ├── base.py                ← `BaseResearcher` ABC — `async def research(query) -> dict`; still not subclassed by anything (`researcher_linkedin` is a standalone function, not a `BaseResearcher` implementation) even now that the researcher is implemented
│   │       ├── researcher.py          ← ✅ IMPLEMENTED + WIRED (no longer a stub): `researcher_linkedin()` runs its own manual `bind_tools()` loop (up to 6 rounds) over `web_search` (Tavily) + `search_vault_posts`, optionally grounded in `user_profile` context (role/industry/audience, fetched directly via SQLAlchemy — not `ProfileService`, to avoid its 404-on-missing-profile behavior), and parses the final turn into exactly 5 `ResearchAngle`s via a strict regex format (`ResearcherDecisionError` if the count is off). `researcher_node()` is the graph-facing wrapper Send-dispatched from `supervisor_node` — fetches profile context, calls `researcher_linkedin()`, reshapes its `{research_topics, research_search_context}` return into `state["research_result"] = {"angles", "search_context"}`. `expand_research_angle()` is a separate, tools-less one-shot LLM call used only by `angle_review_node`'s "expand" action — grounded solely in already-gathered search context, guaranteed never to trigger a fresh Tavily call. The module's own top-of-file docstring still says "Not yet wired into graph.py" — stale, ignore it, `graph.py` imports and registers `researcher_node` for real
│   │       └── angle_review_node.py   ← NEW: `angle_review_node` — INTERRUPT node, loops on `interrupt()` inside one invocation to support `pick`/`expand`/`modify`/`none_fit` without re-entering the node (`expand`/`modify` re-interrupt with updated payload; `pick` returns `picked_angle_id`; `none_fit` clears it and optionally feeds fresh user guidance back to `supervisor_node`). `map_chosen_angle_node` — pure Python, no LLM call, reshapes the picked `ResearchAngle` into `FlatResearchBrief` (writer_node's existing contract) and writes it to `state["research_brief"]`
│   ├── linkedin/
│   │   ├── models.py             ← LinkedInAuth SQLAlchemy model (linkedin_auth table)
│   │   ├── schemas.py            ← ConnectionStatusResponse, AuthUrlResponse, PublishResponse
│   │   ├── service.py            ← LinkedInConnectService (static): get_auth_url, handle_oauth_callback, publish_or_auth, disconnect
│   │   ├── api_client.py         ← LinkedInAPIClient (static): exchange_code, get_userinfo, create_post — httpx sync client
│   │   └── router.py             ← GET /connection-status · GET /auth/url · GET /auth/callback · POST /publish/{id} · DELETE /disconnect
│   ├── core/
│   │   ├── config.py             ← Settings (DATABASE_URL, REDIS_URL, LANGCHAIN_API_KEY_GEMINI, LINKEDIN_CLIENT_ID/SECRET/REDIRECT_URI, FRONTEND_URL) — no researcher-specific settings exist right now (no ENABLED_PROVIDERS, no RESEARCHER_LLM_MODEL); removed along with the old researcher package
│   │   ├── cache.py              ← Redis client (sync + async), tool/embed/style cache helpers
│   │   ├── database.py           ← SQLAlchemy engine, SessionLocal, Base
│   │   └── dependencies.py       ← get_db(), get_current_user() (reads X-User-Id header)
│   └── alembic/versions/         ← Migrations 0001–0015 (0010: post_publish_log FK CASCADE fix; 0011: linkedin_auth table; 0012: user_profile table; 0013: placeholder — the earlier chat_sessions/chat_messages migration this number belonged to was deleted along with that module, see Design Decisions; 0014: thread_registry table; 0015: extends user_profile with profession/goals/topics, relaxes industry/role/target_audience/writing_style to nullable — backs onboarding)
│
├── frontend/
│   ├── vite.config.js            ← @tailwindcss/vite plugin, @ alias → ./src
│   ├── jsconfig.json · package.json
│   └── src/
│       ├── main.jsx              ← BrowserRouter entry
│       ├── App.jsx               ← Routes (Landing/Login/Register/Dashboard/Analytics/MyWork), RequireAuth guard; ReviewQueueProvider wraps entire tree. Legacy `/app` MainApp route removed 2026-06-16.
│       ├── index.css             ← --cc-* tokens, --color-* tokens, Tailwind import
│       ├── api/
│       │   ├── auth.js           ← register(), login()
│       │   ├── vault.js          ← all vault API calls + X-User-Id Axios interceptor + updatePostAnalytics()
│       │   ├── ai.js             ← queryAI(prompt), resumeAI(thread_id, action, content, angle_id), streamQuery(), draftFromTopic()
│       │   ├── linkedin.js       ← getLinkedInStatus(), getLinkedInAuthUrl(), publishToLinkedIn(postId), disconnectLinkedIn()
│       │   ├── profile.js        ← submitOnboarding(answers) — POST /api/profile/onboarding (2026-07-21); getProfile() — GET /api/profile, resolves null on 404 instead of throwing (NEW 2026-07-23, used by ChatPage's workspace card). Same X-User-Id interceptor pattern throughout.
│       │   └── publishing.js     ← sendToReview() stub; publishPost() — LinkedIn delegates to publishToLinkedIn() (real); X/Reddit still stubs
│       ├── context/
│       │   └── ReviewQueueContext.jsx ← shared context for review queue state
│       ├── pages/
│       │   ├── HomePage.jsx      ← Login / Register / Forgot (3 modes); register now navigates to `/onboarding` instead of `/dashboard`
│       │   ├── OnboardingPage.jsx ← first-run-only 7-step questionnaire (`/onboarding`, RequireAuth), shown once right after signup; `finish()` fire-and-forgets `submitOnboarding()` (DB-backed as of 2026-07-21, see below) in addition to its own localStorage "already onboarded" flag — see claude_ui.md
│       │   ├── DashboardPage.jsx ← Fully redesigned: collapsible sidebar, 4 AgentCards, pipeline, AIPanel with initialInput
│       │   ├── AnalyticsPage.jsx ← /analytics route — analytics overview UI
│       │   ├── MyWorkPage.jsx    ← rebuilt 2026-06-16: shared AppSidebar | Canvas = Content Vault browsing view (faithful port, real data) OR redesigned DocEditor (History rail · rich-text toolbar · Research/Writing/Performance inspector rail · bottom AI command bar) — see claude_ui.md for full breakdown
│       │   └── landing/
│       │       ├── landingContent.js  ← COPY object — all text strings, no JSX
│       │       ├── LandingPage.jsx    ← Single-file landing (all sections as functions)
│       │       └── *.jsx              ← Hero, Navbar, Features… DEAD CODE (superseded)
│       ├── hooks/
│       │   ├── useAnalytics.js   ← calls getAnalyticsSummary(); used by DashboardPage Analytics card
│       │   ├── useIdeas.js       ← idea generation hook
│       │   ├── useResizableRail.js ← drag-to-resize hook; wired into MyWorkPage's left/right rails
│       │   └── useVault.js       ← real getFolders/getPostsInFolder/createFolder/createPost, feeds MyWorkPage's Content Vault view
│       └── components/
│           ├── AIAssistant/      ← AIAssistant.jsx (floating widget, currently unmounted) + useAIChat.js (shared hook, also used by MyWorkPage's bottom AI bar)
│           └── shared/           ← Button, Input, Badge, ContextMenu (generalized with a `variant="dashboard"` skin), AppSidebar (shared by DashboardPage + MyWorkPage, 2026-06-16)
│
└── aI_assistance_f1/RAG/RAG.ipynb
```

**Deleted 2026-06-16 (legacy `/app` MainApp stack, dead code):** `components/Editor/` · `components/PostList/` · `components/Sidebar/` · `components/ui/` · `lib/utils.js` · `AppContext.js` · `hooks/useFolders.js` · `hooks/usePosts.js` · `hooks/usePost.js` · `hooks/useTopics.js`.

---

## Route Map

→ Full route table in [claude_ui.md § Page Map](claude_ui.md). Post-login redirect: `/dashboard`.

---

## Database Schema

```sql
users(id UUID PK, username TEXT UNIQUE, email TEXT UNIQUE nullable, password_hash TEXT, created_at TIMESTAMPTZ)
folders(id UUID PK, user_id UUID FK→users, name TEXT, description TEXT, created_at TIMESTAMPTZ)
posts(id UUID PK, user_id UUID FK→users, folder_id UUID FK→folders, title TEXT,
      status post_status_enum, is_pinned BOOL DEFAULT false,
      current_version INT, scheduled_at TIMESTAMPTZ, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
post_versions(id UUID PK, post_id UUID FK→posts CASCADE, version_number INT,
              content TEXT, source TEXT, change_summary TEXT, char_count INT, created_at TIMESTAMPTZ
              UNIQUE(post_id, version_number))
post_tags(id UUID PK, post_id UUID FK→posts CASCADE, tag TEXT)
post_publish_log(id UUID PK, post_id UUID FK→posts CASCADE, version_id UUID FK→post_versions,
                 platform TEXT DEFAULT 'linkedin', published_at TIMESTAMPTZ)
post_embeddings(id UUID PK, post_id UUID FK→posts CASCADE, version_id UUID FK→post_versions CASCADE,
                user_id UUID FK→users, chunk_index INT, content TEXT, embedding vector(768))
user_style_memory(id UUID PK, user_id UUID UNIQUE FK→users CASCADE,
                  long_term JSONB, long_term_post_count INT DEFAULT 0, long_term_updated_at TIMESTAMPTZ,
                  short_term JSONB, short_term_post_count INT DEFAULT 0, short_term_updated_at TIMESTAMPTZ)
post_analytics(id UUID PK, post_id UUID UNIQUE FK→posts CASCADE, user_id UUID FK→users CASCADE,
               impressions INT DEFAULT 0, reactions INT DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT now())
linkedin_auth(id UUID PK, user_id UUID UNIQUE FK→users CASCADE,
              linkedin_id TEXT, linkedin_urn TEXT, access_token TEXT, token_type VARCHAR(32) DEFAULT 'Bearer',
              expires_at TIMESTAMPTZ, scope TEXT, display_name TEXT, email TEXT nullable,
              profile_image_url TEXT nullable, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
user_profile(id UUID PK, user_id UUID UNIQUE FK→users CASCADE,
             profession TEXT nullable, industry TEXT nullable, role TEXT nullable,
             target_audience TEXT nullable, writing_style TEXT nullable,
             goals JSONB DEFAULT '[]', topics JSONB DEFAULT '[]',
             formatting_prefs JSONB DEFAULT '{}', linkedin_headline TEXT nullable, linkedin_about TEXT nullable,
             created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
thread_registry(thread_id UUID PK, user_id UUID FK→users CASCADE,
                status TEXT DEFAULT 'active', created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
```

`chat_sessions`/`chat_messages` (the original migration 0013) existed briefly for persisted chat history and were removed along with the first Postgres-checkpointer experiment — see Design Decisions. That checkpointer has since come back (`thread_registry` above is its ownership-tracking table, not a chat-history table — it stores no conversation content).

**Indexes:** `idx_folders_user_id`, `idx_posts_user_id`, `idx_post_embeddings_user_id`, `idx_post_embeddings_hnsw` (HNSW cosine), `idx_user_style_memory_user_id`, `idx_post_analytics_user_id`, `ix_linkedin_auth_user_id`, `ix_user_profile_user_id`, index on `thread_registry.user_id`
**HNSW index on post_embeddings:** enabled at 768 dims (migration 0007); O(log n) cosine search.

---

## API Endpoints

### Auth — `/api/auth`
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/register` | `{username, email, password}` | `{user_id, username, email}` |
| POST | `/login` | `{username, password}` | `{user_id, username, email}` |

### Vault — `/api/vault` (all require `X-User-Id` header)
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/folders` | List / Create |
| PATCH/DELETE | `/folders/{id}` | Rename / Delete |
| GET/POST | `/folders/{id}/posts` | List / Create posts in folder |
| GET/PATCH/DELETE | `/posts/{id}` | Get / Rename / Delete |
| PATCH | `/posts/{id}/pin` | `{is_pinned: bool}` |
| PATCH | `/posts/{id}/folder` | `{folder_id}` — moves a post to a different folder (`service.move_post`); invalidates Redis tool cache via BackgroundTask |
| PATCH | `/posts/{id}/status` | `{status, scheduled_at?}` — persists `post_status_enum` to DB; fires `sync_check_and_refresh_style_memory` as BackgroundTask when status is `published` or `scheduled` |
| POST/GET | `/posts/{id}/versions` | Save / List versions |
| GET/PATCH/DELETE | `/versions/{id}` | Get / Rename label / Delete |
| GET | `/search?q=` | Keyword search across posts |
| PATCH | `/posts/{id}/analytics` | `{impressions, reactions}` — upsert user-logged metrics; invalidates analytics tool cache |
| GET | `/analytics/summary` | Returns `AnalyticsSummaryResponse` — total_impressions, avg_reactions, top_platform, monthly_trend |
| GET | `/posts/recent?limit=N` | Returns last N posts (`PostListResponse[]`) ordered by updated_at DESC — must be declared BEFORE `/posts/{post_id}` in router |
| DELETE | `/posts/{id}` | Deletes post + cascades to post_embeddings (FK CASCADE); invalidates Redis tool cache via BackgroundTask |
| DELETE | `/folders/{id}` | Deletes folder + cascades all posts + embeddings; invalidates Redis tool cache via BackgroundTask |

### AI — `/api/ai`
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/query` | `{prompt}` | Requires `X-User-Id`; calls LangGraph assistant. `ThreadSessionService.start()` mints + registers a new `thread_id` in `thread_registry`, durable across a process restart. If the graph paused at `angle_review_node` instead of `human_approval_node`, falls back to `aget_state()` and returns `status="awaiting_angle_selection"` with `angles`/`actions` |
| POST | `/stream` | `{prompt}` | Requires `X-User-Id`; SSE stream — primary path. Same thread-registration behavior as `/query`. `done` events: `{status:"awaiting_approval", thread_id, route:"style_retrieval"}` \| `{status:"awaiting_angle_selection", thread_id, angles, actions}` \| `{status:"complete", route}` |
| POST | `/resume` | `{thread_id, action, content?, angle_id?}` | Requires `X-User-Id`; `action` is either a `human_approval_node` decision (`approved`\|`edited`\|`rejected`) or an `angle_review_node` decision (`pick`\|`expand`\|`modify`\|`none_fit`, using `angle_id` for `pick`/`expand`). `ThreadSessionService.resume_config()` 403s if the requesting user isn't the thread's registered owner. Checks `aget_state()` after resuming — a `pick` can chain straight into a second interrupt (the newly-written draft's own `human_approval_node` pause), returned as `status="awaiting_approval"` |
| POST | `/refine` | `{draft, note}` | Requires `X-User-Id`; single LLM call — no graph traversal; used by ChatPage for iterative draft edits |
| POST | `/draft-from-topic` | `{topic, platform?}` | Requires `X-User-Id`; drafts a post from one picked research topic card, skipping supervisor classification (`pre_routed=True`) |

### Profile — `/api/profile` (all require `X-User-Id`)
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `` | `ProfileCreate` (industry, role, target_audience, writing_style, formatting_prefs?, linkedin_headline?, linkedin_about?) | 201; 409 if a profile already exists for this user — not used by onboarding, see `/onboarding` below |
| GET | `` | — | 200 with the user's profile; 404 if none created yet |
| PATCH | `` | `ProfileUpdate` (all fields optional, now includes `profession`/`goals`/`topics`) | Partial update via `exclude_unset`; 404 if no profile exists |
| POST | `/onboarding` | `OnboardingSubmit` (all 7 fields optional: profession, industry, role, target_audience, writing_style, goals[], topics[]) | 200; `ProfileService.upsert_from_onboarding()` — get-or-create + `exclude_unset` partial merge, **never 409s**. Called by `OnboardingPage.jsx`'s `finish()`, fire-and-forget (doesn't block navigation to `/dashboard`) |

### LinkedIn — `/api/linkedin` (all except `/auth/callback` require `X-User-Id`)
| Method | Path | Notes |
|---|---|---|
| GET | `/connection-status` | Returns `ConnectionStatusResponse` — `{connected, display_name?, profile_image_url?, expires_at?}` |
| GET | `/auth/url` | Returns `{auth_url}` — frontend must do `window.location.href = auth_url` (OAuth redirect, no headers) |
| GET | `/auth/callback?code=&state=` | LinkedIn callback; `state` = user_id set by us. On success: redirects to `FRONTEND_URL/mywork?linkedin_connected=true`. On failure: `?linkedin_error=true&reason=…` |
| POST | `/publish/{post_id}` | Publishes latest saved version to LinkedIn. Returns `PublishResponse`: `{published, needs_auth, auth_url?, reason?, linkedin_post_id?, duplicate?}`. If `needs_auth=true` frontend redirects to `auth_url`. Also upserts `PostPublishLog`, updates post status to `published`, fires style_memory background check. |
| DELETE | `/disconnect` | Removes LinkedIn token. Returns 204. |

---

## Frontend API Layer

### vault.js
All functions resolve directly (`.then(r => r.data)` applied). **No `.data` at call site.**

```js
getFolders()                        → folder[]
createFolder(name, description)     → folder
renameFolder(id, name)              → folder
deleteFolder(id)                    → {}
getPostsInFolder(folderId)          → post[]   // only way to list posts — no global getPosts()
createPost(folderId, title)         → post
getPost(id)                         → post
renamePost(id, title)               → post
deletePost(id)                      → {}
pinPost(id, is_pinned)              → post
movePost(id, folder_id)             → post   // PATCH /posts/{id}/folder — moves a post into a different folder
saveVersion(postId, content, label) → version
getVersions(postId)                 → version[]
getVersion(versionId)               → version
renameVersion(versionId, label)     → version
deleteVersion(versionId)            → {}
search(query)                       → result[]
getAnalyticsSummary()               → {total_impressions, avg_reactions, top_platform, monthly_trend}
getRecentPosts(limit=2)             → post[]  // used by Dashboard Writer card to show currentDraft title
updatePostStatus(id, status, scheduledAt?) → post  // PATCH /posts/{id}/status — persists published/scheduled/draft to DB; triggers style extraction
```

**No global getPosts().** To get all user posts: `getFolders()` → `Promise.all(folders.map(f => getPostsInFolder(f.id)))` → flatten.

### ai.js
Separate Axios instance (`baseURL: /api/ai`), same `X-User-Id` interceptor. Threads are now durably persisted server-side (`thread_registry` + `AsyncPostgresSaver`) and ownership-checked on resume — the frontend still treats `thread_id` as an opaque per-exchange handle, it doesn't do anything differently now that persistence is durable.
```js
queryAI(prompt)                                          → {status, answer?, draft?, thread_id?}
resumeAI(thread_id, action, content='', angle_id=null)   → {answer, draft?, status?, angles?, actions?, ...}
refineAI(draft, note)                                    → {refined_draft}   // single-LLM refinement, no graph
streamQuery(prompt, onToken, onDone, onError)            → abort()   // SSE; onDone receives {status, thread_id?, angles?, actions?, route?}
draftFromTopic(topic, platform='linkedin')               → {answer, draft?, thread_id?, status}
```
`status === 'awaiting_approval'` → HITL flow: show draft with Approve / Make Changes / Decline buttons.
`status === 'awaiting_angle_selection'` → show the 5 research angles from `angles`; `resumeAI(thread_id, 'pick', '', angleId)` writes a post from the chosen one (chains into a second `awaiting_approval` pause), `'expand'` gets a grounded summary of one angle, `'none_fit'` (optionally with fresh `content` guidance) sends the request back to `supervisor_node` for re-classification.
`refineAI` used by `ChatPage` for all follow-up messages when a draft exists in the session — bypasses supervisor and style-retrieval, one direct `_llm.ainvoke()` call in `POST /api/ai/refine`.

Chat history in `ChatPage.jsx` is in-memory-only for the page's lifetime (a local cache keyed by chat id, not backed by any API) — there is no `chats.js` API module.

### linkedin.js
Separate Axios instance (`baseURL: /api/linkedin`), same `X-User-Id` interceptor.
```js
getLinkedInStatus()          → {connected, display_name?, profile_image_url?, expires_at?}
getLinkedInAuthUrl()         → {auth_url}   // caller must do window.location.href = auth_url
publishToLinkedIn(postId)    → {published, needs_auth, auth_url?, reason?, linkedin_post_id?, duplicate?}
disconnectLinkedIn()         → (204, no body)
```
If `needs_auth=true` on `publishToLinkedIn`, the caller must redirect to `result.auth_url`.
`publishing.js`'s `publishPost()` delegates to `publishToLinkedIn()` when `platforms.includes('linkedin') && !scheduledAt`.

### profile.js
Separate Axios instance (`baseURL: /api/profile`), same `X-User-Id` interceptor — every call is scoped server-side to the header's user via `get_current_user()` + `ProfileService`, never returns another user's row.
```js
submitOnboarding(answers)    → ProfileResponse   // POST /api/profile/onboarding — get-or-create partial merge
getProfile()                 → ProfileResponse | null   // GET /api/profile — null on 404 (no profile row yet) instead of throwing
```
`getProfile()` backs `ChatPage.jsx`'s workspace document panel — shows the real user's name (from `localStorage`) and profession (`profile.profession || profile.role`, falling back to a generic "Creator on Honne" string when the user has no profile row, e.g. skipped onboarding entirely).

---

## Authentication Flow

1. `POST /api/auth/register` → `UserService.register()` → bcrypt hash → store → return `{user_id, username, email}`
2. `POST /api/auth/login` → `UserService.login()` → `PasswordAuth.validate()` → return user
3. Frontend: stores `user_id` + `username` in `localStorage`
4. Axios interceptor in `vault.js` sends `X-User-Id: <uuid>` on every vault/AI call
5. `get_current_user()` reads header → 401 if missing/invalid
6. All service functions receive `user_id`, enforce ownership (`_own_folder`, `_own_post`, `_own_version`)

**Auth pattern:** `BaseAuthProvider` ABC → `PasswordAuth` (current) → future: `GoogleAuth`, `LinkedInAuth`
**Limitation:** Header-based, no token expiry — dev-grade. JWT planned later.

---

## Agent Architecture

### Node Catalogue

| Node | Category | File | Status | Responsibility |
|---|---|---|---|---|
| `supervisor_node` | COGNITIVE + TOOL CALLER | `agents/supervisor.py` | ✅ Done | Binds 3 tools (`search_vault_posts`, `get_topic_inventory`, `get_style_memory`), loops on tool calls, then emits a `SupervisorClassification` Pydantic JSON contract — **`route: Literal["research", "direct"]` only**. A vault question is answered directly; a vault-redraft request is explicitly declined (`route="direct"` with an explanatory `direct_answer` — redrafting an existing post isn't supported); every fresh "write a post" request routes to `"research"`. There is no route straight to the writer from a fresh chat message anymore. |
| `tool_node` | EXECUTOR | `graph.py` (LangGraph `ToolNode`) | ✅ Done | Bound to 2 tools (`search_vault_posts`, `get_topic_inventory`). Executes whatever tool the LLM called; writes result as `ToolMessage` into messages; loops back to supervisor. |
| `style_retriever_node` | COGNITIVE | `agents/style_agent.py` | ✅ Done | Dispatched via Send API with minimal state `{user_id, query}`. Redis → DB cache read; on miss: calls `analyze_style()` on-demand; fires background stale-check on cache hit. Writes `style_json`. |
| `writer_node` | COGNITIVE | `agents/writer_node.py` | ✅ Done | Style-aware LinkedIn post drafter. Strategy pattern: cold-start prompt vs. `_build_system_prompt(style_json, research_brief, writer_task)`. `writer_task.action` (`"write"` vs `"rewrite"`) picks fresh-post vs apply-constraints-to-existing-draft. Weaves in `research_brief` (angle/talking points/evidence/hook) when present — now genuinely populated via the researcher → angle-pick → write chain, not just `/draft-from-topic`'s pre-seed. Writes `draft`. |
| `human_approval_node` | INTERRUPT | `agents/human_approval_node.py` | ✅ Done | `interrupt()` HITL checkpoint. On approve/edit calls `save_draft_to_vault()`; on reject discards. |
| `sql_fetch_node` | WRITE ONLY | `agents/sql_fetch_node.py` | ✅ Done | Contains only `save_draft_to_vault()`. All read queries live in `tools.py`. |
| `researcher_node` | COGNITIVE + TOOL CALLER | `agents/researcher.py` | ✅ Done | Dispatched via Send API with minimal state `{user_id, query}`. Fetches `user_profile` context (if any), runs its own manual `bind_tools()` loop (up to 6 rounds) over `web_search` (Tavily) + `search_vault_posts`, parses the final turn into exactly 5 `ResearchAngle`s via regex. Writes `research_result = {angles, search_context}`. |
| `angle_review_node` | INTERRUPT | `agents/angle_review_node.py` | ✅ Done | Loops on `interrupt()` within one invocation to handle `pick`/`expand`/`modify`/`none_fit` without re-entering the node. `pick` → sets `picked_angle_id`; `expand` → one-shot grounded summary via `expand_research_angle()`, re-interrupts with the same angles + the summary; `modify` → not implemented, re-interrupts with an error note; `none_fit` → clears `picked_angle_id`, optionally carries fresh user text back to `supervisor_node`. |
| `map_chosen_angle_node` | PURE PYTHON | `agents/angle_review_node.py` | ✅ Done | No LLM call. Reshapes the picked `ResearchAngle` into `FlatResearchBrief` and writes `research_brief` — feeds the existing `style_retriever_node → writer_node` pipeline. |

**`analytics_node` was removed entirely (2026-07-20)** — dead feature, no product need identified. Its graph node/route, the `tool_node`'s wider tool-binding, `get_post_analytics`/`analyze_publish_history`/`fetch_and_summarize_url` tools and their SQL helpers, and their tests were all deleted together. The unrelated vault-side `post_analytics` dashboard (`PATCH /posts/{id}/analytics`, `AnalyticsPage.jsx`) is untouched — that's user-logged metrics, not an AI agent.

> **Architecture rule:** All agent nodes and tool functions are `async def` using `await llm.ainvoke()` / `asyncio.to_thread()` — multi-tenant, all LLM + DB calls are I/O-bound. Never use sync `llm.invoke()` inside graph nodes or tools.

---

### AgentState (`backend/ai/state.py`)

| Field | Type | Set by | Purpose |
|---|---|---|---|
| `query` | str | router | original prompt, never mutated |
| `user_id` | str | router | scopes ALL database operations |
| `messages` | list[HumanMessage\|AIMessage] | add_messages reducer | includes HumanMessage, AIMessage (with tool_calls), ToolMessage (tool results) |
| `task_type` | str | router / supervisor_node | `""\|"general"\|"write"\|"suggest"` — not read by `_supervisor_router` (routing reads `route`, not this) |
| `route` | str | supervisor_node | edge key read by `_supervisor_router`: `"research"\|"tools"\|"direct"` (plus `"style_retrieval"`, only ever pre-seeded by `/draft-from-topic`, never emitted by `supervisor_node` itself) |
| `steps_taken` | int | supervisor_node | tool-loop step budget, capped at 6 (`_MAX_STEPS`); overrunning forces `route="direct"` instead of raising |
| `research_result` | dict | researcher_node | `{"angles": [5 ResearchAngle dicts], "search_context": str}` — read by `angle_review_node` (surfaced in the interrupt payload) and `map_chosen_angle_node` (indexed by `picked_angle_id`) |
| `picked_angle_id` | int \| None | angle_review_node | set on `"pick"`; `None` while nothing's picked yet, or on `"none_fit"` |
| `entry_point` | str | angle_review_node | debug/forward-compat marker, not consumed by any routing logic yet |
| `pre_routed` | bool | router (`/draft-from-topic` only) | `True` bypasses `supervisor_node` entirely via the graph's conditional entry point, straight to `style_retriever_node` |
| `style_json` | dict | style_retriever_node | `{long_term: {9 keys}, short_term: {9 keys}\|None}` |
| `research_brief` | dict | map_chosen_angle_node / router | `{recommended_angle, talking_points, supporting_evidence, past_coverage, avoid_repeating, suggested_length, suggested_hook}` (`FlatResearchBrief`) — written either by `map_chosen_angle_node` after an angle pick, or pre-seeded by `/draft-from-topic`'s `topic_to_flat()`; empty `{}` if neither ran this thread. (`state.py`'s own inline comment calls this "DORMANT... no longer written by any node" — that's stale, `map_chosen_angle_node` does write it; trust the code) |
| `research_topics` | list | — | DORMANT — was written by the old, already-deleted `research_digest_node`; nothing populates it now, kept only for `/stream`'s dead fallback branch |
| `writer_task` | dict | router | `{action: "write"\|"rewrite", topic, constraints: []}` — set by `_build_initial_state()`/`/draft-from-topic`, always `action="write"` today (no node sets `"rewrite"` — the vault-redraft case that used to set it no longer exists in `supervisor.py`) |
| `draft` | str | writer_node | LinkedIn post draft |
| `approval_status` | str | human_approval_node | `""/"approved"/"edited"/"rejected"` |
| `answer` | str | supervisor_node / human_approval_node | final response returned to frontend |

---

### Graph Topology (current — Orchestrator-Worker via Send API)

```
START
  │
  ▼
supervisor_node ── binds 3 tools via llm.bind_tools([...]); emits a
  │                 SupervisorClassification JSON contract (route: "research"|"direct")
  │
  ├─ last msg has tool_calls? ──► tool_node (LangGraph ToolNode, 2 tools)
  │                                    │ result → ToolMessage into messages
  │                                    └──► supervisor_node (loop)
  │
  ├─ route == "research" ──► Send API ──► researcher_node  (worker: Tavily + Gemini, 5 angles)
  │                                              │ writes research_result
  │                                              ▼
  │                                     angle_review_node  (INTERRUPT: pick/expand/modify/none_fit)
  │                                              │
  │                            picked_angle_id set? ──no──► supervisor_node (re-classify, steps_taken caps loop)
  │                                              │
  │                                             yes
  │                                              ▼
  │                                     map_chosen_angle_node  (pure python: angle → research_brief)
  │                                              │
  │                                              ▼
  ├─ route == "style_retrieval" ──► Send API ──► style_retriever_node  (worker, minimal state) ◄── (both paths join here)
  │    (only ever pre-seeded by /draft-from-topic's                    │
  │     pre_routed=True conditional entry — supervisor_node             ▼
  │     itself never emits this route)                          writer_node  (full merged state; uses research_brief if present)
  │                                                                     │
  │                                                            human_approval_node ──► END
  │
  └─ route == "direct" ──► END   (answer already set by supervisor_node's own JSON contract)
```

**Routing rule:** `supervisor_node` runs a tool-calling loop (capped at `_MAX_STEPS=6`, forcing `route="direct"` if exceeded), then produces a `SupervisorClassification` Pydantic object (`route: Literal["research", "direct"]`, plus `direct_answer` when direct) parsed via `model_validate_json()`. A parse/validation failure raises `SupervisorDecisionError` — propagated to `router.py`'s exception handler, never silently swallowed into a fabricated fallback. `_supervisor_router` (in `graph.py`) reads `state["route"]` directly to decide the edge.

**Send API dispatch:** `route=="research"` → `[Send("researcher_node", {user_id, query})]`; `route=="style_retrieval"` (pre-seeded only) → `[Send("style_retriever_node", {user_id, query})]`. Each worker gets only the minimal slice it needs; its output merges back into global `AgentState`, which then flows through fixed edges.

**Research → angle-pick → write chain:** `researcher_node` writes `research_result`; the graph's fixed edge always sends this into `angle_review_node`, which `interrupt()`s so the frontend can render the 5 angles. The user's decision (`pick`/`expand`/`modify`/`none_fit`) comes back via `POST /api/ai/resume`. `expand`/`modify` re-interrupt the same node with an updated payload (no state transition). `pick` sets `picked_angle_id` and `_angle_review_router` sends the graph on to `map_chosen_angle_node` → `research_brief` → the *same* `style_retriever_node → writer_node → human_approval_node` pipeline a fresh write uses. `none_fit` clears `picked_angle_id` and loops back to `supervisor_node` for re-classification (optionally with fresh user text attached as a new `HumanMessage`).

**No vault-redraft flow exists today.** A user asking to redraft/transform an existing saved post gets a `route="direct"` decline from `supervisor_node`'s classification prompt — this replaces an earlier iteration of the pipeline (documented in a prior version of this doc) that fetched the post and routed it through `writer_task.action="rewrite"`; that code path is gone from the current `supervisor.py`.

**Tool loop:** If the LLM emits tool calls, `tool_node` executes them and loops back to supervisor, which re-runs classification with the tool results now in `messages`.

**DB access pattern:**
- READ: `tools.py` — async `@tool` functions; SQL via `asyncio.to_thread()`; pgvector scan inside `search_vault_posts`
- WRITE: `save_draft_to_vault()` in `sql_fetch_node.py`, called by `human_approval_node` on approve/edit

### Tools (`backend/ai/agents/tools.py`)

| Tool | Used for | Data source |
|---|---|---|
| `search_vault_posts(user_id, query)` | general Q&A; also bound into `researcher_node`'s tool loop (only called when the user references their own past posts) | pgvector cosine scan (top 6 chunks, 650-char chunks); no fallback |
| `get_style_samples(user_id)` | dead/unused — not bound by `tool_node`, `supervisor_node`, or `researcher_node`; style now owned entirely by `style_retriever_node` | compressed style memory JSON (Redis → DB → 2 raw posts cold-start) |
| `get_topic_inventory(user_id)` | suggest / general Q&A | all post titles + distinct tags |
| `get_style_memory(user_id)` | meta-questions about the user's own writing style/evolution (not for drafting — that's writer_node's job) | `style_memory.get_style_memory()` + `format_style_memory_for_writer()` |
| `web_search(query)` | researcher_node's angle-generation loop | Tavily (`search_depth="basic"`, 4 results max); result cache keyed by query text (global, not user-scoped) |

`tool_node` (the generic `graph.py` `ToolNode`) is bound to only 2 of these (`search_vault_posts`, `get_topic_inventory`). `supervisor_node`'s own `bind_tools()` call uses a different set of 3 (those 2 plus `get_style_memory`, not `get_style_samples`/`web_search`). `researcher_node`/`researcher_linkedin` runs its own separate manual tool loop over `web_search` + `search_vault_posts` — it does not go through `tool_node` at all. Keep this three-way asymmetry in mind if adding/removing a tool.

`get_post_analytics`, `analyze_publish_history`, and `fetch_and_summarize_url` (and their SQL helpers) were removed along with `analytics_node` (2026-07-20) — do not reference them, they no longer exist in `tools.py`.

---

## Design Patterns in Use

| Pattern | Where | How |
|---|---|---|
| **Singleton** | `_llm` in each agent file | Module-level instance, created once per process by Python's module system |
| **Orchestrator-Worker** | `graph.py` + `supervisor.py` | Supervisor dispatches specialist workers via LangGraph Send API; each worker gets only the state slice it needs |
| **Pipeline / Chain of Responsibility** | `graph.py` fixed edges | `style_retriever_node → writer_node → human_approval_node → END` — each node enriches state and passes it downstream |
| **State Machine** | `graph.py` `StateGraph` | Nodes are states, edges are transitions; `_supervisor_router` is the transition function |
| **Strategy** | `agents/writer_node.py` | `if not style_json` → cold-start prompt; else → `_build_system_prompt()`. Same interface (`ainvoke`), swapped behaviour |
| **Cache-Aside** | `agents/tools.py`, `style_memory.py` | Redis check → return on hit; DB query on miss → write back to Redis |
| **Decorator** | `agents/tools.py` | `@tool` wraps plain async functions into LangChain Tool objects with schema inference |
| **DTO (Data Transfer Object)** | `state.py`, `worker_states.py` | TypedDicts are pure data carriers with no behaviour; define the contracts between pipeline stages |
| **Facade** | `style_memory.py` | Hides Redis + PostgreSQL dual-store, TTL logic, and window-threshold triggers behind 3 clean functions |
| **Structured Output** | `agents/supervisor.py` | `SupervisorClassification(BaseModel)` — the LLM's final turn is parsed via `model_validate_json()`, not string-matched `[HANDOFF:*]` tokens (that Command-style approach was replaced) |
| **Fire-and-Forget** | `agents/style_agent.py` | `asyncio.ensure_future(to_thread(sync_check_and_refresh...))` fires stale-check in background, returns cached result immediately |
| **Builder** | `agents/writer_node.py` | `_build_system_prompt()` assembles a multi-section prompt from style block, evolution note, research brief, and action instruction |
| **Human-in-the-Loop (Interrupt)** | `agents/human_approval_node.py`, `agents/angle_review_node.py` | `interrupt()` pauses graph mid-run, serialises state to the durable `AsyncPostgresSaver`, surfaces draft/angles to frontend, resumes only on `/resume`. `angle_review_node` additionally loops on `interrupt()` *within one invocation* to handle `expand`/`modify` without a full node re-entry |
| **Template Method (ABC, unimplemented)** | `agents/base.py`, `agents/researcher.py` | `BaseResearcher.research(query)` is the contract future per-platform researchers will implement; `researcher_linkedin` is a standalone function, now fully implemented, that still doesn't subclass it — an explicit seam, not a finished pattern |
| **Facade** | `checkpointing/service.py` | `ThreadSessionService` is the only thing `router.py` depends on — hides `ThreadRegistryService`'s CRUD and the raw checkpointer config dict behind `.start()`/`.resume_config()`/`.complete()` |
| **Retry / Circuit-breaker-lite** | `llm_retry.py`, `api_key_rotation.py` | `invoke_with_retry()` wraps `tenacity` exponential backoff around Gemini 429/503/504; on a retryable failure it also calls `rotate_gemini_key()` to switch to a fallback key before the next attempt, rather than retrying the same exhausted key |

---

## Known Gaps / Next Steps

### AI Agent Pipeline

| Step | Node/File | Status | Notes |
|---|---|---|---|
| — | `tools.py` | ✅ Done | 5 async `@tool` functions — all DB reads + `web_search` (Tavily) live here |
| — | `supervisor_node` | ✅ Done (rewritten) | `SupervisorClassification` contract, `route: Literal["research","direct"]` only; tool-loop via `bind_tools()`. No vault-redraft flow (declines redraft requests as unsupported) |
| — | `tool_node` (LangGraph prebuilt) | ✅ Done | Executes tool called by LLM; appends ToolMessage; loops to supervisor |
| — | `style_agent.py` | ✅ Done | `analyze_style()` + `style_retriever_node` merged into one file — both are LLM nodes; circular import broken via local import |
| — | `writer_node` | ✅ Done | Strategy pattern: cold-start vs. `_build_system_prompt()` from style_json; `research_brief` now genuinely populated by the researcher/angle-pick chain, not just `/draft-from-topic` |
| — | `human_approval_node` | ✅ Done | `interrupt()` HITL, saves on approve/edit |
| — | `sql_fetch_node` | ✅ Done | Write-only: `save_draft_to_vault()` |
| — | `router.py` | ✅ Done | Durable `thread_id` registered per request via `ThreadSessionService`, `/stream` SSE, `/resume` handles both HITL and angle-pick decisions, `/draft-from-topic` |
| — | `helper.py` | Dead | Delete when cleaning up |
| — | `vector_search_node.py` | Dead | Logic lives in `tools.py`; delete when cleaning up |
| — | `analytics_node` | ❌ Removed (2026-07-20) | Dead feature — no product need identified. Node, route, wider tool-binding, `get_post_analytics`/`analyze_publish_history` tools + SQL helpers, and their tests all deleted together |
| — | Researcher agent (v2, Stage 1) | ❌ Removed (superseded) | The `agents/research/` package built for Stage 1 (SOLID provider abstractions, Gemini-grounding web search, Reddit search, lexical dedup, evergreen fallback) was deleted outright before v3 replaced it |
| — | Researcher agent (v3) | ✅ Done | `agents/researcher.py` (`researcher_linkedin`/`researcher_node`) + `agents/angle_review_node.py` (`angle_review_node`/`map_chosen_angle_node`) — fully implemented and wired into `graph.py`, Send-dispatched from `supervisor_node`'s `route="research"`. Tavily `web_search` + `search_vault_posts`, manual tool loop, 5 `ResearchAngle`s, interrupt-based pick/expand/modify/none_fit. `supervisor_plan.md`'s original vision (orchestrator chains researcher → distiller → writer with the supervisor deciding after each step) is only partly realized — there's no separate "distiller" module; `angle_review_node`'s "expand" action serves a narrower, single-angle version of that idea |
| — | `user_profile` UI | ✅ Onboarding wired (2026-07-21); standalone editor still not built | `OnboardingPage.jsx` now writes profession/industry/role/target_audience/writing_style/goals/topics via `POST /api/profile/onboarding`; `researcher_node` reads it to ground its domain-fit judgment. There's still no settings-page form to view/edit the profile after onboarding — only `PATCH /api/profile` exists for that, unused by any UI |
| — | Durable checkpointing | ✅ Reintroduced (2026-07-20) | `AsyncPostgresSaver` + `thread_registry` (migration 0014) + `ThreadRegistryService`/`ThreadSessionService` — threads now survive a process restart, and `/resume` 403s a non-owner. This reverses the 2026-07-19 removal documented in prior versions of this doc |

### Other Gaps

| Location | Status | Description |
|---|---|---|
| Forgot password | Placeholder | UI only — no backend endpoint |
| Redis | Not running locally | Cache layer built and wired; needs `docker run -d -p 6379:6379 redis:alpine` to activate |
| CORS | Dev only | Hardcoded `http://localhost:5173` |
| JWT | Not implemented | Plain UUID in header, no expiry |
| Legacy landing files | Dead code | `Hero.jsx`, `Navbar.jsx` etc. superseded by `LandingPage.jsx` |
| `HomePage.module.css` | Unused | No longer imported by `HomePage.jsx` |
| MetricsForm | Broken | Calls `upsertMetrics()` which doesn't exist in API — now superseded by `PATCH /posts/{id}/analytics` |
| Embedding backfill | Pending | Existing `post_versions` rows have no embeddings — new saves embed automatically at 650-char chunks; old content needs a one-off backfill script |
| Style memory cold start | Expected | First write request before user reaches 3 published posts uses 2 raw posts; auto-generates once threshold is crossed |
| AI UI integration | ✅ Done | `AIAssistant.jsx` wired to `ai.js`; supports query, draft approval (Approve/Edit/Reject), and HITL resume flow |
| Dashboard analytics UI | ✅ Done | Analytics card in DashboardPage wired to `useAnalytics()` hook → `GET /api/vault/analytics/summary`; shows impressions, avgLikes, topPlatform |
| Post analytics UI | ✅ Done | `MetricsCard` in `MyWorkPage.jsx`'s inspector rail calls `updatePostAnalytics()`; doesn't refetch existing values on reopen (no GET-single-post-analytics endpoint) |
| Chunk size backfill | Pending | Chunk size changed 300→650; existing embeddings need re-embedding for consistent retrieval quality |
| `writer_node` silent failure | 🔴 Open, diagnosed 2026-07-22 not fixed | Debug log shows `writer_node invoked` → cold-start log line → nothing: no `draft generated` INFO log, no error log (`errors.log` is 0 bytes), happened twice ~1m41s apart on the same thread. No agent LLM has a client-side `timeout` set, so a hung call to `gemini-3.6-flash` (a brand-new model at time of writing) would wait indefinitely with zero error/log. Compounded by `/query` and `/draft-from-topic` in `router.py` having **no try/except at all** around `assistant.ainvoke()` — unlike `/stream`, an exception or hang there never reaches `errors.log`. Needs: verify the exact request in Google AI Studio's own log (succeeded/errored/never received), add `timeout=` to each agent LLM, wrap `/query`/`/draft-from-topic` in the same try/except-and-log pattern `/stream` already uses. |
| `style_agent.py` thinking-budget risk | 🔴 Open | No `thinking_level` set — defaults to `"high"` on Gemini 3+ (confirmed from the installed package's own docstring), contradicting the file's own comment that this is "a non-thinking model." `max_output_tokens=1024` shared between that and a 9-key JSON answer is the same shape that caused the writer/researcher truncation bug already fixed elsewhere — this instance is still open. |
| No LLM rate limiting | 🔴 Open | Explicit unaddressed TODO at `tools.py:255` — `web_search` (Tavily, costs money per call) has no per-user/per-day cap. No FastAPI-level request throttling exists anywhere in the app either. |
| LangSmith tracing | 🔴 Open, diagnosed 2026-07-22 not fixed | See Tech Stack table above — `load_dotenv()` is never called for the live app, so `.env`'s tracing vars never reach `os.environ`. |
| LinkedIn publish integration | ✅ Done | Full OAuth flow live: `backend/linkedin/` module + `linkedin_auth` table (migration 0011) + `GET /api/linkedin/auth/url` → redirect → `GET /api/linkedin/auth/callback` → token stored → `POST /api/linkedin/publish/{id}`. Frontend: `api/linkedin.js` + `SchedulePublishSheet` connect banner in `MyWorkPage.jsx`. Edge cases covered: no token, expired token, revoked token (auto-reconnect), 3000-char limit, 60s duplicate guard. |
| X/Reddit publish integration | Stub | `publishPost()` in `publishing.js` still returns a timed stub for X/Reddit — real platform API integration deferred |
| Floating AIAssistant FAB | Unmounted | `AIAssistant.jsx` + its FAB/panel chrome aren't rendered anywhere currently; `useAIChat()` (its extracted hook) is reused by `MyWorkPage.jsx`'s bottom AI command bar instead |

---

## Design Decisions & Constraints

- **Logical multi-tenancy** — single DB, `user_id` on every table; no schema-per-tenant
- **bcrypt direct** — `passlib` dropped (incompatible with bcrypt ≥ 4.0)
- **Auth SRP** — `UserService(db)` owns all auth logic; `PasswordAuth` is a pure validator; `BaseAuthProvider` ABC for future OAuth
- **No JWT yet** — plain UUID header; deferred
- **Redis cache** — `backend/core/cache.py`; tool results cached per user (30-min TTL, invalidated on save); query embeddings cached 24 h; gracefully degrades (silent fail) when Redis is not running
- **No RLS** — deferred; ownership enforced in service layer
- **768-dim embeddings** — Gemini embedding-001 with `output_dimensionality=768`; 4× smaller than 3072; HNSW index added (migration 0007); `task_type="retrieval_document"` for ingestion, `"retrieval_query"` for search
- **Embedding on save** — `embed_and_store_version()` fires as FastAPI `BackgroundTask` after every `save_version`; HTTP 201 returns immediately; old version chunks deleted before new ones inserted
- **Async agent nodes** — all `backend/ai/agents/*.py` functions are `async def` + `await llm.ainvoke()` for multi-tenant I/O concurrency; never use sync `llm.invoke()` inside graph nodes
- **post_embeddings only** — `langchain_pg_embedding` + `langchain_pg_collection` dropped in migration 0007; single custom table with user_id scoping
- **Style Memory system** — `user_style_memory` table (migration 0008); `agents/style_agent.py` (merged from `style_analyzer.py` + `style_retriever_node.py`) + `style_memory.py`; window-based trigger (short-term every 3 new committed posts, long-term every 10); `analyze_style()` uses `gemini-2.0-flash-lite` at temp=0.1, max_output_tokens=512; outputs 9-key JSON; stored as JSONB in PostgreSQL (source of truth) and cached in Redis (`style:lt:{uid}` 24 h, `style:st:{uid}` 1 h); Redis is RAM-only so DB is always the durable source — Redis re-warms on any DB hit; `style_retriever_node` owns style fetching (not `get_style_samples` tool, which is now fully unused/dead); trigger fires only from `PATCH /posts/{id}/status` — counting both `published` AND `scheduled` posts since both represent committed content
- **Chunk size 650 / overlap 80** — changed from 300/60 (2026-06-09); LinkedIn posts average 700–2500 chars; 650-char chunks keep one coherent idea per chunk; requires re-embedding existing posts (backfill pending)
- **No search_vault_posts fallback** — removed (2026-06-09); fallback dumped full post content into the LLM; embeddings are always written on `save_version` so fallback is dead code; returns `[NO_CONTEXT_FOUND]` when fewer than 1 vector hit exists
- **`analytics_node` removed entirely (2026-07-20)** — dead feature with no identified product need; deleted rather than left dormant, following this project's preference for deleting unused code outright over commenting it out or gating it behind a flag. Removed together: the graph node + `"analytics"` route value (`supervisor.py`'s `SupervisorClassification.route` is now `Literal["research", "direct"]`), `tool_node`'s wider tool-binding, `get_post_analytics`/`analyze_publish_history` tools + their SQL helpers in `tools.py`, `AnalyticsState` in `worker_states.py`, and the corresponding tests. The unrelated vault `post_analytics` table/dashboard (below) is untouched — that's user-logged metrics on a post, not an AI agent.
- **post_analytics table** — user-logged impressions + reactions per post (migration 0009); one row per post (UNIQUE on post_id); `PATCH /posts/{id}/analytics` upserts; cache invalidated on write. No longer feeds an AI analytics agent (removed above) — only the vault-side `AnalyticsPage.jsx`/`useAnalytics()` dashboard reads it now.
- **Researcher agent v3 has landed and is wired in (2026-07-20)** — after v1 (DuckDuckGo+trafilatura `web_tools.py`) and v2 (the `agents/research/` package with SOLID provider abstractions, Gemini-grounding web search, Reddit search, lexical dedup, evergreen fallback) were each deleted outright in turn, v3 replaced the brief `NotImplementedError` stub with real, working code: `agents/researcher.py`'s `researcher_linkedin()` runs a manual `bind_tools()` loop (Tavily `web_search` + `search_vault_posts`, up to 6 rounds) and parses the final turn into exactly 5 `ResearchAngle`s via strict regex; `researcher_node()` is the Send-dispatched graph wrapper. `agents/angle_review_node.py` is new: `angle_review_node` interrupts so the frontend can show the 5 angles and lets the user `pick`/`expand`/`modify`/`none_fit`, looping on `interrupt()` within one invocation rather than re-entering the node for `expand`/`modify`. `map_chosen_angle_node` (pure Python) reshapes the pick into the pre-existing flat `research_brief` shape, rejoining the unchanged `style_retriever_node → writer_node → human_approval_node` pipeline. `supervisor_plan.md`'s original vision — an autonomous orchestrator chaining researcher → distiller → writer with the supervisor deciding after each step — is only partly realized: there is no separate distiller module; `angle_review_node`'s "expand" action covers a narrower, single-angle version of that idea. `/draft-from-topic` and its `pre_routed`/`research_brief`/`schemas/research.py` contract were untouched throughout and still work standalone.
- **Supervisor routing: structured JSON output, two routes only** — `supervisor.py`'s `SupervisorClassification(BaseModel)` (`route: Literal["research", "direct"]`) is parsed via `model_validate_json()`; `_supervisor_router` in `graph.py` reads `state["route"]` directly. A parse/validation failure raises `SupervisorDecisionError`, propagated rather than silently mis-routed. There is no `"write"` or `"analytics"` route value anymore — every fresh "write a post" request goes through `"research"` first; only `/draft-from-topic`'s `pre_routed=True` bypass reaches the writer without going through research.
- **No vault-redraft flow today** — an earlier iteration of the pipeline (documented in a prior version of this doc) detected "redraft my existing post" requests via the classification prompt, fetched the post via `search_vault_posts`, and routed through `writer_task.action="rewrite"` with a pre-seeded `draft`. That code path does not exist in the current `supervisor.py` — asking to redraft an existing post now gets an explicit `route="direct"` decline explaining it isn't supported, with a suggestion to describe what's wanted as a fresh post instead.
- **`gemini-2.5-flash`/`gemini-2.5-flash-lite` both deprecated by Google, migrated to `gemini-3.5-flash`** — confirmed via fresh 404 `ClientError`s in `backend/ai/logs/errors.log` for each in turn. `supervisor_node`/`writer_node`/`researcher.py` (both its main and "expand" LLMs) now all run `gemini-3.5-flash` with `thinking_level="low"` (Gemini 3.x "thinks" by default — this cuts the added latency, especially inside a multi-round tool loop); `style_agent.py` stays on `gemini-2.0-flash-lite`, a different major version, deliberately not kept in lockstep with the others.
- **LLM retry + key rotation** — `llm_retry.py`'s `invoke_with_retry`/`invoke_with_retry_sync` wrap every agent's Gemini call in `tenacity` exponential backoff (1–10s, up to 3 attempts) on 429/503/504 `ClientError`/`ServerError` codes only — a genuine non-transient failure still raises immediately. On a retryable failure it also calls `api_key_rotation.rotate_gemini_key()`, which rebuilds the LLM's internal `google.genai.Client` in place to switch to `LANGCHAIN_API_KEY_GEMINI_2` (no-op, returns `False`, until that env var is set) — so a temporarily-exhausted key doesn't burn all retry attempts against itself.
- **`user_profile` table + `/api/profile`** — `ProfileService(db)` follows a hybrid of `auth/service.py`'s constructor-injected class style and `vault/service.py`'s `_own_*` ownership-guard naming (`_own_profile(user_id, profile_id)`); `linkedin_headline`/`linkedin_about` are nullable/optional everywhere so a profile is creatable and usable without them. **`researcher_node` reads it** (fetched directly via SQLAlchemy, not `ProfileService`, to avoid its 404-on-missing-profile behavior) to ground the angle-generation prompt's domain-fit judgment in the user's actual role/industry/audience when available.
- **Onboarding wired into `user_profile` (2026-07-21)** — `OnboardingPage.jsx`'s 7-step questionnaire previously wrote only to `localStorage`. Migration `0015` added `profession`/`goals`/`topics` columns and relaxed `industry`/`role`/`target_audience`/`writing_style` to nullable, since every onboarding question — and onboarding as a whole — is skippable, so the original `NOT NULL` columns could never be satisfied by a real onboarding submission. New `OnboardingSubmit` schema (all fields optional, unlike strict `ProfileCreate`) + `ProfileService.upsert_from_onboarding()` (get-or-create + `exclude_unset` partial merge, deliberately not `create_profile`'s create-or-409 — a re-run or resumed onboarding, or a profile that already exists via `PATCH /api/profile`, must never 409) back a new `POST /api/profile/onboarding` route. `OnboardingPage.jsx`'s `finish()` calls it fire-and-forget alongside its existing localStorage flag — a slow/failed save doesn't block reaching `/dashboard`. This is the first real write path into `user_profile`, so `researcher_node`'s existing profile read now actually finds data for onboarded users instead of always falling through to its no-profile case.
- **Tavily replaces the earlier DuckDuckGo+trafilatura combo for researcher web search** — `ddgs`/`trafilatura`/`rapidfuzz` were dropped from `requirements.txt`; `tavily-python` + `tenacity` added. `web_search` in `tools.py` uses `search_depth="basic"` (cheaper than `"advanced"`) and caps at 4 results.
- **LinkedIn OAuth** — `backend/linkedin/` follows the same SRP/Strategy pattern as auth: `LinkedInAPIClient` (static HTTP, no state), `LinkedInConnectService` (business logic), `LinkedInAuth` model (storage). OAuth `state` param = `user_id` string so callback can identify user without headers (browser redirect). UPSERT on callback so reconnecting overwrites old token. Duplicate publish guard: 60s window check against `post_publish_log`. 3000-char limit enforced server-side. On successful publish: inserts `PostPublishLog`, calls `update_post_status(published)`, fires `sync_check_and_refresh_style_memory` background task — same as vault router's publish path. LinkedIn API version pin: `202604` (April 2026).
- **Stub user UUID:** `00000000-0000-0000-0000-000000000001` (seeded in migration 0003)
- **CSS approach:** landing/dashboard → inline styles + `var(--cc-*)` tokens; vault components → CSS modules + `--color-*`
- **Postgres checkpointer: removed, then reintroduced in a leaner form (2026-07-06 → 2026-07-19 → 2026-07-20)** — the original attempt bundled `AsyncPostgresSaver` together with a full `backend/chat_sessions/` module (migration 0013: `chat_sessions`+`chat_messages` tables, `ChatSession.id` doubling as the LangGraph `thread_id`) and `backend/ai/history_compaction.py` (post-turn `RemoveMessage`-based compaction). All of that was removed on 2026-07-19, reverting to a plain in-memory `MemorySaver()` with a fresh `thread_id` per request and no cross-request persistence. **As of 2026-07-20, `AsyncPostgresSaver` is back** — but scoped down this time: no `chat_sessions` module, no history compaction, just the checkpointer itself (`backend/ai/checkpointing/factory.py`) plus a minimal `thread_registry` table (migration 0014, `backend/ai/checkpointing/models.py`) that stores *ownership only* (thread_id → user_id → status), never conversation content. `ThreadRegistryService`/`ThreadSessionService` (`checkpointing/service.py`) wrap it: `.start()` mints + registers a thread, `.resume_config()` 403s a non-owner before `/resume` touches the checkpointer, `.complete()` marks a thread done at a terminal state. `backend/main.py`'s `lifespan` now opens the checkpointer, calls `.setup()` (idempotent — creates `checkpoints`/`checkpoint_blobs`/`checkpoint_writes`), and compiles the graph once at startup. **Note:** if the original migration 0013 was ever applied to a real database, its `chat_sessions`/`chat_messages` tables may still physically exist there (the current `0013` is a no-op placeholder revision so `0014` has something to chain off — see that file's own docstring) — dropping stale tables is a separate, explicit DB operation. `ChatPage.jsx`'s sidebar chat list remains purely in-memory for the page's lifetime regardless of this backend change — there is still no `chats.js` API module or persisted-chat-history UI.
- **Long-term style memory is untouched** — `user_style_memory` table, `backend/ai/style_memory.py`, and `agents/style_agent.py`'s `style_retriever_node` remain exactly as before; the removal above was scoped to short-term/thread persistence only, not the writer's style-awareness.
- **Run commands** → see `DEVELOPMENT.md`
