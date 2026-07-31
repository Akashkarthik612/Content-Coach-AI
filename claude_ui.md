# ContentCoach AI — UI State & Design System
> Single source of truth for all UI decisions. Never deviate from constraints without updating this file.
> Last updated: 2026-07-31 (**`ChatPage.jsx` section fully re-ported against the current file — the 2026-07-23 write-up had drifted to describing a component that no longer exists.** The old sub-component table (`ChatHistoryRail`/`ChatMenu`/`WelcomeState`/`AIMessage`/`ThinkingDots`) and its "chat history is local-state-only, no mock fallback" claims were replaced wholesale, not patched — see § ChatPage.jsx below for the current `Sidebar`/`MessageBubble`/`ActivityTimeline`/`AngleCard`/`WorkspaceView` shape. Two real features that were never documented at all were added: (1) a fully-worked-out **workspace with a real in-chat LinkedIn publish flow** (Connect/Publish button, version history) — `WorkspaceView` is no longer just a document-preview panel, it's the entire post-approval surface with its own Refine command assistant; (2) **persisted sidebar chat history** via new `getSessions()`/`getSessionThreads()` calls against a backend `chat_sessions` Store (7-day TTL) — per `CLAUDE.md`'s matching changelog entry, this backend piece is currently uncommitted work-in-progress, not yet on `main`. Also removed two stale doc-only references to a `supervisor_plan.md` file that does not exist anywhere in the repo (see `CLAUDE.md`'s directory map and Known Gaps, corrected in the same pass).)
> Previously (2026-07-30): `HomePage.jsx` re-skinned from an updated Claude Design mock, also named `Honne Auth.dc.html` — replaces the 2026-07-21 rust/serif version entirely with the green/cream palette (`accent #14663B`) that already matches `OnboardingPage.jsx`/`ChatPage.jsx`'s Honne branding, so the auth page is no longer a visually distinct fourth palette. Font moved from `EB Garamond`/`Hanken Grotesk` serif+sans to `Geist` (loaded via a scoped `@import`, same pattern `ChatPage.jsx` already uses — not added to `index.html` globally). Layout moved from `flex` to a `grid-template-columns:'1fr 1fr'` split with a rounded/pill visual language (radius on inputs/buttons/tabs, drop shadows, a radial glow on the brand panel) replacing the old page's square-edged one. The standalone **Username** signup field — previously the one deliberate deviation from the mock, added because `register()` needs a username — was removed to match this mock's fields exactly (Full name/Email/Password only); `handleRegister` now passes the Full name value through as the username argument instead, which is safe because `users.username` is nullable in Supabase mode (migration 0017) and local-auth mode is dev-only. See § HomePage.jsx below for the full breakdown.)
> Previously (2026-07-23): `ChatPage.jsx`'s `WorkspaceView` document panel rebuilt as the real "Honne Chat v3" LinkedIn-preview card, with the user's actual name/profession pulled from `GET /api/profile` — see § ChatPage.jsx → Workspace document panel below (the rest of that section was re-ported on 2026-07-31, see above).
> Previously (2026-07-21): HomePage.jsx rebuilt from the Claude Design mock `Honne Auth.dc.html` — replaces the old blue-themed 3-mode Login/Register/Forgot page with a two-tab Sign up/Log in page on the Honne rust/paper/ink palette; `authContent.js` rewritten to match; see § HomePage.jsx below. Note: this file had drifted behind `HomePage.jsx`/`OnboardingPage.jsx` for a while — the previous "Last updated" line was 2026-07-01 despite an already-documented 2026-07-21 OnboardingPage section; always spot-check against the actual component before relying on a stale entry.

---

## Product Identity

- **Name:** ContentCoach AI (displayed as "ContentCoach **AI**" with " AI" in `#3B82F6`)
- **Tagline:** "Your AI content team, running 24/7"
- **User:** Solo LinkedIn creators, bootstrapped founders, self-employed professionals, newsletter writers
- **Concept:** 5 specialized AI agents (Research, Writer, SEO, Repurpose, Analytics) + Publisher agent

---

## Tech Stack (Frontend)

| Concern | Choice | Notes |
|---|---|---|
| Framework | React 19 | No class components |
| Build | Vite | No CRA, no Next.js |
| Routing | React Router v6 | `<BrowserRouter>` in `main.jsx` |
| HTTP | Axios | Interceptor adds `X-User-Id` header |
| State | `useState` + `useContext` | No Redux/Zustand/Jotai |
| Animation | Framer Motion | High-impact moments only — not decorative |
| Styling (landing) | Inline styles + JS `const C/FONT/GRAD` | New landing uses hardcoded hex; no `--cc-*` |
| Styling (dashboard) | Inline styles + local JS const tokens (`BLUE`, `INK`, `FONT`, `SERIF`, `MONO`…) | Family name only — `DashboardPage.jsx` itself was removed 2026-07-29; these tokens live on in `MyWorkPage.jsx`/`AgentsPage.jsx`. Do NOT use `--cc-*` here despite the name |
| Icons | `lucide-react` + inline SVGs | Landing uses only inline SVGs; lucide for dashboard |

---

## CSS Variable Namespaces

### `--cc-*` — landing page + dashboard (inline-style pages)

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

### `--color-*` — shared component tokens (CSS modules)

Used by the surviving CSS-module components that aren't tied to any deleted page: `AIAssistant.module.css`, `components/shared/ContextMenu.module.css` (legacy skin only — see its `dashboard` variant for the inline-style equivalent).

```css
:root {
  --color-bg:           #FFFFFF;   --color-bg-soft:       #F8FAFF;   --color-bg-subtle:    #EEF2FF;
  --color-blue-primary: #2563EB;   --color-blue-light:    #DBEAFE;   --color-blue-dark:    #1D4ED8;
  --color-text:         #0F172A;   --color-text-muted:    #64748B;   --color-text-faint:   #94A3B8;
  --color-border:       #E2E8F0;   --color-border-focus:  #2563EB;   --color-accent:       #FEE2E2;
  --color-accent-dark:  #EF4444;   --color-success:       #10B981;   --color-warning:      #F59E0B;
}
```

---

## Typography

### Landing page (`LandingPage.jsx`)
| Font | Use |
|---|---|
| `Newsreader` (400/500/600, incl. italic) | ALL headings (H1–H3), big stat numbers, logo "C", social post avatars |
| `Hanken Grotesk` (400/500/600/700) | Body, nav links, buttons, labels, paragraph text |
| `JetBrains Mono` (400/500/600) | Eyebrow labels, metadata badges, percentages, timestamps, copyright |

Loaded via Google Fonts in `index.html` (`<link>`). Defined as `const FONT = { serif, sans, mono }` in `LandingPage.jsx`.

### Dashboard / vault app
| Font | Use |
|---|---|
| `DM Sans` (400/500/600) | All UI — labels, nav, buttons, body |
| `IBM Plex Mono` (400/500) | Version labels, code, metadata badges |
| `Fraunces` (variable 100–900) | Display / hero headlines only |

**Body default:** `font-family: 'Plus Jakarta Sans', sans-serif` (set in `index.css` — shadcn default; dashboard pages override per-element)

---

## Layout Utilities (index.css)

### Legacy dashboard/vault classes (`--cc-*` pages)
```css
@media (max-width: 768px)  { .cc-hide-mobile { display: none !important; } }
@media (min-width: 769px)  { .cc-show-mobile { display: none !important; } }
@media (max-width: 900px)  { .cc-hero-grid   { grid-template-columns: 1fr !important; } }
```

### New landing page classes (`lp-*`)
Breakpoints: **desktop ≥ 1024px**, **tablet 768–1023px**, **phone ≤ 767px**

| Class | Behaviour |
|---|---|
| `.lp-hide-phone` | hidden on phone (≤767px) |
| `.lp-show-phone` | hidden on desktop, visible on phone |
| `.lp-hero-stage` | visible desktop/tablet; `display:none` on phone |
| `.lp-hero-mobile` | hidden desktop/tablet; `display:flex column` on phone |
| `.lp-cta-row` | flex row → flex column on phone |
| `.lp-agent-grid` | 5-col → 3-col tablet → 1-col phone |
| `.lp-2col` | 2-col → 1-col phone (VoiceVault) |
| `.lp-3col` | 3-col → 2-col tablet → 1-col phone (Repurpose) |
| `.lp-pricing-grid` | 3-col → 1-col phone; `align-items:start` |
| `.lp-pipeline-row` | flex row → flex column phone; `.lp-pipeline-arrow-svg` rotates 90° |
| `.lp-workspace-grid` | `200px 1fr 268px` → `1fr 240px` tablet → `1fr` phone |
| `.lp-ws-sidebar` | hidden on tablet/phone |
| `.lp-ws-agents` | hidden on phone |
| `.lp-footer-inner` | space-between → centered column phone |
| `.lp-h2` | 48px → 40px tablet → 30px phone |
| `.lp-hero-h1` | 72px → 56px tablet → 40px phone |
| `.lp-section` | padding reduced on tablet/phone |
| `.lp-cta-chips` | hidden on phone (decorative floating chips) |
| `.lp-pro-lift` | `translateY(-12px)` removed on phone |

### CSS keyframes

**Landing (landing page only):**
```css
ccFloatA / ccFloatB / ccFloatC / ccFloatD  /* vertical float with optional tilt */
ccPulse    /* status dot opacity+scale pulse */
ccBlob / ccBlob2   /* background blob drift */
ccDash     /* animated dashed SVG stroke (linear timing) */
ccBlink    /* cursor blink (steps(1) timing) */
ccGrow     /* progress bar width from 0 */
```

**Dashboard (dashboard + shared):**
```css
ccReveal   /* card reveal: opacity:0 translateY(7px) → opacity:1 translateY(0), .38s cubic-bezier(.16,1,.3,1) */
ccPulse    /* shared with landing — status dot pulse */
ccDash     /* shared with landing — pipeline connector animation */
```

**Dashboard utility classes (index.css):**
```css
.cc-stagger            /* animation: ccReveal .38s cubic-bezier(.16,1,.3,1) both */
.cc-stagger-1 – .cc-stagger-5   /* animation-delay: .04s – .20s (40ms steps) */
.cc-hover-lift         /* transition: transform/box-shadow; :hover → translateY(-3px) + shadow */
.cc-press              /* :active → scale(.97) */
```
All respect `@media (prefers-reduced-motion: reduce)` — `animation:none; transform:none; transition:none` applied.

---

## Page Map

| Route | Component | Auth | Status |
|---|---|---|---|
| `/` | `pages/landing/LandingPage.jsx` | Public | ✅ Built |
| `/login` | `pages/HomePage.jsx` (mode=login) | Public | ✅ Built |
| `/register` | `pages/HomePage.jsx` (mode=register) | Public | ✅ Built |
| `/onboarding` | `pages/OnboardingPage.jsx` | RequireAuth | ✅ Built 2026-07-21 — first-run-only questionnaire |
| `/vault`, `/my-work` | `pages/MyWorkPage.jsx` | RequireAuth | ✅ Rebuilt 2026-06-16 |
| `/chat` | `pages/ChatPage.jsx` | RequireAuth | ✅ Built — primary AI interaction surface, **app home page as of 2026-07-29** |
| `/schedule` | `pages/SchedulePage.jsx` | RequireAuth | ✅ Built 2026-07-31 — calendar/momentum/content-runway view, ported from the "Honne Schedule" design; see `CLAUDE.md` changelog |
| `/agents` | `pages/AgentsPage.jsx` | RequireAuth | ✅ Built (undocumented below — see App.jsx) |
| `/app` | — | — | ❌ Removed — legacy MainApp stack deleted, not rebuilt |
| `/dashboard`, `/analytics` | — | — | ❌ Removed 2026-07-29 — `DashboardPage.jsx`/`AnalyticsPage.jsx` deleted outright; Chat is now the app's home page (see changelog in `CLAUDE.md`) |

**Post-login redirect:**
- **Register** (`HomePage.jsx`'s `handleRegister`) → `/onboarding` — every fresh signup lands on the onboarding questionnaire first, exactly once.
- **Login** (`handleLogin`) → `/chat` directly, unconditionally (changed from `/dashboard` on 2026-07-29) — an already-onboarded user (i.e. every returning login) never sees `/onboarding` again. There is no server-side "has this user onboarded" check yet (see `OnboardingPage.jsx` § below) — the redirect split lives entirely in `HomePage.jsx`'s two submit handlers, not in a route guard.

**App.jsx wiring:**
- `<ReviewQueueProvider>` wraps the entire `<Routes>` tree — so any page can push into the shared review queue.
- `/onboarding`, `/my-work`, `/vault`, `/chat`, `/schedule`, `/agents` all wrapped in `<RequireAuth>`
- `/vault` is an alias for `/my-work` (both render `MyWorkPage`)

**Deleted 2026-06-16 (dead code, confirmed unreferenced anywhere else before removal):**
`pages/MyWorkPage.jsx` · `components/Editor/` · `components/PostList/` · `components/Sidebar/` · `components/ui/button.jsx` · `lib/utils.js` · `AppContext.js` · `hooks/useFolders.js` · `hooks/usePosts.js` · `hooks/usePost.js` · `hooks/useTopics.js`. `components/shared/Button.jsx` / `Input.jsx` / `Badge.jsx` are now also unreferenced (only consumers were the deleted pages) but were left in place — not yet deleted.

---

## Landing Page Architecture

```
frontend/src/pages/landing/
├── landingContent.js    ← COPY object — data arrays only (agents, feed, pricing, footer). Edit copy here.
└── LandingPage.jsx      ← Single file; all sections as named functions + shared primitives
```

All old section files (`Hero.jsx`, `Navbar.jsx`, `Features.jsx`, `HowItWorks.jsx`, `Pricing.jsx`, `ProblemStrip.jsx`, `FinalCTA.jsx`) have been **deleted**. `HomePage.module.css` also deleted (orphaned).

### Design tokens in LandingPage.jsx
The landing page does **not** use `--cc-*` CSS variables. Colors are hardcoded as JS constants:
```js
const C    = { ink:'#111827', blue:'#3B82F6', indigo:'#6366F1', violet:'#8B5CF6', sky:'#0EA5E9', dark:'#0B1220', tint:'#F7FAFF', ... }
const FONT = { serif:"'Newsreader',...", sans:"'Hanken Grotesk',...", mono:"'JetBrains Mono',..." }
const GRAD = { sig:'linear-gradient(135deg,#3B82F6,#8B5CF6)', bi:'(135deg,#3B82F6,#6366F1)', text:'(120deg,...)' }
```

### Reusable primitives (defined inline in LandingPage.jsx)
- `<IconTile bg size radius>` — rounded square tile for agent icons
- `<ProgressBar pct color>` — 5px filled bar
- `<Eyebrow color>` — JetBrains Mono, uppercase, 0.14em tracking
- `<PulsingDot color delay size>` — 6px circle with `ccPulse` animation
- `<CheckIcon>` — blue SVG check for pricing feature lists
- `AGENT` map — keyed by agent name (`research/writer/seo/repurpose/analytics/publisher`); each entry: `{ color, bg, gradient, Icon }`

### Sections (order in LandingPage.jsx)
1. `Nav` — sticky blur (`rgba(255,255,255,.82)` + `backdrop-filter:blur(14px)`); logo = 32px gradient tile + "ContentCoach **AI**"; `.lp-hide-phone`/`.lp-show-phone` hamburger
2. `Hero` — ambient gradient blobs; centered copy (badge + H1 italic gradient + sub + CTA row); 7 absolutely-positioned floating cards in `.lp-hero-stage`; 3-card static stack in `.lp-hero-mobile` on phone; gradient fade strip
3. `TeamGrid` — `id="agents"`, `#F7FAFF` bg, 5-col agent cards with progress bars and pulsing status dots
4. `VoiceVault` — `#fff` bg, 2-col: left copy + stat row; right = outer `#F7FAFF` card → inner white card with mic icon header + 5-item green checklist
5. `Orchestration` — `#F7FAFF` bg; pipeline pill nodes connected by animated dashed SVG arrows; Row 1: Research→Writer→SEO; Row 2: Analytics→Publisher (gradient node)
6. `WorkspaceMockup` — `#fff` bg; browser-chrome outer (dots + URL bar); 3-pane grid: sidebar nav / editor with blinking cursor / agent workspace panel
7. `Repurpose` — `#F7FAFF` bg; 3-col grid: 5 format cards (LinkedIn, Medium, Newsletter, Blog, X Thread) + 1 gradient summary tile
8. `AlwaysOn` — `#0B1220` dark bg with floating blobs; activity feed glassmorphism card with 4 pulsing-dot rows
9. `Pricing` — `id="pricing"`, `#F7FAFF` bg; 3-col: Starter / Pro (blue border + `-12px` lift + "MOST POPULAR" ribbon) / Team
10. `FinalCTA` — `#0B1220` bg; 3 floating background agent chips (`.lp-cta-chips`, hidden on phone); H2 + sub + blue button
11. `Footer` — `#0B1220` bg; gradient logo + links + copyright

### CTA wiring
- Hero "Start Free" → `navigate('/register')`
- Hero "Watch Demo" → no-op (static button)
- Nav "Sign in" → `navigate('/login')` · "Start Free" → `navigate('/register')`
- Pricing "Start Free" (all tiers) → `navigate('/register')`
- FinalCTA "Start Free Today" → `navigate('/register')`

---

## HomePage.jsx (Sign up / Log in) — re-skinned 2026-07-30 (previously redesigned 2026-07-21)

Split-screen auth page implementing an updated Claude Design mock also named
`Honne Auth.dc.html` (same project, `ff122375-c3bc-4438-aece-706b0bd557b0`) — this pass
replaces every visual token from the 2026-07-21 version (rust accent, `EB Garamond`/`Hanken
Grotesk` fonts, square edges, `flex` layout) with a green/cream, `Geist`-font, pill-shaped
redesign that now matches `OnboardingPage.jsx`/`ChatPage.jsx`'s existing Honne green
branding — see Design tokens below. Content strings still live in `pages/authContent.js`;
component structure, state, and handlers are otherwise unchanged from the prior version.

### Layout
```
<div style="display:grid; grid-template-columns:'1fr 1fr'; min-height:100vh" className="honne-auth">
  <BrandPanel className="lp-hide-phone" />  ← hidden ≤767px (media query forces the grid to 1 column)
  <FormPanel />                             ← always visible
</div>
```
Grid instead of the prior version's `flex:1`/`flex:1` split — functionally equivalent
(`1fr 1fr`) but matches this mock's own `display:'grid'`. Still reuses the existing
`.lp-hide-phone` CSS utility for mobile collapse; a scoped `@media (max-width:767px)` rule
on `.honne-auth` collapses the grid to one column so the hidden brand panel doesn't leave a
dead empty column.

### Brand panel (`C.accent` `#14663B` green bg, `C.cream`/`C.mint` text)
- A radial `brandGlow` overlay (`radial-gradient` in the top-right corner, `position:absolute`,
  `zIndex:1`) sits behind the content (`zIndex:2`) — new in this pass, not present in the
  2026-07-21 version
- Top: "Honne" wordmark (Geist 600 30px, not serif anymore) + mono tagline "THE ART OF TRUE VOICE."
- Quote block: large quote mark (`❞`, Georgia serif — the only remaining serif on the page,
  matches the mock) + Geist-weight-500 pull-quote (`AUTH_COPY.brandQuote`, no longer italic)
  + small mono foot label "VOICE-NATIVE WORKSPACE"
- Bottom: mono copyright note "© 2026 Honne"

### Form panel (`C.paper` `#F4F2EA` bg)
- "← Back to home" link, absolute top-left (kept from the prior version — still not in the
  mock, kept so users aren't stranded; everything else follows the mock)
- Two-tab pill segment ("Sign up" / "Log in", white pill + green text on the active tab,
  `borderRadius:999` — replaces the prior version's square ink-bg tab) — drives `mode` state
  (`'signup' | 'login'`), remounted via `key={mode}` on the form-inner wrapper to replay the
  `authFade` entrance animation on every switch
- Heading + subheading from `AUTH_COPY.signup` / `.login` per mode
- **Sign up fields: Full name · Email · Password only** — the standalone **Username** field
  added in the 2026-07-21 version (a deliberate deviation from that mock, since `register()`
  needs a username) is now **removed** to match this mock's fields exactly. `handleRegister`
  passes `form.name` (Full name) through as the username argument to `register()` instead —
  safe because `users.username` is nullable in Supabase mode (migration 0017, the prod
  default) and local-auth mode (`AUTH_PROVIDER=local`) is dev-only, so a collision there is a
  non-issue in practice
- **Log in fields:** Email · Password, with a "Forgot?" mono link inline in the label row —
  still a placeholder (`Known Gaps`: forgot-password has no backend endpoint); clicking it
  shows an inline "Password reset isn't available yet" message
- Submit button: full-width, pill-shaped (`borderRadius:12`), `C.accent` bg with a matching
  green drop shadow, darkens to `C.accentHover` + lifts 1px on hover (`useState` hover flag,
  unchanged mechanism from the prior version — just restyled)
- Divider "or continue with" + Google button (pill-shaped, border brightens to accent-tinted
  green + lifts 1px on hover) — calls the real `googleSignIn()` (Supabase OAuth as of the
  `dab7872` auth migration, no longer a no-op placeholder); no eye-toggle on password fields,
  the mock doesn't have one
- Switch-mode line ("Already have an account? Log in" / "Don't have an account? Sign up")
- Legal line: "By continuing you agree to Honne's Terms & Privacy Policy." (links are
  `href="#"` placeholders, matching the mock)

### Design tokens (inline, no CSS vars — now the SAME green palette as `OnboardingPage.jsx`'s
`C.green`/`C.greenHov`, not a distinct one; still don't merge with Dashboard's cool blue or
ChatPage's warm palette)
```js
const C = {
  paper:'#F4F2EA', ink:'#1B1C14', accent:'#14663B', accentHover:'#0F4C2C', card:'#FFFFFF',
  hair:'rgba(27,28,20,0.12)', glow:'rgba(205,235,214,.22)', cream:'#EAF3EC', mint:'#CDEBD6',
  muted:'#7A7C6C', faint:'#9A9C8C', faint2:'#A6A895',
  errText:'#B91C1C', errBg:'#FEF2F2',
}
const GEIST = "'Geist', system-ui, sans-serif"
const MONO  = "'JetBrains Mono', monospace"
```
`Geist` is **not** loaded in `index.html` globally — it's pulled in via a scoped `@import`
inside `HomePage.jsx`'s own `<style>` block, the same pattern `ChatPage.jsx` already uses for
the same font. `JetBrains Mono` is already loaded globally in `index.html` (shared with the
old version). `EB Garamond`/`Hanken Grotesk` are no longer referenced by this page at all
(still loaded globally for other pages that use them).
A scoped `<style>` block (className `honne-auth`) declares the `@import`, the `authFade`
keyframe, `input::placeholder` color, a scoped `::selection` color, and the mobile grid
media query — deliberately not the mock's global `a{}` override, which would leak the green
link color onto every anchor in the app; anchors are styled inline per-element instead.

### Shared primitives (module-level, not inside render)
- `GoogleSVG` — inline Google "G" icon (24px viewBox, unchanged from the prior version)
- `st` — style table object mirroring the mock's own `st`, `tabOn`/`tabOff`,
  `submitBase`/`submitHover`, `googleBase`/`googleHover` constants
- `focusable` — shared `onFocus`/`onBlur` pair that sets `border-color` to the accent green
  and `box-shadow` to a soft green focus ring; the mock declared the `transition` on `.input`
  but never wired an actual focus state, so this (carried over from the prior version) fills
  that gap

### Auth API (`api/auth.js`) — unchanged by this pass
Already migrated to Supabase JWT auth (see the `dab7872` changelog entry at the top of
`CLAUDE.md`) with an isolated local-auth dev fallback (`VITE_AUTH_MODE=local`) — this
restyle did not touch `auth.js`, `localAuth.js`, or either backend auth path. The one
functional change in `HomePage.jsx` itself is `handleRegister` now calling
`register(form.name, form.email, form.password)` instead of
`register(form.username, form.email, form.password)`, since the Username field is gone.

### authContent.js (`pages/authContent.js`)
Same shape as before — `AUTH_COPY.brand`/`.brandTagline`/`.brandQuote`/`.brandFootLabel`/
`.brandNote` (brand panel), `.tabs`, `.signup`/`.login` (heading, sub, placeholders,
submit/submitting labels), `.switchMode`, `.google`, `.legal` — with `.signup.usernamePlaceholder`
removed (dead after the Username field's removal above). Edit copy here; page component
reads `AUTH_COPY.*`. Never hardcode auth copy in `HomePage.jsx`.

**Do NOT touch in `HomePage.jsx`:** `handleLogin`, `switchMode`, or anything in `auth.js`/`localAuth.js`.

`handleRegister` navigates to `/onboarding` on success — see `OnboardingPage.jsx` below. `handleLogin` navigates straight to `/chat` (Dashboard removed 2026-07-29, Chat is the app's home page). `App.jsx`'s routing is otherwise unchanged: `/login` → `<HomePage initialMode="login" />`, `/register` → `<HomePage initialMode="register" />` (mapped internally to `mode: 'signup'`).

---

## OnboardingPage.jsx (`/onboarding`) — built 2026-07-21

First-run-only questionnaire shown exactly once, immediately after a brand-new signup (`HomePage.jsx`'s `handleRegister` → `navigate('/onboarding')`). Ported from the approved Claude Design mock `ContentCoach AI - Onboarding.dc.html`. UI + client-side flow only — **no backend persistence yet**; answers are held in local component state and (on finish) mirrored into `localStorage` only. The `user_profile` table/`/api/profile` endpoints described elsewhere in this doc are a separate, still-unwired backend feature — wiring this page's answers into that table is a deliberately deferred follow-up, not done here.

### Design tokens (Honne palette — distinct from every other page's tokens)
```js
C = {
  bg: '#F4F2EA', ink: '#1B1C14', green: '#14663B', greenHov: '#0F4C2C', rust: '#B0663A',
  sub: '#9A9C8C', faint: '#A6A895', muted: '#6C7064', chipText: '#3A3C30',
  chipBrd: 'rgba(27,28,20,.12)', track: 'rgba(27,28,20,.08)', divider: 'rgba(27,28,20,.05)',
  rowLbl: '#A6A895', rowVal: '#26281C',
}
SERIF = "'EB Garamond', serif"   SANS = "'Hanken Grotesk', system-ui, sans-serif"   MONO = "'JetBrains Mono', monospace"
```
This is a fourth, independent palette alongside HomePage's blue (`C.blue`), Dashboard's cool blue, and ChatPage's warm palette — do not reuse or merge them. Both `EB Garamond` and `Hanken Grotesk`/`JetBrains Mono` are already loaded globally in `index.html`; no new font `<link>`s were added.

### Flow
```
Top bar: "ContentCoach" wordmark (green, EB Garamond) + "Skip for now →" (hidden once done)
  │
  ▼
7-question wizard (one per screen, `obRise` keyframe on step change)
  Step 1  profession  chips   single
  Step 2  industry    chips   single
  Step 3  role         text    optional (free text, "Skip this" if empty)
  Step 4  audience     text    optional
  Step 5  goals        chips   multi
  Step 6  topics       chips   multi
  Step 7  style        chips   single
  │  each step: progress bar + "Step N of 7", eyebrow, EB Garamond title, italic sub
  │  Back / Continue nav; Continue disabled until a required chip step has a selection
  ▼
Done screen — checkmark tile, "You're all set", summary card (only non-empty answers shown),
"Start writing →" button → finish()
```
`finish()` sets `localStorage['cc_onboarded_' + user_id] = '1'` (falls back to a bare `cc_onboarded` key if `user_id` is somehow absent) and `localStorage['onboarding_answers']`, then `navigate('/chat')` (changed 2026-07-29, was `/dashboard`). "Skip for now" jumps straight to the done screen with whatever was answered so far (summary card simply shows fewer/no rows) — it does not bypass the flow entirely, matching the original mock's behavior.

### What's real vs deferred
| Piece | Status |
|---|---|
| 7-step chip/text wizard, progress bar, back/continue, skip | ✅ Real — full client-side state machine |
| Register → onboarding → dashboard routing | ✅ Real — wired in `HomePage.jsx` + `App.jsx` |
| Answers persisted anywhere durable | ❌ Not done — `localStorage` only, no `POST /api/profile` call yet (that endpoint exists per this doc's backend section but isn't called from here) |
| "Already onboarded" enforcement | ⚠️ Soft — only enforced by the register-vs-login redirect split, not a route guard; a user could still navigate to `/onboarding` manually after their first run |

### Follow-up (not yet done)
Wiring `finish()` to `POST /api/profile` (mapping `profession`→`role`, `industry`→`industry`, `audience`→`target_audience`, `style`→`writing_style`, `goals`/`topics` folded into `formatting_prefs` or a new column) so the questionnaire actually populates `user_profile` is explicitly out of scope for this pass — the user asked for UI + routing only, DB wiring is a separate task.

---

## DashboardPage.jsx — ❌ REMOVED (2026-07-29)

`DashboardPage.jsx` (post-login home, redesigned 2026-06-16 — agent cards, content pipeline, analytics stat cards) was deleted outright, along with its route (`/dashboard`) and the `useAnalytics.js` hook it shared with `AnalyticsPage.jsx`. **Chat is now the app's home page** — both login (`HomePage.jsx`'s `handleLogin`) and onboarding completion (`OnboardingPage.jsx`'s `finish()`) navigate straight to `/chat`. See the dated changelog entry at the top of `CLAUDE.md` for the full list of touched files.

`components/shared/AppSidebar.jsx` survives (still used by `MyWorkPage.jsx` and `AgentsPage.jsx`) but its `NAV_ITEMS` dropped the `Dashboard`/`Templates`/`Analytics` entries — remaining: Start Writing (`/my-work?new=1`), Agents, Content Vault, Chat. Its collapsible-sidebar mechanics (`collapsed`/`onToggle` props, 248px/64px widths, calendar widget) are otherwise unchanged from what's described below for historical/design reference — only the nav item list and its default `activeKey` (now `'content'`, was `'dashboard'`) changed.

### Sidebar — `components/shared/AppSidebar.jsx` mechanics (still accurate)
- **WHITE** background (`#FFFFFF`) with `border-right: 1px solid rgba(17,24,39,0.07)`
- Collapsible: caller owns `collapsed` state, passed as `collapsed` + `onToggle` props (`MyWorkPage`'s `sidebarCollapsed`, also reused as its focus-mode flag when a post is open; `AgentsPage`'s own `sidebarCollapsed`)
- Expanded (248px): logo text visible, nav labels, full calendar widget, user name
- Collapsed (64px): icon-only nav (with `title` tooltips), calendar icon shortcut, avatar only
- Transition: `width .22s cubic-bezier(.16,1,.3,1)` on `<aside>`
- Toggle chevron button in header row (‹ = collapse, › = expand)
- Nav items (exported as `NAV_ITEMS`, as of 2026-07-29): **Start Writing** (navigates to `/my-work?new=1`, which auto-creates a post and opens it directly in `DocEditor`) · Agents · Content Vault · Chat
- `activeKey` prop selects the highlighted item (`MyWorkPage` passes `'vault'` on `/vault`, else `'content'`; `AgentsPage` passes `'agents'`)
- Calendar widget (click → `onCalendarOpen`; only `MyWorkPage`/`AgentsPage` remain as callers — neither currently wires it to an actual calendar panel, defaults to a no-op)
- User row at bottom: avatar + name + Pro plan + sign-out dots button

---

## ChatPage.jsx (`/chat`) — primary AI interaction surface

Full-screen agent chat in the Honne green/cream palette (`#F4F2EA` canvas, accent `#14663B`), font `Geist` (scoped `@import`, same pattern as `HomePage.jsx`). The app's home page — see `CLAUDE.md`'s 2026-07-29 changelog entry.

> **Re-ported 2026-07-31** against the actual current file (1,380 lines) — the previous version of this section (dated 2026-07-23, describing `ChatHistoryRail`/`ChatMenu`/`WelcomeState`/`AIMessage`/`ThinkingDots`/mock-stream-fallback) had drifted far enough that it was describing a component that no longer exists in any form; that write-up is gone, not patched. The component has also gained real persisted chat history and a real in-chat LinkedIn publish flow since 2026-07-23 that were never documented at all — both are covered below. Per `CLAUDE.md`'s top-of-file changelog, the persisted-history piece (`getSessions()`, the backing `chat_sessions` Store) is currently uncommitted.

### Design tokens
```js
BG='#F4F2EA'  SIDEBAR_BG='#EFEDE3'  INK='#1B1C14'  ACCENT='#14663B'  ACCENT_TINT='rgba(20,102,59,.09)'
MUTED='#6C7064'  MUTED_2='#8A8C7C'  MUTED_3='#A6A895'  HAIRLINE='rgba(27,28,20,.09)'
DANGER='#B42318'  LI_BLUE='#0A66C2'  (LinkedIn brand blue — Connect/Publish button)
FONT="'Geist', system-ui, sans-serif"   MONO="'JetBrains Mono', monospace"
```
`Geist`+`JetBrains Mono` are pulled in via a scoped `@import` inside the component's own `KEYFRAMES` template string (not a global `index.html` `<link>`), alongside the `ccRise`/`ccFade`/`ccBreathe`/`ccCaret` keyframes and a `prefers-reduced-motion` override.

### Layout
Two mutually-exclusive top-level views, switched by `view` state (`'chat' | 'workspace'`):
```
view === 'chat':
┌──────────┬───────────────────────────────────────────────┐
│ Sidebar  │ header (brand + status dot + New button)       │
│ 256/58px │ empty-state greeting  OR  message stream       │
│ collaps- │ Composer (docked, auto-sizing textarea)         │
│ ible     │                                                 │
└──────────┴───────────────────────────────────────────────┘

view === 'workspace' (replaces the whole page, not a side panel):
┌──────────┬──────────────────────────────────────────────────┐
│ Refine   │ header (← Chat / title / pills / Approve-Decline  │
│ command  │         or decision pill / Copy / History / LinkedIn) │
│ assistant│ Edit|Preview toggle                               │
│ 300/56px │ LinkedIn-preview card (avatar, name, profession)  │
└──────────┴──────────────────────────────────────────────────┘
```
`ChatPage` uses the shared `HonneSidebar` (`components/shared/HonneSidebar.jsx`, extracted 2026-07-31) — still does NOT use `AppSidebar` used by `MyWorkPage`/`AgentsPage` (blue/indigo palette, unrelated component); `HonneSidebar` is its own green/cream sibling, now shared between `ChatPage` and the new `SchedulePage` instead of living inline in `ChatPage.jsx` (see `CLAUDE.md`'s 2026-07-29 entry, which called the ChatPage/AppSidebar divergence a deliberate, still-unresolved gap — that gap is unchanged, only the ChatPage-vs-Schedule duplication was resolved).

### Sub-components (all inline in `ChatPage.jsx` unless noted, not exported)
| Component | Responsibility |
|---|---|
| `HonneSidebar` (`components/shared/HonneSidebar.jsx`) | Collapsible aside (256px open / 58px collapsed, `PanelLeft` toggle). New chat button, `SIDE_NAV` (Chats/Vault/**Scheduled** enabled, each navigating via the caller-supplied `navigate` prop; Analytics still rendered inert, no page behind it), search box, persisted chat list (see below), account footer (initial avatar + username, inert Settings button). Takes an `activeNav` prop (`'chat'` here, `'scheduled'` on `SchedulePage`) to highlight the right icon and skip re-navigating to the current page |
| `MessageBubble` | Renders one message. `role==='user'` → right-aligned accent-green bubble. `role==='ai'` → agent-icon tile ("H") + `ActivityTimeline` + streamed text + one of 3 body kinds (`angles`/`draft`/`direct`) once `phase==='done'` |
| `ActivityTimeline` / `ActivityRow` | Collapsible "Working…" / "Done · N steps" panel; flat, id-keyed activity list upserted in place via `upsertActivity()`, nested one level via `parentId`. Fed by real `activity` SSE events (`backend/ai/activity.py`) — never renders a node/tool/agent name, only whatever title the backend sent |
| `AngleCard` | One research angle: mono provokes-type tag, title, argument, optional glimpse text, "For: {audience}" + optional Source link, inline Expand/Refine panel, "Draft for LinkedIn" (LinkedIn-branded) + "Expand" actions |
| `Composer` | Docked auto-sizing textarea + send button; Enter sends, Shift+Enter newlines |
| `WorkspaceView` | Full post-draft workspace — see below |
| `LinkedInGlyph` | Inline LinkedIn "in" SVG mark — used on the angle card's "Draft for LinkedIn" button and the workspace's Publish/Connect button (no icon package ships this mark) |
| `NavIcon` (in `HonneSidebar.jsx`) | Renders one `SIDE_NAV` icon from its `'|'`-joined multi-path string |

### Research angle cards (`msg.kind === 'angles'`)
Rendered once `researcher_node` → `angle_review_node` produces the 5 `ResearchAngle`s and the graph pauses (`status: 'awaiting_angle_selection'`). Two display modes toggled by a header button: **expanded** — `AngleCard`s in a vertical `flex-column` stack (each showing title/argument/glimpse/audience/source, an inline Expand panel, and a Refine input) — or **collapsed** — a single row of small pill chips (title only, click to draft). This replaced the horizontal-scrolling-row layout from 2026-07-23 (itself a deliberate deviation from the "Honne Chat v3" source design's vertical stack) — the row scroll approach is gone; the current layout matches the source design's vertical stack after all, plus the new collapse toggle which has no equivalent in that design.
Per-card actions: **Draft for LinkedIn** (`onPick` → `resumeAI(threadId, 'pick', '', index)` — chains into the writer, opening a fresh `awaiting_approval` draft that replaces this same message's body and opens `WorkspaceView`); **Expand** (`onExpand` → `resumeAI(threadId, 'expand', '', index)` — grounded summary sections shown inline, expandable/collapsible); once expanded, an inline **Refine** input (`onModify` → `resumeAI(threadId, 'modify', instructionText, index)`) lets the user revise that angle's expanded sections repeatedly in place — the backend, not the frontend, tracks the "current version" of an angle's expanded content. Below the angle list, "None of these fit? Just type what you'd rather see" — typing in the composer while the latest AI message is still an unresolved `angles` message routes through `sendAsAngleGuidance()` instead of a fresh `send()`, which calls `resumeAI(threadId, 'none_fit', text)` on the SAME paused thread rather than starting a new one.

### Persisted chat history (uncommitted — see `CLAUDE.md`'s top-of-file changelog)
The sidebar's `chats` list is fetched from the backend on mount via `getSessions()` (`GET /api/ai/sessions`, backed by a new `chat_sessions` Store namespace with a 7-day TTL — not `thread_registry`) and mapped to `{id, sessionId, title, time}`; `currentSessionId` persists to `localStorage['lastSessionId']` and is restored on reload if still present in the fetched list. `selectChat()` calls `getSessionThreads(chat.sessionId)` and rehydrates the whole message list via `threadToMessages()` (handles all three terminal shapes: `awaiting_angle_selection`, `awaiting_approval`, and completed-with-or-without-a-draft, including re-showing the correct approve/edit/decline badge from `approval_status`). **Deleting a chat row is local-only** — it removes the entry from that browser tab's React state but does not call any backend delete endpoint (none exists); the record persists server-side until its 7-day TTL sweep. `newChat()` mints a fresh `crypto.randomUUID()` session id and pushes the outgoing chat into the sidebar list immediately (optimistic — not yet confirmed by a `getSessions()` refetch).

### Message lifecycle
Each exchange creates a `user` message and an `ai` message; the AI message's `phase` moves `working` (no text yet, `ActivityTimeline` expanded) → `streaming` (text accumulates token-by-token via SSE, blinking caret) → `done`, at which point `kind` (`'angles' | 'draft' | 'direct'`) determines which body renders. A `draft`-kind message with no `decision` yet shows "Open Workspace →" + Copy; once decided, shows the approved/edited/declined pill (+ Regenerate on decline).

### Two-path sending architecture
```
last AI message is an unresolved 'angles' message → sendAsAngleGuidance()
                                                      → resumeAI(threadId, 'none_fit', text) on the SAME paused thread
anything else                                       → send() → streamQuery() → POST /api/ai/stream (SSE)
```
There is no client-side `refineAI`-vs-`streamQuery` branch on the main composer anymore — `refineAI` is only used inside `WorkspaceView`'s left-panel command assistant (`submitWsCmd()`), never on the main chat composer.

### WorkspaceView — full post-draft workspace (replaces `WorkspaceView`'s 2026-07-23 "document panel" description below, still accurate as far as it goes)
Opened via "Open Workspace →" (from a `draft`-kind message) or automatically the moment a draft is produced (angle pick or fresh write). Two-column layout:
- **Left ("Refine") panel** (300px/56px collapsible) — a chat-style command assistant: a scrollback of past refine commands + their one-line confirmation, 3 quick-action chips ("Make the hook stronger" / "Add statistics" / "Shorten this"), and an input wired to `submitWsCmd()` → `refineAI(ws.docText, note)` (`POST /api/ai/refine`, single LLM call, no graph) — replaces the draft text in place
- **Right (document) panel** — Edit/Preview tab toggle over the same real "Honne Chat v3" LinkedIn-preview card documented below (44px avatar, real user name + `professionLine`); Edit mode is a plain auto-growing `<textarea>`, Preview mode is read-only with the Like/Comment/Repost/Send action row
- **Header** — back-to-chat, title + LinkedIn-Post/read-time/word-count pills, then either Approve/Decline (undecided) or the decision pill (approved/edited/saved), Copy, History (toggles a version list fetched via `getVersions(postId)` from `vault.js`), and a real LinkedIn-branded **Connect LinkedIn / Publish to LinkedIn** button (`getLinkedInStatus()`/`getLinkedInAuthUrl()`/`publishToLinkedIn()` from `api/linkedin.js` — same OAuth/publish flow `MyWorkPage.jsx`'s `DocEditor` uses, now also reachable directly from chat without leaving to the Vault)
- Approve (`wsApprove`) calls `resumeAI(threadId, 'edited', docText)` if the text was changed from the original draft, else `resumeAI(threadId, 'approved')`; Decline (`wsDecline`) calls `resumeAI(threadId, 'rejected')` and returns to chat

### Workspace document panel — LinkedIn-preview card (built 2026-07-23, still accurate)
The right-panel card is the real "Honne Chat v3" `.dc.html` markup: a `#fff` card with a 44px circular avatar (accent bg, user's initial), the real logged-in user's name (`localStorage.username`), and their profession — `professionLine = profile?.profession || profile?.role || 'Creator on Honne'`, where `profile` comes from `getProfile()` (`frontend/src/api/profile.js`, `GET /api/profile`) fetched once on mount and resolved to `null` instead of throwing on the backend's 404-when-no-profile-row case. Every request carries the current auth header (same interceptor as the rest of the app) and the backend scopes the row to it — this can only ever show the requesting user's own data. Edit mode's textarea has an "Editable" pill badge in the card header; Preview mode's fake post-age reads "Draft preview" (not a fabricated "2d") since the post hasn't actually been published yet.

### API calls
```js
streamQuery(text, sessionId, onToken, onDone, onError, onActivity)  // SSE — main composer, first/subsequent messages
resumeAI(threadId, action, content, angleId)                       // approve/edited/rejected/pick/expand/modify/none_fit
refineAI(draft, note)                                              // POST /api/ai/refine — workspace's Refine panel only
getSessions()                                                      // GET /api/ai/sessions — sidebar chat list (uncommitted)
getSessionThreads(sessionId)                                       // GET /sessions/{id}/threads — rehydrates one chat's messages
getLinkedInStatus() / getLinkedInAuthUrl() / publishToLinkedIn()    // workspace's Connect/Publish button
getVersions(postId)                                                 // workspace's History toggle (from vault.js)
getProfile()                                                        // workspace card's name/profession line
```
There is no mock/simulated-stream fallback anywhere in the current file — an SSE or resume failure surfaces as an inline error message on that AI message (`msg.error`) or the workspace (`ws.error`), not a fabricated typed-out response.

### What's real vs mock
| Feature | Status |
|---|---|
| SSE streaming to backend | ✅ Real — `streamQuery()` hits `/api/ai/stream` |
| HITL approve/decline, angle pick/expand/modify/none_fit | ✅ Real — `resumeAI()` hits `/api/ai/resume` |
| Draft refinement (workspace Refine panel) | ✅ Real — `refineAI()` hits `POST /api/ai/refine` (single LLM call, no graph) |
| Persisted sidebar chat history | ⚠️ Real but uncommitted — `getSessions()`/`chat_sessions` Store, see `CLAUDE.md` changelog |
| In-chat LinkedIn publish | ✅ Real — same OAuth/publish flow as `MyWorkPage.jsx`, reachable from `WorkspaceView` |
| Sidebar Scheduled nav item | ✅ Real, built 2026-07-31 — navigates to `/schedule` (`pages/SchedulePage.jsx`) |
| Sidebar Analytics nav item | ⚠️ Inert — no page behind it, `enabled: false` in `SIDE_NAV` |
| Deleting a chat row | ⚠️ Local-only — no backend delete endpoint; row reappears after the TTL window if refetched before the 7-day sweep |
| Streaming/refine fallback on error | ❌ None — no mock simulation; errors render inline instead |

---

## SchedulePage.jsx (`/schedule`) — built 2026-07-31

Ported from the "Honne Schedule" Claude Design project file (`ff122375-c3bc-4438-aece-706b0bd557b0`, `Honne Schedule.dc.html`), reached via the sidebar's now-enabled **Scheduled** nav item. Single file, sub-components inline except the shared `HonneSidebar` (`activeNav="scheduled"`).

```
┌──────────┬─────────────────────────────┬──────────────┐
│ Honne    │ header (Publishing / Schedule│ Momentum     │
│ Sidebar  │ eyebrow + h1 + subtitle)     │ (streak,     │
│ 256/58px │ Calendar (month grid, day    │  history,    │
│          │ detail panel on select)      │  progress,   │
│          ├──────────────────────────────┤  message)    │
│          │ Upcoming runway (This week /│              │
│          │ Next week rails, CTA banner) │              │
└──────────┴─────────────────────────────┴──────────────┘
```

**Sidebar chrome deviates from the source design on purpose:** the `.dc.html` file ships its own white-bg/`#F7F8F5`-sidebar copy of the nav rail, but this page uses the same cream/green `HonneSidebar` `ChatPage` already established as canonical in-app, for a consistent navigation surface across both pages — only the main content area (calendar/momentum/runway) uses the source file's own white/grey token set.

### Sub-components (all inline, not exported)
| Component | Responsibility |
|---|---|
| `FlameIcon` | Inline streak-flame SVG mark (dim variant for "scheduled but not yet published" day markers vs. full-opacity for a day with at least one published post) |
| Calendar grid | Mon-first month grid (`weeks` from a `useMemo` keyed on `cal.year`/`cal.month`), each day cell showing the date number (accent-filled if selected, tinted ring if today) and a flame glyph if any post falls on that day |
| Day detail panel | Expands below the grid on day select (`selKey`) — lists that day's posts (time/channel icon/title/status pill) or a dashed "Nothing scheduled this day" + "Plan this day" CTA |
| Momentum panel | Streak label (presentational `STREAK_WEEKS` constant, not derived data — see below), 12-bar history strip, "This week N/5 scheduled" progress dots (filled/flame-next/empty), a momentum message string keyed off `progressDone`, and a static "5 days a week" tip box |
| Upcoming runway | "This week" rail (5 rows, Mon–Fri from the real current week, each either a post row with a kebab menu or an empty "Plan" row) + "Next week" rail (read-only, posts already scheduled 7–13 days out) + a bottom CTA banner whose title/button/action also key off `progressDone` |

### What's real vs mock
| Feature | Status |
|---|---|
| Sidebar (nav, search, persisted chat list, New chat) | ✅ Real — same `HonneSidebar` + `getSessions()` as `ChatPage.jsx`; clicking a recent chat sets `localStorage['lastSessionId']` and navigates to `/chat`, which rehydrates it |
| Calendar navigation, day selection, day detail panel | ✅ Real, client-side state — month grid math and day-detail toggling are fully interactive |
| Scheduled posts (`posts` state), momentum streak/history, "Plan"/"Cancel post"/kebab menu actions | ❌ Mock — client-only local state seeded around the real current date, ported 1:1 from the source design's own placeholder `TITLES`/`PLATS`/`TIMES` mock arrays and streak math. **No backend endpoint exists yet** for listing or creating scheduled posts by date range — `posts.scheduled_at` exists on the `Post` model and `PATCH /posts/{id}/status` can set it, but nothing reads a calendar view back out of it. "Open in editor" / "Reschedule" kebab-menu actions are inert (close the menu only); "Cancel post" removes the mock row locally only |
| `STREAK_WEEKS` (12-week streak label + history bars) | ❌ Mock — a fixed presentational constant (mirrors the source design's own configurable prop default), not computed from real publish history |

---

## MyWorkPage.jsx (`/vault`, `/my-work`) — rebuilt 2026-06-16

Single file (per File Naming Conventions — sub-components inline, not exported). Column 1 is now the **shared `AppSidebar`** component (see below) — the old inline `--cc-*`/DM Sans shell sidebar is gone. Column 2 ("Canvas") shows either the **Content Vault** browsing view (no post open) or the redesigned `DocEditor` (post open).

### Content Vault view (browsing — no post open)

Faithful port of the approved `ContentCoach AI - Vault.dc.html` design per `ContentCoachAI-Vault-ClaudeCode-Prompt.md` §A: header ("Content Vault" + Import Content/New Folder) → search bar (clears with ✕, searches title + folder name across all folders) → two-panel body (260px folder rail | post grid). Folder tiles use a 5-color rotating tint palette (`FOLDER_TINTS` in `hooks/useVault.js`) since real folders have no inherent "platform". Post cards show a **status pill** (real `post.status`, not a fictional platform) + version chip + 2-line-clamped title + "Updated {relative} · Open ↗" footer; clicking a card sets `activePost` (same mechanism as before) to open `DocEditor`.

**Deviates from the prompt's literal §B1 ("mock data now"):** `useVault()` is wired to the **real backend** (`getFolders`/`getPostsInFolder`/`createFolder`/`createPost`) instead of the spec's hardcoded LinkedIn/Blog/Newsletter/Reddit/Research mock set — a deliberate call so the page shows the user's actual folders/posts and "Open" leads to a working editor. Import Content (§B4) and the Trending/Audience-style extras are left as disclosed TODO stubs; New Folder (§B3) is real (creates via `createFolder`, no color/platform field since real folders don't have one). Folder rail's responsive collapse-to-scroller under ~720px (§D5) was not implemented.

**3-dot menus (added 2026-06-23):**
- **PostCard** — rebuilt as `<div>` (was `<a>`); `···` button in top-right corner opens a ContextMenu (`variant="dashboard"`) with: **Rename** (inline input replaces title text; `PATCH /posts/{id}`), **Pin** (toggles `is_pinned` pin badge; `PATCH /posts/{id}/pin`), **Delete** (`window.confirm` → `DELETE /posts/{id}` → `removePost()` optimistic state; pgvector rows cascade automatically via FK). Signature: `PostCard({ post, index, onOpen, onDelete, onRename, onPin })`.
- **FolderRail** — `···` button per folder item opens a ContextMenu with: **Rename** (inline input replaces folder name text; `PATCH /folders/{id}`), **Delete** (count-aware `window.confirm` → `DELETE /folders/{id}` → `removeFolder()` + resets `selectedFolderId` to the next remaining folder if the deleted folder was selected). Signature: `FolderRail({ folders, postsByFolder, selectedId, onSelect, onDeleteFolder, onRenameFolder })`.

### DocEditor (post open) — built 2026-06-16, unchanged by the Vault rebuild

Redesigned to match `ContentCoachAI-TextEditor-ClaudeCode-Prompt.md` + the `image_text_editor.pdf` mockup, using dashboard-family tokens (`Newsreader`/`Hanken Grotesk`/`JetBrains Mono`, local JS consts — same family `DashboardPage.jsx` used before its 2026-07-29 removal).

**DocEditor layout (top to bottom):**
1. **TopBar** — logo, status dropdown (Draft/In review/Scheduled/Published — opens a `ContextMenu` with "Mark as in review"), platform dropdown (LinkedIn/X/Reddit), `✓ Saved`/`Unsaved` indicator, **Share** (copies draft to clipboard via `navigator.clipboard`), **Publish** (opens `SchedulePublishSheet`).
2. **3-column row:**
   - **HistoryRail** (left, resizable 240–420px via `useResizableRail('cc_leftW',...)`) — "History" header + "Diff" toggle (UI-only stub) + big **"+ Save as v{N}"** button + vertical version cards (active = blue border/tint, relative-time label, content-label preview). Right-click a card → `ContextMenu` (Rename label / Delete version / Pin to top / Review later / Mark milestone — last 3 are TODO stubs, no backend field exists).
   - **Center column** — `FormattingToolbar` (H1/H2/H3/Bold/Italic/Quote/Link — inserts **Markdown syntax** into the plain `<textarea>` at the cursor/selection via `applyMarkdown()`, not a WYSIWYG/contentEditable editor) → title (32px bold Newsreader) → status·platform subline → read-only banner + Restore (non-latest versions) → body textarea → footer stats (word count, read time, dirty/saved state, `chars / 3000` with a "cut at 210" LinkedIn preview-truncation marker).
   - **Right rail** (resizable 240–460px) — **ResearchCard** (Vault/Trending/Audience tabs; Vault tab is real via `getRecentPosts()`, Trending/Audience are TODO-stub "Coming soon"; "Insert into draft" appends a reference line) → **WritingActionsCard** ("Rewrite in your voice" opens `StyleAgentModal`; "Sounds like me?" is a TODO-stub verdict) → **MetricsCard** (real `updatePostAnalytics()`; muted pre-publish, doesn't refetch existing values on reopen — no GET-single-post-analytics endpoint exists).
3. **AICommandBar** (bottom, full width under center+right) — quick-action chips (Rewrite/Shorten/Hook/CTA) + Whole-doc/Selection scope toggle + prompt input, built on the shared `useAIChat()` hook (same HITL approve/edit/reject flow as the floating `AIAssistant`). Replaces a side-panel chat — matches the PDF mockup, not the original spec text's inspector-rail chat description.

**Right-click on the writing surface** → `ContextMenu` with Send to review (→ `useReviewQueue().addToQueue` + `api/publishing.js`'s `sendToReview` stub) / Rename (focuses title) / Pin / Delete.

**Status workflow:** `draft` → (Send to review) → `in_review` (local state + real review-queue push, no backend persistence) → (Publish sheet) → `scheduled`/`published`. LinkedIn "Publish now" path is **real**: `publishPost()` → `publishToLinkedIn(postId)` → `POST /api/linkedin/publish/{id}` → backend inserts `PostPublishLog`, updates post status, fires style memory check. Scheduled posts and X/Reddit still use stubs.

**SchedulePublishSheet LinkedIn flow** (props: `linkedInStatus`, `onConnectLinkedIn`):
- Platform toggle row shows LinkedIn/X/Reddit chips
- When LinkedIn is selected: connection indicator row appears — green "LinkedIn connected" or orange "LinkedIn not connected" + "Connect LinkedIn" button
- "Connect LinkedIn" → `handleConnectLinkedIn()` → `getLinkedInAuthUrl()` → `window.location.href = auth_url` (full-page OAuth redirect)
- Publish button is disabled with label "Connect LinkedIn first" when LinkedIn selected but not connected
- On return from OAuth: `?linkedin_connected=true` → green toast "✓ LinkedIn connected successfully!"; `?linkedin_error=true` → red toast "LinkedIn connection failed — please try again" (both auto-dismiss at 4s; URL param stripped via `history.replaceState`)
- LinkedIn status is fetched on DocEditor mount and refreshed each time the sheet opens

**Reused, not rebuilt:** `components/shared/ContextMenu.jsx` (generalized with a `variant="dashboard"` skin + right-click-to-close), `hooks/useResizableRail.js`, `components/AIAssistant/useAIChat.js`, `api/publishing.js`, `updatePostAnalytics` in `api/vault.js` — all were built in an earlier pass and survived because only `MyWorkPage.jsx` + the legacy `/app` stack were deleted.

---

## Inline Style Conventions

### Landing page
```jsx
// Correct — use JS color constants
<div style={{ background: C.tint, borderRadius: 14 }}>
<span style={{ fontFamily: FONT.serif, fontSize: 48, color: C.ink }}>

// Wrong — do NOT use --cc-* vars or Tailwind in the landing page
<div style={{ background: 'var(--cc-bg-soft)' }}>
<div className="bg-[--cc-bg-soft] rounded-xl">
```

### Dashboard / vault
```jsx
// Correct
<div style={{ background: 'var(--cc-bg-soft)', borderRadius: 14 }}>

// Wrong — do NOT mix Tailwind into inline-style pages
<div className="bg-[--cc-bg-soft] rounded-xl">
```

Shared style constants → local `const S = { ... }` (dashboard) or `const C/FONT/GRAD` (landing) at top of file.

---

## Component Rules (CSS-module components)

No page currently uses this pattern (the vault-app pages that did were deleted 2026-06-16); kept for `AIAssistant`/`ContextMenu` and any future CSS-module component.

### Buttons

```jsx
// Primary
<button className="bg-[--color-blue-primary] hover:bg-[--color-blue-dark] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150">

// Secondary (outline)
<button className="border border-[--color-border] hover:border-[--color-blue-primary] text-[--color-text] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150">

// Ghost
<button className="text-[--color-text-muted] hover:text-[--color-text] hover:bg-[--color-bg-subtle] px-4 py-2 rounded-lg text-sm transition-colors duration-150">
```

---

## Animation Budget

### Landing page (CSS keyframes only — no Framer Motion)

| Location | Animation | Keyframe |
|---|---|---|
| Hero floating cards | vertical float ± tilt | `ccFloatA/B/C/D` (9–13s, ease-in-out infinite) |
| Background blobs (Hero, AlwaysOn) | slow drift + scale | `ccBlob / ccBlob2` (20–26s, ease-in-out infinite) |
| Status dots (all agent cards) | opacity + scale pulse | `ccPulse` (1.8s, ease-in-out, staggered delays) |
| Pipeline dashed arrows | dash march | `ccDash` (1s, **linear** infinite) |
| Editor / Writer blinking caret | blink | `ccBlink` (1s, **steps(1)** infinite) |
| Progress bars | grow from 0 | `ccGrow` (on mount, not looped) |

**Rule:** No Framer Motion on the landing page. If CSS `transition`/`animation` can do it, use CSS.

### Dashboard
| Location | Animation | Implementation |
|---|---|---|
| Sidebar collapse/expand | `width .22s cubic-bezier(.16,1,.3,1)` | CSS transition on `<aside>` |
| AI panel + Calendar panel slide | `transform translateX(0/100%) .28s cubic-bezier(.16,1,.3,1)` | inline style transition |
| Agent / stat cards on mount | `ccReveal .38s` staggered via `.cc-stagger-1–5` | CSS keyframe |
| Card hover lift | `translateY(-3px)` + shadow, `.25s cubic-bezier(.2,.7,.3,1)` | `.cc-hover-lift` class |
| Button press | `scale(.97)` on `:active` | `.cc-press` class |
| Tab underline slide | `left/width .22s cubic-bezier(.16,1,.3,1)` | inline style transition |
| Pipeline connectors | `ccDash 1s linear infinite` | SVG `strokeDasharray` animation |
| Page transitions | none | deferred |

---

## File Naming Conventions

- Pages: `PascalCase.jsx`
- Sub-components (inside single file): plain functions, not exported
- Hooks: `camelCase.js` prefixed `use`
- API modules: `camelCase.js`
- Content/copy: `camelCase.js` (e.g. `landingContent.js`)

---

## Frontend Hooks (`src/hooks/`)

| Hook | File | Data source | Status |
|---|---|---|---|
| `useIdeas()` | `useIdeas.js` | Mock list of 4 ideas (source: HN/News labels) | ⚠️ Mock — TODO: connect HN + Google News |
| `useResizableRail()` | `useResizableRail.js` | N/A — drag-to-resize a rail, `localStorage`-persisted (`cc_leftW`/`cc_rightW`) | ✅ Wired into `MyWorkPage.jsx`'s History rail + inspector rail |
| `useVault()` | `useVault.js` | Real backend — `getFolders`/`getPostsInFolder`/`createFolder`/`createPost` | ✅ Connected — feeds `MyWorkPage.jsx`'s Content Vault view; returns `{folders, postsByFolder, loading, refetch, addFolder, addPost, removePost, updatePost, removeFolder, updateFolder}` |
| `useAIChat()` | `components/AIAssistant/useAIChat.js` | `queryAI`/`resumeAI` via `api/ai.js` | ✅ Shared by `AIAssistant.jsx` (unmounted) and `MyWorkPage.jsx`'s `AICommandBar` |

**`useIdeas()` return shape:**
```js
{ ideas: [{ id, title, source, saves }, ...] }
```

---

## Frontend Context (`src/context/`)

| Context | File | State | Backend |
|---|---|---|---|
| `ReviewQueueContext` | `ReviewQueueContext.jsx` | Local `useState` — array of `{id, title, platform}` | None (no backend queue endpoint) |

**Usage:** `useReviewQueue()` → `{ queue, addToQueue, removeFromQueue }`. `<ReviewQueueProvider>` wraps the entire `<Routes>` tree in `App.jsx` (not scoped to any one route).

---

## AnalyticsPage.jsx — ❌ REMOVED (2026-07-29)

Was a stub page (`/analytics`, tab group LinkedIn/X/Reddit, per-platform stat cards via `useAnalytics()`). Deleted outright along with `useAnalytics.js` and its `/analytics` route — no product need identified, per the same 2026-07-29 pass that removed Dashboard. The `AgentsPage.jsx` "Analytics Agent" card that used to link here now shows a disabled "Coming soon" state instead. Backend `GET /api/vault/analytics/summary` still exists (untouched, no frontend caller left).

---

## AIAssistant Component (`components/AIAssistant/`)

Floating panel wired to the AI backend via `api/ai.js`. **Not currently mounted anywhere** — `MyWorkPage.jsx`'s `DocEditor` uses the bottom `AICommandBar` (built on the same shared `useAIChat()` hook this component also uses) instead of the floating FAB. The component/hook still exist and work; nothing currently renders `<AIAssistant/>` itself.

**API calls:**
- `queryAI(prompt)` → `POST /api/ai/query` — sends user message; returns `{status, answer?, draft?, thread_id?}`
- `resumeAI(thread_id, action, content)` → `POST /api/ai/resume` — HITL response; returns `{answer}`

**Message types rendered in chat:**
- `role: 'user'` → right-aligned bubble (`.userBubble`)
- `role: 'assistant'` → left-aligned bubble (`.aiBubble`)
- `role: 'draft'` → special card with header "Draft post ready" + Approve / Edit / Reject action bar

**HITL (draft) flow:**
1. Response has `status === 'awaiting_approval'` → push `{role: 'draft', content: draft}` into messages
2. "Edit" → inline textarea opens (`editMode=true`); "Confirm" → calls `resumeAI(threadId, 'edited', editContent)`
3. "Approve" → `resumeAI(threadId, 'approved')`
4. "Reject" → `resumeAI(threadId, 'rejected')`
5. After any resume → push `{role: 'assistant', content: data.answer}`, clear `threadId`

**Input behaviour:** Enter sends (no Shift+Enter); textarea auto-focuses when panel opens; chat auto-scrolls to bottom on new messages.

**Styling:** CSS module (`AIAssistant.module.css`). FAB button fixed bottom-right. Panel is a fixed overlay; `.panel` class defines dimensions and positioning.

---

## ai.js API module (`api/ai.js`)

This section had drifted badly stale (missing `session_id`/`angle_id` params, `getSessionThreads`/`getSessions`, and wrongly claimed a mock-stream fallback that doesn't exist in the current file) — rather than maintain the same contract in two places, **the authoritative, up-to-date version lives in `CLAUDE.md`'s § Frontend API Layer → `ai.js`**; see that instead of this section. Kept here only as a pointer so this doc's own "single source of truth" claim doesn't create a second, competing description. Same rule of thumb as `ChatPage.jsx` above: `refineAI`/`streamQuery`/etc. usage details belong in the ChatPage section above (component behavior), the request/response contracts belong in `CLAUDE.md` (API surface).

---

## linkedin.js API module (`api/linkedin.js`)

Separate Axios instance (`baseURL: /api/linkedin`), same `X-User-Id` interceptor pattern as `vault.js`.

```js
getLinkedInStatus()         → {connected, display_name?, profile_image_url?, expires_at?}
getLinkedInAuthUrl()        → {auth_url}   // caller does window.location.href = auth_url
publishToLinkedIn(postId)   → {published, needs_auth, auth_url?, reason?, linkedin_post_id?, duplicate?}
disconnectLinkedIn()        → (204, no body)
```

Used by: `MyWorkPage.jsx` DocEditor — status fetch on mount + on sheet open; `handleConnectLinkedIn()` calls `getLinkedInAuthUrl()`; `publishing.js`'s `publishPost()` delegates LinkedIn to `publishToLinkedIn()`.

---

## What NOT to Do

- No hardcoded copy/data in landing JSX — text arrays belong in `landingContent.js`; structural/static text tightly coupled to layout is acceptable inline
- No hardcoded copy in `HomePage.jsx` — marketing text belongs in `authContent.js`
- No `styled-components`, no Emotion
- No `console.log` in production code
- No placeholder images (Unsplash/Lorem) — use inline SVGs or CSS shapes
- Do not mix Tailwind into inline-style pages (landing/dashboard)
- Do not use `--cc-*` CSS variables inside `LandingPage.jsx` — use the `C`/`FONT`/`GRAD` JS constants
- Do not add Framer Motion to the landing page — CSS keyframes only
- Do not add npm packages without noting them here
