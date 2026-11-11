# Organizational multiplayer demo

The implementation adds company workspaces to the existing Honne AI FastAPI/React application. The authenticated route is `/demo`; the Home sidebar's Agents item opens it. Existing personal knowledge, personal custom-agent endpoints and LinkedIn/Reddit/X studio routes remain separate.

## Implemented behavior

- UUID company identity, workspace selection, membership, `admin`/`member` roles, and admin addition of an employee who has already signed in to Honne.
- Explicit sharing of selected indexed documents or an entire source, including future synchronized documents. Admins can update or revoke a sharing grant and synchronize shared sources through the existing Google Drive pipeline.
- Configurable company agents: name, handle, description, responsibility, instructions, guardrails, model, specialist role, selected sources/documents, enabled read-only tools, immutable configuration versions, and archive. The builder can run an unsaved configuration against actual permitted knowledge.
- Shared conversations, ordered persistent messages, employee and agent attribution, immutable version references, `@handle` routing, continuation by stable agent ID after a rename, bounded context, source references, failed-turn retry, and concurrent-turn protection.
- A real, checkpointed LangGraph launch workflow: resolve the configured specialists, run Product, validate structured fact references, hand permitted facts to Marketing and Support, run each specialist with its own read-only knowledge tools, aggregate deliverables and missing/contradictory information, and interrupt for human review.
- Approve, reject or request changes with feedback. A revision uses the original brief, previous relevant deliverables, source information and pinned agent versions. Up to three revision cycles are allowed. A new run uses the current agent versions and indexed knowledge.
- Persisted execution steps, actual tool names/results, agent identities/versions, durations, available token usage, error codes, source references and reviewer identity. The UI polls these records; it contains no fabricated execution or example deliverables presented as results.

## Adaptation from Honne-Careers

The read-only reference was the local checkout at `F:/proect_Honne_careers`, whose origin is `Akashkarthik612/Honne-Careers`.

| Reference pattern | Adaptation here |
| --- | --- |
| `domain/chat_agents.py`, `agents/chat/catalog.py` | Configuration-driven specialists; stable agent IDs; immutable version snapshots; handles route within a workspace. |
| `services/custom_agents.py` | Admin builder, optimistic version check, archive, and unsaved preview through the real runner. |
| `services/chats.py`, `agents/chat/prompt.py` | Short transactions; user/assistant rows; attributed prior context; labelled answers from other agents; continuation by identity; stale/failed-turn handling. |
| `agents/chat/runner.py`, `agents/chat/tools.py` | One reusable runner and backend-bound permission scopes. Honne AI's `CustomAgentRunner`, `KnowledgeAccess`, `KnowledgeRetrievalService` and existing tool loop are extended rather than replaced. |
| `agents/chat/graph.py`, `agents/chat/state_store.py` | Bounded execution and durable state. The new coordinator uses the target application's existing official `AsyncPostgresSaver` pool, a separate `workspace-workflow:<UUID>` thread namespace and a genuine LangGraph review interrupt. |
| `agents/recorder.py`, `agents/tracing.py` | Metadata-only execution records in short transactions; automatic prompt/tool-result tracing disabled around workspace model/graph execution; sanitized error codes. |
| `AgentBuilderPage.jsx`, `TryItDrawer.jsx` | Editable configuration, actual preview, source selection and version-aware saves, adapted to the existing Honne AI styling. |

Honne-Careers was not modified. Its application framework, personal career data tools, quota system and database schema were not copied into this application.

## Data ownership and migration

New migration: `backend/alembic/versions/0030_organizational_multiplayer.py`, following the existing uncommitted `0029_add_agent_configurations.py`.

Migration 0030 creates:

1. `workspaces`
2. `workspace_members`
3. `workspace_knowledge_sources`
4. `agent_configuration_versions`
5. `workspace_conversations`
6. `workspace_chat_messages`
7. `workspace_workflow_runs`
8. `workspace_workflow_steps`
9. `workspace_workflow_reviews`

It extends `agent_configurations` with workspace ownership, descriptive fields, specialty, permission selections and a version counter. Personal agents retain `user_id`; workspace agents use `workspace_id` as owner and record their creator on version rows. `user_id` becomes nullable, with a check requiring an owner. Existing personal rows are not reassigned. Active handles are unique within the personal owner or company workspace, as appropriate.

The knowledge source/document/chunk tables and their composite ownership foreign keys remain unchanged. A separate sharing row references the original `(source_id, user_id)` pair. `document_ids = NULL` explicitly shares the whole source; a JSON array shares only those documents; an empty array grants no document access.

Every workspace retrieval query intersects current employee membership, the version's configured source/document selection, actual sharing and source visibility. The model receives no employee/workspace/source-scope parameters. Individual document reads apply the same predicate as search/list/find. Handoffs and history are filtered to the receiving agent's permitted documents, and chat context retains inherited source provenance.

New tables enable PostgreSQL RLS without direct-browser policies. Run migrations with the backend database role/table owner, or use an appropriately configured backend role with BYPASSRLS. Browser requests go through FastAPI and Supabase JWT authentication, not direct access to these tables. Workspace management authorization is enforced in the backend.

Migration downgrade removes organizational records and company agents, then restores the original personal-agent ownership/index layout. It preserves personal agents and knowledge. Downgrade intentionally discards the new feature's records; export them first if they are needed. Neither upgrade nor downgrade was applied to a live database during this implementation.

The existing official LangGraph checkpoint tables continue to be managed by `AsyncPostgresSaver.setup()` at application startup, rather than a second hand-written checkpoint migration.

## API

All new endpoints require the existing authenticated bearer token. `{workspace_id}` is a UUID; current membership is checked on every request. Admin-only operations return 403 for members. Inaccessible workspaces/resources return 404.

| Method | Path under `/api/workspaces` | Access / purpose |
| --- | --- | --- |
| GET | (root) | List caller's companies. |
| POST | (root) | Create company; caller becomes admin. Body `{name}`. |
| GET | `/{workspace_id}` | Company context, members, role and shared sources. |
| GET | `/{workspace_id}/members` | List company members. |
| POST | `/{workspace_id}/members` | Admin adds existing employee by `{email, role}`. |
| GET | `/{workspace_id}/knowledge` | Shared source and visible document metadata. |
| POST | `/{workspace_id}/knowledge/sources` | Admin shares/updates their own source with `{source_id, document_ids}`. |
| DELETE | `/{workspace_id}/knowledge/sources/{source_id}` | Admin revokes company sharing; original source remains. |
| POST | `/{workspace_id}/knowledge/sources/{source_id}/sync` | Admin starts existing source synchronization; 202. |
| GET | `/{workspace_id}/agents` | List active company configurations. |
| POST | `/{workspace_id}/agents` | Admin creates configuration and version 1. |
| PUT | `/{workspace_id}/agents/{agent_id}` | Admin saves configuration with `expected_version`; 409 on stale edits. |
| DELETE | `/{workspace_id}/agents/{agent_id}` | Admin archives agent; history/version identity remains. |
| POST | `/{workspace_id}/agents/preview` | Admin previews `{configuration, message}` using real authorized tools. |
| GET | `/{workspace_id}/conversations` | Recent shared conversations. |
| POST | `/{workspace_id}/conversations` | Create with `{title}`. |
| GET | `/{workspace_id}/conversations/{conversation_id}` | Ordered messages, attribution, sources, progress and errors. |
| POST | `/{workspace_id}/conversations/{conversation_id}/messages` | Accept `{message}`; 202. First message starts with `@handle`. |
| POST | `/{workspace_id}/conversations/{conversation_id}/retry` | Retry latest failed turn; 202. |
| GET | `/{workspace_id}/workflows` | Recent workflow runs. |
| POST | `/{workspace_id}/workflows` | Accept `{request, agents?}`; 202. `agents` assigns Product, Marketing and Support IDs. Without it, exactly one active configuration per specialty is required. |
| GET | `/{workspace_id}/workflows/{run_id}` | Saved state, deliverables, handoffs, sources, steps, durations and reviews. |
| POST | `/{workspace_id}/workflows/{run_id}/review` | `{action, feedback, expected_revision}`; 202. Action is `approve`, `request_changes` or `reject`. Changes require feedback. |
| POST | `/{workspace_id}/workflows/{run_id}/retry` | Resume failed run from its checkpoint where available; 202. |

Detailed request schemas are available in FastAPI `/docs`. Existing `/api/knowledge` OAuth, folder/file selection, synchronization and document-management APIs are reused unchanged.

## Start the demo

Use Python 3.11+ with the existing requirements and the project's supported Node environment. From the repository root in PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m uvicorn backend.main:app --reload
```

In another terminal:

```powershell
Set-Location frontend
npm install
npm run dev -- --configLoader native
```

The native Vite config loader avoids a Windows sandbox issue encountered with the default config bundler. Normal `npm run dev`/`npm run build` can also be used where the default loader works.

Use existing `.env` / `frontend/.env` configuration, or fill in their examples:

- Backend: `DATABASE_URL` for PostgreSQL with pgvector; `LANGCHAIN_API_KEY_GEMINI`; `SUPABASE_URL`; `AUTH_PROVIDER=supabase`; `KNOWLEDGE_TOOLS_ENABLED=true`.
- Drive: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_DRIVE_REDIRECT_URI=http://localhost:5173/connect/gdrive/callback`, and `KNOWLEDGE_TOKEN_KEY` (Fernet key). Enable the Drive API and register the redirect URI in the existing Google OAuth application.
- `KNOWLEDGE_SYNC_ENABLED=true` enables the existing periodic Drive sync; admins can request synchronization manually in `/demo`.
- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_MODE=supabase`; leave `VITE_API_BASE_URL` empty for the existing local Vite proxy, or set the backend origin. Configure `EXTRA_ALLOWED_ORIGINS` for a different frontend origin.
- Existing `GEMINI_BASE_URL` / `GOOGLE_BASE_URL` overrides should remain unset for actual provider calls.

Database URL adapters now normalize SQLAlchemy/Alembic to psycopg3 and the checkpoint pool to a standard PostgreSQL URI. This keeps the existing `prepare_threshold=None` pooler setting compatible with both consumers of `DATABASE_URL`.

Open `http://localhost:5173/demo` after signing in. To exercise the intended implementation sequence:

1. Create **NovaTech** and add another registered employee by email.
2. Open **Connect Drive & manage files**, finish the existing Google OAuth flow, select company files/folders and synchronize them. Return via Home → Agents or `/demo`.
3. Choose **Share** under Company knowledge. Select company documents explicitly, or explicitly share the complete selected source. Personal documents outside the grant are unavailable to company agents.
4. Create the Product, Marketing and Customer Support agents using the configurable templates. Select their shared sources/documents and tools. Use **Try agent**, then save.
5. Create a shared conversation and invoke `@product`, `@marketing` and `@support`. The second employee can select the same company and conversation, or open its `/demo?workspace=…&view=chat&conversation=…` URL after signing in.
6. In **Company workflow**, enter one business request, select the three specialist configurations, and run it. Inspect actual persisted progress, structured handoffs and deliverable source references.
7. Approve, reject or request changes. A second member may review the same run; revision checks reject conflicting decisions.
8. Edit the source in Drive, click synchronization in the company sidebar and wait for its successful-sync timestamp to update. Use **Rerun with latest knowledge** to create a new run using the current index and selected agent versions.

## Limits and remaining verification

- This is a fixed three-specialist launch workflow, with sequential Marketing/Support execution and a maximum of three revision cycles. It is not an unrestricted agent planner or autonomous recursive delegation system.
- Jobs use FastAPI background tasks. State/checkpoints survive process loss; execution is not scheduled automatically after a restart. Stale jobs become failed when read after the timeout and expose Retry. Chat retries rerun the failed turn from saved history; workflow retries use node checkpoints. An interrupted provider call may run again on retry; there are no external write tools.
- A conversation allows 200 employee turns. Each turn uses up to 40 recent messages / 48,000 content characters. Workspace lists show up to 100 recent conversations and 50 recent runs; active company agents are capped at 50. There is no invitation system, billing, role-edit/removal UI, production queue or deployment in this task.
- The database validates source identity/visibility and structured product reference provenance. It does not prove the semantic truth of generated prose. Missing/contradictory facts are reported by structured specialist outputs and surfaced for review. Listed sources are actual retrieved or authorized inherited context references, not a claim of independent fact-checking or sentence-level citation verification.
- Previously shared chat messages and workflow outputs remain shared historical records after a source is unshared. Subsequent retrieval and agent context apply current permissions. Sharing cannot retroactively erase facts an employee already read.
- The original Drive connection and encrypted credentials remain owned by the connecting employee. That employee manages file/folder selection and OAuth reconnection on the existing Knowledge page; workspace admins can synchronize shared sources. Deleting the original connection removes its sharing associations.
- Live database migration, authenticated browser behavior, real provider responses and the full two-employee sequence remain to be exercised in the dedicated testing phase. No formal test/evaluation framework, synthetic company dataset, DeepEval integration or benchmark was added.

Executed implementation checks: Python compilation/import, OpenAPI generation (24 workspace operations), LangGraph construction, PostgreSQL metadata and permission-query compilation, Ruff on the changed backend modules, offline 0030 upgrade/downgrade SQL generation, and the frontend production build with `npm run build -- --configLoader native`. The build reported existing CSS `@import` ordering and bundle-size warnings. These checks do not establish end-to-end runtime correctness.

## Files changed by this implementation

New backend files:

- `backend/workspaces/__init__.py`
- `backend/workspaces/models.py`
- `backend/workspaces/schemas.py`
- `backend/workspaces/service.py`
- `backend/workspaces/runtime.py`
- `backend/workspaces/chat.py`
- `backend/workspaces/workflow.py`
- `backend/workspaces/router.py`
- `backend/knowledge/permissions.py`
- `backend/core/database_urls.py`
- `backend/alembic/versions/0030_organizational_multiplayer.py`

Updated backend files:

- `backend/agents/models.py`, `records.py`, `repository.py`, `runner.py`
- `backend/ai/tools/context.py`, `knowledge_tools.py`, `tool_loop.py`
- `backend/ai/independent_agents/checkpointer.py`
- `backend/knowledge/repository.py`, `retrieval.py`
- `backend/core/database.py`
- `backend/alembic/env.py`
- `backend/main.py`

New frontend files:

- `frontend/src/api/workspaces.js`
- `frontend/src/pages/DemoWorkspacePage.jsx`
- `frontend/src/pages/demo/AgentBuilder.jsx`
- `frontend/src/pages/demo/KnowledgePanel.jsx`
- `frontend/src/pages/demo/SharedConversation.jsx`
- `frontend/src/pages/demo/WorkflowPanel.jsx`
- `frontend/src/pages/demo/shared.jsx`
- `frontend/src/pages/demo/demo.css`

Updated frontend/documentation files:

- `frontend/src/App.jsx`
- `frontend/src/pages/HomeDashboardPage.jsx` (Agents navigation only)
- `.env.example`
- `README.md`
- `CLAUDE.md` (current implementation status and guide reference)
- `docs/organizational-demo.md`

The checkout already contained additional uncommitted edits, deletions and new personal-agent/home files when implementation began. Those were preserved and are not claimed as work performed in this task. No commit, push or deployment was performed.
