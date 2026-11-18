# Authenticated workspace redesign

The `/demo` workspace uses a white reading canvas, beige sidebar and run header,
self-hosted Inter, and one muted sage accent. Navigation contains workspace
switching, recent runs and conversations, Documents, Agents, and workspace members.
One deliverable is displayed at a time in a column no wider than 760px.

Run identities, output titles, revision status and handoffs come from the persisted
run. Assignment order follows its saved plan. Sources and the existing review
actions open from the run rail; execution events and token usage are collapsed.
The existing backend still requires three launch assignments. The creation form
preserves that contract; rendering accepts other roles and numbers of agents.
No APIs, authentication, knowledge permissions or backend orchestration changed.

Agent replies, preview replies, workflow output, notes, facts, issues and review
feedback use the same `react-markdown` renderer with GFM. Raw HTML and remote
images are disabled and URLs pass through its safe protocol filter. Prose-only
cleanup handles incomplete emphasis and separator lines. Code nodes, URL/path
tokens and verbatim source excerpts preserve punctuation. Long source labels wrap
and their original full URLs remain available.

## Local verification, 18 November 2026

- `npm run build -- --configLoader native`: passed. The native config loader
  avoids the existing Windows native dependency bundling failure with the default
  Vite loader. Existing global CSS import-order and bundle-size warnings remain.
- `npx eslint src/pages/DemoWorkspacePage.jsx src/pages/demo`: passed.
- `npm run lint`: the remaining 10 errors and one warning are in the unchanged
  static bundle `frontend/public/demo/support.js`.
- `npm run test:smoke`: attempted; its backend refuses to start without a
  `TEST_DATABASE_URL` pointing to a local disposable PostgreSQL database.
- `npm run test:workspace`: 12 browser checks passed, including 1920×1080,
  1280×1080 and 1024×1080 layouts, French paragraphs, nested lists, links, code,
  incomplete streamed text, safe URLs/HTML, deliverable selection, recorded facts,
  review payloads for all three actions, another agent role, conversation replies,
  and the authentication gate.

The three viewport checks replayed the actual saved run open in Honne, loaded
through a read-only database transaction. Its snapshot and screenshots remain in
the ignored local `reports` directory; no private run content or credentials are
committed. Review tests submit only to intercepted local replay routes; they do
not approve, reject or modify the production run. This verifies the frontend and
API payload contracts, not a new end-to-end production review or provider call.

## Reproduce the workspace checks

From `frontend`, install dependencies and Chromium, then run:

```powershell
npm ci
npx playwright install chromium
npm run test:workspace
```

The suite uses a deterministic French fixture by default. To replay a private
saved-run snapshot for the three layout checks, set `DEMO_SAVED_RUN_PATH` to a
local JSON file containing `workspace`, `agents`, `run`, `runs`, and `conversations`
in the shapes returned by the current workspace APIs. Do not commit that file.
The test server enables the existing local-auth development mode in its own
process only; deployment authentication settings are unaffected.

Screenshots are written to the ignored `reports` directory when running from the
repository's normal `frontend` directory. Failure traces remain outside source.
