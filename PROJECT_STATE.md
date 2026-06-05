# Content Coach — Project State
> Living reference for Claude. Update when architecture, decisions, or status change.
> Last updated: 2026-06-04

---

## Operational Guardrails & Architecture Rules

> **Strict Rules for Claude Code Architecture:**
> * **LLD & SOLID:** Adhere strictly to SDE-grade Low-Level Design. Every module must follow the Single Responsibility Principle (SRP). No monolithic service functions.
> * **Dependency Inversion:** Always pass dependencies (like `db: Session` or config objects) explicitly via constructors or FastAPI dependency injection — never import globals mid-function.
> * **Encapsulation & Typing:** Enforce strict Python type hinting throughout. Use Pydantic schemas at all data boundaries; keep internal domain logic encapsulated in service classes.
> * **Design Patterns over Nested Logic:** When scaling `helper.py` or managing complex post states, favor clean patterns (Strategy, Factory) over deeply nested if/else.

---

## What This Product Is

"Git for writing" — version-controlled LinkedIn/Medium post library. Users create folders, write posts, save named versions. AI layer queries post history and gives writing help.

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
| Embeddings | `models/gemini-embedding-001` — 3072 dims |
| LLM | `gemini-2.5-flash-lite` |
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
│   ├── main.py                   ← FastAPI app, CORS, router registration
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
│   │   ├── router.py             ← POST /api/ai/query + POST /api/ai/resume (HITL)
│   │   ├── embeddings.py         ← embed_and_store_version() — BackgroundTask, writes post_embeddings
│   │   ├── rag_chain.py          ← Legacy RAG chain (reference only — superseded by graph)
│   │   ├── state.py              ← AgentState TypedDict
│   │   ├── graph.py              ← LangGraph StateGraph, 4 nodes + ToolNode, MemorySaver
│   │   └── agents/
│   │       ├── supervisor.py          ← COGNITIVE: classifier (Pass 1) + tool caller + synthesizer (Pass 2)
│   │       ├── tools.py               ← 4 async @tool functions — all DB reads + Redis cache layer
│   │       ├── sql_fetch_node.py      ← WRITE ONLY: save_draft_to_vault()
│   │       ├── vector_search_node.py  ← DEAD (kept for reference — logic lives in tools.py)
│   │       ├── writer_node.py         ← COGNITIVE: style-aware LinkedIn post drafter
│   │       ├── analytics_node.py      ← DEAD (kept for reference — logic lives in tools.py)
│   │       ├── human_approval_node.py ← INTERRUPT: HITL checkpoint, saves on approve/edit
│   │       └── helper.py              ← DEAD (superseded — delete when ready)
│   ├── core/
│   │   ├── config.py             ← Settings (DATABASE_URL, REDIS_URL, LANGCHAIN_API_KEY_GEMINI…)
│   │   ├── cache.py              ← Redis client (sync + async), tool/embed cache helpers
│   │   ├── database.py           ← SQLAlchemy engine, SessionLocal, Base
│   │   └── dependencies.py       ← get_db(), get_current_user() (reads X-User-Id header)
│   └── alembic/versions/         ← Migrations 0001–0007 (initial schema → 768-dim embeddings + HNSW)
│
├── frontend/
│   ├── vite.config.js            ← @tailwindcss/vite plugin, @ alias → ./src
│   ├── jsconfig.json · package.json
│   └── src/
│       ├── main.jsx              ← BrowserRouter entry
│       ├── App.jsx               ← Routes, RequireAuth guard, AppContext
│       ├── index.css             ← --cc-* tokens, --color-* tokens, Tailwind import
│       ├── api/
│       │   ├── auth.js           ← register(), login()
│       │   └── vault.js          ← all vault API calls + X-User-Id Axios interceptor
│       ├── pages/
│       │   ├── HomePage.jsx      ← Login / Register / Forgot (3 modes)
│       │   ├── DashboardPage.jsx ← Post-login dashboard (sidebar + cards + AI bar)
│       │   ├── MyWorkPage.jsx    ← 3-col workspace: sidebar | folder panel | DocEditor
│       │   └── landing/
│       │       ├── landingContent.js  ← COPY object — all text strings, no JSX
│       │       ├── LandingPage.jsx    ← Single-file landing (all sections as functions)
│       │       └── *.jsx              ← Hero, Navbar, Features… DEAD CODE (superseded)
│       ├── hooks/
│       │   ├── useFolders.js · usePosts.js · usePost.js
│       └── components/
│           ├── Sidebar/   PostList/   Editor/   AIAssistant/
│           ├── shared/    ← Button, Input, Badge, ContextMenu
│           └── ui/        ← shadcn base (installed, not used in landing)
│
└── aI_assistance_f1/RAG/RAG.ipynb
```

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
post_publish_log(id UUID PK, post_id UUID FK→posts, version_id UUID FK→post_versions,
                 platform TEXT DEFAULT 'linkedin', published_at TIMESTAMPTZ)
post_embeddings(id UUID PK, post_id UUID FK→posts CASCADE, version_id UUID FK→post_versions CASCADE,
                user_id UUID FK→users, chunk_index INT, content TEXT, embedding vector(3072))
-- LangChain-managed:
langchain_pg_collection(uuid, name, cmetadata)
langchain_pg_embedding(uuid, collection_id, embedding, document, cmetadata)
```

**Indexes:** `idx_folders_user_id`, `idx_posts_user_id`, `idx_post_embeddings_user_id`
**No HNSW/IVFFlat:** 3072 dims exceeds pgvector's 2000-dim index limit — sequential scan acceptable at current scale.

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
| POST/GET | `/posts/{id}/versions` | Save / List versions |
| GET/PATCH/DELETE | `/versions/{id}` | Get / Rename label / Delete |
| GET | `/search?q=` | Keyword search across posts |

### AI — `/api/ai`
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/query` | `{prompt}` | Requires `X-User-Id`; calls LangGraph assistant |

---

## Frontend API Layer (vault.js)

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
```

**No global getPosts().** To get all user posts: `getFolders()` → `Promise.all(folders.map(f => getPostsInFolder(f.id)))` → flatten.

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
| `supervisor_node` | COGNITIVE + TOOL CALLER | `agents/supervisor.py` | ✅ Done | Pass 1: classify intent; call appropriate tool via `llm_agent.bind_tools()`. Pass 2: synthesize from ToolMessage or route to writer. |
| `tool_node` | EXECUTOR | `graph.py` (LangGraph `ToolNode`) | ✅ Done | Executes whatever tool the LLM called; writes result as `ToolMessage` into messages; loops back to supervisor. |
| `writer_node` | COGNITIVE | `agents/writer_node.py` | ✅ Done | Style-aware LinkedIn post drafter. Reads style samples from last `ToolMessage` in messages. Writes `draft`. |
| `human_approval_node` | INTERRUPT | `agents/human_approval_node.py` | ✅ Done | `interrupt()` HITL checkpoint. On approve/edit calls `save_draft_to_vault()`; on reject discards. |
| `sql_fetch_node` | WRITE ONLY | `agents/sql_fetch_node.py` | ✅ Done | Contains only `save_draft_to_vault()`. All read queries moved to `tools.py`. |

> **Architecture rule:** All agent nodes and tool functions are `async def` using `await llm.ainvoke()` / `asyncio.to_thread()` — multi-tenant, all LLM + DB calls are I/O-bound. Never use sync `llm.invoke()` inside graph nodes or tools.

---

### AgentState (`backend/ai/state.py`)

| Field | Type | Set by | Purpose |
|---|---|---|---|
| `query` | str | router | original prompt, never mutated |
| `user_id` | str | router | scopes ALL database operations |
| `messages` | list[HumanMessage\|AIMessage] | add_messages reducer | includes HumanMessage, AIMessage (with tool_calls), ToolMessage (tool results) |
| `task_type` | str | supervisor_node | `""` → `"general"/"research"/"write"/"analytics"/"suggest"` |
| `route` | str | supervisor_node | edge key: `"tools"/"write"/"direct"` |
| `draft` | str | writer_node | LinkedIn post draft |
| `approval_status` | str | human_approval_node | `""/"approved"/"edited"/"rejected"` |
| `answer` | str | supervisor_node | final response returned to frontend |

---

### Graph Topology

```
START
  │
  ▼
supervisor_node ── tools bound via llm.bind_tools([...])
  │
  ├─ last msg has tool_calls? ──► tool_node (LangGraph ToolNode)
  │                                    │ result → ToolMessage into messages
  │                                    └──► supervisor_node (loop — Pass 2)
  │
  ├─ route == "write" ──► writer_node ──► human_approval_node ──► END
  └─ route == "direct" ──► END
```

**Routing rule:** `supervisor_node` is the sole router. Pass 1 classifies and triggers a tool call (via `llm_agent`). After `tool_node` runs, supervisor is called again (Pass 2) to synthesize or route to writer.

**Supervisor pass detection:** `if state.get("task_type"):` → Pass 2; else → Pass 1.

**DB access pattern:**
- READ: `tools.py` — 4 async `@tool` functions; SQL via `asyncio.to_thread()`; pgvector scan inside `search_vault_posts`
- WRITE: `save_draft_to_vault()` in `sql_fetch_node.py`, called by `human_approval_node` on approve/edit
- Analytics is ephemeral — never written to DB

### Tools (`backend/ai/agents/tools.py`)

| Tool | Used for | Data source |
|---|---|---|
| `search_vault_posts(user_id, query)` | research | pgvector cosine scan → fallback to recent posts |
| `get_style_samples(user_id)` | write | 8 most recent published posts |
| `get_topic_inventory(user_id)` | suggest | all post titles + distinct tags |
| `analyze_publish_history(user_id)` | analytics | publish log + version metadata |

---

### Classifier (supervisor_node Pass 1)

Uses `llm.with_structured_output(ClassificationResult)` for reliable JSON — no string parsing.

| User intent | task_type | route |
|---|---|---|
| Greetings, factual LinkedIn/writing Q&A | `general` | `direct` |
| "What have I written about X?" | `research` | `sql_fetch` |
| "Write a post about X in my style" | `write` | `sql_fetch` |
| "What topics should I cover next?" | `suggest` | `sql_fetch` |
| "When should I post / predict engagement?" | `analytics` | `sql_fetch` |

---

## Known Gaps / Next Steps

### AI Agent Pipeline

| Step | Node/File | Status | Notes |
|---|---|---|---|
| — | `tools.py` | ✅ Done | 4 async `@tool` functions — all DB reads live here |
| — | `supervisor_node` | ✅ Done | Pass 1: classify + trigger tool call. Pass 2: synthesize or route to writer. |
| — | `tool_node` (LangGraph prebuilt) | ✅ Done | Executes tool called by LLM; appends ToolMessage; loops to supervisor |
| — | `writer_node` | ✅ Done | Reads style from last ToolMessage in messages |
| — | `human_approval_node` | ✅ Done | `interrupt()` HITL, saves on approve/edit |
| — | `sql_fetch_node` | ✅ Done | Write-only: `save_draft_to_vault()` |
| — | `router.py` | ✅ Done | `thread_id`, trimmed initial state, `/resume` endpoint |
| — | `helper.py` | Dead | Delete when cleaning up |

### Other Gaps

| Location | Status | Description |
|---|---|---|
| Forgot password | Placeholder | UI only — no backend endpoint |
| Redis | Not running locally | Cache layer built and wired; needs `docker run -d -p 6379:6379 redis:alpine` to activate |
| CORS | Dev only | Hardcoded `http://localhost:5173` |
| JWT | Not implemented | Plain UUID in header, no expiry |
| Legacy landing files | Dead code | `Hero.jsx`, `Navbar.jsx` etc. superseded by `LandingPage.jsx` |
| `HomePage.module.css` | Unused | No longer imported by `HomePage.jsx` |
| MetricsForm | Broken | Calls `upsertMetrics()` which doesn't exist in API |
| Embedding backfill | Pending | Existing `post_versions` rows have no embeddings in `post_embeddings` — new saves embed automatically; old content needs a one-off backfill script |

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
- **Stub user UUID:** `00000000-0000-0000-0000-000000000001` (seeded in migration 0003)
- **CSS approach:** landing/dashboard → inline styles + `var(--cc-*)` tokens; vault components → CSS modules + `--color-*`
- **Run commands** → see `DEVELOPMENT.md`
