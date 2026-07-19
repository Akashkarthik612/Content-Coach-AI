# Content Coach — Project State
> Living reference for Claude. Update when architecture, decisions, or status change.
> **UI/Frontend state:** See [claude_ui.md](claude_ui.md) for component map, design tokens, and UI conventions.
> Last updated: 2026-07-19 (**Short-term memory removed**: the Postgres checkpointer (`AsyncPostgresSaver`), `backend/chat_sessions/` module, `backend/ai/history_compaction.py`, and migration `0013` have all been deleted — reverted to a plain in-memory `MemorySaver()` compiled once at import time in `main.py`, with every `/api/ai/*` call minting its own fresh `thread_id`. No persisted chat history across requests; `frontend/src/api/chats.js` and the `session_id` param on every `ai.js` function are gone too. Long-term style memory (`user_style_memory`, `style_memory.py`, `style_agent.py`) is untouched. See Design Decisions for the full breakdown. Prior entry, still accurate for everything else — Researcher agent v2 — the entire `agents/research/` package (dtos/providers/normalizer/dedup/fallback/trend_cache/tools/node) and its Send-API dispatch from the graph have been **removed**. `researcher_node`/`research_tool_node` no longer exist in `graph.py`, and `state.py`'s `research_result` field is gone. In their place: a minimal, explicitly-unfinished stub — `agents/base.py` (`BaseResearcher` ABC) + `agents/researcher.py` (`researcher_linkedin`, `raise NotImplementedError`) — **not wired into the graph or routed from the supervisor**. This is the start of a ground-up v3 rewrite; see `supervisor_plan.md` at the repo root for the in-progress redesign (a more "Claude-Code-style" orchestrator that chains researcher → distiller → writer). Alongside this, `supervisor.py` was rewritten from token-based `[HANDOFF:*]` routing to a structured-output `SupervisorClassification` Pydantic contract (`route: "write"|"analytics"|"direct"` — no research route today), and gained a vault-redraft flow (fetches an existing post via `search_vault_posts`, routes to `style_retrieval` with a new `writer_task={action:"rewrite", constraints}` state field). Two new tools landed in `tools.py`: `get_style_memory` and `fetch_and_summarize_url`. Gemini deprecated `gemini-2.5-flash-lite` server-side (confirmed via 404s in `backend/ai/logs/errors.log`) — `writer_node`/`supervisor_node`/`analytics_node`/`tools.py`'s page-summarizer now run `gemini-2.5-flash`; `style_agent.py` runs `gemini-2.0-flash-lite`. **This doc describes the live working tree, which is ahead of what's on the git remote/`main` — treat this file, not git history, as ground truth for architecture questions right now.**)

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
| LLM (writer / supervisor / analytics / URL summarizer) | `gemini-2.5-flash` — moved off `gemini-2.5-flash-lite` after Google deprecated it server-side (confirmed via 404 `ClientError`s in `backend/ai/logs/errors.log`) |
| LLM (style analyzer) | `gemini-2.0-flash-lite` (`agents/style_agent.py`) |
| LLM (researcher) | Not applicable right now — `agents/researcher.py`'s `researcher_linkedin` is an unwired `NotImplementedError` stub; no LLM instance exists for it yet |
| Tracing | LangSmith (`linkedin-coach-rag` project) |

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
│   ├── main.py                   ← FastAPI app, CORS, router registration (auth + vault + ai + linkedin + profile routers); compiles the LangGraph assistant once at import time against a plain in-memory `MemorySaver` and stashes it on `app.state.assistant` (see `ai/graph.py`'s `build_assistant()`) — no persisted chat history or thread reuse across process restarts
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
│   │   ├── models.py             ← UserProfile (industry, role, target_audience, writing_style, formatting_prefs JSONB, linkedin_headline/about nullable)
│   │   ├── schemas.py            ← ProfileCreate, ProfileUpdate, ProfileResponse
│   │   ├── service.py            ← ProfileService(db) class (auth-style ctor injection) + vault-style _own_profile(user_id, profile_id) ownership guard
│   │   └── router.py             ← POST/GET/PATCH /api/profile — all require X-User-Id; no UI yet, API + persistence only
│   ├── ai/
│   │   ├── router.py             ← POST /api/ai/query + /resume (HITL) + /stream (SSE) + /refine (single-LLM draft edit, no graph) + /draft-from-topic — every call mints a fresh `thread_id` (`uuid4()`), no persisted chat history across requests; `thread_id` only matters within one exchange, to let `/resume` reconnect to a paused HITL interrupt on the in-memory checkpointer; resolves the compiled graph via `Depends(get_assistant)` (→ `request.app.state.assistant`, set once at import time in `main.py`) rather than a module-level import; calls setup_ai_file_logging() at startup
│   │   ├── _log_setup.py         ← file-based log handler setup; log_style_json() + log_research_json() helpers
│   │   ├── logs/                 ← AUTO-CREATED at runtime
│   │   │   ├── ai_debug.log      ← DEBUG+ from all backend.ai.* loggers
│   │   │   ├── errors.log        ← ERROR+ only
│   │   │   └── style_debug.log   ← full style JSON dumps on every style extraction
│   │   ├── embeddings.py         ← embed_and_store_version() — BackgroundTask, writes post_embeddings
│   │   ├── style_memory.py       ← Style memory lifecycle: window trigger, DB UPSERT, Redis cache
│   │   ├── rag_chain.py          ← Legacy RAG chain (reference only — superseded by graph)
│   │   ├── schemas/
│   │   │   └── research.py       ← Pydantic DTOs for the dormant flat `research_brief` shape — `ResearchTopic`, `SupportingEvidence`, `FlatResearchBrief`, `topic_to_flat()`; `ResearchBrief`/`fallback_brief()` are leftovers from the old (already-removed) `research_digest_node` and are unused. Only consumer is `router.py`'s `/draft-from-topic`
│   │   ├── state.py              ← AgentState TypedDict — NO `research_result` field (removed along with the old researcher package). Carries `pre_routed: bool` and `writer_task: dict` (both new), plus the dormant `research_brief`/`research_topics` (kept only for /draft-from-topic, untouched)
│   │   ├── worker_states.py      ← StyleRetrieverState, AnalyticsState ({user_id, query[, messages]}); WriterState adds `writer_task`; ResearcherState ({user_id, query}) still defined but unused — nothing Sends to it since researcher_linkedin isn't wired into the graph
│   │   ├── graph.py              ← LangGraph StateGraph, 6 nodes + 1 ToolNode (supervisor_node, tool_node, style_retriever_node, writer_node, analytics_node, human_approval_node — no researcher node); `build_assistant(checkpointer)` compiles against a caller-supplied checkpointer, kept generic over any `BaseCheckpointSaver` — `main.py` passes a plain in-memory `MemorySaver()` at import time
│   │   └── agents/
│   │       ├── supervisor.py          ← COGNITIVE: structured-output classifier — binds 6 tools, then emits a `SupervisorClassification` JSON contract (`route: "write"|"analytics"|"direct"`, no research route today); handles a vault-redraft case (fetches the post via `search_vault_posts`, sets `writer_task={action:"rewrite", constraints}`)
│   │       ├── style_agent.py         ← COGNITIVE: analyze_style() LLM fn + style_retriever_node (MERGED — both are LLM nodes)
│   │       ├── writer_node.py         ← COGNITIVE: style-aware LinkedIn post drafter; Strategy: cold-start vs `_build_system_prompt(style_json, research_brief, writer_task)`; `writer_task.action` selects write-from-scratch vs rewrite-existing-draft; reads research_brief (angle/points/evidence/hook) if present — currently always empty unless pre-seeded by /draft-from-topic
│   │       ├── analytics_node.py      ← COGNITIVE: LinkedIn analytics synthesizer
│   │       ├── human_approval_node.py ← INTERRUPT: HITL checkpoint, saves on approve/edit
│   │       ├── tools.py               ← 7 async @tool functions — DB reads + Redis cache layer (also 1 outbound HTTP fetch: fetch_and_summarize_url)
│   │       ├── sql_fetch_node.py      ← WRITE ONLY: save_draft_to_vault()
│   │       ├── vector_search_node.py  ← DEAD (kept for reference — logic lives in tools.py)
│   │       ├── helper.py              ← DEAD (superseded — delete when ready)
│   │       ├── base.py                ← `BaseResearcher` ABC — `async def research(query) -> dict`; the shared contract future per-platform researchers (LinkedIn, Reddit, X, Medium) will implement
│   │       └── researcher.py          ← 🚧 STUB, not wired into graph.py or routed from supervisor.py: `researcher_linkedin(state: ResearcherState)` currently `raise NotImplementedError`. Start of a ground-up v3 rewrite of the researcher agent — the old `agents/research/` package (dtos/providers/normalizer/dedup/fallback/trend_cache/tools/node, Gemini-grounding web search, Reddit search, lexical dedup, evergreen fallback) has been deleted, not just this file. See `supervisor_plan.md` at the repo root for the redesign direction (orchestrator chains researcher → distiller → writer, "Claude-Code-style")
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
│   └── alembic/versions/         ← Migrations 0001–0012 (0010: post_publish_log FK CASCADE fix; 0011: linkedin_auth table; 0012: user_profile table). 0013 (chat_sessions + chat_messages) was added then deleted along with the chat_sessions module — see Design Decisions
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
│       │   ├── ai.js             ← queryAI(prompt), resumeAI(thread_id, action, content)
│       │   ├── linkedin.js       ← getLinkedInStatus(), getLinkedInAuthUrl(), publishToLinkedIn(postId), disconnectLinkedIn()
│       │   └── publishing.js     ← sendToReview() stub; publishPost() — LinkedIn delegates to publishToLinkedIn() (real); X/Reddit still stubs
│       ├── context/
│       │   └── ReviewQueueContext.jsx ← shared context for review queue state
│       ├── pages/
│       │   ├── HomePage.jsx      ← Login / Register / Forgot (3 modes)
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
             industry TEXT, role TEXT, target_audience TEXT, writing_style TEXT,
             formatting_prefs JSONB DEFAULT '{}', linkedin_headline TEXT nullable, linkedin_about TEXT nullable,
             created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
```

`chat_sessions`/`chat_messages` (migration 0013) existed briefly for persisted chat history and were removed along with the Postgres checkpointer — see Design Decisions.

**Indexes:** `idx_folders_user_id`, `idx_posts_user_id`, `idx_post_embeddings_user_id`, `idx_post_embeddings_hnsw` (HNSW cosine), `idx_user_style_memory_user_id`, `idx_post_analytics_user_id`, `ix_linkedin_auth_user_id`, `ix_user_profile_user_id`
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
| POST | `/query` | `{prompt}` | Requires `X-User-Id`; calls LangGraph assistant. Mints a fresh `thread_id` (`uuid4()`) per call — no persisted chat history across requests |
| POST | `/stream` | `{prompt}` | Requires `X-User-Id`; SSE stream — primary path. Same fresh-`thread_id`-per-call behavior as `/query`; `done` events carry `thread_id` (HITL resume only) |
| POST | `/resume` | `{thread_id, action, content?}` | Requires `X-User-Id`; HITL resume — reconnects to the paused interrupt on the in-memory checkpointer using the `thread_id` returned by the original call |
| POST | `/refine` | `{draft, note}` | Requires `X-User-Id`; single LLM call — no graph traversal; used by ChatPage for iterative draft edits |
| POST | `/draft-from-topic` | `{topic, platform?}` | Requires `X-User-Id`; drafts a post from one picked research topic card, skipping supervisor classification (`pre_routed=True`) |

### Profile — `/api/profile` (all require `X-User-Id`; backend only, no UI yet)
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `` | `ProfileCreate` (industry, role, target_audience, writing_style, formatting_prefs?, linkedin_headline?, linkedin_about?) | 201; 409 if a profile already exists for this user |
| GET | `` | — | 200 with the user's profile; 404 if none created yet |
| PATCH | `` | `ProfileUpdate` (all fields optional) | Partial update via `exclude_unset`; 404 if no profile exists |

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
Separate Axios instance (`baseURL: /api/ai`), same `X-User-Id` interceptor. No session/thread persistence — each call is independent; the backend mints a fresh `thread_id` per request, needed only within one exchange for HITL resume.
```js
queryAI(prompt)                              → {status, answer?, draft?, thread_id?}
resumeAI(thread_id, action, content='')      → {answer}
refineAI(draft, note)                        → {refined_draft}   // single-LLM refinement, no graph
streamQuery(prompt, onToken, onDone, onError) → abort()   // SSE; onDone receives {status, thread_id?, research_topics?}
draftFromTopic(topic, platform='linkedin')   → {answer, draft?, thread_id?, status}
```
`status === 'awaiting_approval'` → HITL flow: show draft with Approve / Make Changes / Decline buttons.
`refineAI` used by `ChatPage` for all follow-up messages when a draft exists in the session — bypasses supervisor and style-retrieval, one direct `_llm.ainvoke()` call in `POST /api/ai/refine`.

Chat history in `ChatPage.jsx` is in-memory-only for the page's lifetime (see Design Decisions — chat_sessions/checkpointer removal); there is no `chats.js` API module anymore.

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
| `supervisor_node` | COGNITIVE + TOOL CALLER | `agents/supervisor.py` | ✅ Done | Structured-output classifier — binds 6 tools (`search_vault_posts`, `get_topic_inventory`, `analyze_publish_history`, `get_post_analytics`, `get_style_memory`, `fetch_and_summarize_url`), loops on tool calls, then emits a `SupervisorClassification` Pydantic JSON contract (`route: "write"\|"analytics"\|"direct"`, `redraft_constraints?`, `direct_answer?`) — **no more `[HANDOFF:*]` string tokens, and no research route today**. Vault-redraft case: fetches the referenced post via `search_vault_posts`, sets `route="style_retrieval"` + `writer_task={action:"rewrite", topic, constraints}` + pre-seeds `draft` with the fetched content. |
| `tool_node` | EXECUTOR | `graph.py` (LangGraph `ToolNode`) | ✅ Done | Bound to only 4 tools (`search_vault_posts`, `get_topic_inventory`, `analyze_publish_history`, `get_post_analytics` — narrower than supervisor's own `bind_tools()` list). Executes whatever tool the LLM called; writes result as `ToolMessage` into messages; loops back to supervisor. |
| `style_retriever_node` | COGNITIVE | `agents/style_agent.py` | ✅ Done | Dispatched via Send API with minimal state `{user_id, query}`. Redis → DB cache read; on miss: calls `analyze_style()` on-demand; fires background stale-check on cache hit. Writes `style_json`. |
| `writer_node` | COGNITIVE | `agents/writer_node.py` | ✅ Done | Style-aware LinkedIn post drafter. Strategy pattern: cold-start prompt vs. `_build_system_prompt(style_json, research_brief, writer_task)`. `writer_task.action` (`"write"` vs `"rewrite"`) picks fresh-post vs apply-constraints-to-existing-draft. Also weaves in `research_brief` (angle/talking points/evidence/hook) when present — currently only ever populated by `/draft-from-topic`'s manual pre-seed (the researcher → writer handoff is not built; researcher itself isn't even wired up yet). Writes `draft`. |
| `analytics_node` | COGNITIVE | `agents/analytics_node.py` | ✅ Done | LinkedIn analytics synthesizer. Reads `get_post_analytics` ToolMessage; `gemini-2.5-flash` at `temp=0.0`. Writes `answer` + sets `route="direct"`. |
| `human_approval_node` | INTERRUPT | `agents/human_approval_node.py` | ✅ Done | `interrupt()` HITL checkpoint. On approve/edit calls `save_draft_to_vault()`; on reject discards. |
| `sql_fetch_node` | WRITE ONLY | `agents/sql_fetch_node.py` | ✅ Done | Contains only `save_draft_to_vault()`. All read queries live in `tools.py`. |

**Researcher agent — not currently in the graph.** `agents/base.py` (`BaseResearcher` ABC) + `agents/researcher.py` (`researcher_linkedin`, `raise NotImplementedError`) exist as an explicit stub, not registered as a graph node and not dispatched by the supervisor. The previous fully-built researcher (Send-dispatched `researcher_node`/`research_tool_node`, `agents/research/` package with web/Reddit search, lexical dedup, evergreen fallback) has been deleted outright, not deprecated in place. See `supervisor_plan.md` for the redesign direction and Known Gaps below for status.

> **Architecture rule:** All agent nodes and tool functions are `async def` using `await llm.ainvoke()` / `asyncio.to_thread()` — multi-tenant, all LLM + DB calls are I/O-bound. Never use sync `llm.invoke()` inside graph nodes or tools.

---

### AgentState (`backend/ai/state.py`)

| Field | Type | Set by | Purpose |
|---|---|---|---|
| `query` | str | router | original prompt, never mutated |
| `user_id` | str | router | scopes ALL database operations |
| `messages` | list[HumanMessage\|AIMessage] | add_messages reducer | includes HumanMessage, AIMessage (with tool_calls), ToolMessage (tool results) |
| `task_type` | str | router / supervisor_node | `""\|"general"\|"write"\|"analytics"\|"suggest"` — not read by `_supervisor_router` (routing reads `route`, not this) |
| `pre_routed` | bool | router (`/draft-from-topic` only) | `True` bypasses `supervisor_node` entirely via the graph's conditional entry point, straight to `style_retriever_node` |
| `route` | str | supervisor_node | edge key read by `_supervisor_router`: `"style_retrieval"\|"analytics"\|"tools"\|"direct"` — **no `"research"` value exists today** |
| `style_json` | dict | style_retriever_node | `{long_term: {9 keys}, short_term: {9 keys}\|None}` |
| `research_brief` | dict | — | DORMANT — `{recommended_angle, talking_points, supporting_evidence, past_coverage, avoid_repeating, suggested_length, suggested_hook}` (`backend/ai/schemas/research.py`'s `FlatResearchBrief`); only ever set by `/draft-from-topic`'s manual pre-seed (`topic_to_flat`), never by any node; empty `{}` otherwise |
| `research_topics` | list | — | DORMANT — was written by the old, already-deleted `research_digest_node`; nothing populates it now, kept only for `/stream`'s dead fallback branch |
| `writer_task` | dict | router / supervisor_node | `{action: "write"\|"rewrite", topic, constraints: []}` — set by `_build_initial_state()` by default (`action="write"`), overwritten by `supervisor_node`'s vault-redraft case (`action="rewrite"`) |
| `draft` | str | writer_node | LinkedIn post draft |
| `approval_status` | str | human_approval_node | `""/"approved"/"edited"/"rejected"` |
| `answer` | str | supervisor_node / analytics_node | final response returned to frontend |

**Note:** `research_result` (the Stage-1 researcher's output field) has been removed from `AgentState` entirely along with the researcher package that wrote it — do not reference it, it no longer exists in `state.py`.

---

### Graph Topology (current — Orchestrator-Worker via Send API)

```
START
  │
  ▼
supervisor_node ── binds 6 tools via llm.bind_tools([...]); emits a
  │                 SupervisorClassification JSON contract, not [HANDOFF:*] tokens
  │
  ├─ last msg has tool_calls? ──► tool_node (LangGraph ToolNode, 4 tools)
  │                                    │ result → ToolMessage into messages
  │                                    └──► supervisor_node (loop)
  │
  ├─ route == "style_retrieval" ──► Send API ──► style_retriever_node  (worker, minimal state)
  │    (route="write" new-topic case, OR vault-redraft case with                │
  │     writer_task.action="rewrite" + draft pre-seeded from search_vault_posts) writer_node  (full merged state; uses research_brief if already in state)
  │                                                       │
  │                                              human_approval_node ──► END
  │
  ├─ route == "analytics" ──► analytics_node ──► END
  │
  └─ route == "direct" ──► END   (answer already set by supervisor_node's own JSON contract)
```

Also reachable via the graph's conditional entry point (bypassing `supervisor_node` entirely) when `pre_routed=True`: `/draft-from-topic` seeds `route="style_retrieval"` + a manually-built `research_brief` and enters straight at `style_retriever_node`. Nothing else changed about this path.

**No researcher path exists in the graph today.** The old `[HANDOFF:RESEARCH]` branch, `researcher_node`, and `research_tool_node` have all been removed — not disabled, deleted. `agents/researcher.py`'s `researcher_linkedin` stub is not registered as a graph node at all.

**Routing rule:** `supervisor_node` no longer emits `[HANDOFF:*]` string tokens. It runs a tool-calling loop (up to `_MAX_TOOL_LOOP_ROUNDS=5`), then produces a `SupervisorClassification` Pydantic object (`route: "write"|"analytics"|"direct"`, plus `redraft_constraints` or `direct_answer` depending on route) parsed via `model_validate_json()`. A parse/validation failure raises `SupervisorDecisionError` — propagated to `router.py`'s exception handler, never silently swallowed into a fabricated fallback. `_supervisor_router` (in `graph.py`) reads `state["route"]` directly (not response text) to decide the edge.

**Send API dispatch:** When route is `style_retrieval`, supervisor returns `[Send("style_retriever_node", {user_id, query})]` — the worker gets only the minimal slice it needs. Its output (`style_json`) merges back into global `AgentState`, which flows through the fixed edges to `writer_node` and `human_approval_node`.

**Vault redraft flow (new):** if the user references an existing saved post and asks to redraft/transform it (not just asks a question about it), `supervisor_node` calls `search_vault_posts` first, then sets `route="style_retrieval"`, `draft=<fetched post content>` (pulled verbatim from the `ToolMessage`, never re-typed by the LLM), and `writer_task={action:"rewrite", topic, constraints: redraft_constraints}`. `writer_node` then appends `[EXISTING DRAFT TO MODIFY]` to its prompt instead of writing from scratch.

**Tool loop:** If the LLM emits tool calls, `tool_node` executes them and loops back to supervisor, which re-runs classification with the tool results now in `messages`.

**DB access pattern:**
- READ: `tools.py` — async `@tool` functions; SQL via `asyncio.to_thread()`; pgvector scan inside `search_vault_posts`
- WRITE: `save_draft_to_vault()` in `sql_fetch_node.py`, called by `human_approval_node` on approve/edit
- Analytics is ephemeral — never written to DB from the agent pipeline

### Tools (`backend/ai/agents/tools.py`)

| Tool | Used for | Data source |
|---|---|---|
| `search_vault_posts(user_id, query)` | general Q&A, vault-redraft fetch | pgvector cosine scan (top 6 chunks, 650-char chunks); no fallback |
| `get_style_samples(user_id)` | dead/unused — not bound by either `tool_node` or `supervisor_node` anymore; style now owned entirely by `style_retriever_node` | compressed style memory JSON (Redis → DB → 2 raw posts cold-start) |
| `get_topic_inventory(user_id)` | suggest / general Q&A | all post titles + distinct tags |
| `analyze_publish_history(user_id)` | analytics | publish log + version metadata |
| `get_post_analytics(user_id)` | analytics | `post_analytics` + publish log + posts (DISTINCT ON post_id); includes 150-char content preview |
| `get_style_memory(user_id)` | NEW — meta-questions about the user's own writing style/evolution (not for drafting — that's writer_node's job) | `style_memory.get_style_memory()` + `format_style_memory_for_writer()` |
| `fetch_and_summarize_url(url)` | NEW — user wants more detail on one specific URL | `httpx` GET + HTML strip + a dedicated `gemini-2.5-flash` summarizer LLM (`_page_summarizer`, temp=0.2, 256 max tokens) |

`tool_node` (the generic `graph.py` `ToolNode`) is bound to only 4 of these 7 (`search_vault_posts`, `get_topic_inventory`, `analyze_publish_history`, `get_post_analytics`). `supervisor_node`'s own `bind_tools()` call uses a different, overlapping set of 6 (those 4 plus `get_style_memory` and `fetch_and_summarize_url`, but not `get_style_samples`). Keep this asymmetry in mind if adding/removing a tool — it must be updated in both places.

**No researcher tools exist today.** `web_search_tool`/`reddit_search_tool` and the whole `agents/research/tools.py` module they lived in were deleted along with the rest of the old researcher package.

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
| **Human-in-the-Loop (Interrupt)** | `agents/human_approval_node.py` | `interrupt()` pauses graph mid-run, serialises state to MemorySaver, surfaces draft to frontend, resumes only on `/resume` |
| **Template Method (ABC, unimplemented)** | `agents/base.py`, `agents/researcher.py` | `BaseResearcher.research(query)` is the contract future per-platform researchers will implement; `researcher_linkedin` is a standalone stub function that doesn't yet subclass it — an explicit seam, not a finished pattern |

---

## Known Gaps / Next Steps

### AI Agent Pipeline

| Step | Node/File | Status | Notes |
|---|---|---|---|
| — | `tools.py` | ✅ Done | 7 async `@tool` functions — all DB reads (+ one outbound HTTP fetch) live here |
| — | `supervisor_node` | ✅ Done (rewritten) | Structured-output `SupervisorClassification` contract (`write`/`analytics`/`direct`); tool-loop via `bind_tools()`; vault-redraft flow. No `[HANDOFF:*]` tokens, no research route |
| — | `tool_node` (LangGraph prebuilt) | ✅ Done | Executes tool called by LLM; appends ToolMessage; loops to supervisor |
| — | `style_agent.py` | ✅ Done | `analyze_style()` + `style_retriever_node` merged into one file — both are LLM nodes; circular import broken via local import |
| — | `writer_node` | ✅ Done | Strategy pattern: cold-start vs. `_build_system_prompt()` from style_json; now also branches on `writer_task.action` (write vs rewrite) |
| — | `analytics_node` | ✅ Done | Dedicated analytics synthesizer; `gemini-2.5-flash`, temp=0.0 |
| — | `human_approval_node` | ✅ Done | `interrupt()` HITL, saves on approve/edit |
| — | `sql_fetch_node` | ✅ Done | Write-only: `save_draft_to_vault()` |
| — | `router.py` | ✅ Done | Fresh `thread_id` per request, trimmed initial state, `/stream` SSE, `/resume` HITL endpoint — no persisted chat history |
| — | `helper.py` | Dead | Delete when cleaning up |
| — | `vector_search_node.py` | Dead | Logic lives in `tools.py`; delete when cleaning up |
| — | Researcher agent (v2, Stage 1) | ❌ Removed | The entire `agents/research/` package built for Stage 1 (SOLID provider abstractions, Gemini-grounding web search, Reddit search, lexical dedup, evergreen fallback, `researcher_node`/`research_tool_node` graph wiring, `state["research_result"]`) has been deleted outright — not deprecated, not disabled. |
| — | Researcher agent (v3, in progress) | 🚧 Stub only | `agents/base.py` (`BaseResearcher` ABC) + `agents/researcher.py` (`researcher_linkedin`, raises `NotImplementedError`) exist but are **not wired into `graph.py` or routed from `supervisor.py`**. See `supervisor_plan.md` (repo root) for the intended redesign: a more autonomous orchestrator that breaks a request into subtasks and chains researcher → distiller → writer, with the supervisor deciding what happens after each step rather than a fixed pipeline. Nothing beyond rough LLD notes exists yet for the distiller or the orchestrator rewrite. |
| — | `user_profile` UI | Not built | Part A is backend-only (API + persistence) per spec — no frontend form yet to create/edit a profile |

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
- **analytics_node offload** — analytics synthesis moved out of supervisor into a dedicated `analytics_node` (temp=0.0, tight prompt, 1024 max tokens); supervisor Pass 2 only routes for analytics, never synthesizes; reduces supervisor token spend per analytics query
- **post_analytics table** — user-logged impressions + reactions per post (migration 0009); one row per post (UNIQUE on post_id); `PATCH /posts/{id}/analytics` upserts; cache invalidated on write; enables AI analytics + future dashboard cards
- **Researcher agent, deleted and restarted twice now (as of 2026-07-13)** — the original researcher (DuckDuckGo `web_search` + trafilatura `fetch_page`, single-file `web_tools.py`) was fully removed once. It was then rebuilt from scratch as "v2" (Stage 1): a `agents/research/` package with SOLID provider abstractions (`GeminiGroundingClient` web search, unauthenticated Reddit search, `LexicalDedup`, `EvergreenFallback`, `TrendCache`), Send-dispatched `researcher_node`/`research_tool_node` graph nodes, and a new `state["research_result"]` field. **That entire v2 package has now also been deleted** — not deprecated in place, removed from disk, along with its graph wiring and state field. In its place: `agents/base.py` (`BaseResearcher` ABC) + `agents/researcher.py` (`researcher_linkedin`, `raise NotImplementedError`), an explicit stub not yet wired into `graph.py` or routed from `supervisor.py`. This is the start of a "v3" — see `supervisor_plan.md` (repo root) for the LLD notes driving the redesign: a more autonomous orchestrator (supervisor) that breaks a request into subtasks and chains researcher → distiller (fetch/clean/structure a picked page) → writer, rather than the old fixed Send-dispatch pipeline. `/draft-from-topic` and its `pre_routed`/`research_brief`/`backend/ai/schemas/research.py` contract remain completely untouched throughout all of this and still work standalone.
- **Supervisor routing: structured JSON output, not `[HANDOFF:*]` string tokens** — `supervisor.py`'s `SupervisorClassification(BaseModel)` (`route: Literal["write","analytics","direct"]`) replaces the earlier token-parsing approach entirely; `_supervisor_router` in `graph.py` reads `state["route"]` directly. Chosen for validation (Pydantic rejects malformed output via `SupervisorDecisionError` instead of silently mis-routing on a missed token) over the token approach's implicit string-matching. There is no `"research"` route value today — a route only exists once the researcher is wired back in.
- **Vault-redraft as part of the write path, not a separate route** — asking to redraft/transform an existing saved post is detected by `supervisor.py`'s classification prompt (not a separate LLM call), fetches the post via `search_vault_posts`, and flows through the *same* `style_retrieval` → `writer_node` → `human_approval_node` pipeline as a fresh write, distinguished only by `writer_task.action="rewrite"` and a pre-seeded `draft`. Kept it inside the existing write pipeline rather than adding a new graph branch, since the downstream steps (style-aware generation, HITL approval, vault save) are identical either way.
- **`gemini-2.5-flash-lite` deprecated by Google, migrated off it** — confirmed via `backend/ai/logs/errors.log` 404 `ClientError`s ("This model models/gemini-2.5-flash-lite is no longer available"). `writer_node`/`supervisor_node`/`analytics_node`/`tools.py`'s `_page_summarizer` now run `gemini-2.5-flash`; `style_agent.py` runs `gemini-2.0-flash-lite` (a different major version, not the same tier as the others — no attempt made to keep all nodes on one exact model).
- **`user_profile` table + `/api/profile`, backend only** — `ProfileService(db)` follows a hybrid of `auth/service.py`'s constructor-injected class style and `vault/service.py`'s `_own_*` ownership-guard naming (`_own_profile(user_id, profile_id)`); `linkedin_headline`/`linkedin_about` are nullable/optional everywhere so a profile is creatable and usable without them. No frontend form yet — UI wiring is a separate, later task. **No AI node reads `user_profile` right now** — the old researcher was the only consumer and it's gone; revisit once a researcher is wired back in.
- **`ddgs`/`trafilatura`/`rapidfuzz` removed from requirements.txt** — leftovers from the deleted researcher packages (`web_tools.py`, then `agents/research/dedup.py`); nothing imports any of the three anymore.
- **LinkedIn OAuth** — `backend/linkedin/` follows the same SRP/Strategy pattern as auth: `LinkedInAPIClient` (static HTTP, no state), `LinkedInConnectService` (business logic), `LinkedInAuth` model (storage). OAuth `state` param = `user_id` string so callback can identify user without headers (browser redirect). UPSERT on callback so reconnecting overwrites old token. Duplicate publish guard: 60s window check against `post_publish_log`. 3000-char limit enforced server-side. On successful publish: inserts `PostPublishLog`, calls `update_post_status(published)`, fires `sync_check_and_refresh_style_memory` background task — same as vault router's publish path. LinkedIn API version pin: `202604` (April 2026).
- **Stub user UUID:** `00000000-0000-0000-0000-000000000001` (seeded in migration 0003)
- **CSS approach:** landing/dashboard → inline styles + `var(--cc-*)` tokens; vault components → CSS modules + `--color-*`
- **Persistent chat sessions + Postgres checkpointer, added then removed (2026-07-06 → 2026-07-19)** — briefly had `AsyncPostgresSaver` (`langgraph-checkpoint-postgres`/`psycopg[binary]`), a `backend/chat_sessions/` module (migration 0013: `chat_sessions`+`chat_messages` tables, `ChatSession.id` doubling as the LangGraph `thread_id`), and `backend/ai/history_compaction.py` (post-turn `RemoveMessage`-based compaction so a reused thread didn't resend raw tool-calling scaffolding every turn). **All of this has been removed** at the user's explicit request — reverted to the simpler pre-2026-07-06 shape: `backend/main.py` compiles the graph once at import time against a plain in-memory `MemorySaver()` (no lifespan handler, no Windows event-loop-policy shim — that was only needed for psycopg3's async mode); `backend/ai/router.py` mints a fresh `uuid4()` thread_id on every `/query`/`/stream`/`/draft-from-topic` call, used only within that one exchange to let `/resume` reconnect to a paused HITL interrupt — nothing persists across requests, and nothing survives a process restart. `chat_sessions/`, `history_compaction.py`, `backend/scripts/prune_old_checkpoints.py`, and migration `0013` were deleted outright; `RECENT_CHATS_LIMIT`/`TURN_COMPACTION_PENDING_TTL_S` settings, `frontend/src/api/chats.js`, and the `session_id` parameter on every `ai.js` function were removed too. `ChatPage.jsx`'s sidebar chat list is now purely in-memory for the page's lifetime (a local `chatMessagesRef` cache keyed by chat id lets switching between chats created *this session* restore their messages; nothing survives a reload). **Note:** if migration 0013 was ever applied to a real database, the `chat_sessions`/`chat_messages` tables (and `AsyncPostgresSaver.setup()`'s own `checkpoints`/`checkpoint_blobs`/`checkpoint_writes` tables) still physically exist there — dropping them is a separate, explicit DB operation this cleanup did not perform.
- **Long-term style memory is untouched** — `user_style_memory` table, `backend/ai/style_memory.py`, and `agents/style_agent.py`'s `style_retriever_node` remain exactly as before; the removal above was scoped to short-term/thread persistence only, not the writer's style-awareness.
- **Run commands** → see `DEVELOPMENT.md`
