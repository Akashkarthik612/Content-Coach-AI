# Content Coach — Project State

> This file is the living reference for Claude. Update it when architecture, decisions, or status change.
> Last updated: 2026-05-26

---

## What This Product Is

A version-controlled LinkedIn/Medium post library — "Git for writing". Users create folders, write posts, and save named versions of each post. An AI layer lets users query their post history and get writing help. Landing page, auth, dashboard, and vault app are all built.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router v6, Axios |
| Styling | Tailwind CSS v4 (@tailwindcss/vite), inline styles (landing/dashboard) |
| Icons | lucide-react |
| Backend | FastAPI + Uvicorn |
| ORM | SQLAlchemy |
| Database | PostgreSQL 18 + pgvector extension |
| Migrations | Alembic |
| Auth | bcrypt (direct, no passlib — incompatible with bcrypt ≥ 4.0) |
| AI / RAG | LangChain, LangGraph, Google Gemini API |
| Embeddings | `models/gemini-embedding-001` — 3072 dims |
| LLM | `gemini-2.5-flash-lite` |
| Tracing | LangSmith (`linkedin-coach-rag` project) |

---

## Directory Map

```
f:\My_first_product\
├── .env                          ← NEVER COMMIT — contains real API keys
├── .env.example                  ← safe to commit, placeholder values
├── requirements.txt
├── alembic.ini
├── PROJECT_STATE.md              ← this file
├── UI_STATE.md                   ← frontend design system reference
│
├── backend/
│   ├── main.py                   ← FastAPI app, CORS, router registration
│   ├── core/
│   │   ├── config.py             ← Settings (DATABASE_URL, LANGCHAIN_API_KEY_GEMINI, etc.)
│   │   ├── database.py           ← SQLAlchemy engine, SessionLocal, Base
│   │   └── dependencies.py       ← get_db(), get_current_user() (reads X-User-Id header)
│   ├── auth/
│   │   ├── models.py             ← User model (id, username, email, password_hash)
│   │   ├── schemas.py            ← RegisterRequest, LoginRequest, AuthResponse
│   │   └── router.py             ← POST /api/auth/register, POST /api/auth/login
│   ├── vault/
│   │   ├── models.py             ← Folder, Post, PostVersion, PostTag, PostPublishLog
│   │   ├── schemas.py            ← All Pydantic request/response models
│   │   ├── service.py            ← Business logic; all queries scoped to user_id
│   │   └── router.py             ← /api/vault/* — all endpoints require X-User-Id header
│   ├── ai/
│   │   ├── router.py             ← POST /api/ai/query — calls LangGraph assistant
│   │   ├── rag_chain.py          ← LangChain RAG: PGVector retriever → Gemini (legacy ref)
│   │   ├── state.py              ← AgentState TypedDict (shared across graph nodes)
│   │   ├── graph.py              ← LangGraph StateGraph, compiled as `assistant`
│   │   └── agents/
│   │       ├── supervisor.py     ← Entry node — invokes Gemini, sets answer + route
│   │       └── helper.py         ← STUB — researcher/writer node (pass)
│   └── alembic/versions/
│       ├── 0001_initial_schema.py
│       ├── 0002_add_pgvector.py
│       ├── 0003_add_users_table.py
│       ├── 0004_add_user_id_to_posts.py
│       ├── 0005_add_email_to_users.py
│       └── 0006_add_is_pinned_to_posts.py
│
├── frontend/
│   ├── vite.config.js            ← @tailwindcss/vite plugin, @ alias → ./src
│   ├── jsconfig.json             ← path alias @/* → ./src/*
│   ├── package.json
│   └── src/
│       ├── main.jsx              ← BrowserRouter entry
│       ├── App.jsx               ← Routes, RequireAuth guard, AppContext
│       ├── index.css             ← --cc-* tokens, --color-* tokens, Tailwind import
│       ├── api/
│       │   ├── auth.js           ← register(), login() → POST /api/auth/*
│       │   └── vault.js          ← all vault API calls + X-User-Id interceptor
│       ├── pages/
│       │   ├── HomePage.jsx      ← Login / Register / Forgot (3 modes, restyled)
│       │   ├── DashboardPage.jsx ← Post-login dashboard (sidebar + 4 cards + AI bar)
│       │   ├── MyWorkPage.jsx    ← 3-col workspace: sidebar | folder panel | DocEditor canvas
│       │   └── landing/
│       │       ├── landingContent.js  ← COPY object — all text strings, no JSX
│       │       ├── LandingPage.jsx    ← Single-file landing page (all sections inline)
│       │       ├── Navbar.jsx         ← (legacy, superseded by LandingPage.jsx inline)
│       │       ├── Hero.jsx           ← (legacy, superseded)
│       │       ├── ProblemStrip.jsx   ← (legacy, superseded)
│       │       ├── Features.jsx       ← (legacy, superseded)
│       │       ├── HowItWorks.jsx     ← (legacy, superseded)
│       │       ├── Pricing.jsx        ← (legacy, superseded)
│       │       └── FinalCTA.jsx       ← (legacy, superseded)
│       ├── hooks/
│       │   ├── useFolders.js
│       │   ├── usePosts.js
│       │   └── usePost.js
│       └── components/
│           ├── Sidebar/          ← Folder list, rename, delete, right-click menu
│           ├── PostList/         ← Post table, inline rename, expand row
│           ├── Editor/           ← Textarea, version tabs, save form, metrics form
│           ├── AIAssistant/      ← Floating chat → POST /api/ai/query
│           ├── shared/           ← Button, Input, Badge, ContextMenu
│           └── ui/               ← shadcn base components (installed, not used in landing)
│
└── aI_assistance_f1/RAG/RAG.ipynb  ← Dev notebook for RAG pipeline
```

---

## Route Map

| Route | Component | Auth | Status |
|---|---|---|---|
| `/` | `LandingPage.jsx` | Public | ✅ Built |
| `/login` | `HomePage.jsx` (mode=login) | Public | ✅ Built |
| `/register` | `HomePage.jsx` (mode=register) | Public | ✅ Built |
| `/dashboard` | `DashboardPage.jsx` | RequireAuth | ✅ Built |
| `/vault` | `MyWorkPage.jsx` (3-col workspace) | RequireAuth | ✅ Built |
| `/my-work` | `MyWorkPage.jsx` (alias) | RequireAuth | ✅ Built |
| `/app` | `MainApp` (old vault UI) | RequireAuth | ⚠️ Legacy — kept for safety |

**Post-login redirect:** Both login and register navigate to `/dashboard`.

---

## Database Schema

```sql
users           (id UUID PK, username TEXT UNIQUE, email TEXT UNIQUE nullable,
                 password_hash TEXT, created_at TIMESTAMPTZ)

folders         (id UUID PK, user_id UUID FK→users, name TEXT,
                 description TEXT, created_at TIMESTAMPTZ)

posts           (id UUID PK, user_id UUID FK→users, folder_id UUID FK→folders,
                 title TEXT, status post_status_enum, is_pinned BOOLEAN DEFAULT false,
                 current_version INT, scheduled_at TIMESTAMPTZ,
                 created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)

post_versions   (id UUID PK, post_id UUID FK→posts CASCADE,
                 version_number INT, content TEXT, source TEXT,
                 change_summary TEXT, char_count INT, created_at TIMESTAMPTZ)
                UNIQUE (post_id, version_number)

post_tags       (id UUID PK, post_id UUID FK→posts CASCADE, tag TEXT)

post_publish_log (id UUID PK, post_id UUID FK→posts, version_id UUID FK→post_versions,
                  platform TEXT DEFAULT 'linkedin', published_at TIMESTAMPTZ)

post_embeddings  (id UUID PK, post_id UUID FK→posts CASCADE,
                  version_id UUID FK→post_versions CASCADE,
                  user_id UUID FK→users, chunk_index INT,
                  content TEXT, embedding vector(3072))

-- LangChain managed (PGVector library):
langchain_pg_collection  (uuid, name, cmetadata)
langchain_pg_embedding   (uuid, collection_id, embedding, document, cmetadata)
```

**Indexes:** `idx_folders_user_id`, `idx_posts_user_id`, `idx_post_embeddings_user_id`

**Note:** No HNSW/IVFFlat index on embedding — 3072 dims exceeds pgvector's 2000-dim limit. Sequential scan is fine at current scale.

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
| GET | `/folders` | List user's folders |
| POST | `/folders` | Create folder |
| PATCH | `/folders/{id}` | Rename folder |
| DELETE | `/folders/{id}` | Delete folder |
| GET | `/folders/{id}/posts` | List posts in folder |
| POST | `/folders/{id}/posts` | Create post in folder |
| GET | `/posts/{id}` | Get single post |
| PATCH | `/posts/{id}` | Rename post |
| PATCH | `/posts/{id}/pin` | Pin / unpin post (`{is_pinned: bool}`) |
| DELETE | `/posts/{id}` | Delete post |
| POST | `/posts/{id}/versions` | Save version (manual/AI) |
| GET | `/posts/{id}/versions` | List versions |
| GET | `/versions/{id}` | Get single version |
| PATCH | `/versions/{id}` | Rename version label |
| DELETE | `/versions/{id}` | Delete version |
| GET | `/search?q=` | Keyword search across posts |

### AI — `/api/ai`
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/query` | `{prompt}` | Requires `X-User-Id`; calls LangGraph assistant |

---

## Frontend API Layer (vault.js)

All functions resolve directly (`.then(r => r.data)` already applied). **No `.data` access needed at call site.**

```js
getFolders()                           → folder[]
createFolder(name, description)        → folder
renameFolder(id, name)                 → folder
deleteFolder(id)                       → {}
getPostsInFolder(folderId)             → post[]     // only way to get posts — no global getPosts()
createPost(folderId, title)            → post
getPost(id)                            → post
renamePost(id, title)                  → post
deletePost(id)                         → {}
pinPost(id, is_pinned)                 → post
saveVersion(postId, content, label)    → version
getVersions(postId)                    → version[]
getVersion(versionId)                  → version
renameVersion(versionId, label)        → version
deleteVersion(versionId)              → {}
search(query)                          → result[]
```

**Important:** There is no `getPosts()` that fetches all posts globally. To get all posts for a user, call `getFolders()` then `Promise.all(folders.map(f => getPostsInFolder(f.id)))` and flatten.

---

## Authentication Flow

1. `POST /api/auth/register` → bcrypt hash → store user → return `{user_id, username, email}`
2. `POST /api/auth/login` → verify bcrypt → return `{user_id, username, email}`
3. Frontend stores `user_id` and `username` in `localStorage`
4. Every vault/AI API call sends `X-User-Id: <uuid>` header via Axios interceptor in `vault.js`
5. `get_current_user()` dependency reads header, looks up user in DB → 401 if missing/invalid
6. All service functions receive `user_id` and enforce ownership (`_own_folder`, `_own_post`, `_own_version`)

**Current limitation:** Header-based auth with no token expiry — dev-grade only. JWT planned later.

---

## Agent Architecture (Partially Implemented)

### AgentState fields

| Field | Type | Set by | Purpose |
|---|---|---|---|
| `query` | str | caller | original user prompt, never mutated |
| `user_id` | str | caller | scopes all DB queries |
| `messages` | list[HumanMessage\|AIMessage] | add_messages reducer | auto-appended message history |
| `task_type` | str | supervisor | "general" / "summarize" / "write" |
| `route` | str | supervisor / helper | "direct" / "researcher" / "writer" |
| `post_context` | str | helper | raw post content from DB or vector search |
| `draft` | str | writer | generated content |
| `answer` | str | supervisor | final response to user |

### Graph edges

```
[supervisor] --"direct"--> END
[supervisor] --"research"--> [helper]
[helper]                 --> [supervisor]
```

### Current status

- `supervisor.py` — **working**: invokes `gemini-2.5-flash-lite`, sets `state["answer"]`, routes "direct" → END
- `helper.py` — **STUB**: `pass` only, not yet wired
- Classification logic (general/summarize/write) not yet implemented in supervisor

---

## Known Gaps / Next Steps

| Location | Status | Description |
|---|---|---|
| `agents/helper.py` | STUB | Needs SQL tool + RAG tool + routing decision |
| Supervisor classification | STUB | Currently always routes "direct" |
| Forgot password | Placeholder | Shows UI only — no backend endpoint |
| Embedding on save | Not wired | `save_version` does not trigger async embedding |
| CORS | Dev only | Hardcoded `http://localhost:5173` |
| JWT | Not implemented | Plain UUID in header, no expiry |
| Legacy files | Dead code | `landing/Navbar.jsx`, `Hero.jsx`, etc. superseded by single-file `LandingPage.jsx` |
| `HomePage.module.css` | Unused | CSS module no longer imported by HomePage.jsx |
| MetricsForm | Broken | Calls `upsertMetrics()` which doesn't exist in API |

---

## Running the Project

```bash
# Backend
cd f:\My_first_product
venv\Scripts\uvicorn backend.main:app --reload

# Frontend
cd f:\My_first_product\frontend
npm run dev

# Migrations
venv\Scripts\alembic upgrade head

# Clear all DB data (dev)
venv\Scripts\python -c "
from sqlalchemy import create_engine, text
from dotenv import load_dotenv; import os; load_dotenv()
engine = create_engine(os.getenv('DATABASE_URL'))
with engine.connect() as conn:
    conn.execute(text('TRUNCATE langchain_pg_embedding, langchain_pg_collection, post_embeddings, post_publish_log, post_tags, post_versions, posts, folders, users CASCADE'))
    conn.commit()
"
```

---

## Design Decisions & Constraints

- **Logical multi-tenancy** (not schema-per-tenant) — single DB, `user_id` on every table
- **bcrypt direct** — `passlib` dropped (incompatible with bcrypt ≥ 4.0)
- **No JWT yet** — plain UUID in header; JWT deferred
- **No Redis yet** — deferred until 100+ users
- **No RLS yet** — deferred; ownership enforced in service layer instead
- **3072-dim embeddings** — Gemini embedding-001; no vector index possible at this dim count
- **Async embedding** — not yet implemented; manual via notebook for now
- **RAG collection name:** `linkedin_coach_posts` (LangChain PGVector managed)
- **Stub user UUID:** `00000000-0000-0000-0000-000000000001` — seeded in migration 0003
- **CSS approach:** landing pages and dashboard use inline styles with `var(--cc-*)` tokens; vault app components use CSS modules
- **Two CSS token namespaces:** `--cc-*` (landing/dashboard, inline-style pages) and `--color-*` (legacy vault components)
