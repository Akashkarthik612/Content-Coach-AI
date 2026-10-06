# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
> Living reference for Claude. Describes only the current state of the project — no changelog, no history.
> Edit sections in place when things change. Hard limit: **200 lines**.
> Status: schema rebuild and auth are done; the independent platform agents are being built (see §3). Build against this file as-is.
---

## 1. What the project does

Honne AI is the middle layer between where people keep their ideas and where they publish them. It is for individuals and companies alike.

- **Input: knowledge sources.** Google Drive (Docs, Sheets), Notion, GitHub repos (README), MS Word, local files. Users either connect a source or upload into Honne's own knowledge store.
- **Output: distribution platforms.** LinkedIn, X, Reddit.
- **Middle: Honne AI.** A supervisor coordinates specialized agents that turn raw material into ready-to-publish content, creating a unified knowledge source like Dust and Jasper, once the knowledge source of an organisation has been centralised anyone create any kind of agents on top of this knowledge source and organise and build efficient workflow on top of this, all in one platform.

### Problems it solves
Starting set as of now, expected to grow: (1) **no angles** — users have material but get stuck deciding what to post; (2) **building in public** — turning what's being built into content as it's built; (3) **consistency** — a series generator makes a week's content in one sitting this will grow more as of now for prototype testing we are doing this but the goal is replciate what Dust and Jasper is doing creating a centralised knowldge source and build Agentic Workflows on top of that.

### Positioning
Jasper writes marketing copy for agencies; Taplio helps write LinkedIn posts. Honne starts from the user's own knowledge sources, reducing the friction between "I have this knowledge source" and "I know what to post" so even a beginner can post consistently.

### What carries over vs. what is new
- **Kept:** writer agent, post templates, user style memory extraction, existing UI (landing page will be redesigned; dashboard/main window UI still being designed).
- **Rebuilt:** the research layer — one agent no longer does everything; split across specialized agents under the supervisor (see §3).

Portfolio project aimed at recruiters: prefer production-grade, well-tested, explainable design over feature breadth. Longer-term, intended to become a product.

---

## 2. Where things live

### Hosting
| Layer | Host | Notes |
|---|---|---|
| Backend | Render | FastAPI app, LangGraph agents, scheduler |
| Frontend | Vercel | React + Vite build |
| Database + auth | Supabase | Postgres + pgvector; Supabase Auth (JWT) |

### Commands
Backend (repo root, venv active): `pip install -r requirements.txt -r requirements-test.txt` · `uvicorn backend.main:app --reload` · `alembic upgrade head` (migrations) · `ruff check backend` (lint).
CI lints only the rebuilt code; to match it run `ruff check backend/main.py backend/ai backend/auth backend/core/config.py backend/core/database.py tests scripts`
(legacy modules outside that set still have known lint errors).
Frontend (`frontend/`): `npm install` · `npm run dev` · `npm run build` · `npm run lint`.
Single test: `pytest tests/unit/independent_agents/<file>.py::<test_name>`; by layer: `pytest -m integration` / `pytest -m smoke` (markers in `pytest.ini`).
`README.md` still describes the old "Content Coach" product; trust this file over it.

### Tests (LinkedIn agent; Reddit/X will copy the pattern)
- `pytest tests/` runs `tests/unit/` (fakes only, runs anywhere). `tests/integration/` (real Postgres SQL + checkpointer, LLM faked) and
  `tests/smoke/` (whole stack over HTTP) need `TEST_DATABASE_URL` pointing at a **local** pgvector Postgres; without it they skip, and any
  non-local host is refused (the tests truncate tables). On Windows they need the selector event loop (set in `tests/conftest.py`).
- Smoke tests fake only the outside world, with `tests/smoke/fake_upstream.py` standing in for Gemini (via `GEMINI_BASE_URL`) and
  Supabase's JWKS (via `SUPABASE_URL`). The Gemini request contract test pins what production sends.
- Browser smoke: `npm run test:smoke` in `frontend/` (Playwright → real backend via `python -m tests.smoke.serve`).
- CI (`.github/workflows/ci.yml`): lint (scoped to the rebuilt code), backend-tests, docker-smoke (boots the real Dockerfile image
  that Render builds), browser-smoke. No secrets in CI.
- After a deploy, `python scripts/prod_check.py --api … --origin … --token …` makes the only real Gemini calls.
  Production refuses to boot on Render (`RENDER` env) without `LANGCHAIN_API_KEY_GEMINI`; `GEMINI_BASE_URL` must stay unset there.

### Tech stack
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

### Database (Supabase Postgres; Alembic head `0024`)
The model: a **user** attaches **knowledge sources**, the app generates **posts** from them, and each post's
**analytics** are tracked regardless of platform. Read `backend/*/models.py` for exact columns.
- `users`: account row keyed by the Supabase auth id. No password column; Supabase owns credentials (`0023`).
- `user_profile`: one per user. Onboarding answers (profession, audience, goals, topics, formatting prefs, weekly target).
- `posts`: generated content. Body lives in `posts.content`; status is draft/published/archived/scheduled/failed, plus pin and scheduling fields.
- `post_analytics`: one per post. Impressions, reactions, comments.
- `post_publish_log`: one row per real publish (platform, `published_at`).
- `user_style_memory`: one per user. Long-term and short-term style JSON extracted from their posts.
- `linkedin_auth`: one per user. LinkedIn OAuth token and profile.
- `agent_threads`: one row per independent-agent chat. `id` is the LangGraph `thread_id`; holds owner, agent (linkedin|reddit|x),
  title, `turn_count`, the `busy_until` lease and `last_message_at`.
- Checkpoint tables (`checkpoints`, `checkpoint_*`) are created by `AsyncPostgresSaver.setup()` at startup, not by Alembic.
- **Not designed yet:** `knowledge_sources` (Google Docs/Sheets, Notion, GitHub README, Word, uploads). Don't create it until it's designed here.

**Rules:** every table carries `user_id` (directly or via `posts`), and ownership is enforced in the service layer. Real publish
history comes from `post_publish_log.published_at`, never `posts.scheduled_at` (that's future intent). Never edit existing migrations;
`0022` (schema cleanup) is irreversible.

---

## 3. How work gets done

### Build order
| Step | What | Status |
|---|---|---|
| 1 | Three independent platform agents (LinkedIn, Reddit, X), each with its own endpoint and studio page | Done |
| 1b | Thread memory for those agents | Done for LinkedIn; Reddit and X still stateless |
| 2 | Unified knowledge source: retrieve, chunk, embed and semantically search all connected sources, shared by every agent | Next. Not built |
| 3 | Supervisor/worker graph (below) | Later. `backend/ai/agents/*.py`, `graph.py` and `llm.py` are empty stubs; `state.py`/`schemas.py` are drafted |

### Independent platform agents (`backend/ai/independent_agents/`, Steps 1–1b)
- Each agent is **one LLM call per turn** (Gemini `gemini-3.5-flash`) with its own system prompt. No tools, no routing, no supervisor.
  Keep these separate from the Step 3 supervisor graph: don't route through it or change it for this work.
- Routes live under `/api/independent-agents`: `POST /linkedin` (chat turn), `GET /linkedin/threads`, `GET`/`DELETE /linkedin/threads/{id}`,
  and stateless `POST /reddit` and `POST /x`. Every endpoint returns a draft and nothing is written to `posts`.
- **Thread memory:** one chat is one thread. The conversation lives in the LangGraph `AsyncPostgresSaver` (a single-node graph built at
  startup in `main.py`). `AgentThreadService` (`threads.py`) owns the `agent_threads` row, and every lookup matches id, user and agent.
  A new chat starts with empty memory; there is no memory across chats (long-term context will come from Step 2).
- **Limits:** a thread ends after `THREAD_TURN_LIMIT` (15) turns, and the UI tells the user to start a new chat; history is never trimmed silently.
  A `busy_until` lease allows one turn at a time. Its length is derived in `limits.py` from Gemini attempts × timeout, so never hardcode it.
  Threads idle longer than `THREAD_RETENTION_DAYS` (7) are hidden right away and removed by a daily purge task in `main.py`.
- Frontend: the only app pages are landing, auth (`/login`, `/register`, password reset), `/onboarding`, `HomeDashboardPage` (`/home`) and `LinkedInStudioPage`, `RedditStudioPage` and `XStudioPage` (`/linkedin`, `/reddit`, `/x`),
  via `src/api/independentAgents.js`. LinkedIn studio uses the thread endpoints; Reddit studio calls the stateless endpoint; X studio is still simulated. Tests: see §2 Tests.

### Agent graph (Step 3): single supervisor, everything else is a tool

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