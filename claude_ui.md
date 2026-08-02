# ContentCoach AI — UI State & Design System
> Single source of truth for all UI decisions. This file describes only the current state of the frontend — no changelog, no history. When a page or component changes, edit its section in place.
> Last updated: 2026-08-02

---

## Product Identity

- **Name:** ContentCoach AI (displayed as "ContentCoach **AI**" with " AI" in `#3B82F6`) on the marketing landing page; the in-app product identity (Chat, Vault, Schedule, Settings) uses the "Honne" brand name and green/cream palette instead — the two names/palettes are deliberately not merged.
- **Tagline:** "Your AI content team, running 24/7"
- **User:** Solo LinkedIn creators, bootstrapped founders, self-employed professionals, newsletter writers
- **In-app agent roster** (`AgentsPage.jsx`, `/agents`): Research (active), Writer (drafting), SEO (coming soon), Analytics (coming soon) — every message routes through the supervisor first, which dispatches to a specialist.
- The landing page's own marketing copy additionally names Repurpose/Publisher agents (`landingContent.js`'s `AGENT` map) — presentational only, not a claim about what `AgentsPage.jsx` or the backend currently expose.

---

## Tech Stack (Frontend)

| Concern | Choice | Notes |
|---|---|---|
| Framework | React 19 | No class components |
| Build | Vite | No CRA, no Next.js |
| Routing | React Router v6 | `<BrowserRouter>` in `main.jsx` |
| HTTP | Axios | `attachAuthHeader.js` interceptor branches on `VITE_AUTH_MODE`: `"local"` attaches `X-User-Id` from `localStorage`; else attaches `Authorization: Bearer <supabase access_token>` |
| State | `useState` + `useContext` | No Redux/Zustand/Jotai |
| Styling | Inline styles + JS-const design tokens per page/component (no CSS-in-JS library) | Tailwind v4 (`@tailwindcss/vite`) tokens exist in `index.css` for the surviving CSS-module components only |
| Icons | `lucide-react` (Chat/Schedule/Settings) + inline SVGs (Landing, MyWork, Agents) | |

---

## CSS Variable Namespaces (`index.css`)

### `--cc-*` — landing page tokens
```css
:root {
  --cc-white:       #FFFFFF;   --cc-bg-soft:    #F8FAFF;   --cc-bg-subtle:  #EEF2FF;
  --cc-blue:        #2563EB;   --cc-blue-hover: #1D4ED8;   --cc-blue-light: #DBEAFE;
  --cc-blue-dark:   #1E40AF;   --cc-text:       #0F172A;   --cc-text-muted: #475569;
  --cc-text-faint:  #94A3B8;   --cc-border:     #E2E8F0;   --cc-accent:     #FEE2E2;
  --cc-green-light: #DCFCE7;   --cc-green-text: #15803D;
  --cc-red-light:   #FEF2F2;   --cc-red-text:   #B91C1C;
}
```

### `--color-*` + shadcn/Tailwind-v4 tokens — shared component tokens
Used by the surviving CSS-module components: `components/AIAssistant.module.css`-style modules no longer apply (that component was removed — see Dead/Orphaned Code), so this namespace's only remaining consumer is `components/shared/ContextMenu.module.css` (itself orphaned — see below).
```css
:root {
  --color-bg:           #FFFFFF;   --color-bg-soft:       #F8FAFF;   --color-bg-subtle:    #EEF2FF;
  --color-blue-primary: #2563EB;   --color-blue-light:    #DBEAFE;   --color-blue-dark:    #1D4ED8;
  --color-text:         #0F172A;   --color-text-muted:    #64748B;   --color-text-faint:   #94A3B8;
  --color-border:       #E2E8F0;   --color-border-focus:  #2563EB;   --color-accent:       #FEE2E2;
  --color-accent-dark:  #EF4444;   --color-success:       #10B981;   --color-warning:      #F59E0B;
}
```
`index.css` additionally declares `--space-1..12`, `--radius-sm/md/lg/pill`, `--shadow-sm/md/lg`, `--text-xs..4xl`, and a shadcn-required alias set (`--background`, `--card`, `--primary`, `--ring`, etc.) feeding a `@theme inline` Tailwind v4 block — not used by any current page directly, kept for the Tailwind pipeline.

---

## Typography

### Landing page (`LandingPage.jsx`)
| Font | Use |
|---|---|
| `Newsreader` (400/500/600, incl. italic) | Headings, big stat numbers, logo "C" |
| `Hanken Grotesk` (400/500/600/700) | Body, nav links, buttons, labels |
| `JetBrains Mono` (400/500/600) | Eyebrow labels, metadata badges, timestamps |

Loaded via Google Fonts `<link>` in `index.html`.

### Honne pages (HomePage, OnboardingPage, ChatPage, SchedulePage, SettingsPage, ResetPasswordPage, MyWorkPage)
| Font | Use |
|---|---|
| `Geist` | Chat/Schedule/Settings/ResetPassword/HomePage body — pulled in via a scoped `@import` inside each component's own `<style>` block, not a global `index.html` `<link>` |
| `EB Garamond` | Serif display (titles, quote marks) on OnboardingPage/MyWorkPage — loaded globally in `index.html` |
| `Hanken Grotesk` | Sans body on OnboardingPage/MyWorkPage |
| `JetBrains Mono` | Eyebrow labels, metadata pills across all Honne pages — loaded globally |

### AgentsPage.jsx / AppSidebar.jsx (legacy blue/indigo family)
| Font | Use |
|---|---|
| `Hanken Grotesk` / `DM Sans` | Body, nav, buttons |
| `Newsreader` | Serif headline ("Your AI Team") |
| `JetBrains Mono` / `Fira Code` | Metadata badges |

**Body default:** `font-family: 'Plus Jakarta Sans', sans-serif` (set in `index.css`, shadcn default) — every page overrides this per-element via its own tokens above.

---

## Layout Utilities (`index.css`)

### Landing-only classes (`lp-*`)
Breakpoints: desktop ≥1024px, tablet 768–1023px, phone ≤767px.

| Class | Behaviour |
|---|---|
| `.lp-hide-phone` / `.lp-show-phone` | hide on phone / hide on desktop |
| `.lp-hero-stage` / `.lp-hero-mobile` | desktop+tablet hero vs. phone hero |
| `.lp-cta-row`, `.lp-agent-grid`, `.lp-2col`, `.lp-3col`, `.lp-pricing-grid`, `.lp-pipeline-row`, `.lp-workspace-grid` | responsive grid/flex collapses, one per landing section |
| `.lp-h2`, `.lp-hero-h1` | responsive font-size steps |
| `.lp-section` | padding reduced on tablet/phone |

### Legacy `--cc-*` utility classes
`.cc-hide-mobile`/`.cc-show-mobile`/`.cc-hero-grid` (media-query utilities), `.cc-stagger`/`.cc-stagger-1..5`, `.cc-hover-lift`, `.cc-press:active` — defined in `index.css`, still used by the landing page; no current non-landing page relies on them (`MyWorkPage.jsx`/`ChatPage.jsx` define their own scoped keyframes instead — see their sections below).

### Keyframes
**Landing:** `ccFloatA/B/C/D` (float+tilt), `ccPulse` (status-dot pulse), `ccBlob`/`ccBlob2` (background drift), `ccDash` (dashed SVG stroke march), `ccBlink` (cursor blink), `ccGrow` (progress bar fill), `ccReveal`/`ccBounce`/`ccRise` (card entrances).
All respect `@media (prefers-reduced-motion: reduce)`.

**Per-page scoped keyframes** (declared inline in the component itself, not in `index.css`): `ChatPage.jsx` → `ccRise`/`ccFade`/`ccBreathe`/`ccCaret`; `MyWorkPage.jsx` → `vRise`/`vFade`/`vSlide`/`vCaret`/`vCard`. Both respect reduced-motion via their own scoped media query.

---

## Page Map

| Route | Component | Auth | Notes |
|---|---|---|---|
| `/` | `pages/landing/LandingPage.jsx` | Public | Marketing page, fully self-contained |
| `/login` | `pages/HomePage.jsx` (mode=login) | Public | |
| `/register` | `pages/HomePage.jsx` (mode=register) | Public | |
| `/reset-password` | `pages/ResetPasswordPage.jsx` | Public — own recovery-session check, not `RequireAuth` | |
| `/onboarding` | `pages/OnboardingPage.jsx` | RequireAuth | First-run-only questionnaire |
| `/my-work`, `/vault` | `pages/MyWorkPage.jsx` | RequireAuth | Both paths render the same component |
| `/chat` | `pages/ChatPage.jsx` | RequireAuth | App home page (post-login/post-onboarding redirect target) |
| `/schedule` | `pages/SchedulePage.jsx` | RequireAuth | Calendar/momentum/content-runway view |
| `/settings` | `pages/SettingsPage.jsx` | RequireAuth | Account settings |
| `/agents` | `pages/AgentsPage.jsx` | RequireAuth | Static "AI team" overview |
| `*` | — | — | `<Navigate to="/">` |

**`RequireAuth`** (`App.jsx`): state machine `checking → authed/anon`. If `import.meta.env.VITE_AUTH_MODE === 'local'`, checks `localStorage.getItem('user_id')` synchronously; else calls `supabase.auth.getSession()`. Renders `null` while checking; redirects to `/` if anon.

**Post-login/post-onboarding redirect is always `/chat`** — there is no Dashboard route.

`<ReviewQueueProvider>` wraps the entire `<Routes>` tree in `App.jsx`, but nothing currently reads from it (`useReviewQueue()` has zero call sites) — see Dead/Orphaned Code.

---

## Landing Page Architecture

```
frontend/src/pages/landing/
├── landingContent.js    ← COPY object — data arrays only (agents, feed, pricing, footer)
└── LandingPage.jsx      ← Single file; all sections as named functions + shared primitives
```

All old per-section files (`Hero.jsx`, `Navbar.jsx`, `Features.jsx`, etc.) and `HomePage.module.css` do not exist on disk — fully deleted, not merely superseded.

### Design tokens (JS constants, not CSS variables)
```js
const C    = { ink:'#111827', blue:'#3B82F6', indigo:'#6366F1', violet:'#8B5CF6', sky:'#0EA5E9', dark:'#0B1220', tint:'#F7FAFF', ... }
const FONT = { serif:"'Newsreader',...", sans:"'Hanken Grotesk',...", mono:"'JetBrains Mono',..." }
const GRAD = { sig:'linear-gradient(135deg,#3B82F6,#8B5CF6)', bi:'(135deg,#3B82F6,#6366F1)', text:'(120deg,...)' }
```

### Sections (in order)
Nav → Hero → TeamGrid (`#agents`) → VoiceVault → Orchestration → WorkspaceMockup → Repurpose → AlwaysOn → Pricing (`#pricing`) → FinalCTA → Footer.

### CTA wiring
All "Start Free"/"Sign in" CTAs → `navigate('/register')` / `navigate('/login')`. "Watch Demo" is a static no-op button.

---

## HomePage.jsx (`/login`, `/register`)

Split-screen auth page on the Honne green/cream palette — `display:grid; grid-template-columns:'1fr 1fr'`, brand panel (`lp-hide-phone` on mobile) + form panel.

### Brand panel
`C.accent` (`#14663B`) background with a radial glow overlay; "Honne" wordmark + mono tagline; a large pull-quote; mono copyright footer.

### Form panel (`C.paper` `#F4F2EA` bg)
- Pill-shaped Sign up/Log in tab segment drives `mode` state (`'signup'|'login'`).
- **Sign up fields:** Full name · Email · Password. `handleRegister` passes the Full name value through as the `username` argument to `register()` — safe because `users.username` is nullable.
- **Log in fields:** Email · Password, plus an inline "Forgot?" link. `handleForgot()` currently only sets a static message ("Password reset isn't available yet — contact support.") — it does not call the existing `sendPasswordResetEmail()`/`/reset-password` flow that Settings already uses (see Known Gaps in `CLAUDE.md`).
- Google button calls the real `googleSignIn()` (Supabase OAuth).
- Legal line links are `href="#"` placeholders.

### Design tokens
```js
const C = {
  paper:'#F4F2EA', ink:'#1B1C14', accent:'#14663B', accentHover:'#0F4C2C', card:'#FFFFFF',
  hair:'rgba(27,28,20,0.12)', glow:'rgba(205,235,214,.22)', cream:'#EAF3EC', mint:'#CDEBD6',
  muted:'#7A7C6C', faint:'#9A9C8C', faint2:'#A6A895', errText:'#B91C1C', errBg:'#FEF2F2',
}
const GEIST = "'Geist', system-ui, sans-serif"
const MONO  = "'JetBrains Mono', monospace"
```
`Geist` is loaded via a scoped `@import` inside `HomePage.jsx`'s own `<style>` block. Copy lives in `pages/authContent.js` (`AUTH_COPY`) — never hardcode auth copy in the component.

`handleRegister` navigates to `/onboarding` on success. `handleLogin` navigates to `/chat`.

---

## OnboardingPage.jsx (`/onboarding`)

First-run-only questionnaire shown once, immediately after signup. UI + client-side flow, plus a real backend write.

### Design tokens
```js
C = {
  bg: '#F4F2EA', ink: '#1B1C14', green: '#14663B', greenHov: '#0F4C2C', rust: '#B0663A',
  sub: '#9A9C8C', faint: '#A6A895', muted: '#6C7064', chipText: '#3A3C30',
  chipBrd: 'rgba(27,28,20,.12)', track: 'rgba(27,28,20,.08)', divider: 'rgba(27,28,20,.05)',
}
SERIF = "'EB Garamond', serif"   SANS = "'Hanken Grotesk', system-ui, sans-serif"   MONO = "'JetBrains Mono', monospace"
```

### Flow
7-question wizard (profession/industry/role/audience/goals/topics/style, one per screen) → Done screen with a summary card → `finish()`. "Skip for now" jumps straight to Done with whatever was answered so far.

`finish()` sets `localStorage['cc_onboarded_' + user_id] = '1'` + `localStorage['onboarding_answers']`, fire-and-forgets `submitOnboarding(answers)` (`POST /api/profile/onboarding`), then navigates to `/chat`. A failed/slow save does not block navigation. There is no server-side "has this user onboarded" enforcement — only the register-vs-login redirect split.

---

## MyWorkPage.jsx (`/my-work`, `/vault`)

Single self-contained file (no shared sidebar) implementing a flat, searchable vault of every draft plus an in-place editor. Two-view state machine: **Vault** (`VaultView`, no post open) ↔ **Editor** (`EditorView`, one post open), toggled by `activePost` state.

### Design tokens
```js
const PAPER = '#F4F2EA'; const ASIDE_BG = '#EFEDE3'; const INK = '#1B1C14'; const ACCENT = '#14663B'
const SERIF = "'EB Garamond', serif"; const SANS = "'Hanken Grotesk', system-ui, sans-serif"; const MONO = "'JetBrains Mono', monospace"
```

### VaultView (browsing)
Header ("The Vault" + "New draft" button, `useMagnetic()` pointer-follow effect on the CTA) → search bar + content-type filter chips (`CATS`/`ORDER` constants — every post the app creates today is tagged `IDEA`, since nothing upstream ever assigns a different tag; the chip system exists for when that changes) → responsive grid of `VaultCard`s (status-pill-free; shows relative time, 2-line title/preview clamp, word count + read-time footer). Empty state: "Nothing saved yet — start a new draft, or approve one from Chat."

Folders are still real backend data (`useVault()`) and every post still has a `folder_id` (chat-approved drafts land in an auto-created folder server-side), but folders are **not** a browsing layer in this UI — `allPosts` flattens every folder's posts into one list.

"New draft" (`handleNewDraft`) falls back to the first existing folder, or creates a `"Quick Drafts"` folder if none exists, then opens the new post directly in the editor. `/my-work?new=1` (used by other pages' "Start Writing" links) triggers this automatically on mount and then strips the query param.

### EditorView (one post open)
Header: back-to-Vault, content-type pill, word-count/read-time pills, a "Research" toggle, a Saved/Saving indicator, Done button. Body: auto-growing title `<input>` + auto-growing body `<textarea>` (plain text, no Markdown toolbar, no WYSIWYG). Autosave: 650ms debounce after any edit → `renamePost()` (if title changed) + `saveVersion(postId, content, null, false)` (draft save — **not** `is_final`, so this never triggers embedding, see `CLAUDE.md`'s vault `/versions` note). On "Done": persists immediately, then if both title and body are empty, deletes the post (`deletePost`) instead of leaving an empty draft behind.

### ResearchAside (optional right panel, opened via the header's "Research" toggle)
A minimal chat: empty state shows 3 canned suggestion prompts; sending a message calls `queryAI(q)` directly (not the shared streaming path `ChatPage.jsx` uses) and renders the answer with a client-side fake-typewriter reveal (`setInterval`-based character reveal, not a real SSE stream). Handles three response shapes: `awaiting_angle_selection` and `awaiting_approval` both show a redirect-to-Chat message instead of trying to render angles/drafts inline; anything else shows `res.answer`. "Add to draft" appends the agent's text to the body textarea.

### What's real vs mock
| Feature | Status |
|---|---|
| Vault listing, search, filter chips | ✅ Real — `useVault()` (`getFolders`/`getPostsInFolder`/`createFolder`/`createPost`) |
| Draft create/rename/delete, autosave | ✅ Real — `saveVersion`/`renamePost`/`deletePost`/`getVersions`/`getVersion` |
| Research aside | ✅ Real question-answering via `queryAI()`, but the "streaming" text reveal is a client-side fake typewriter, not a real token stream |
| Content-type tagging (`CATS`) | ⚠️ Structurally ready, functionally inert — every post is hardcoded to `IDEA`, nothing ever sets a different tag |
| Pin, folder browsing, version history UI, LinkedIn publish, analytics | Not present in this page at all (no `AppSidebar`, no `ContextMenu`, no `MetricsCard`, no publish button) |

---

## ChatPage.jsx (`/chat`) — primary AI interaction surface

Full-screen agent chat on the Honne green/cream palette, using the shared `HonneSidebar`.

### Design tokens
```js
BG='#F4F2EA'  SIDEBAR_BG='#EFEDE3'  INK='#1B1C14'  ACCENT='#14663B'  ACCENT_TINT='rgba(20,102,59,.09)'
MUTED='#6C7064'  MUTED_2='#8A8C7C'  MUTED_3='#A6A895'  HAIRLINE='rgba(27,28,20,.09)'
DANGER='#B42318'  LI_BLUE='#0A66C2'  (LinkedIn brand blue)
FONT="'Geist', system-ui, sans-serif"   MONO="'JetBrains Mono', monospace"
```
`Geist`/`JetBrains Mono` are pulled in via a scoped `@import`, alongside `ccRise`/`ccFade`/`ccBreathe`/`ccCaret` keyframes and a reduced-motion override.

### Layout
Two mutually exclusive top-level views, switched by `view` state (`'chat' | 'workspace'`):
```
view === 'chat':      Sidebar | header + empty-state/message-stream + Composer
view === 'workspace': Refine command assistant | header + Edit/Preview LinkedIn-preview card
```

### Sub-components
| Component | Responsibility |
|---|---|
| `HonneSidebar` | Collapsible aside — see § Shared Components below |
| `MessageBubble` | Renders one message; `ai`-role messages show an agent-icon tile, `ActivityTimeline`, streamed text, and one of `angles`/`draft`/`direct` bodies once `phase==='done'` |
| `ActivityTimeline`/`ActivityRow` | Collapsible "Working…"/"Done · N steps" panel, driven by real `activity` SSE events from the backend (never renders a raw node/tool/agent name — only whatever label the backend sent) |
| `AngleCard` | One research angle: tag, title, argument, optional glimpse, audience/source, inline Expand/Refine panel, "Draft for LinkedIn"/"Expand" actions |
| `Composer` | Docked auto-sizing textarea; Enter sends, Shift+Enter newlines |
| `WorkspaceView` | Full post-draft workspace — see below |
| `LinkedInGlyph` | Inline LinkedIn "in" SVG mark |

### Research angle cards (`msg.kind === 'angles'`)
Rendered once the graph pauses at `awaiting_angle_selection`. Two display modes toggled by a header button: expanded (vertical `AngleCard` stack) or collapsed (single row of pill chips). Per-card actions: **Draft for LinkedIn** (`resumeAI(threadId,'pick','',index)` — chains into the writer, opens `WorkspaceView`); **Expand** (`resumeAI(threadId,'expand','',index)` — grounded summary shown inline); once expanded, an inline **Refine** input (`resumeAI(threadId,'modify',text,index)`) revises that angle's summary repeatedly in place. Typing in the composer while the latest message is still an unresolved `angles` message routes through `sendAsAngleGuidance()` → `resumeAI(threadId,'none_fit',text)` on the same paused thread, instead of starting a new one.

### Persisted chat history
The sidebar's chat list is fetched from the backend on mount via `getSessions()` and mapped to `{id, sessionId, title, time}`; `currentSessionId` persists to `localStorage['lastSessionId']` and is restored on reload if still present in the fetched list. `selectChat()` calls `getSessionThreads(sessionId)` and rehydrates the full message list via `threadToMessages()`. **Deleting a chat row calls `deleteSession(sessionId)`** (`DELETE /api/ai/sessions/{id}`) with an optimistic UI removal that reverts on failure — this permanently deletes the backend record and its threads, not just the local list entry.

### Message lifecycle
Each exchange creates a `user` message and an `ai` message; the AI message's `phase` moves `working` → `streaming` (SSE token accumulation) → `done`, at which point `kind` (`'angles'|'draft'|'direct'`) determines which body renders.

### WorkspaceView — full post-draft workspace
Opened via "Open Workspace →" or automatically once a draft exists. Two-column layout:
- **Left ("Refine") panel** — chat-style command assistant; input wired to `submitWsCmd()` → `refineAI(ws.docText, note)` (single LLM call, no graph) — replaces the draft text in place.
- **Right (document) panel** — Edit/Preview toggle over a LinkedIn-preview card: 44px avatar, the real logged-in user's name (`localStorage.username`) and `professionLine = profile?.profession || profile?.role || 'Creator on Honne'` (from `getProfile()`, resolved to `null` on 404 instead of throwing). Edit mode is a plain auto-growing `<textarea>`; Preview mode is read-only with a Like/Comment/Repost/Send action row and a "Draft preview" label (not a fabricated post age).
- **Header** — back-to-chat, title + pills, Approve/Decline (or the decision pill once resolved), Copy, History (fetches `getVersions(postId)`), and a real LinkedIn-branded Connect/Publish button (`getLinkedInStatus()`/`getLinkedInAuthUrl()`/`publishToLinkedIn()`).
- Approve calls `resumeAI(threadId,'edited',docText)` if the text changed, else `resumeAI(threadId,'approved')`; Decline calls `resumeAI(threadId,'rejected')`.

### API calls
```js
streamQuery(text, sessionId, onToken, onDone, onError, onActivity)  // SSE — main composer
resumeAI(threadId, action, content, angleId)                       // approve/edited/rejected/pick/expand/modify/none_fit
refineAI(draft, note)                                              // workspace Refine panel only
getSessions() / getSessionThreads(sessionId) / deleteSession(sessionId)
getLinkedInStatus() / getLinkedInAuthUrl() / publishToLinkedIn()   // workspace Connect/Publish
getVersions(postId)                                                // workspace History toggle
getProfile()                                                       // workspace card's name/profession line
```
There is no mock/simulated-stream fallback anywhere in this file — an SSE or resume failure surfaces as an inline error on that message (`msg.error`) or the workspace (`ws.error`).

---

## SchedulePage.jsx (`/schedule`)

```
HonneSidebar | header (Publishing/Schedule) + Calendar (month grid, day-detail panel) + Upcoming runway | Momentum panel
```

### What's real vs mock
| Feature | Status |
|---|---|
| Sidebar (nav, search, persisted chat list) | ✅ Real — same `HonneSidebar` + `getSessions()`/`deleteSession()` as `ChatPage.jsx` |
| Calendar navigation, day selection | ✅ Real client-side state |
| Scheduled posts, momentum streak/history, week rails | ❌ Entirely mock — client-only state seeded from hardcoded `TITLES`/`PLATS`/`TIMES` arrays and a fixed `STREAK_WEEKS=12` constant. No backend endpoint exists for listing/creating scheduled posts by date range (`posts.scheduled_at` + `PATCH /posts/{id}/status` exist server-side, but nothing reads a calendar view back out of them) |
| "Open in editor"/"Reschedule" kebab actions | ❌ Inert — close the menu only. "Cancel post" removes the mock row locally only |

---

## SettingsPage.jsx (`/settings`)

```
HonneSidebar | Profile (email · username) · Security (password) · Session & plan (logout · cancel subscription)
```

### What's real vs mock
| Feature | Status |
|---|---|
| Sidebar (persisted chat list) | ✅ Real |
| Logout | ✅ Real — clears `localStorage`, navigates to `/login` |
| Email + username display | ✅ Real — `GET /api/profile/settings` (`getAccountSettings()`). No silent fallback on fetch failure — an explicit inline error replaces the rows |
| Email change | ✅ Real, async — `updateEmail()` calls `supabase.auth.updateUser()` directly; Supabase emails a confirmation link, so the DB only reflects the change after the user confirms *and* makes a subsequent authenticated request (backend self-heal, see `CLAUDE.md`) |
| Password change | ✅ Real, async — "Send reset link" emails a Supabase recovery link to the account's registered address; the new password is actually set on `/reset-password`, not here |
| Username change | ⚠️ `localStorage`-only — no backend call |
| Cancel subscription | ❌ Presentational only — shows a toast, no backend call, no billing system exists |

Not built for local-auth dev mode — `supabase` is a placeholder client there, so the email/password calls would simply fail.

---

## ResetPasswordPage.jsx (`/reset-password`)

Standalone landing page for Supabase's password-recovery email link. Public route, not `RequireAuth`-wrapped. No `HonneSidebar` — a centered card using the same Geist/Honne token style as `SettingsPage.jsx`.

**States:** `Checking` (listens for Supabase's `'PASSWORD_RECOVERY'` event, with a `getSession()` fallback for a fired-before-mount race) → `Link invalid or expired` (points back to `/login`) **or** `Form` (new password + confirm, calls `updatePassword(newPassword)`) → `Done` (button to `/settings`).

---

## AgentsPage.jsx (`/agents`)

Static "AI team" overview using `AppSidebar` (the only remaining consumer of that component — see § Shared Components). Four hardcoded agent cards (`AGENTS` array): Research (active, CTA → `/chat`), Writer (drafting, CTA → `/chat`), SEO (coming soon, disabled), Analytics (coming soon, disabled). No API calls — pure presentational page plus a "how the agents work together" note.

---

## Shared Components (`components/shared/`)

### `HonneSidebar.jsx`
Used by `ChatPage.jsx`, `SchedulePage.jsx`, `SettingsPage.jsx`. Props: `open, onToggle, chats, activeIndex, onSelect, onDelete, onNewChat, search, onSearch, userName, navigate, activeNav`. Palette: `SIDEBAR_BG='#EFEDE3'`, `ACCENT='#14663B'`, `INK='#1B1C14'`, `BG='#F4F2EA'`; fonts Geist/JetBrains Mono. `SIDE_NAV`: Chats (`/chat`, enabled), Vault (`/my-work`, enabled), Analytics (disabled, no page behind it), Scheduled (`/schedule`, enabled). Footer button always navigates to `/settings`.

### `AppSidebar.jsx`
Used only by `AgentsPage.jsx` — `MyWorkPage.jsx` no longer imports it; it is a self-contained page with no sidebar of this kind. Exports `NAV_ITEMS` + `AppSidebar({navigate, activeKey, collapsed, onToggle, onCalendarOpen})`. Distinct palette: `INK='#111827'`, `BLUE='#3B82F6'`, `INDIGO='#6366F1'`, `VIOLET='#8B5CF6'`, fonts Hanken Grotesk/Newsreader/JetBrains Mono. Has its own inline mock calendar widget and sign-out button. `NAV_ITEMS`: `content`→`/my-work?new=1`, `agents`→`/agents`, `vault`→`/vault`, `chat`→`/chat`.

Two visually distinct palette systems remain in the app: **Honne** (green `#14663B`/cream `#F4F2EA`) used by every page except `AgentsPage`, and **the `AppSidebar` blue/indigo/violet family** used only by `AgentsPage`. They are deliberately not merged.

---

## API Modules (`src/api/`)

| Module | Axios instance / mechanism | Exports → HTTP |
|---|---|---|
| `attachAuthHeader.js` | Interceptor, shared by every module below except `streamQuery`/`localAuth.js` | Branches on `VITE_AUTH_MODE` — see Tech Stack |
| `vault.js` | `baseURL:/api/vault` | `getFolders`, `createFolder`, `renameFolder`, `deleteFolder`, `getPostsInFolder`, `createPost`, `getPost`, `renamePost`, `deletePost`, `pinPost`, `movePost`, `saveVersion`, `getVersions`, `getVersion`, `renameVersion`, `deleteVersion`, `updatePostAnalytics`, `updatePostStatus`, `search` — all resolve `.data` directly |
| `ai.js` | `baseURL:/api/ai`, except `streamQuery` (raw `fetch`, manual `X-User-Id`) | `queryAI(prompt, sessionId?)`, `resumeAI(thread_id, action, content, angle_id?)`, `refineAI(draft, note)`, `draftFromTopic(topic, platform, sessionId?)`, `getSessionThreads(sessionId)`, `getSessions()`, `deleteSession(sessionId)` (`DELETE /sessions/{id}`), `streamQuery(prompt, sessionId, onToken, onDone, onError, onActivity)` — SSE events: `token`, `activity`, `done`, `error` |
| `auth.js` | `supabase-js` direct + delegates to `localAuth.js` | `login`, `register`, `googleSignIn` |
| `account.js` | `supabase-js` direct, no backend route | `updateEmail(newEmail)`, `sendPasswordResetEmail(email)`, `updatePassword(newPassword)` |
| `localAuth.js` | Own axios, `baseURL:/api/auth`, no interceptor | `localLogin`, `localRegister` — write `user_id`/`username` to `localStorage` on success |
| `profile.js` | `baseURL:/api/profile` | `submitOnboarding(answers)`, `getProfile()` (null on 404), `getAccountSettings()` |
| `linkedin.js` | `baseURL:/api/linkedin` | `getLinkedInStatus`, `getLinkedInAuthUrl`, `publishToLinkedIn(postId)`, `disconnectLinkedIn` |
| `publishing.js` | Wraps `linkedin.js` | `sendToReview()` (stub, no `in_review` backend status), `publishPost()` (delegates LinkedIn+immediate to `publishToLinkedIn`, stubs X/Reddit/scheduled) |
| `chat.js` | none | Dead — all 5 exports (`listChats`/`getChat`/`createChat`/`renameChat`/`deleteChat`) are `Promise.resolve()` stubs, unimported anywhere. Superseded by `ai.js`'s session functions |

---

## Frontend Hooks (`src/hooks/`)

| Hook | Status |
|---|---|
| `useVault()` | ✅ Live — feeds `MyWorkPage.jsx` (`{folders, postsByFolder, loading, addFolder, addPost, removePost, updatePost, removeFolder, updateFolder}`) |
| `useIdeas()` | ❌ Dead — mock data, unimported anywhere |
| `useResizableRail()` | ❌ Dead — unimported anywhere (no page currently has a resizable rail) |

---

## Frontend Context (`src/context/`)

| Context | State | Status |
|---|---|---|
| `ReviewQueueContext` | `useState` array of `{id, title, platform}` | ❌ Dead weight — `<ReviewQueueProvider>` wraps the entire `App.jsx` route tree, but `useReviewQueue()` has zero call sites anywhere in the codebase |

---

## Dead / Orphaned Frontend Code

Confirmed unreferenced or removed from disk — do not build on these without first re-wiring them:

- **Removed from disk entirely:** `components/AIAssistant/` (`AIAssistant.jsx` + `useAIChat.js`) — not just unmounted, the files no longer exist.
- **`api/chat.js`** — all-stub module, unimported.
- **`components/shared/Button.jsx`, `Badge.jsx`, `Input.jsx`, `ContextMenu.jsx`** (+ their `.module.css` files) — no importers anywhere.
- **`hooks/useIdeas.js`, `hooks/useResizableRail.js`** — no importers anywhere.
- **`context/ReviewQueueContext.jsx`** — provider mounted app-wide, consumer hook never called.

---

## Inline Style Conventions

### Landing page
```jsx
// Correct — JS color constants
<div style={{ background: C.tint, borderRadius: 14 }}>
// Wrong — landing page does not use --cc-* vars or Tailwind classes
<div style={{ background: 'var(--cc-bg-soft)' }}>
```

### Honne pages (HomePage/OnboardingPage/ChatPage/SchedulePage/SettingsPage/ResetPasswordPage/MyWorkPage)
```jsx
// Correct — module-level JS-const tokens, same pattern each of these pages already uses
const ACCENT = '#14663B'
<div style={{ background: ACCENT, borderRadius: 12 }}>
```
Each of these pages defines its own token consts at module scope (see each page's own section above) rather than sharing a single global palette file — this is intentional per-page ownership, not drift.

---

## Component Rules (CSS-module components)

`Button.jsx`/`Input.jsx`/`Badge.jsx`/`ContextMenu.jsx` are orphaned (see Dead/Orphaned Code) — no current page uses the `--color-*`-based Tailwind-class button patterns below. Kept only as reference in case a future CSS-module component is added.

```jsx
// Primary
<button className="bg-[--color-blue-primary] hover:bg-[--color-blue-dark] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150">
// Secondary (outline)
<button className="border border-[--color-border] hover:border-[--color-blue-primary] text-[--color-text] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150">
```

---

## Animation Budget

### Landing page (CSS keyframes only — no Framer Motion)
| Location | Animation |
|---|---|
| Hero floating cards | `ccFloatA/B/C/D` (9–13s ease-in-out infinite) |
| Background blobs | `ccBlob`/`ccBlob2` (20–26s ease-in-out infinite) |
| Status dots | `ccPulse` (1.8s ease-in-out, staggered) |
| Pipeline dashed arrows | `ccDash` (1s linear infinite) |
| Progress bars | `ccGrow` (on mount) |

**Rule:** no Framer Motion on the landing page — CSS `transition`/`animation` only.

### AppSidebar (used by `AgentsPage.jsx`)
`width .22s cubic-bezier(.16,1,.3,1)` transition on collapse/expand; agent-card mount uses `ccReveal`-style stagger, hover lift `translateY(-3px)`.

### ChatPage / MyWorkPage (own scoped keyframes)
Message/card entrances use each page's own `ccRise`/`ccFade` (ChatPage) or `vRise`/`vCard` (MyWorkPage) keyframes — declared inline in the component, not in `index.css`. Both respect `prefers-reduced-motion` via a scoped media query.

---

## File Naming Conventions

- Pages: `PascalCase.jsx`
- Sub-components (inside a single file): plain functions, not exported
- Hooks: `camelCase.js` prefixed `use`
- API modules: `camelCase.js`
- Content/copy: `camelCase.js` (e.g. `landingContent.js`, `authContent.js`)

---

## What NOT to Do

- No hardcoded copy/data in landing JSX — text arrays belong in `landingContent.js`.
- No hardcoded copy in `HomePage.jsx` — marketing text belongs in `authContent.js`.
- No `styled-components`, no Emotion.
- No `console.log` in production code.
- No placeholder images (Unsplash/Lorem) — use inline SVGs or CSS shapes.
- Do not mix Tailwind utility classes into inline-style pages (Landing, Honne pages, AgentsPage).
- Do not use `--cc-*` CSS variables inside `LandingPage.jsx` — use the `C`/`FONT`/`GRAD` JS constants.
- Do not add Framer Motion to the landing page — CSS keyframes only.
- Do not add npm packages without noting them here.
