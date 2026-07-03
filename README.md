# Content Coach

### A team of AI agents for your content. Git for your writing.

![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat&logo=fastapi)
![React](https://img.shields.io/badge/React_19-20232A?style=flat&logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_18-316192?style=flat&logo=postgresql&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-Multi--Agent-blueviolet?style=flat)
![Gemini](https://img.shields.io/badge/Google_Gemini-4285F4?style=flat&logo=google&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-232F3E?style=flat&logo=amazon-aws&logoColor=white)

**Content Coach is a multi-agent AI SaaS that gives LinkedIn creators a version-controlled writing vault and a coordinated team of specialized AI agents — each tuned to the individual user's writing voice — that automates research, drafting, and analytics end to end.**

<!-- HERO IMAGE: ./docs/screenshots/dashboard.png — the main "What are you planning today?" dashboard. Best clean product shot. (This is my Image 5 — the crisp full-screen capture.) -->
*The Content Coach dashboard — a single command center where users direct their AI agent team.*

---

## ▶ Demo

<!-- DEMO VIDEO: coming soon — embed link placeholder. -->
[![Demo](./docs/screenshots/dashboard.png)](# "▶ Watch the demo (coming soon)")

▶ **Watch the demo** *(coming soon)*

---

## 🎯 The Problem

Creators write in Google Docs, paste into ChatGPT, and ship posts that sound like every other piece of AI-generated content. Generic output. No version history. Up to 50% of creation time lost to topic research that should be instant.

The root cause: **tools, not teammates.** ChatGPT is a generalist. It doesn't know your voice, your audience, or what you published last month.

---

## ✨ Key Features

### Multi-Agent AI — Not a Wrapper

Content Coach runs a coordinated team of specialist agents orchestrated by a Supervisor. Each agent does one job at expert level:

- **Researcher Agent** surfaces trending and niche topics (Google News RSS + Hacker News Algolia), fuses them with the user's own vault via pgvector semantic search, and hands a ranked research brief to the Writer — LLM reserved for final editorial judgment only.
- **Writer Agent** drafts LinkedIn posts in the user's voice using compressed style-memory context, then pauses for a human-in-the-loop approval step (Approve / Edit / Reject) before anything is saved.
- **Analytics Agent** synthesizes post performance data and feeds insight back into the writing workflow.
- **Supervisor / Router** classifies every user request, calls the right tools, and routes to the right specialist — the sole orchestrator in the system.

This is agent-native architecture: not a chat interface bolted onto an LLM, but a graph of specialized agents with typed state contracts and deterministic handoff tokens.

---

### 🧠 Style Memory — Agents That Sound Like You

The moat. Every user's agents learn from their own published posts through a dual-window style memory system:

- **Short-term memory** refreshes every 3 committed posts, capturing recent shifts in tone.
- **Long-term memory** evolves every 10 posts, tracking stable stylistic fingerprints.

The Writer Agent consumes a compressed style-memory JSON (9 keys: sentence rhythm, vocabulary density, emoji usage, structural patterns, and more) and drafts posts that read like *the user wrote them* — not like every other LinkedIn creator using AI.

Style profiles are stored durably in PostgreSQL (source of truth) and re-warmed in Redis on every hit. Extraction runs as a background task — users never wait on ML inference in the critical path.

<!-- IMAGE: ./docs/screenshots/onboarding-voice.png — Step 2 "Define your voice", target audience + writing style. This visually proves the "agents tuned to you" claim. (Image 2) -->
*Onboarding Step 2: users define their target audience and writing style — seeds the style-memory system before any posts are published.*

---

### 📁 Version-Controlled Content Vault

A structured writing environment built around the mental model of Git:

- **Folders → Posts → Named versions** — every draft is preserved, nothing is ever lost.
- Restore any version, rename labels, track progression from rough idea to published post.
- Semantic search across the entire vault via pgvector HNSW — the Researcher Agent retrieves relevant past posts as context when drafting new ones.

---

### 🚀 Onboarding — Configuring the Agents to You

The onboarding flow captures the signals the agents need to do their job from day one:

<!-- IMAGE: ./docs/screenshots/onboarding-industry.png — Step 1 onboarding, "Tell us about yourself" industry + role selection. (Image 3) -->
*Step 1: industry and role — scopes the Researcher Agent's topic recommendations.*

<!-- IMAGE: ./docs/screenshots/onboarding-formatting.png — Step 3 formatting preferences. (Image 4) -->
*Step 3: formatting preferences — wired directly into the Writer Agent's prompt construction.*

---

### 📊 One-Click LinkedIn Publishing & Analytics

Post status flows from `draft → scheduled → published`; publishing triggers a style extraction pass so the memory system stays current without any extra user action. The Analytics Agent synthesizes impressions, reactions, and publish history into actionable writing insight — in plain language, not a dashboard the user has to interpret themselves.

---

## ⚙️ How It Works

### Agent Graph Topology

```
START
  │
  ▼
supervisor_node  ── llm.bind_tools([search_vault, get_topics, get_analytics, ...])
  │
  ├─ tool_calls present? ──► tool_node  (LangGraph ToolNode)
  │                               │ ToolMessage → messages
  │                               └──► supervisor_node  (tool loop)
  │
  ├─ [HANDOFF:WRITE] ──► Send API ──► style_retriever_node  (Redis → DB → on-demand extraction)
  │                                            │ style_json merged into AgentState
  │                                       writer_node  (Strategy: cold-start vs. style-aware)
  │                                            │
  │                                   human_approval_node  ──► save_draft_to_vault()
  │                                            │
  │                                           END
  │
  ├─ [HANDOFF:ANALYTICS] ──► analytics_node  (temp=0.0, tight prompt, 1024-token cap)
  │                                 │
  │                                END
  │
  └─ direct answer ──► END
```

<!-- ARCHITECTURE DIAGRAM: ./docs/architecture.png — the multi-agent workflow diagram (orchestrator + 4 agents). Place directly under the ASCII graph topology. -->
*The full multi-agent pipeline — supervisor orchestrates specialist workers via LangGraph's Send API.*

**Design principles baked into the graph:**

| Principle | Implementation |
|---|---|
| Prose at the boundary | `[HANDOFF:WRITE]` / `[HANDOFF:ANALYTICS]` tokens in the supervisor's natural language output drive routing — no fragile JSON parsing of LLM intent |
| Deterministic retrieval, LLM judgment only | Tools execute deterministic SQL/vector queries; the LLM only synthesizes, never fetches |
| Fully async I/O | Every node is `async def` with `await llm.ainvoke()`; DB calls via `asyncio.to_thread()` — multi-tenant concurrency without blocking |
| Minimal state dispatch | Send API passes workers only the state slice they need (`{user_id, query}`), keeping context windows small and reducing token spend |
| Human-in-the-loop | `interrupt()` serialises graph state to MemorySaver mid-run; frontend surfaces Approve / Edit / Reject; `/resume` rehydrates and continues |

---

## 🛠 Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | FastAPI · SQLAlchemy · Alembic · Uvicorn |
| **Database** | PostgreSQL 18 + pgvector (HNSW cosine index) · Redis |
| **AI / Agents** | LangGraph · LangChain · Google Gemini Flash-Lite · Gemini Embeddings (768-dim) |
| **Observability** | LangSmith (full agent trace per request) |
| **Frontend** | React 19 · Vite · React Router v6 · Tailwind CSS v4 · Framer Motion |
| **Auth / Publishing** | bcrypt (direct) · LinkedIn OAuth 2.0 · LinkedIn Posts API |
| **Infra** | AWS · Multi-tenant (single DB, `user_id` scoping throughout) |

---

## 🏗 Engineering Highlights

- **Logical multi-tenancy** — single PostgreSQL instance; `user_id` scoped on every table and enforced at the service layer. No shared data leaks between tenants by design.

- **768-dim embeddings + HNSW** — `models/gemini-embedding-001` with `output_dimensionality=768` (4× smaller than the 3072-dim default). Deliberate cost/latency trade-off; HNSW O(log n) cosine search via migration-managed index. Cost-conscious for emerging-market price sensitivity.

- **Dual-durability style memory** — PostgreSQL is the source of truth for style profiles; Redis re-warms on every cache hit. Redis failure degrades gracefully (silent miss → DB fallback) — the agent team keeps working regardless.

- **Fire-and-forget style extraction** — style analysis runs as a FastAPI `BackgroundTask` on post publish and as `asyncio.ensure_future()` inside the agent graph on stale cache hit. The critical user path is never blocked by ML inference.

- **BaseAuthProvider ABC (Strategy pattern)** — `PasswordAuth` is the current implementation; `GoogleAuth` and `LinkedInAuth` are the pluggable next targets. Auth strategy swaps without touching any business logic.

- **Embedding pipeline** — `embed_and_store_version()` fires as a `BackgroundTask` on every version save; 650-char chunks / 80-char overlap (tuned for LinkedIn post length); previous version's chunks deleted atomically before new ones are inserted. HTTP 201 returns immediately.

- **Redis cache-aside with invalidation** — tool results cached per user (30-min TTL); cache invalidated on every vault write. Query embeddings cached for 24 h. System behaves correctly with or without Redis running.

- **Human-in-the-Loop checkpoint** — LangGraph `interrupt()` serialises full graph state to `MemorySaver` mid-run; the frontend surfaces the draft with Approve / Edit / Reject controls; `/resume` rehydrates and continues execution. Approval state survives server restarts.

---

## 📍 Status & Roadmap

| | |
|---|---|
| **Live** | Core vault (folders, posts, versions) · Multi-agent AI pipeline · Style memory system · Post analytics ingestion · Human-in-the-loop draft approval |
| **In progress** | LinkedIn publishing (OAuth + Posts API wired; final review UI in progress) |
| **Roadmap** | Analytics → Writer feedback loop (agent reads own performance, adapts future drafts) · X / Reddit publishing channels · Mobile-responsive editor · Team workspaces |

**Waitlist open.** Early access for LinkedIn creators and bootstrapped founders.

---

## 👤 Built by

**Akash Balamurugan** — [Live Demo](#) *(coming soon)* · [LinkedIn](https://linkedin.com/in/akashbalamurugan)

---

*Content Coach — a team of AI agents for your content.*
