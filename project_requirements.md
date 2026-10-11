# Project Requirements: Honne AI (Multiplayer AI Prototype)

What we are building and why. Architecture and stack live in [CLAUDE.md](./CLAUDE.md); how Claude behaves while working lives in [guardrails.md](./guardrails.md). Read all three, plus the attached `Day_N.md` (the day's task brief), before planning.

---

## 1\. Vision

Honne AI is **multiplayer AI for companies**: one shared knowledge layer, with many agents on top, that any person can drop into and continue from where the last person left off.

- Consumer AI (ChatGPT, Claude) is individual-focused: one person, one chat, one memory.  
- Enterprise AI should be team-focused: knowledge is centralised, agents are shared, and humans and agents work along each other.  
- Reference products: **Dust** and **Jasper AI** (a centralised company knowledge source with agents and workflows on top).

**Do not anchor on one use case.** Angle generation and post writing are small problems. The real target is the platform layer: knowledge source \+ ingestion pipeline \+ agents on top.

## 2\. Product layers

| Layer | What it is | Status |
| :---- | :---- | :---- |
| **Knowledge layer** | Unified knowledge source in pgvector (data-lake style). Everything a company knows lives here. | **Build now** |
| **Ingestion pipeline** | Connect/upload → parse → chunk → embed → store, with incremental updates. | **Build now** |
| **Retrieval** | Semantic search over the knowledge layer, shared by every agent. | **Build now** |
| **Agent layer** | N agents on top of the knowledge layer. Existing: LinkedIn, Reddit, X. | Exists; to be wired to the knowledge layer |
| **Multiplayer** | Any human can join any agent's work and continue from where it stopped. | Design toward it; full multi-tenancy later |

## 3\. Core idea: Honne AI onboards like a company onboards a human

**Analogy.** When a company onboards a new hire, it first brings them onto its track and mindset through knowledge transfer (KT): what the company is, how it works, what projects are running. Only then does the hire work effectively alongside the team.

**Honne AI does the same for itself.** When a user or company signs up, Honne AI first learns them, then works for them:

1. Takes in their material (starting with Google Docs): policies, project docs, brand voice.  
2. Understands their **brand voice** and their **workflow**.  
3. **Personalises** to them, so every agent on top works in their voice and within their guardrails.

**Status:** this is the guiding idea only. The system design for onboarding and personalisation comes later, after the knowledge layer and ingestion pipeline exist. It is not prototype scope yet.

## 4\. Prototype scope

### In scope

| \# | Requirement |
| :---- | :---- |
| 1 | **Google Docs only** as the first connector. Notion, GitHub, Drive files, Word, and uploads come after the pipeline is proven. |
| 2 | **Unified knowledge store in pgvector** (Supabase Postgres). |
| 3 | **Ingestion pipeline** with **incremental RAG**: unchanged content is not re-chunked or re-embedded; only new or changed content is processed. |
| 4 | **Semantic search** over the unified store, exposed as one retrieval interface that any agent can use. |
| 5 | Existing LinkedIn, Reddit and X agents can read from the knowledge layer. Adding a new agent must not require changes to the knowledge layer or the UI shell. |
| 6 | Scoping by **`user_id`**; no RLS and no multi-tenancy in the prototype. |

### Out of scope (for now)

- Multi-tenancy, RLS, org/team permission models (after the prototype is tested).  
- Production hardening: autoscaling, SLAs, full HA.  
- New content agents (angle generator, series generator, etc.). Any agent can be built once the knowledge layer and ingestion pipeline exist.  
- Supervisor/worker graph (CLAUDE.md Step 3\) stays untouched.  
- Connectors other than Google Docs.

## 5\. Quality bar

Prototype-level scope, **not** prototype-level code.

| Area | Requirement |
| :---- | :---- |
| Design | SOLID principles and explicit design patterns; data classes separate from operation classes. |
| Extensibility | Adding a connector or an agent is an addition, not a modification (open/closed). |
| Failure | No hidden fallbacks. Every failure path is visible and logged (see guardrails.md). |
| Observability | Structured, traceable logs; a failure in production must be diagnosable from the logs alone. |
| Efficiency | Time/space complexity known per operation; cost per ingestion and per query estimated before building. |
| Testing | Unit tests with fakes; integration tests against real Postgres; see CLAUDE.md §2. |

## 6\. Success criteria (proposed; confirm or edit)

- A Google Doc ingested once is searchable semantically from any agent.  
- Re-ingesting an unchanged doc makes **zero** embedding calls; editing one section re-embeds only the affected chunks.  
- A new agent can be added with no change to the ingestion or retrieval code.  
- Every ingestion and retrieval failure leaves a log trail that identifies what failed, where, and for which user and document.

## 7\. Open questions

| \# | Question |
| :---- | :---- |
| 1 | **Multiplayer handoff without multi-tenancy:** "any person can drop into any agent" implies shared threads, but `user_id` scoping means one owner per thread. For the prototype, is handoff simulated (e.g. transferring a thread) or deferred? |
| 2 | **Incremental detection for Google Docs:** change detection by content hash, by Drive revision/modified time, or both? |
| 3 | **Deletions:** when a source doc is deleted or a section removed, are its chunks removed too? |
| 4 | **Knowledge-layer schema:** CLAUDE.md says `knowledge_sources` is not designed yet and must not be created until designed there. Design goes through the LLD process first. |

