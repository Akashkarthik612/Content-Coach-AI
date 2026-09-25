# CLAUDE.md

This file guides Claude Code when working with code in this repository.
> Living reference for Claude. Describes only the current state of the project — no changelog, no history.
> Edit sections in place when things change. Hard limit: **200 lines**.
> Status: rebuild complete for v1 scope. Build against this file as-is.
---

## 1. What the project does

Honne AI is the middle layer between where people keep their ideas and where they publish
them. It is for individuals and companies alike.

- **Input: knowledge sources.** Google Drive (Docs, Sheets), Notion, GitHub repos (README),
  MS Word, local files. Users either connect a source or upload into Honne's own knowledge store.
- **Output: distribution platforms.** LinkedIn, X, Reddit.
- **Middle: Honne AI.** A supervisor coordinates specialized agents that turn raw material
  into ready-to-publish content, all in one platform.

### Problems it solves
Starting set, expected to grow: (1) **no angles** — users have material but get stuck
deciding what to post; (2) **building in public** — turning what's being built into content
as it's built; (3) **consistency** — a series generator makes a week's content in one sitting.

### Positioning
Jasper writes marketing copy for agencies; Taplio helps write LinkedIn posts. Honne starts
from the user's own knowledge sources, reducing the friction between "I have this knowledge
source" and "I know what to post" so even a beginner can post consistently.

### What carries over vs. what is new
- **Kept:** writer agent, post templates, user style memory extraction, existing UI (landing
  page will be redesigned; dashboard/main window UI still being designed).
- **Rebuilt:** the research layer — one agent no longer does everything; split across
  specialized agents under the supervisor (see §3).

Portfolio project aimed at recruiters: prefer production-grade, well-tested, explainable
design over feature breadth. Longer-term, intended to become a product.

---

## 2. Where things live

### Hosting
| Layer | Host | Notes |
|---|---|---|
| Backend | Render | FastAPI app, LangGraph agents, scheduler |
| Frontend | Vercel | React + Vite build |
| Database + auth | Supabase | Postgres + pgvector; Supabase Auth (JWT) |

### Tech stack (unchanged from the previous version)
| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router v7, Axios, Tailwind CSS v4, lucide-react |
| Backend | FastAPI + Uvicorn, SQLAlchemy, Alembic |
| Database | PostgreSQL + pgvector (on Supabase) |
| Auth | Supabase JWT |
| AI orchestration | LangChain, LangGraph (AsyncPostgresSaver checkpointing) |
| LLM + embeddings | Google Gemini |
| Web search | Tavily |
| Cache | Redis |
| Tracing | LangSmith |

### Database

Phase 1 of the rebuild is cleaning the database down to the tables the new design needs.
The model is: a **user** attaches **knowledge sources**, the app generates **posts** from that data,
and each post's **analytics** are tracked regardless of platform.

#### Tables to keep

```sql
users(id UUID PK default gen_random_uuid(), username TEXT UNIQUE nullable, email TEXT UNIQUE nullable,
      password_hash TEXT nullable, created_at TIMESTAMPTZ NOT NULL default now())

user_profile(id UUID PK, user_id UUID UNIQUE NOT NULL FK→users ON DELETE CASCADE,
             profession TEXT nullable, industry TEXT nullable, role TEXT nullable, target_audience TEXT nullable,
             writing_style TEXT nullable, goals JSONB NOT NULL default '[]', topics JSONB NOT NULL default '[]',
             formatting_prefs JSONB NOT NULL default '{}', linkedin_headline TEXT nullable,
             linkedin_about TEXT nullable, weekly_post_target INT nullable,
             created_at TIMESTAMPTZ NOT NULL default now(), updated_at TIMESTAMPTZ NOT NULL default now())

-- Whatever the user generates in the app.
posts(id UUID PK, user_id UUID NOT NULL FK→users, title TEXT NOT NULL,
      content TEXT NOT NULL,                                  -- replaces post_versions (dropped)
      status post_status_enum NOT NULL default 'draft' (draft|published|archived|scheduled|failed),
      is_pinned BOOLEAN NOT NULL default false,
      scheduled_at TIMESTAMPTZ nullable, schedule_attempts INT NOT NULL default 0, last_schedule_error TEXT nullable,
      created_at TIMESTAMPTZ NOT NULL default now(), updated_at TIMESTAMPTZ NOT NULL default now())

-- Performance of a post, irrespective of platform.
post_analytics(id UUID PK, post_id UUID UNIQUE NOT NULL FK→posts ON DELETE CASCADE,
               user_id UUID NOT NULL FK→users ON DELETE CASCADE,
               impressions INT NOT NULL default 0, reactions INT NOT NULL default 0,
               updated_at TIMESTAMPTZ NOT NULL default now())

post_publish_log(id UUID PK, post_id UUID NOT NULL FK→posts ON DELETE CASCADE,
                 platform TEXT NOT NULL default 'linkedin', published_at TIMESTAMPTZ NOT NULL default now())

user_style_memory(id UUID PK, user_id UUID UNIQUE NOT NULL FK→users ON DELETE CASCADE,
                  long_term JSONB nullable, long_term_post_count INT NOT NULL default 0,
                  long_term_updated_at TIMESTAMPTZ nullable,
                  short_term JSONB nullable, short_term_post_count INT NOT NULL default 0,
                  short_term_updated_at TIMESTAMPTZ nullable)

linkedin_auth(id UUID PK, user_id UUID UNIQUE NOT NULL FK→users ON DELETE CASCADE,
              linkedin_id TEXT NOT NULL, linkedin_urn TEXT NOT NULL, access_token TEXT NOT NULL,
              token_type VARCHAR(32) NOT NULL default 'Bearer', expires_at TIMESTAMPTZ NOT NULL, scope TEXT NOT NULL,
              display_name TEXT NOT NULL, email TEXT nullable, profile_image_url TEXT nullable,
              created_at TIMESTAMPTZ NOT NULL default now(), updated_at TIMESTAMPTZ NOT NULL default now())
```

#### Table to add (not designed yet)
`knowledge_sources` — material a user attaches so the app can generate content from it.
Planned source types: Google Docs, GitHub repos (README is enough), MS Word, Notion, local
file upload. Columns not decided; do not create this table until designed here.

#### Tables to remove
`folders` (drop `posts.folder_id`), `post_versions` (content moves to `posts.content`; drop
`posts.current_version`, `post_publish_log.version_id`), `post_tags`, `post_embeddings` (drop
`idx_post_embeddings_user_id`, `idx_post_embeddings_hnsw`), `thread_registry`.

#### Indexes kept
`idx_posts_user_id`, `idx_post_analytics_user_id`, `idx_user_style_memory_user_id`,
`ix_linkedin_auth_user_id`, `ix_user_profile_user_id`.

#### Rules
Every table carries `user_id` (directly or via `posts`); ownership enforced in the service
layer. A post's real publish history comes from `post_publish_log.published_at`, never from
`posts.scheduled_at` (future intent only). The cleanup is migration `0022_rebuild_schema_cleanup`
(head; irreversible, not yet applied to any DB). `post_analytics` also has `comments INT` from
`0021`. Never edit existing migrations.

---

## 3. How work gets done

### Agent graph — single supervisor, everything else is a tool

```
User → Frontend (React/Vite) → FastAPI ⇄ Database (Supabase)
                                    │
                            Supervisor Agent ⇄ Memory (AsyncPostgresSaver, per thread_id)
                        (single AgentState — no separate sub-graphs)
              ┌──────────┬──────────┼──────────┬──────────┐
          Researcher   Series    Angles      Writer     (future: MCP
            Agent      Gen Agent  Gen Agent    Agent      tools/servers)
```

- **One graph, one memory.** Writer agent is bound as a tool on the supervisor, same as the
  others — no separate sub-graph or checkpoint. Supervisor is both orchestrator and
  aggregator; there is no separate aggregator node.
- **Supervisor**: holds full `AgentState`, is the only node that talks to the user, runs a
  ReAct-style tool-calling loop — call a tool, read result, decide next call or respond.
  First drafts, redrafts, and edit requests are all just another tool call in the same loop.
- **Workers** (incl. writer): get a scoped slice of state, never respond to the user directly,
  always report back to the supervisor, carry no memory of their own.
- **`Send()`** is for genuine parallel fan-out within one step (e.g. querying several
  connected knowledge sources at once) — not the normal dispatch mechanism.

### Conversation flow — multi-turn, not one-shot
A request is not "user asks → writer writes." It narrows over several supervisor turns:
1. **Intent** — open question ("what can I post about," "week's worth of content") or a
   direct ask ("write a post about X"). Supervisor picks which agent(s) to call — writer only
   if the user was already specific enough to skip suggestions (see edge cases).
2. **Suggestions** — angle/series/researcher output presented as options, not a finished
   post. User can browse, ask for more/different options, or narrow — loops several turns.
3. **Decision** — user picks one, or asks the supervisor to just go with its best pick.
4. **Draft(s)** — writer agent returns a draft; each edit request is another writer call in
   the same loop, informed by the running conversation — can loop several turns.
5. **Commit** — user approves; supervisor calls `save_post` (publish/schedule stays gated).

Edge cases: user skips straight to writing (writer called directly, maybe after a quick
research call); out-of-scope small talk (supervisor answers directly, no tool call); redraft
of an existing saved post (writer called with that post's content loaded into state); series
flow (each chosen angle gets its own draft/edit/approve cycle); resumed session (checkpointer
restores the thread — supervisor should recognize the stage, not restart); multi-source
requests (researcher/knowledge-source tool may be called more than once before suggesting).

This staging matters for the UI: it needs distinct states — suggestions/browse, draft/edit,
save/publish confirmation — not just a single chat stream.

### Save/publish, and operational rules
- Writer tool call returns a **draft only**, never writes to `posts`. `save_post` is the
  explicit action that persists one. Publish/schedule is external and hard to undo — always
  gate behind explicit confirmation.
- **Recursion limit** on supervisor tool-call loops so redraft cycles can't run unbounded.
- **State hygiene**: keep only the *current* draft as an overwritten field, don't replay every
  past version in the message history each turn.
- **Writer tool schema** must cover both "write from a template/angle" and "revise this
  existing draft" so the supervisor never has to guess what context to pass.

### Tools, retrieval, model tiering
Web search: Tavily (researcher). Knowledge sources (Drive, Notion, GitHub, uploads): existing
RAG pipeline for now; MCP server for on-the-go access is planned, not built. Model tiering:
supervisor on Gemini Flash-Lite (routing only); researcher and writer on Gemini Flash.

### Architectural constraints (carried over, still binding)
LLM for judgment only, deterministic Python for mechanics. JSON at machine-to-machine
boundaries, prose only at the user-facing boundary. No subgraphs for workers — supervisor
needs full `AgentState` visibility. One agent per feature (research/angles/series/writer) —
a single agent doing everything failed before; don't re-merge them.