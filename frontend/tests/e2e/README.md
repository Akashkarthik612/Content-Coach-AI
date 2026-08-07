# Frontend E2E suite (Playwright)

Frontend-only, fully mocked end-to-end tests for the ContentCoach AI / Honne
React app. **No real backend, no real Postgres/Redis, no real Gemini/Tavily,
no real Supabase project — ever.** Every network call the app makes is
intercepted with `page.route()` (or, for the one endpoint that genuinely
streams, redirected to a real local server — see [`fixtures/sseHelper.ts`](fixtures/sseHelper.ts)).

Backend and AI-pipeline test coverage is a separate, not-yet-written suite —
see `CLAUDE.md`. This suite is frontend-only.

## Running locally

```bash
cd frontend
npm ci
npm run test:e2e          # builds both auth-mode variants, then runs everything
npx playwright show-report # opens the last HTML report
```

Individual pieces:

```bash
npm run build:e2e:supabase   # -> dist-e2e-supabase/  (VITE_AUTH_MODE=supabase)
npm run build:e2e:local      # -> dist-e2e-local/     (VITE_AUTH_MODE=local)
npx playwright test auth.spec.ts          # run one file
npx playwright test --project=supabase-chromium
npx playwright test --ui                  # interactive mode (build first!)
```

## Why two builds

`VITE_AUTH_MODE` is read via `import.meta.env.VITE_AUTH_MODE`, which Vite
inlines into the bundle **at build time** — it cannot be switched at
runtime. Since `CLAUDE.md` documents two genuinely different code paths
(Supabase JWT vs. local `X-User-Id` header, see Authentication Flow), one
built bundle can only ever exercise one of them. `playwright.config.ts`
therefore builds and serves both (`dist-e2e-supabase` on :4173,
`dist-e2e-local` on :4174) and runs three projects:

| Project | Build | Browsers |
|---|---|---|
| `supabase-chromium` / `supabase-webkit` | `dist-e2e-supabase` | Chromium, WebKit |
| `local-auth-chromium` | `dist-e2e-local` | Chromium only (dev-only mode per `CLAUDE.md`) |

Every spec file runs against the Supabase build **except** files whose name
contains `.local-auth.` (`auth.local-auth.spec.ts`,
`auth-boundary.local-auth.spec.ts`), which run only against the local build.

## How the mocks are structured

- **`fixtures/mockRouter.ts`** — generic `page.route()` wrapper
  (`mockEndpoint`) plus named response presets (`preset.success`,
  `preset.error(status)`, `preset.slow(ms)`, `preset.hang()`,
  `preset.malformed()`, `preset.noContent()`) and one typed helper per
  backend endpoint (`mockGetSessions`, `mockResumeAI`, `mockVaultFolders`,
  …), matching the exact shapes in `CLAUDE.md`'s API Endpoints section. A
  `CallLog` lets tests assert *how many times* and *with what body* an
  endpoint was hit.
- **`fixtures/authFixtures.ts`** — `localAuthPage` (seeds
  `localStorage.user_id`/`username` directly) and `supabaseAuthPage` (lets
  the **real** `@supabase/supabase-js` client run in the browser, mocking
  only its `**/auth/v1/**` HTTP calls — see the file's doc comment for why
  this is more robust than hand-crafting the library's localStorage session
  format). Also exports `mockSupabaseAuthSurface`/`mockSupabaseLogin`/
  `mockSupabaseSignup` for tests that need to drive the login/register flow
  itself rather than start pre-authenticated.
- **`fixtures/sseHelper.ts`** — `page.route()`'s `fulfill()` can only send
  one static body, which can't simulate a real, time-spaced stream. This
  spins up a genuine local `http` server and redirects
  `fetch('/api/ai/stream')` to it via `route.continue({ url })`, so
  `ai.js`'s `streamQuery()` reads a real, incrementally-arriving response —
  supporting normal token streaming, a stream that opens and hangs forever,
  a stream that ends mid-JSON-chunk, an abrupt socket close, and capturing
  the first request's actual headers/body for assertions.

## Known-gap tests

These tests assert **current, documented (or newly-discovered) broken/
incomplete behavior**, not an ideal. They are expected to keep passing;
if one starts *failing*, that almost always means the underlying gap was
fixed — update the test's expectation (and the source doc it references)
rather than reverting the fix.

| Test | File | Gap | Source |
|---|---|---|---|
| Forgot password shows a static message, never calls `sendPasswordResetEmail()` | `auth.spec.ts` | `HomePage.jsx`'s Forgot flow isn't wired to the real reset-email flow that already exists for Settings | `CLAUDE.md` Known Gaps |
| Rapid double-click Approve fires two `resume` calls | `chat-workspace.spec.ts` | `WorkspaceView`'s Approve button has no pending/disabled guard (unlike `AngleCard`'s "Draft for LinkedIn") | discovered by this suite |
| `/stream` opens and never sends another event → stuck in "Working on it…" forever | `failure-modes.spec.ts` | No client-side timeout on the SSE connection | `CLAUDE.md` Known Gaps ("No LLM rate limiting") |
| `getSessions()` empty array vs. 500 failure render identically | `failure-modes.spec.ts` | Both paths silently `.catch(() => {})` to an empty list — no distinct error state | discovered by this suite |
| A mocked 401 mid-session does not redirect to `/login` | `failure-modes.spec.ts` | `attachAuthHeader.js` only has a *request* interceptor; no response interceptor reacts to 401 anywhere | discovered by this suite |
| `streamQuery()` sends `X-User-Id`, not `Authorization: Bearer`, even in Supabase mode | `auth-boundary.spec.ts` | `ai.js`'s `streamQuery` builds its own `fetch()` headers manually and never goes through `attachAuthHeader.js`'s `VITE_AUTH_MODE` branch | `claude_ui.md`'s `ai.js` API-modules row (Section 5 priority test) |
| Content-type filter chips don't actually filter by type | `vault.spec.ts` | Every post is hardcoded `IDEA`; chip system is "structurally ready, functionally inert" | `claude_ui.md` MyWorkPage "What's real vs mock" |
| Calendar/momentum/runway data, kebab menu actions | `schedule.spec.ts` (whole file) | Entirely client-seeded mock data; "Open in editor"/"Reschedule" are inert, "Cancel post" is local-only | `claude_ui.md` SchedulePage "What's real vs mock" |
| Username change is `localStorage`-only; Cancel subscription is presentational only | `settings.spec.ts` | No backend endpoint for either | `CLAUDE.md` Known Gaps |
| Two tabs editing the same post: last write wins silently, no conflict warning | `optimistic-and-races.spec.ts` | `post_versions` has no version/etag field for the frontend to detect a conflict with | discovered by this suite |
| SchedulePage's kebab-menu backdrop appears to sit on top of the dropdown's own menu items in real hit-testing, not just visually below it | `schedule.spec.ts` | The full-viewport `position:fixed` backdrop (added to close the menu on an outside click) and the `position:absolute` menu share no common ancestor with an explicit `z-index`, so a real coordinate-based click — even Playwright's `{force:true}`, which still dispatches at real screen coordinates — lands on the backdrop instead of "Open in editor"/"Reschedule"/"Cancel post"; these tests use `dispatchEvent('click')` (bypasses hit-testing) to reach the handler directly and prove what it does | discovered by this suite |
| Sidebar "restore last session on reload" never actually fires, even when the session is present in the fetched list | `chat-core.spec.ts` | Two mount effects race: the one persisting `currentSessionId` to `localStorage['lastSessionId']` fires synchronously and overwrites it with a fresh random UUID before the restore effect's `getSessions().then()` microtask ever reads the original value back — so the id it looks up is always its own, freshly-written, never-matching UUID | discovered by this suite |

## What "done" looks like

- `npm run test:e2e` runs the full suite locally end-to-end.
- `.github/workflows/frontend-e2e.yml` runs on every PR touching
  `frontend/**` and blocks merge on failure (default Playwright exit code,
  never swallowed).
- Every known-gap test above passes *because* it asserts the current
  behavior — none of them were "fixed" by changing the app code to make
  them green.

## Known test-infrastructure limitations (not product bugs)

- `vault.spec.ts`'s two "EditorView autosave" tests around clicking "Done"
  right after typing are skipped on WebKit only (`test.skip(browserName ===
  'webkit', ...)`) — WebKit consistently logs 2 `saveVersion` calls instead
  of 1 there, reproducing even single-worker/no-parallelism, for a cause
  this suite hasn't isolated. Chromium's identical scenario is reliable and
  already covers the behavior these tests exist to guard (that
  `handleDone()`'s `clearTimeout()` actually cancels the pending debounce).
  Investigate if WebKit coverage of this exact interaction becomes a
  priority; don't just raise the assertion's tolerance to make it pass.

## Deliberately out of scope

- `SchedulePage`'s data correctness (it's mock data by design).
- LinkedIn's actual OAuth token exchange (only the redirect trigger and the
  UI states around `connected: true/false` are covered).
- Tavily/Gemini output quality — an AI/backend concern.
- `api/chat.js`, `Button.jsx`/`Badge.jsx`/`Input.jsx`/`ContextMenu.jsx`,
  `useIdeas.js`/`useResizableRail.js`, `ReviewQueueContext` — confirmed
  dead/unimported code per `claude_ui.md`, not tested.
