# Content Coach — Project State
> Living reference for Claude. Update when architecture, decisions, or status change.
> **UI/Frontend state:** See [claude_ui.md](claude_ui.md) for component map, design tokens, and UI conventions.
> Last updated: 2026-07-02 (Researcher agent live: researcher_node + research_tool_node + research_digest_node added to the graph — agentic tool loop over web_tools.py's web_search/fetch_page (DuckDuckGo + trafilatura, free) + vault tools (only when the user asks about their own past posts), routed via new [HANDOFF:RESEARCH]/[HANDOFF:RESEARCH_WRITE] supervisor tokens; research_debug.log added)

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
| LLM (writer / supervisor / analytics) | `gemini-2.5-flash-lite` |
| LLM (style analyzer) | `gemini-2.5-flash-lite` (same as other nodes — kept consistent after merge into style_agent.py) |
| Web search (researcher) | `ddgs` (DuckDuckGo, free, no API key) |
| Page extraction (researcher) | `trafilatura` — strips a fetched URL down to clean readable text |
| Tracing | LangSmith (`linkedin-coach-rag` project) |

---

## Directory Map

```
f:\My_first_product\
├── .env                          ← NEVER COMMIT
├── .env.example
├── requirements.txt · alembic.ini
├── PROJECT_STATE.md · UI_STATE.md · DEVELOPMENT.md
│
├── backend/
│   ├── main.py                   ← FastAPI app, CORS, router registration (auth + vault + ai + linkedin routers)
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
│   ├── ai/
│   │   ├── router.py             ← POST /api/ai/query + /resume (HITL) + /stream (SSE) + /refine (single-LLM draft edit, no graph); calls setup_ai_file_logging() at startup
│   │   ├── _log_setup.py         ← file-based log handler setup; log_style_json() + log_research_json() helpers
│   │   ├── logs/                 ← AUTO-CREATED at runtime
│   │   │   ├── ai_debug.log      ← DEBUG+ from all backend.ai.* loggers
│   │   │   ├── errors.log        ← ERROR+ only
│   │   │   ├── style_debug.log   ← full style JSON dumps on every style extraction
│   │   │   └── research_debug.log ← full research_brief JSON dumps on every research turn
│   │   ├── embeddings.py         ← embed_and_store_version() — BackgroundTask, writes post_embeddings
│   │   ├── style_memory.py       ← Style memory lifecycle: window trigger, DB UPSERT, Redis cache
│   │   ├── rag_chain.py          ← Legacy RAG chain (reference only — superseded by graph)
│   │   ├── state.py              ← AgentState TypedDict
│   │   ├── worker_states.py      ← StyleRetrieverState, WriterState, AnalyticsState, ResearcherState ({user_id, query, messages})
│   │   ├── graph.py              ← LangGraph StateGraph, 9 nodes + 2 ToolNodes, MemorySaver
│   │   └── agents/
│   │       ├── supervisor.py          ← COGNITIVE: routes via [HANDOFF:WRITE]/[HANDOFF:RESEARCH]/[HANDOFF:RESEARCH_WRITE]/[HANDOFF:ANALYTICS] tokens; direct answer sets state["answer"]
│   │       ├── style_agent.py         ← COGNITIVE: analyze_style() LLM fn + style_retriever_node (MERGED — both are LLM nodes)
│   │       ├── writer_node.py         ← COGNITIVE: style-aware LinkedIn post drafter; Strategy: cold-start vs personalised; reads research_brief (angle/points/evidence/hook) if present
│   │       ├── researcher_node.py     ← COGNITIVE, SILENT: agentic tool loop (gemini-2.5-flash-lite + bind_tools) over web_tools.py's web_search/fetch_page + tools.py's get_topic_inventory/search_vault_posts (vault tools only called if the user asks about their own past posts); loops via research_tool_node until no more tool calls, final turn is the strict research_brief JSON. Never streamed to the user.
│   │       ├── research_digest_node.py ← COGNITIVE, USER-FACING: turns research_brief into a plain-text LinkedIn-creator digest; only researcher-path node streamed live (router.py treats it like analytics_node)
│   │       ├── web_tools.py           ← 2 async @tool functions — web_search (ddgs/DuckDuckGo) + fetch_page (trafilatura); not user-scoped, cached under a "global" tool_key slot
│   │       ├── analytics_node.py      ← COGNITIVE: LinkedIn analytics synthesizer
│   │       ├── human_approval_node.py ← INTERRUPT: HITL checkpoint, saves on approve/edit
│   │       ├── tools.py               ← 4 async @tool functions — DB reads + Redis cache layer
│   │       ├── sql_fetch_node.py      ← WRITE ONLY: save_draft_to_vault()
│   │       ├── vector_search_node.py  ← DEAD (kept for reference — logic lives in tools.py)
│   │       └── helper.py              ← DEAD (superseded — delete when ready)
│   ├── linkedin/
│   │   ├── models.py             ← LinkedInAuth SQLAlchemy model (linkedin_auth table)
│   │   ├── schemas.py            ← ConnectionStatusResponse, AuthUrlResponse, PublishResponse
│   │   ├── service.py            ← LinkedInConnectService (static): get_auth_url, handle_oauth_callback, publish_or_auth, disconnect
│   │   ├── api_client.py         ← LinkedInAPIClient (static): exchange_code, get_userinfo, create_post — httpx sync client
│   │   └── router.py             ← GET /connection-status · GET /auth/url · GET /auth/callback · POST /publish/{id} · DELETE /disconnect
│   ├── core/
│   │   ├── config.py             ← Settings (DATABASE_URL, REDIS_URL, LANGCHAIN_API_KEY_GEMINI, LINKEDIN_CLIENT_ID/SECRET/REDIRECT_URI, FRONTEND_URL)
│   │   ├── cache.py              ← Redis client (sync + async), tool/embed/style cache helpers
│   │   ├── database.py           ← SQLAlchemy engine, SessionLocal, Base
│   │   └── dependencies.py       ← get_db(), get_current_user() (reads X-User-Id header)
│   └── alembic/versions/         ← Migrations 0001–0011 (0010: post_publish_log FK CASCADE fix; 0011: linkedin_auth table)
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
│       │   ├── MyWorkPage.jsx    ← rebuilt 2026-06-16: shared AppSidebar | Canvas = Content Vault browsing view (faithful port, real data) OR redesigned DocEditor (History rail · rich-text toolbar · Research/Writing/Performance inspector rail · bottom AI command bar) — see UI_STATE.md for full breakdown
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

→ Full route table in [UI_STATE.md § Page Map](UI_STATE.md). Post-login redirect: `/dashboard`.

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
```

**Indexes:** `idx_folders_user_id`, `idx_posts_user_id`, `idx_post_embeddings_user_id`, `idx_post_embeddings_hnsw` (HNSW cosine), `idx_user_style_memory_user_id`, `idx_post_analytics_user_id`, `ix_linkedin_auth_user_id`
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
| POST | `/query` | `{prompt}` | Requires `X-User-Id`; calls LangGraph assistant |
| POST | `/stream` | `{prompt}` | Requires `X-User-Id`; SSE stream — primary path |
| POST | `/resume` | `{thread_id, action, content?}` | Requires `X-User-Id`; HITL resume |
| POST | `/refine` | `{draft, note}` | Requires `X-User-Id`; single LLM call — no graph traversal; used by ChatPage for iterative draft edits |

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
Separate Axios instance (`baseURL: /api/ai`), same `X-User-Id` interceptor.
```js
queryAI(prompt)                              → {status, answer?, draft?, thread_id?}
resumeAI(thread_id, action, content='')     → {answer}
refineAI(draft, note)                        → {refined_draft}   // single-LLM refinement, no graph
```
`status === 'awaiting_approval'` → HITL flow: show draft with Approve / Make Changes / Decline buttons.
`refineAI` used by `ChatPage` for all follow-up messages when a draft exists in the session — bypasses supervisor and style-retrieval, one direct `_llm.ainvoke()` call in `POST /api/ai/refine`.

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
| `supervisor_node` | COGNITIVE + TOOL CALLER | `agents/supervisor.py` | ✅ Done | Classifies intent; emits `[HANDOFF:WRITE]` / `[HANDOFF:RESEARCH]` / `[HANDOFF:RESEARCH_WRITE]` / `[HANDOFF:ANALYTICS]` tokens or calls tools; does NOT synthesize analytics. `llm.bind_tools()` for tool loop. |
| `tool_node` | EXECUTOR | `graph.py` (LangGraph `ToolNode`) | ✅ Done | Executes whatever tool the LLM called; writes result as `ToolMessage` into messages; loops back to supervisor. |
| `style_retriever_node` | COGNITIVE | `agents/style_agent.py` | ✅ Done | Dispatched via Send API with minimal state `{user_id, query}`. Redis → DB cache read; on miss: calls `analyze_style()` on-demand; fires background stale-check on cache hit. Writes `style_json`. |
| `writer_node` | COGNITIVE | `agents/writer_node.py` | ✅ Done | Style-aware LinkedIn post drafter. Strategy pattern: cold-start prompt vs. `_build_system_prompt()` from `style_json`. Also weaves in `research_brief` (angle/talking points/evidence/hook) when present. Writes `draft`. |
| `researcher_node` | COGNITIVE, SILENT | `agents/researcher_node.py` | ✅ Done | Dispatched via Send API with `{user_id, query, messages}`. Agentic tool loop (`llm.bind_tools([web_search, fetch_page, get_topic_inventory, search_vault_posts])`) — same shape as `supervisor_node`'s loop, via `research_tool_node`. System prompt instructs: use `web_search`/`fetch_page` freely, only reach for vault tools if the user asks about their own past posts. Final (no-tool-call) turn is the strict `research_brief` JSON. Never streamed to the user — router.py doesn't match its node name. |
| `research_tool_node` | EXECUTOR | `graph.py` (LangGraph `ToolNode`) | ✅ Done | Executes whatever tool `researcher_node`'s LLM called (`web_search`/`fetch_page`/`get_topic_inventory`/`search_vault_posts`); writes result as `ToolMessage`; loops back to `researcher_node`. Separate `ToolNode` instance from supervisor's `tool_node`. |
| `research_digest_node` | COGNITIVE, USER-FACING | `agents/research_digest_node.py` | ✅ Done | Turns `research_brief` into a plain-text LinkedIn-creator digest (angle, talking points, hook, what to avoid repeating). Only node on the research path that streams live — treated identically to `analytics_node` in `router.py`. Writes `answer`. |
| `analytics_node` | COGNITIVE | `agents/analytics_node.py` | ✅ Done | LinkedIn analytics synthesizer. Reads `get_post_analytics` ToolMessage; `gemini-2.5-flash-lite` at `temp=0.0`. Writes `answer`. |
| `human_approval_node` | INTERRUPT | `agents/human_approval_node.py` | ✅ Done | `interrupt()` HITL checkpoint. On approve/edit calls `save_draft_to_vault()`; on reject discards. |
| `sql_fetch_node` | WRITE ONLY | `agents/sql_fetch_node.py` | ✅ Done | Contains only `save_draft_to_vault()`. All read queries live in `tools.py`. |

> **Architecture rule:** All agent nodes and tool functions are `async def` using `await llm.ainvoke()` / `asyncio.to_thread()` — multi-tenant, all LLM + DB calls are I/O-bound. Never use sync `llm.invoke()` inside graph nodes or tools.

---

### AgentState (`backend/ai/state.py`)

| Field | Type | Set by | Purpose |
|---|---|---|---|
| `query` | str | router | original prompt, never mutated |
| `user_id` | str | router | scopes ALL database operations |
| `messages` | list[HumanMessage\|AIMessage] | add_messages reducer | includes HumanMessage, AIMessage (with tool_calls), ToolMessage (tool results) |
| `task_type` | str | supervisor_node | legacy field — currently unused in routing (routing is token-based) |
| `route` | str | supervisor_node | edge key read by `_supervisor_router`: `"style_retrieval"/"research"/"research_then_write"/"analytics"/"direct"` |
| `style_json` | dict | style_retriever_node | `{long_term: {9 keys}, short_term: {9 keys}\|None}` |
| `research_brief` | dict | researcher_node | `{recommended_angle, talking_points, supporting_evidence, past_coverage, avoid_repeating, suggested_length, suggested_hook}` — empty `{}` if research never ran this thread |
| `draft` | str | writer_node | LinkedIn post draft |
| `approval_status` | str | human_approval_node | `""/"approved"/"edited"/"rejected"` |
| `answer` | str | supervisor_node | final response returned to frontend |

---

### Graph Topology (current — Orchestrator-Worker via Send API)

```
START
  │
  ▼
supervisor_node ── tools bound via llm.bind_tools([...])
  │
  ├─ last msg has tool_calls? ──► tool_node (LangGraph ToolNode)
  │                                    │ result → ToolMessage into messages
  │                                    └──► supervisor_node (loop)
  │
  ├─ [HANDOFF:WRITE] in content ──► Send API ──► style_retriever_node  (worker, minimal state)
  │                                                       │
  │                                                  writer_node  (full merged state; uses research_brief if already in state)
  │                                                       │
  │                                              human_approval_node ──► END
  │
  ├─ [HANDOFF:RESEARCH] / [HANDOFF:RESEARCH_WRITE] ──► Send API ──► researcher_node  (worker, {user_id,query,messages}, silent)
  │                                                             │
  │                                     last msg has tool_calls? ──► research_tool_node (LangGraph ToolNode)
  │                                                             │         │ result → ToolMessage into messages
  │                                                             │         └──► researcher_node (loop)
  │                                                             │
  │                                          route=="research_then_write"? ──yes──► style_retriever_node → writer_node → human_approval_node → END
  │                                                             │
  │                                                             no
  │                                                             ▼
  │                                                  research_digest_node (user-facing, streams live) ──► END
  │
  ├─ [HANDOFF:ANALYTICS] in content ──► analytics_node ──► END
  │
  └─ direct answer ──► END
```

**Routing rule:** `supervisor_node` emits `[HANDOFF:WRITE]` / `[HANDOFF:RESEARCH]` / `[HANDOFF:RESEARCH_WRITE]` / `[HANDOFF:ANALYTICS]` tokens in its text content. The `_supervisor_router` conditional edge reads these tokens and returns the appropriate edge key or a `[Send(...)]` list.

**Send API dispatch:** When route is `style_retrieval`, supervisor returns `[Send("style_retriever_node", {user_id, query})]` — the worker gets only the minimal slice it needs. Its output (`style_json`) merges back into global `AgentState`, which flows through the fixed edges to `writer_node` and `human_approval_node`. Same shape for `research`/`research_then_write` → `Send("researcher_node", {user_id, query, messages})` — `researcher_node` additionally needs `messages` since it runs its own tool loop against them.

**Research routing (`_researcher_router`):** checks `last.tool_calls` first (mid-loop → `research_tool_node`, same shape as supervisor's own tool loop), then reads `state.get("route")` once `researcher_node` has no more tool calls — `"research_then_write"` continues into the existing style→writer→approval chain; anything else goes to `research_digest_node` for a standalone digest. `researcher_node` behaves like a general research agent by default (`web_search`/`fetch_page`, both plain custom tools — DuckDuckGo search + trafilatura page extraction, no API key) and only reaches for the vault tools (`get_topic_inventory`/`search_vault_posts`) when the user's message references their own past posts, per its system prompt.

**Tool loop:** If the LLM emits tool calls (for analytics data fetching), `tool_node` executes them and loops back to supervisor. The supervisor then emits `[HANDOFF:ANALYTICS]` once data is in messages.

**DB access pattern:**
- READ: `tools.py` — async `@tool` functions; SQL via `asyncio.to_thread()`; pgvector scan inside `search_vault_posts`
- WRITE: `save_draft_to_vault()` in `sql_fetch_node.py`, called by `human_approval_node` on approve/edit
- Analytics is ephemeral — never written to DB from the agent pipeline

### Tools (`backend/ai/agents/tools.py`)

| Tool | Used for | Data source |
|---|---|---|
| `search_vault_posts(user_id, query)` | research / general Q&A | pgvector cosine scan (top 6 chunks, 650-char chunks); no fallback |
| `get_style_samples(user_id)` | (legacy — style now owned by style_retriever_node) | compressed style memory JSON (Redis → DB → 2 raw posts cold-start) |
| `get_topic_inventory(user_id)` | suggest / general Q&A | all post titles + distinct tags |
| `analyze_publish_history(user_id)` | analytics | publish log + version metadata |
| `get_post_analytics(user_id)` | analytics | `post_analytics` + publish log + posts (DISTINCT ON post_id); includes 150-char content preview |

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
| **Command** | `agents/supervisor.py` | `[HANDOFF:WRITE]` / `[HANDOFF:RESEARCH]` / `[HANDOFF:RESEARCH_WRITE]` / `[HANDOFF:ANALYTICS]` tokens encode routing intent in the LLM's natural language output |
| **Fire-and-Forget** | `agents/style_agent.py` | `asyncio.ensure_future(to_thread(sync_check_and_refresh...))` fires stale-check in background, returns cached result immediately |
| **Builder** | `agents/writer_node.py` | `_build_system_prompt()` assembles a multi-section prompt from style block, evolution note, research brief, and action instruction |
| **Human-in-the-Loop (Interrupt)** | `agents/human_approval_node.py` | `interrupt()` pauses graph mid-run, serialises state to MemorySaver, surfaces draft to frontend, resumes only on `/resume` |
| **Pipeline (silent worker → user-facing worker)** | `agents/researcher_node.py` → `agents/research_digest_node.py` | Same shape as `style_retriever_node → writer_node`: one node gathers/structures data with no visible output, the next turns it into user-facing prose. Lets `router.py` decide what's streamable purely by node name, no content filtering |

---

## Known Gaps / Next Steps

### AI Agent Pipeline

| Step | Node/File | Status | Notes |
|---|---|---|---|
| — | `tools.py` | ✅ Done | 5 async `@tool` functions — all DB reads live here |
| — | `supervisor_node` | ✅ Done | Emits `[HANDOFF:WRITE]` / `[HANDOFF:ANALYTICS]` tokens; tool-loop via `bind_tools()`; direct answers |
| — | `tool_node` (LangGraph prebuilt) | ✅ Done | Executes tool called by LLM; appends ToolMessage; loops to supervisor |
| — | `style_agent.py` | ✅ Done | `analyze_style()` + `style_retriever_node` merged into one file — both are LLM nodes; circular import broken via local import |
| — | `writer_node` | ✅ Done | Strategy pattern: cold-start vs. `_build_system_prompt()` from style_json |
| — | `analytics_node` | ✅ Done | Dedicated analytics synthesizer; temp=0.0 |
| — | `human_approval_node` | ✅ Done | `interrupt()` HITL, saves on approve/edit |
| — | `sql_fetch_node` | ✅ Done | Write-only: `save_draft_to_vault()` |
| — | `router.py` | ✅ Done | `thread_id`, trimmed initial state, `/stream` SSE, `/resume` HITL endpoint |
| — | `helper.py` | Dead | Delete when cleaning up |
| — | `vector_search_node.py` | Dead | Logic lives in `tools.py`; delete when cleaning up |
| — | `researcher_node` | ✅ Done | Agentic tool loop: `web_search`/`fetch_page` (open web, default) + `get_topic_inventory`/`search_vault_posts` (only when the user asks about their own past posts) → `research_brief`. Silent — never streamed |
| — | `research_digest_node` | ✅ Done | `research_brief` → plain-text LinkedIn-creator digest; only researcher-path node that streams live |
| — | Reddit / community-sentiment source | Deferred | Originally scoped as a small MCP server (`search_reddit`); cut from v1 — `researcher_node` currently draws from the open web (`web_search`/`fetch_page`) + the user's own vault only |

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
- **Style Memory system** — `user_style_memory` table (migration 0008); `agents/style_agent.py` (merged from `style_analyzer.py` + `style_retriever_node.py`) + `style_memory.py`; window-based trigger (short-term every 3 new committed posts, long-term every 10); `analyze_style()` uses `gemini-2.5-flash-lite` at temp=0.1, max_output_tokens=512; outputs 9-key JSON; stored as JSONB in PostgreSQL (source of truth) and cached in Redis (`style:lt:{uid}` 24 h, `style:st:{uid}` 1 h); Redis is RAM-only so DB is always the durable source — Redis re-warms on any DB hit; `style_retriever_node` owns style fetching (not `get_style_samples` tool); trigger fires only from `PATCH /posts/{id}/status` — counting both `published` AND `scheduled` posts since both represent committed content
- **Chunk size 650 / overlap 80** — changed from 300/60 (2026-06-09); LinkedIn posts average 700–2500 chars; 650-char chunks keep one coherent idea per chunk; requires re-embedding existing posts (backfill pending)
- **No search_vault_posts fallback** — removed (2026-06-09); fallback dumped full post content into the LLM; embeddings are always written on `save_version` so fallback is dead code; returns `[NO_CONTEXT_FOUND]` when fewer than 1 vector hit exists
- **analytics_node offload** — analytics synthesis moved out of supervisor into a dedicated `analytics_node` (temp=0.0, tight prompt, 1024 max tokens); supervisor Pass 2 only routes for analytics, never synthesizes; reduces supervisor token spend per analytics query
- **post_analytics table** — user-logged impressions + reactions per post (migration 0009); one row per post (UNIQUE on post_id); `PATCH /posts/{id}/analytics` upserts; cache invalidated on write; enables AI analytics + future dashboard cards
- **Researcher: DuckDuckGo + trafilatura over a paid search vendor or native grounding** — considered Tavily/Serper/Brave (rejected, paid vendor) and Gemini's native `google_search` grounding tool (rejected — grounding returns short search snippets, not a full page read, and mixing it with our own function-calling tools in one call is Gemini-3-only/Preview on `gemini-2.5-flash-lite`). Landed on plain custom tools instead: `web_search` (`ddgs`, free, no API key) + `fetch_page` (`trafilatura`, strips a URL to clean readable text) — this gets genuine deep reads of a specific page (e.g. a product page) via `fetch_page` after `web_search` finds the URL, not just snippets
- **Researcher: one agentic tool loop, not a fixed multi-call pipeline** — because `web_search`/`fetch_page` are our own custom tools (not native Gemini tools), there's no restriction on binding them together with `get_topic_inventory`/`search_vault_posts` in one `bind_tools()` call — `researcher_node` runs a normal ReAct loop via `research_tool_node`, identical in shape to `supervisor_node`'s own tool loop, deciding for itself how many searches/fetches it needs instead of a fixed 3-call sequence
- **Researcher behaves like a general research agent by default** — the system prompt instructs the model to only call `get_topic_inventory`/`search_vault_posts` when the user's message explicitly references their own past posts/coverage; a plain "research X" query never touches the vault
- **Researcher: standalone digest vs. chained draft** — supervisor decides per-message via `[HANDOFF:RESEARCH]` (brief only, `research_brief` persists in the thread's checkpointed state for a later write turn) vs `[HANDOFF:RESEARCH_WRITE]` (chains straight into `style_retriever_node → writer_node → human_approval_node` in the same turn) — two decoupled specialists composed by the supervisor, not one merged agent. `researcher_node` (silent, tool loop) and `research_digest_node` (user-facing prose pass) mirror the existing `style_retriever_node → writer_node` silent-worker/user-facing-worker split, so `router.py` can tell what's streamable by node name alone
- **Reddit/MCP deferred** — a small MCP server for community-sentiment search (Reddit) was scoped for v1 and cut; `researcher_node` currently draws from the open web (`web_search`/`fetch_page`) + the user's own vault only. X/Twitter and LinkedIn have no viable free read APIs either way and are out of scope regardless of MCP
- **LinkedIn OAuth** — `backend/linkedin/` follows the same SRP/Strategy pattern as auth: `LinkedInAPIClient` (static HTTP, no state), `LinkedInConnectService` (business logic), `LinkedInAuth` model (storage). OAuth `state` param = `user_id` string so callback can identify user without headers (browser redirect). UPSERT on callback so reconnecting overwrites old token. Duplicate publish guard: 60s window check against `post_publish_log`. 3000-char limit enforced server-side. On successful publish: inserts `PostPublishLog`, calls `update_post_status(published)`, fires `sync_check_and_refresh_style_memory` background task — same as vault router's publish path. LinkedIn API version pin: `202604` (April 2026).
- **Stub user UUID:** `00000000-0000-0000-0000-000000000001` (seeded in migration 0003)
- **CSS approach:** landing/dashboard → inline styles + `var(--cc-*)` tokens; vault components → CSS modules + `--color-*`
- **Run commands** → see `DEVELOPMENT.md`
