# **Day 7 — Knowledge Tools \+ Agent Wiring**

> Task brief for Claude Code. Read `CLAUDE.md`, `project_requirements.md` and `guardrails.md` first. **The knowledge store (Day 5 Part A), Drive ingestion (Part B) and the 5-min poller (Day 6\) are built.** Do not redesign them. This build adds **four read-only knowledge tools** and wires them into the existing **LinkedIn, Reddit and X** agents. **Not in this build:** UI for sources/citations, MMR, tags, folder hierarchy, MCP server, supervisor graph (Step 3).  
>   
> Items marked **Owner's call** need a decision before coding (guardrails §1: suggestions, not decisions).

---

## **0\. What already exists — reference only**

Read the real code before starting. If anything here differs, **the code wins**: report the difference.

| Piece | Where | What this build relies on |
| :---- | :---- | :---- |
| `KnowledgeRepository.search(db, user_id, query_vector, k, source_ids)` → `list[ChunkHit]` | `backend/knowledge/repository.py` | Per-user cosine search; `k ≤ MAX_SEARCH_K` (50); skips paused sources and other embedding-model tags; `search_mode` keeps filtered HNSW complete |
| `KnowledgeRepository.list_documents(db, user_id)` | same | Used by the knowledge page. **Keep it unchanged**; the tools get their own paged method |
| `KnowledgeStore` Protocol, `Embedder` Protocol | `repository.py`, `embedder.py` | Depend on these, not the concrete classes |
| `GeminiEmbedder.embed_query(text)` | `backend/knowledge/embedder.py` | Query-side embedding (`query_input`) |
| `SessionLocal` | `backend/core/database.py` | Sync SQLAlchemy sessions |
| Chunk text | `knowledge_chunks.content` | Each chunk **repeats its `$title:` \+ heading prefix**. The full document text is **not stored** anywhere (matters for `read_document`, D7-D1) |
| `MAX_DOCUMENT_CHARS` | `config.py` | 750,000 chars, so a document can be far larger than one context window |
| LinkedIn agent | `independent_agents/linkedin.py` | Single-node graph \+ `AsyncPostgresSaver`; one `with_structured_output(LinkedInPost)` call; `state["user_id"]` is already there "for Step 2" |
| Reddit / X agents | `reddit.py`, `x.py` | Stateless, one `with_structured_output(...)` call each; X runs `check_lengths` after |
| `SystemPromptBuilder` | `prompts/builder.py` | Has an unused `knowledge` slot (meant for pre-injected text) |
| `LEASE` | `limits.py` | Derived from `GEMINI_ATTEMPTS × GEMINI_TIMEOUT_S`, assuming **one** LLM call per turn. Tool calling breaks that assumption (D7-D6) |

---

## **1\. Goal**

Agents look things up in the user's knowledge layer themselves, the way Dust's agents do: **the model decides when to search, find, list or read; the server decides whose data.** One shared toolset, so any future agent gets knowledge access by calling one factory, with no change to the knowledge layer.

sequenceDiagram

  participant R as Route

  participant A as Agent (LinkedIn/Reddit/X)

  participant L as ToolCallingRunner

  participant G as Gemini

  participant T as Knowledge tools

  participant S as KnowledgeRetrievalService

  R-\>\>A: user message \+ user\_id

  A-\>\>L: run(prompt, messages, tools(ctx), SubmitSchema)

  loop until submit\_post, max MAX\_TOOL\_ROUNDS

    L-\>\>G: messages \+ tool declarations (tool\_choice=any)

    G--\>\>L: tool call(s)

    L-\>\>T: search\_knowledge / find / list / read

    T-\>\>S: user\_id from ctx, never from the model

    S--\>\>T: records

    T--\>\>L: JSON result (or error result)

  end

  G--\>\>L: submit\_post(args)

  L--\>\>A: output \+ sources \+ call trace

  A--\>\>R: draft (only the final message goes to the checkpoint)

---

## **2\. The four tools**

| Honne tool | Dust equivalent | Answers | Model-visible inputs | Returns (JSON) |
| :---- | :---- | :---- | :---- | :---- |
| `search_knowledge` | `search/semantic_search` | "What text is about X?" | `query` | Top-K chunks grouped by document: `document_id, title, url, chunks[{heading, text}]` |
| `find_documents` | `data_sources_file_system/find` | "Which doc is called X?" | `title_query`, `limit?` | `[{document_id, title, source, modified_at, url}]` |
| `list_documents` | `data_sources_file_system/list` | "What docs exist / what's new?" | `sort_by? (title|modified)`, `limit?`, `cursor?` | Same items \+ `next_cursor` |
| `read_document` | `data_sources_file_system/cat` | "Give me the whole doc." | `document_id`, `offset?`, `limit?` | `{document_id, title, url, text, offset, total_chars, next_offset}` |

- **Why `find`:** the user names a doc ("turn my *Q3 Launch Plan* into a post"). Search by meaning returns chunks from every doc that mentions launches; `find` matches the title and returns that one doc's id, which `read_document` then opens.  
- **Typical chains:** `find → read` · `list(sort=modified) → read` · `search` alone.  
- **Scoping rule (Dust's `hideInternalConfiguration` / `augmentInputsWithConfiguration`):** `user_id` is **never** a tool argument. It is bound server-side through `ToolContext`, so no prompt can make a tool read another user's data.

---

## **3\. Scope**

| In | Out |
| :---- | :---- |
| `KnowledgeRetrievalService` (framework-agnostic) | Showing sources/citations in the UI |
| 3 repository methods \+ body write (D7-D1) | MMR, time-frame filter, per-document search scoping, `grep` on read |
| LangChain tool adapter \+ shared `ToolCallingRunner` | Tags, folder hierarchy, `locate_in_tree` |
| Wiring into LinkedIn, Reddit, X | MCP server, supervisor graph (Step 3\) |
| Prompt guidance section, lease formula, settings | New connectors, ingestion changes beyond D7-D1 |
| Migration `0028` (`body` column, D7-D1) | Reddit/X thread memory |
| Tests T1–T16 |  |

---

## **4\. Decisions**

| \# | Decision | Choice |
| :---- | :---- | :---- |
| D7-D1 | **Where `read_document` gets full text** (not stored today). **Decided: B** | Migration `0028`: nullable `knowledge_documents.body TEXT` holding the whole normalized document in one piece, written by `apply_document_version` in the same transaction as `content_hash`, so text and hash always describe the same version. Never embedded: chunks \+ vectors stay the search path, `body` is only for reading. Backfill needs two small changes, because `SyncService` skips the **download** of a file whose `modifiedTime` is unchanged (`sync.py` L184‑191) before the pipeline ever sees it: (1) that skip also requires `body IS NOT NULL`; (2) the pipeline's hash-unchanged path writes `body` when it is NULL. Each old doc is downloaded once more, with **zero** embedding calls. Until then `read_document` returns `text_unavailable`. *Rejected:* A, rebuild from chunks by stripping prefixes (fragile, tied to the splitter's rendering); C, fetch live from Drive (slow, may not match what was indexed); storing un-prefixed chunk text (no duplication, but changes the stored chunk format and needs a re-sync) |
| D7-D2 | **Checkpoint hygiene** | The tool loop runs **inside** the agent call on a local message list. Only the final `AIMessage` enters `LinkedInState` and the checkpoint, so 15-turn threads don't fill with `read_document` output. A compact `sources` list (`document_id, title, url`) rides in `additional_kwargs`, like `note` |
| D7-D3 | **How the final answer comes out** | A `submit_post` tool built from each agent's existing output schema (`LinkedInPost`, `RedditPostResponse`, `XPostResponse`), bound with the knowledge tools, `tool_choice="any"` on every round. The loop ends when `submit_post` is called. This replaces `with_structured_output`, which can't be combined with tool calling in one call |
| D7-D4 | **Round cap reached.** **Owner's call** | `MAX_TOOL_ROUNDS = 4` knowledge-tool rounds. When hit: **(a)** raise `ToolLoopExhaustedError` → 502 (fail loud, guardrails default) or **(b)** one last call with **only** `submit_post` bound, logged at WARNING (`agent.tool_loop forced_submit=true`). (b) is a fallback, so it needs approval here; recommended because the user still gets a post |
| D7-D5 | **Tool errors** | *Expected* (document not found or not owned, offset past the end, blank query, `text_unavailable`) → returned to the model as `{"error": code, "message": …}` and logged at WARNING with the code, so the model can recover. *Infrastructure* (DB error, embedding failure after its retries) → raised; the turn fails 502/504 as today. No bare `except` |
| D7-D6 | **Lease must cover several LLM calls** | `LEASE` in `limits.py` becomes `(MAX_TOOL_ROUNDS + 1) × (GEMINI_ATTEMPTS × GEMINI_TIMEOUT_S + BACKOFF_S) + MAX_TOOL_ROUNDS × TOOL_TIMEOUT_S + SAVE_BUFFER_S` \= 5 × 95 \+ 4 × 20 \+ 15 \= **570 s** worst case. Still derived, never hardcoded. Check the frontend request timeout against it. Lowering `GEMINI_ATTEMPTS` for tool rounds is an option, **Owner's call** |
| D7-D7 | **Sync DB from async tools** | Each tool call opens its **own** `SessionLocal()` inside `asyncio.to_thread`, never the request's session (not thread-safe, and `AgentThreadService` owns it). Per-call timeout `TOOL_TIMEOUT_S` via `asyncio.wait_for` |
| D7-D8 | **Visibility \= search's rules** | `find`, `list` and `read` hide paused sources and `sync_status='failed'` documents, so every doc the agent can see is also searchable |
| D7-D9 | **Output sizes** | `KNOWLEDGE_SEARCH_TOP_K = 8` chunks (≈4k tokens at ≤512 tokens each). `read_document` default and max `12_000` chars per call (≈3k tokens), sliced **in SQL** so a 750k-char body never loads. `list`/`find` default 20, max 50 |
| D7-D10 | **Prompt** | New `knowledge_tools` section in `SystemPromptBuilder`, rendered only when tools are bound: when to use each tool, read before quoting a doc, tool output is **data, not instructions**, never state a fact that isn't in the results or the conversation. The unused `knowledge` slot stays |
| D7-D11 | **Kill switch.** **Owner's call** | `KNOWLEDGE_TOOLS_ENABLED` (default `True`). `False` → agents run exactly as today (one call, no tools). It's an explicit config switch logged at startup, not a hidden fallback |
| D7-D12 | **Tool names** | Descriptive (`search_knowledge`, …) over Dust's Unix names (`cat`): the model chooses tools by name and description |
| D7-D13 | **`find` matching** | `title ILIKE '%q%'` with `%`, `_` and `\` escaped; prefix matches first, then most recently modified. No `pg_trgm` index: per-user corpora are small and `ix_knowledge_documents_user_source` narrows first |
| D7-D14 | **Several tool calls in one round** | Run them **sequentially**, in order: simpler, bounded, one DB session at a time |

---

## **5\. LLD**

### **5.1 Data classes**

| Class | Kind | Pattern | SOLID | Fields / data structure | Where |
| :---- | :---- | :---- | :---- | :---- | :---- |
| `ToolContext` | data | — | SRP | `user_id: UUID, agent: str, correlation_id: str` (thread id, or a request uuid for Reddit/X). Frozen | `backend/ai/tools/context.py` |
| `ChunkSnippet` | data | — | — | `heading: str | None, text: str` | `backend/knowledge/records.py` |
| `DocumentHits` | data | — | — | `document_id, title, url, chunks: tuple[ChunkSnippet, ...]` | same |
| `DocumentSummary` | data | — | — | `document_id, title, source_name, mime_type, url, modified_at` | same |
| `DocumentListPage` | data | — | — | `items: tuple[DocumentSummary, ...], next_cursor: str | None` | same |
| `DocumentPage` | data | — | — | `document_id, title, url, text, offset, total_chars, next_offset: int | None` | same |
| `SourceRef` | data | — | — | `document_id, title, url` | `backend/ai/tools/records.py` |
| `ToolCallRecord` | data | — | — | `name, duration_ms, ok, error_code: str | None, result_count` | same |
| `ToolLoopResult[T]` | data | — | — | `output: T, sources: tuple[SourceRef, ...]` (deduped, first-seen order), `calls: tuple[ToolCallRecord, ...]`, `rounds, forced_submit` | same |
| `KnowledgeToolError` (+ `DocumentNotFoundError`, `DocumentTextUnavailableError`, `InvalidToolInputError`) | data | — | — | `code: str, message: str` | `backend/knowledge/errors.py` |

### **5.2 Operation classes**

| Class | Pattern | SOLID | Data structure | Where |
| :---- | :---- | :---- | :---- | :---- |
| `KnowledgeRetrievalService` | Facade over `KnowledgeStore` \+ `Embedder` | SRP (retrieval only); DIP (depends on both Protocols; no LangChain import, so a later MCP server reuses it) | Grouping hits by document: `dict[UUID, list]`, insertion order keeps rank order, O(k) | `backend/knowledge/retrieval.py` |
| `KnowledgeRepository` (+3 methods) | Repository (existing) | Every method takes `user_id` and filters on it | — | `repository.py` |
| `build_knowledge_tools(ctx, service)` | Adapter (service → LangChain `StructuredTool`) \+ Factory | ISP (the model sees four narrow tools); OCP (a new agent calls the factory, nothing changes) | Pydantic arg schemas; `ctx` bound by closure | `backend/ai/tools/knowledge_tools.py` |
| `ToolCallingRunner` | Strategy for tools and output schema, injected per agent | OCP, SRP (loop mechanics only, no prompts) | Local `list[AnyMessage]`; `dict[str, BaseTool]` for O(1) dispatch | `backend/ai/tools/tool_loop.py` |
| `SystemPromptBuilder` (+ section) | existing | OCP: a new section, specs untouched | — | `prompts/builder.py` |

\# backend/knowledge/retrieval.py

class KnowledgeRetrievalService:

    def \_\_init\_\_(self, store: KnowledgeStore, embedder: Embedder, session\_factory: Callable\[\[\], Session\]): ...

    async def search(self, user\_id: UUID, query: str) \-\> list\[DocumentHits\]: ...

    async def find(self, user\_id: UUID, title\_query: str, limit: int) \-\> list\[DocumentSummary\]: ...

    async def list(self, user\_id: UUID, sort\_by: Literal\["title", "modified"\], limit: int, cursor: str | None) \-\> DocumentListPage: ...

    async def read(self, user\_id: UUID, document\_id: UUID, offset: int, limit: int) \-\> DocumentPage: ...

\# backend/ai/tools/knowledge\_tools.py

def build\_knowledge\_tools(ctx: ToolContext, service: KnowledgeRetrievalService) \-\> list\[StructuredTool\]: ...

\# backend/ai/tools/tool\_loop.py

class ToolCallingRunner:

    async def run(self, llm: BaseChatModel, messages: list\[AnyMessage\], tools: list\[BaseTool\],

                  output\_schema: type\[T\], ctx: ToolContext) \-\> ToolLoopResult\[T\]: ...

### **5.3 Repository additions (all scoped by `user_id`)**

\-- find\_documents\_by\_title(user\_id, pattern, prefix, limit)

SELECT d.id, d.title, s.display\_name, d.mime\_type, d.source\_url, d.source\_modified\_at

  FROM knowledge\_documents d

  JOIN knowledge\_sources s ON s.id \= d.source\_id AND s.user\_id \= d.user\_id

 WHERE d.user\_id \= :user\_id AND s.status \<\> 'paused' AND d.sync\_status \= 'synced'

   AND d.title ILIKE :pattern ESCAPE '\\'

 ORDER BY (d.title ILIKE :prefix ESCAPE '\\') DESC, d.source\_modified\_at DESC NULLS LAST, d.id

 LIMIT :limit;

\-- list\_documents\_page(user\_id, sort\_by, limit, offset): same SELECT/JOIN/WHERE without the title filter,

\-- ORDER BY d.title, d.id  |  d.source\_modified\_at DESC NULLS LAST, d.id

\-- LIMIT :limit \+ 1 OFFSET :offset   (the extra row tells whether next\_cursor exists)

\-- get\_document\_text(user\_id, document\_id, offset, limit)   \[D7-D1\]

SELECT d.title, d.source\_url, substr(d.body, :offset \+ 1, :limit) AS text, char\_length(d.body) AS total\_chars

  FROM knowledge\_documents d JOIN knowledge\_sources s ON s.id \= d.source\_id AND s.user\_id \= d.user\_id

 WHERE d.id \= :document\_id AND d.user\_id \= :user\_id AND s.status \<\> 'paused' AND d.sync\_status \= 'synced';

\-- no row → DocumentNotFoundError; body NULL → DocumentTextUnavailableError

### **5.4 Tool loop (`ToolCallingRunner.run`)**

1. `bound = llm.bind_tools([*tools, submit_post], tool_choice="any")`.  
2. For each round up to `MAX_TOOL_ROUNDS`: invoke; if the response calls `submit_post`, validate its args against `output_schema` and return. Otherwise run each tool call **in order** (D7-D14) under `wait_for(TOOL_TIMEOUT_S)`, append the `AIMessage` and one `ToolMessage` per call, record a `ToolCallRecord`, and collect `SourceRef`s from the results.  
3. Cap reached → D7-D4 path.  
4. Invalid `submit_post` args → raise `InvalidModelOutputError` (logged; turn fails 502). No retry unless approved.

### **5.5 Wiring per agent**

| Agent | Change |
| :---- | :---- |
| LinkedIn | In `generate`: build `ToolContext(user_id=state["user_id"], agent="linkedin", correlation_id=thread_id)`, run the runner, return **one** `AIMessage(content=post.content, additional_kwargs={"note": …, "sources": […]})` (D7-D2) |
| Reddit | `RedditAgent.run`: same runner, `correlation_id = uuid4()`; returns `RedditPostResponse` |
| X | `XAgent.run`: same runner; `check_lengths` still runs on the result |
| Route responses | Add optional `sources: list[SourceRef] = []` to `LinkedInChatResponse`, `RedditPostResponse`, `XPostResponse`. Additive; the UI ignores it until a later build |

### **5.6 Logging (guardrails §4)**

| Event | Fields |
| :---- | :---- |
| `knowledge.tool` (per call) | `tool, user_id, agent, correlation_id, duration_ms, result_count, error_code`. `query_chars` only, never query or document text |
| `agent.tool_loop` (per turn) | `agent, user_id, correlation_id, rounds, calls, tools_used, forced_submit, sources_count` |
| Startup | `knowledge_tools_enabled=…` |

---

## **6\. Cost and complexity**

D \= the user's documents, C \= chunks, K \= top-k, L \= read limit, R \= rounds.

| Operation | Time | Space | External calls | Est. cost |
| :---- | :---- | :---- | :---- | :---- |
| `search_knowledge` | HNSW ≈ O(log C) \+ O(K) grouping | O(K) chunks | 1 embedding call | Fractions of a cent; ≈4k tokens into the next LLM round |
| `find_documents` | O(D) ILIKE scan within the user's rows | O(limit) | none | 1 indexed query |
| `list_documents` | O(D log D) sort, bounded by LIMIT | O(limit) | none | 1 query |
| `read_document` | O(L) (`substr` in SQL) | O(L) | none | ≤ 12k chars ≈ 3k tokens into the next round |
| One agent turn | R \+ 1 LLM calls (was 1\) | Local messages grow with each result | ≤ 5 Gemini calls | **Main cost increase:** input tokens accumulate across rounds, roughly quadratic in R. Typical turn 2–3 calls, ≈10–20k input tokens |
| Storage (`body`, D7-D1) | — | \+1× normalized text per doc (TOAST-compressed) | — | Bounded by `MAX_DOCUMENT_CHARS` |

Efficiency risks: the model re-reading the same doc page by page (bounded by the round cap); re-searching every turn because tool results aren't kept in memory (accepted for D7-D2; `sources` give continuity).

---

## **7\. Files**

| File | Change |
| :---- | :---- |
| `backend/knowledge/retrieval.py` | New: `KnowledgeRetrievalService` |
| `backend/knowledge/records.py` | \+ `ChunkSnippet`, `DocumentHits`, `DocumentSummary`, `DocumentListPage`, `DocumentPage` |
| `backend/knowledge/errors.py` | \+ `KnowledgeToolError` family |
| `backend/knowledge/repository.py` | \+ `find_documents_by_title`, `list_documents_page`, `get_document_text`; `apply_document_version` writes `body` |
| `backend/knowledge/pipeline.py` | Write `body` when hash unchanged but `body IS NULL` (no embedding) |
| `backend/knowledge/sync.py` | The unchanged-`modifiedTime` skip also requires `body IS NOT NULL` (`DocumentRecord` gains `has_body`) |
| `backend/knowledge/models.py` \+ `backend/alembic/versions/0028_add_document_body.py` | \+ `body` column (nullable `TEXT`) |
| `backend/ai/tools/{__init__,context,records,knowledge_tools,tool_loop}.py` | New |
| `backend/ai/independent_agents/linkedin.py`, `reddit.py`, `x.py` | Use the runner (5.5) |
| `backend/ai/independent_agents/schemas.py` | \+ optional `sources` |
| `backend/ai/independent_agents/limits.py` | Lease formula (D7-D6), `MAX_TOOL_ROUNDS`, `TOOL_TIMEOUT_S` |
| `backend/ai/independent_agents/prompts/builder.py` | \+ `knowledge_tools` section (D7-D10) |
| `backend/core/config.py` | `KNOWLEDGE_TOOLS_ENABLED`, `KNOWLEDGE_SEARCH_TOP_K`, `KNOWLEDGE_READ_MAX_CHARS`, `KNOWLEDGE_LIST_MAX` |
| `tests/fakes.py` | Scripted fake chat model that supports `bind_tools` and returns queued tool calls |
| `tests/smoke/fake_upstream.py` | Answer Gemini with a scripted function call, then `submit_post` |
| `CLAUDE.md` | Knowledge section: tools \+ runner in 2–3 lines; agents are no longer "no tools" |

---

## **8\. Tests (CI only, colocated where possible)**

No test calls Google or Gemini. Integration tests use the `db` fixture.

| \# | Type | Test | Proves |
| :---- | :---- | :---- | :---- |
| T1 | Integration | Two users with similar docs → `search` returns only the caller's chunks | Scoping |
| T2 | Integration | `find`: partial, case-insensitive; `%` and `_` in the query matched literally; prefix match ranked first | Matching \+ escaping |
| T3 | Integration | Paused source and failed doc → absent from `find`, `list` and `read` | Visibility \= search (D7-D8) |
| T4 | Integration | `list` with 25 docs, limit 10 → 3 pages, no duplicates; both sort orders | Pagination |
| T5 | Integration | `read`: offset/limit slice, `total_chars`, `next_offset=None` at the end; offset past the end → `InvalidToolInputError` | Paging |
| T6 | Integration | `read` another user's document id → `DocumentNotFoundError` | Scoping |
| T7 | Integration | Doc ingested before `0028` (body NULL), unchanged in Drive → next sync downloads it once and fills `body` with **0** embedding calls (`FakeEmbedder`); the sync after that skips the download again | Backfill (D7-D1) |
| T8 | Unit | Tool JSON schemas contain no `user_id` or source field | Server-side scoping |
| T9 | Unit | Scripted model: `search_knowledge` → `submit_post` → output returned, sources deduped, 1 `ToolCallRecord` | Loop happy path |
| T10 | Unit | Model never submits → D7-D4 behaviour (error, or forced submit \+ WARNING) | Round cap |
| T11 | Unit | Tool raises `DocumentNotFoundError` → model gets an error result and WARNING is logged; DB error → raised | Error split (D7-D5) |
| T12 | Integration | LinkedIn turn with 2 tool calls → checkpoint holds only Human \+ final AI; `sources` in `additional_kwargs` | Hygiene (D7-D2) |
| T13 | Unit | `KNOWLEDGE_TOOLS_ENABLED=False` → one LLM call, no tools bound | Kill switch |
| T14 | Unit | Builder renders `knowledge_tools` only when tools are bound; existing prompt tests unchanged | Prompt |
| T15 | Unit | `LEASE` equals the D7-D6 formula and exceeds a simulated worst-case turn | Lease |
| T16 | Smoke | Fake Gemini scripts `search_knowledge` on a seeded doc then `submit_post`; contract test pins that the request carries function declarations and `tool_choice=any` | End to end |

---

## **9\. Second-brain check**

| \# | Edge case | Handling |
| :---- | :---- | :---- |
| CE1 | User hasn't connected Drive | Tools return empty results with `hint: "no_sources"`; the prompt tells the agent to write without them and mention connecting a source in `note` |
| CE2 | Prompt injection inside a document | Results framed as data (D7-D10); tools are read-only, so the worst case is a bad draft, never a write |
| CE3 | Doc deleted or excluded between `search` and `read` | `read` returns `not_found`; the model recovers |
| CE4 | Sync runs during a turn | Each tool call sees the latest committed state; acceptable |
| CE5 | Embedding model tag changes | `search` returns nothing until re-embedded while `find`/`list` still show docs; log it, accept for the prototype |
| CE6 | Next turn needs the same doc | Tool results aren't in memory (D7-D2), so the agent searches again; `sources` keep continuity. Option: append "sources used so far" to the request copy, like `_with_notes` |
| CE7 | Gemini \+ `tool_choice="any"` \+ `thinking_level="low"` | Verify in T16 and on the first `prod_check.py` run after deploy |
| CE8 | Worst-case turn ≈ 9.5 min | Lease covers it (D7-D6); check the frontend request timeout |
| CE9 | Reddit/X revisions | Still pass the draft in `extra_context`; the tools work the same |

---

# **Done when**

- [x] D7-D1 settled: `body` column (B)  
- [ ] Owner's calls settled: D7-D4, D7-D6 (attempts), D7-D11  
- [ ] T1–T16 pass in CI; results table in the job summary  
- [ ] Existing knowledge, agent and smoke tests still pass  
- [ ] Scoped lint clean (`backend/ai`, `backend/knowledge`)  
- [ ] On production: with a synced Drive doc, ask the LinkedIn agent for a post about it **by title** → logs show `find_documents → read_document → submit_post`, and the draft uses facts from that doc

---

# **Next (not today)**

| Step | What |
| :---- | :---- |
| UI | Show `sources` under each draft |
| Retrieval quality | MMR, time-frame filter, `document_ids` scoping on search, `grep` on read |
| MCP | Expose `KnowledgeRetrievalService` as an MCP server (Dust's model) |
| Step 3 | Supervisor graph reuses `build_knowledge_tools` and `ToolCallingRunner` |


---

# **As built: where the code departs from this brief**

Recorded for later reference. The code is the source of truth; these are the places it differs from §0–§9 above, and why.

| # | Brief said | Built | Why |
|---|---|---|---|
| AB1 | D7-D8: `find`/`list`/`read` hide paused sources **and** `sync_status='failed'` documents | Only **paused sources** are hidden. Failed documents stay visible | `mark_failed` keeps a failed doc's last good chunks searchable, and its `body` matches them. Hiding it would let `search` return a passage that `read_document` then reports as `not_found`. Visibility now really equals search's rule (T3 tests this) |
| AB2 | D7-D6 lease counts `MAX_TOOL_ROUNDS × TOOL_TIMEOUT_S` | New `MAX_TOOL_CALLS = 4` per turn (`limits.py`); lease = `(MAX_TOOL_ROUNDS+1) × 95 + MAX_TOOL_CALLS × 20 + 15` = **570 s** | A model can ask for several tools in one round, so rounds don't bound tool time. Calls over the cap get a `call_limit` error result (WARNING), which tells the model to call `submit_post` |
| AB3 | Runner collects `SourceRef`s from the results | Every tool returns `(json, ToolOutcome)` via LangChain `content_and_artifact`; `ToolOutcome = sources, result_count, error_code` (`backend/ai/tools/records.py`) | Keeps `ToolCallingRunner` free of knowledge code: it never parses tool JSON or imports `KnowledgeToolError`, so Step 3 reuses it as is |
| AB4 | Agents get `ToolContext` + tools + runner | One `KnowledgeAccess(service, runner)` facade (`backend/ai/tools/access.py`), built in `main.py`'s lifespan. **`None` = kill switch off** | One object to inject; the kill switch is a `None` check, not a second config read in each agent |
| AB5 | Service clamps limits to settings | Out-of-range `limit`/`offset` raise `InvalidToolInputError` (`invalid_input`) | Guardrails §3: no quiet substitution. The tool arg schemas already bound what the model can send |
| AB6 | `ToolCallRecord` and `knowledge.tool` log `duration_ms` | No per-call timing | Standing preference: no runtime metrics on the request hot path |
| AB7 | Add `sources` to `RedditPostResponse` / `XPostResponse` | Those classes stay the **model's** schema (`submit_post` args). Routes return `RedditDraftResponse` / `XDraftResponse` subclasses that add `sources` | Otherwise `submit_post` would declare `sources` and the model would invent them. `test_g1_submit_post_schema_has_no_sources_field` pins this |
| AB8 | `GeminiEmbedder` used as is | Ctor takes `attempts` / `timeout`. The query embedder uses `KNOWLEDGE_QUERY_EMBED_ATTEMPTS=1`, `KNOWLEDGE_QUERY_EMBED_TIMEOUT_S=8` | Ingestion's worst case (≈210 s) was far over `TOOL_TIMEOUT_S` (20 s) |
| AB9 | `wait_for` bounds a tool call | Each tool session also sets `statement_timeout = TOOL_TIMEOUT_S` | `wait_for` on `to_thread` doesn't stop the SQL; Postgres now does |
| AB10 | Reddit/X LLMs unchanged | Pass `base_url=GEMINI_BASE_URL`, as LinkedIn does | Otherwise smoke tests can't fake them |
| AB11 | `body` = "whole normalized document" | `body = normalize(doc.text)` **without** the `$title:` prefix; `apply_document_version(..., *, body)` is required. `_touch_metadata` also requires `has_body` before skipping | The title has its own column. Without the `has_body` check the hash-unchanged path would never backfill (T7) |
| AB12 | — | A reply that calls no tool, or a forced round with no `submit_post`, raises `ToolLoopInvalidOutputError` (502). If one reply calls `submit_post` and other tools, the submission wins | Fail loud (guardrails §3) |

**Test-suite changes:** `tests/integration/linkedin/test_router_db.py` turns the kill switch off (it tests thread storage; T12 covers the tool path). Fake Gemini (`tests/smoke/fake_upstream.py`) answers with a `submit_post` function call whenever the request declares tools, and `reply_call()` scripts a tool call. The smoke contract test pins the tool-calling request; a second test pins the structured request under the kill switch.

**Still open:** the production check in "Done when" (after deploy, ask the LinkedIn agent about a synced doc by title and look for `find_documents → read_document` in the `knowledge.tool` logs). The frontend has no request timeout, so a worst-case turn waits up to the 570 s lease.
