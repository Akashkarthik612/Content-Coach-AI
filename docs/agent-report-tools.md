# Agent web search and Google Docs tools

Workspace agents can opt into `web_search` and `create_google_doc` alongside the
four existing knowledge tools. Users supply their own agent names, instructions
and responsibilities. There is no built-in report-agent persona or required
multi-agent workflow. Ordinary workspace conversations support both tools.

## Setup

1. Install `requirements.txt`, then run `alembic upgrade head`. Migration 0031
   adds per-user encrypted Google Docs connections, expiring OAuth attempts, and
   durable generated-document records. It does not change existing agent choices.
2. Set `TAVILY_API_KEY` on the backend to enable public web research. Never use a
   `VITE_` variable for this secret. The default Tavily endpoint is fixed in
   production; `TAVILY_BASE_URL` overrides are for local tests only.
3. Enable the Google Drive API and Google Docs API for the existing OAuth project.
   Retain `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
   `GOOGLE_DRIVE_REDIRECT_URI`, and `KNOWLEDGE_TOKEN_KEY`. No additional redirect
   URI is necessary: the existing authenticated Drive callback dispatches the
   separate `docs.` state flow.
4. Allow the `https://www.googleapis.com/auth/drive.file` scope in the OAuth consent
   configuration. Each employee selects **Connect Google Docs** and grants document
   creation. Existing read-only Drive connections remain usable independently.
   For a Google OAuth app in testing, add the demo account to its test users.
5. In Workspace > Agents, create or edit any agent and select the desired tools.
   Knowledge tools retain their existing defaults; external tools are opt-in.
   **Try agent** validates proposed document content without external writes.

A sample user-authored agent instruction is: "Research the permitted documents
and public sources when needed. Prepare a report with an executive summary,
findings, recommendations and references. Create a Google document when the user
requests one. Explain missing evidence and tool failures."

The employee can then ask: "Use our customer interviews and public research to
prepare a report in French and create it in Google Docs."

## Behavior and boundaries

- Tavily returns at most five results per call, with a two-search budget per
  agent turn. Keys, provider bodies and full queries are not logged. Search
  results are untrusted evidence and retain their titles, original URLs,
  retrieval timestamps and server-generated `web:` source IDs.
- Tools are selected by the server from the pinned agent configuration. Web-only
  and report-only agents can run without a RAG source. The existing fixed launch
  workflow still requires its three capability assignments; report agents can
  use shared conversations directly.
- Internal source grants continue to apply on retrieval, history, handoffs and
  report retries. Public web references do not masquerade as internal document
  IDs. Old document-only snapshots remain readable.
- `create_google_doc` accepts a title and structured heading, paragraph, bullet
  and numbered-list blocks. It supports inline emphasis/code/links, French text,
  and numbered source references. Native tables, images, arbitrary document
  editing, PPTX, PDF and DOCX export are outside this initial tool.
- Source references must have been retrieved or admitted from permission-checked
  conversation/handoff context. The server validates IDs and renders a Sources
  section with links. Citation validity checks establish provenance, not factual
  correctness of every generated claim.
- Reports are created in the **running employee's** connected Google account.
  The document is not automatically shared with the Honne workspace. Google
  sharing controls govern the external link. Honne records are membership-scoped;
  only the requesting employee can retry external creation.
- Prepared report content, provenance and output metadata are persisted before
  provider writes. A per-report lease serializes retries. The Google file has an
  app-owned recovery marker, so a lost create response is looked up before any
  new creation. Unresolved ambiguous creation stays incomplete and is never
  blindly repeated. A successful atomic formatting batch can be recognized on
  retry. Externally edited documents are not overwritten.
- There is no restart-proof job queue. Interrupted work is retried explicitly
  after the short lease expires. A disconnected or revoked account requires
  reconnection; historical Google files are not deleted by disconnecting Honne.
- A workspace tool catalog and per-employee connection controls are available
  in agent configuration and shared conversations. Existing message/run polling
  returns generated document deliverables, including saved failures and retry
  controls. No generated link is presented as ready until formatting succeeds.

## API additions

All routes require authentication and workspace membership:

- `GET /api/workspaces/{id}/tools`
- `GET /api/workspaces/{id}/google-docs/connect`
- `POST /api/workspaces/{id}/google-docs/complete`
- `DELETE /api/workspaces/{id}/google-docs/connection`
- `GET /api/workspaces/{id}/documents/generated`
- `POST /api/workspaces/{id}/documents/generated/{report_id}/retry`

OAuth state is user/workspace/purpose-bound, expires in ten minutes and is
consumed once. Refresh tokens use the existing encryption key; credentials are
never placed in an agent configuration or sent to the model.

## Verification

Backend checks use a dedicated local `honne_test` PostgreSQL instance with
pgvector, fake provider HTTP responses and a scripted model. They do not create
real Google documents or make paid Tavily calls. Tests cover migration, mixed
citations, permission enforcement, preview behavior, account ownership, OAuth
state binding, encrypted credentials, idempotency and recovery. Frontend browser
checks cover opt-in tool selection and persistent ready/failed deliverables.

From the repository root:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/honne_test'
python -m pytest backend/agent_tools/tests backend/ai/tools/tests tests/unit -q
```

From `frontend`:

```powershell
npm run test:workspace
npm run build -- --configLoader native
```

A live acceptance run still requires a valid Tavily key, enabled Google APIs,
user OAuth consent, and an actual model response choosing the tools.
