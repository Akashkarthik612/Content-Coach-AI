# ContentCoach AI — UI State & Design System
> Single source of truth for all UI decisions. Never deviate from constraints without updating this file.
> Last updated: 2026-07-23 (`ChatPage.jsx`'s `WorkspaceView` document panel rebuilt as the real "Honne Chat v3" LinkedIn-preview card, with the user's actual name/profession pulled from `GET /api/profile` — see § ChatPage.jsx → Workspace view below. That section also flags that the rest of the ChatPage.jsx write-up predates the current component and needs a full re-port, not just this patch.)
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
| Styling (dashboard) | Inline styles + local JS const tokens (`BLUE`, `INK`, `FONT`, `SERIF`, `MONO`…) | See `DashboardPage.jsx` § below — do NOT use `--cc-*` here despite the name |
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
| `/dashboard` | `pages/DashboardPage.jsx` | RequireAuth | ✅ Redesigned |
| `/analytics` | `pages/AnalyticsPage.jsx` | RequireAuth | ✅ Stub built |
| `/vault`, `/my-work` | `pages/MyWorkPage.jsx` | RequireAuth | ✅ Rebuilt 2026-06-16 |
| `/chat` | `pages/ChatPage.jsx` | RequireAuth | ✅ Built — primary AI interaction surface |
| `/app` | — | — | ❌ Removed — legacy MainApp stack deleted, not rebuilt |

**Post-login redirect:**
- **Register** (`HomePage.jsx`'s `handleRegister`) → `/onboarding` — every fresh signup lands on the onboarding questionnaire first, exactly once.
- **Login** (`handleLogin`) → `/dashboard` directly, unconditionally — an already-onboarded user (i.e. every returning login) never sees `/onboarding` again. There is no server-side "has this user onboarded" check yet (see `OnboardingPage.jsx` § below) — the redirect split lives entirely in `HomePage.jsx`'s two submit handlers, not in a route guard.

**App.jsx wiring:**
- `<ReviewQueueProvider>` wraps the entire `<Routes>` tree — so any page can push into the shared review queue `/dashboard` reads.
- `/onboarding`, `/analytics`, `/my-work`, `/vault`, `/chat` all wrapped in `<RequireAuth>`
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

## HomePage.jsx (Sign up / Log in) — redesigned 2026-07-21

Split-screen auth page implementing the approved Claude Design mock `Honne Auth.dc.html`
(replaces the earlier 3-mode "Login / Register / Forgot" blue-themed design — that
version, its `LeftPanel`/`PrimaryBtn`/`ErrorBox`/`Divider`/`EyeIcon` primitives, and the
`#0B1220`/`#EBEEF6` token set are gone). Content strings live in `pages/authContent.js`.

### Layout
```
<div style="display:flex; min-height:100vh" className="honne-auth">
  <BrandPanel className="lp-hide-phone" style="flex:1, min-width:380px" />  ← hidden ≤767px
  <FormPanel  style="flex:1" />                                            ← always visible
</div>
```
Equal-width split (both sides `flex:1`), matching the mock's `1fr 1fr` grid — not the old
page's 42/58 split. Reuses the existing `.lp-hide-phone` CSS utility (same one the old
`LeftPanel` used) for mobile collapse — no new responsive CSS needed.

### Brand panel (`C.ink` `#1A1A1A` dark, `C.cream` `#F4F0E6` text)
- Top: "Honne" wordmark (EB Garamond 32px) + mono tagline "THE ART OF TRUE VOICE."
- Quote block: large accent quote mark (`❞`, EB Garamond, `C.accent` `#B4402A`) + italic
  serif pull-quote (`AUTH_COPY.brandQuote`) + small mono foot label "VOICE-NATIVE WORKSPACE"
- Bottom: mono copyright note "© 2026 Honne"

### Form panel (`C.paper` `#F9F8F3` bg)
- "← Back to home" link, absolute top-left (kept from the old page — not in the mock, added
  back so users aren't stranded; everything else follows the mock)
- Two-tab segment ("Sign up" / "Log in", `C.ink` bg on the active tab) — drives `mode` state
  (`'signup' | 'login'`), remounted via `key={mode}` on the form-inner wrapper to replay the
  `authFade` entrance animation on every switch
- Heading + subheading from `AUTH_COPY.signup` / `.login` per mode
- **Sign up fields:** Full name (optional, UI-only → `localStorage.display_name`) ·
  **Username** (added — the mock's signup form only has name/email/password, but the
  backend's `register()` requires a username, so a Username field was inserted between
  Full name and Email; this is the one deliberate deviation from the mock) · Email ·
  Password
- **Log in fields:** Username · Password, with a "Forgot?" mono link inline in the label
  row — placeholder only (matches `Known Gaps`: forgot-password has no backend endpoint);
  clicking it shows an inline "Password reset isn't available yet" message instead of the
  old page's full third `forgot` mode/view, which no longer exists
- Submit button: full-width, `C.accent` bg, mono uppercase label, lifts 1px + fades 6% on
  hover (`useState` hover flag, not the old page's imperative ref-based hover)
- Divider "or continue with" + Google button (calls `googleSignIn()` → no-op; shows
  "coming soon" inline, same behavior as before) — no eye-toggle on password fields, the
  mock doesn't have one and it was dropped
- Switch-mode line ("Already have an account? Log in" / "Don't have an account? Sign up")
- Legal line: "By continuing you agree to Honne's Terms & Privacy Policy." (new — not in
  the old page; links are `href="#"` placeholders, matching the mock)

### Design tokens (inline, no CSS vars — fourth independent palette, see OnboardingPage's
note below; do not merge with HomePage's old blue tokens, Dashboard's cool blue, or
ChatPage's warm palette)
```js
const C = {
  paper:'#F9F8F3', ink:'#1A1A1A', accent:'#B4402A', card:'#FFFFFF',
  cream:'#F4F0E6', hair:'rgba(26,26,26,0.12)',
  errText:'#B91C1C', errBg:'#FEF2F2',
}
const SERIF = "'EB Garamond', serif"
const SANS  = "'Hanken Grotesk', system-ui, sans-serif"
const MONO  = "'JetBrains Mono', monospace"
```
All three fonts are already loaded globally in `index.html`; no new font `<link>`s added.
A scoped `<style>` block (className `honne-auth`) declares only the `authFade` keyframe and
`input::placeholder` color — deliberately not the mock's global `a{}`/`::selection{}`
overrides, which would have leaked the rust accent onto every link/selection in the app;
anchors are styled inline per-element instead.

### Shared primitives (module-level, not inside render)
- `GoogleSVG` — inline Google "G" icon (24px viewBox, from the mock)
- `st` — style table object mirroring the mock's own `st`, `tabOn`/`tabOff`,
  `submitBase`/`submitHover`, `googleBase`/`googleHover` constants
- `focusable` — shared `onFocus`/`onBlur` pair that sets `border-color`/`box-shadow` to the
  accent color; the mock declared the `transition` on `.input` but never wired an actual
  focus state, so this was added for usability parity with the old page

### Auth API (`api/auth.js`) — unchanged
Single `_classify(err)` function maps HTTP errors to typed `Error` objects with `.code`:

| HTTP outcome | `err.code` | User message | Console |
|---|---|---|---|
| No response (offline) | `network` | "Cannot reach the server…" | `console.error` |
| 401 | `invalid_credentials` | "Invalid username or password" | `console.warn` |
| 409 | `conflict` | Backend detail or "already taken" | `console.warn` |
| 5xx | `server` | "Server error. DB may be unavailable." | `console.error` |
| Other | `unknown` | Backend detail | `console.error` |

All logs prefixed `[auth]` for easy DevTools filtering.

`googleSignIn()` exported but no-op (logs `[auth] Google sign-in not yet configured`).
**Supabase migration:** replace only the three exported function bodies in `auth.js`; `HomePage.jsx` unchanged.

### authContent.js (`pages/authContent.js`)
Rewritten for the new design — `AUTH_COPY.brand`/`.brandTagline`/`.brandQuote`/
`.brandFootLabel`/`.brandNote` (brand panel), `.tabs`, `.signup`/`.login` (heading, sub,
placeholders, submit/submitting labels), `.switchMode`, `.google`, `.legal`. The old
`.leftPanel`/`.toggle`/`.signIn`/`.register`/`.forgot` shape is gone. Edit copy here; page
component reads `AUTH_COPY.*`. Never hardcode auth copy in `HomePage.jsx`.

**Do NOT touch in `HomePage.jsx`:** `handleLogin`, `handleRegister`, localStorage writes, `switchMode`, `_classify` in `auth.js`.

`handleRegister` navigates to `/onboarding` (not `/dashboard`) on success — see `OnboardingPage.jsx` below. `handleLogin` is unchanged, still navigates straight to `/dashboard`. `App.jsx`'s routing is unchanged: `/login` → `<HomePage initialMode="login" />`, `/register` → `<HomePage initialMode="register" />` (mapped internally to `mode: 'signup'`).

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
`finish()` sets `localStorage['cc_onboarded_' + user_id] = '1'` (falls back to a bare `cc_onboarded` key if `user_id` is somehow absent) and `localStorage['onboarding_answers']`, then `navigate('/dashboard')`. "Skip for now" jumps straight to the done screen with whatever was answered so far (summary card simply shows fewer/no rows) — it does not bypass the flow entirely, matching the original mock's behavior.

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

## DashboardPage.jsx

Post-login home. Fully redesigned 2026-06-16. Single file; all sub-components defined inline.

### Design tokens (local JS constants — do NOT use --cc-* vars here)
```js
BG='#EEF2F9'  INK='#111827'  BODY='#4B5563'  MUTED='#6B7280'  FAINT='#9CA3AF'
BLUE='#3B82F6'  INDIGO='#6366F1'  VIOLET='#8B5CF6'  SKY='#0EA5E9'
GREEN='#22C55E'  AMBER='#F59E0B'  TINT='#F7FAFF'  WHITE='#FFFFFF'
FONT="'Hanken Grotesk'..."  SERIF="'Newsreader'..."  MONO="'JetBrains Mono'..."
```

### Layout
```
┌─────────────────┬──────────────────────────────────────────────┐
│ Sidebar         │ main (padding 28px 32px)                      │
│ WHITE #FFFFFF   │  Header: greeting (Newsreader 36px) + pills   │
│ 248px expanded  │  Your agents (4-col grid)                     │
│  64px collapsed │  Content pipeline (5 stages + connectors)     │
│ border-right    │  Recent content + Voice Vault (1.6fr / 1fr)   │
│ sticky top:0    │  Analytics stat cards + Growth trend chart     │
└─────────────────┴──────────────────────────────────────────────┘
```

### Sidebar — `components/shared/AppSidebar.jsx` (extracted 2026-06-16)
Shared between `DashboardPage.jsx` and `MyWorkPage.jsx` so navigation is consistent across pages — previously DashboardPage had its own inline `Sidebar`/`NAV_ITEMS` and MyWorkPage had a completely different, older `--cc-*` sidebar; both now render the same component.
- **WHITE** background (`#FFFFFF`) with `border-right: 1px solid rgba(17,24,39,0.07)`
- Collapsible: caller owns `collapsed` state, passed as `collapsed` + `onToggle` props (`DashboardPage`'s `sidebarCollapsed`; `MyWorkPage`'s `sidebarCollapsed`, also reused as its focus-mode flag when a post is open)
- Expanded (248px): logo text visible, nav labels, full calendar widget, user name
- Collapsed (64px): icon-only nav (with `title` tooltips), calendar icon shortcut, avatar only
- Transition: `width .22s cubic-bezier(.16,1,.3,1)` on `<aside>`
- Toggle chevron button in header row (‹ = collapse, › = expand)
- Nav items (exported as `NAV_ITEMS`): Dashboard · **Start Writing** (renamed from "Content" 2026-06-16; navigates to `/my-work?new=1`, which auto-creates a post and opens it directly in `DocEditor`) · Agents · Content Vault · Analytics · Templates
- `activeKey` prop selects the highlighted item (`DashboardPage` always passes `'dashboard'`; `MyWorkPage` passes `'vault'` on `/vault`, else `'content'`)
- Calendar widget (click → `onCalendarOpen`; `DashboardPage` opens its `CalendarPanel`, `MyWorkPage` doesn't pass one — defaults to a no-op)
- User row at bottom: avatar + name + Pro plan + sign-out dots button

### Header
- Greeting: `fontFamily: SERIF, fontSize: 36, fontWeight: 400` — time-of-day aware (morning/afternoon/evening)
- `displayName` from `localStorage.display_name ?? localStorage.username ?? 'there'`
- Status pills row: single "4 Agents Active" pill with pulsing green dot — **no** "Tasks Running" pill
- Top-right: bell icon (red dot) + AI Assistance toggle button + avatar

### Quick Actions button
- Button label: "Quick Actions" — navigates to `/chat` (no longer opens an inline AIPanel)
- The "Draft with AI →" button on the Writer agent card also navigates to `/chat`
- `AIPanel` and `CalendarPanel` still exist as side-panel components — `CalendarPanel` is still used; `AIPanel` is now unused since both entry points navigate to ChatPage instead

### Your agents (4 cards)
| Card | Colour | Data source |
|---|---|---|
| Research Agent | Blue `#3B82F6` | Static (progress bar 82%) |
| Writer Agent | Indigo `#6366F1` | `currentDraft` from `getRecentPosts(1)` |
| SEO Agent | Violet `#8B5CF6` | Static (score 92/100) |
| Analytics Agent | Sky `#0EA5E9` | `useAnalytics()` real data |

Writer card has **"Draft with AI →"** button → `navigate('/chat')` (opens ChatPage as primary AI surface).

### Content pipeline (5 stages)
Stages: Ideas → Research (Pro-gated) → Drafting → Review (from `ReviewQueueContext`) → Published (Pro-gated)

Between stages: animated `ccDash` SVG connectors (dashed line + arrowhead, `#C7D2FE`/`#6366F1`).

Pipeline container is **`display:flex`** with no `overflowX: auto` — columns flex-shrink to fill available width dynamically.

Ideas from `useIdeas()` hook. Each idea has "Draft this →" button.

### Data connections
| Section | Hook / API |
|---|---|
| Analytics agent card + stat cards | `useAnalytics()` → `GET /api/vault/analytics/summary` |
| Writer task title | `getRecentPosts(1)` → post title |
| Recent content section | `getRecentPosts(3)` |
| Pipeline Review column | `useReviewQueue()` context (local state) |
| Pipeline Ideas column | `useIdeas()` hook (mock, 4 items) |

### Side panels (slide-in, fixed right)
- `AIPanel` — 380px, AI chat; opens via Quick Actions button or Writer card button
- `CalendarPanel` — 360px, stub ("coming soon"); opens via calendar widget click

### Analytics section
- 4 stat cards (Views 128k, Engagement 8.4%, Followers +2,341, Posts Published 46) — static demo values
- `GrowthTrend` SVG chart — dual-series (impressions + likes); uses `analytics.weeklyTrend` from backend if available, falls back to 7-month mock data; fully responsive (`viewBox` + `width:100%`)

### Removed from old dashboard
- Dark/navy sidebar (was wrong — now WHITE)
- "Overview / Needs review" tab group section (removed entirely)
- `OverviewTab` and `ReviewTab` components (deleted)
- `overflowX: 'auto'` on pipeline (pipeline now fluid)

---

## ChatPage.jsx (`/chat`) — primary AI interaction surface

Full-screen agent chat built in the warm palette (`#FAF6EF` canvas). The main entry point for all AI work — replaces the old inline `AIPanel` on Dashboard.

> **Note (2026-07-23):** the sub-component table, layout diagram, and "what's real vs mock" table below describe an earlier iteration of this file (`ChatHistoryRail`/`WelcomeState`/`AIMessage`/mock-stream-fallback) that has since drifted from the actual component — the live `ChatPage.jsx` today is `Sidebar` + `MessageBubble` + `ActivityTimeline` (real `activity` SSE events from `backend/ai/activity.py`, no mock fallback) + `WorkspaceView`. Only `WorkspaceView`'s document panel is documented accurately as of this date (see below); the rest of this section needs a full re-port pass against the current file rather than a patch. Always spot-check against the code before relying on the rest of this section.

### Workspace view — document panel (rebuilt 2026-07-23)
`WorkspaceView`'s right pane (opened after a draft is approved/being refined) now renders the actual `#fff` LinkedIn-preview card from the "Honne Chat v3" `.dc.html`, not a plain text block: a 44px circular avatar (accent bg, user's initial), the real logged-in user's name (`localStorage.username`), and their profession — `professionLine = profile?.profession || profile?.role || 'Creator on Honne'`, where `profile` comes from `getProfile()` (`frontend/src/api/profile.js`, `GET /api/profile`) fetched once on mount and resolved to `null` instead of throwing on the backend's 404-when-no-profile-row case. Every request carries `X-User-Id` (same interceptor as the rest of the app) and the backend scopes the row to that header — this can only ever show the requesting user's own data. **Edit mode** is a genuinely editable `<textarea>` (previously this tab's content wasn't actually editable despite the name) with an "Editable" pill badge in the card header. **Preview mode** is read-only with a Like/Comment/Repost/Send action row. The design's fake "2d" post-age was replaced with "Draft preview" since the post hasn't been published yet.

### Design tokens (warm palette — distinct from Dashboard's cool blue)
```js
CANVAS='#FAF6EF'  WARM_WHITE='#FFFEFB'  WARM_INPUT='#F6F1E8'  INK='#2A241D'
BODY='#3A332A'    MUTED='#8E8472'       FAINT='#A99E8C'
BLUE='#2563EB'    INDIGO='#6366F1'      GREEN='#16A34A'        RED='#B42318'  AMBER='#B45309'
FONT="'Hanken Grotesk'..."  SERIF="'Newsreader'..."  MONO="'JetBrains Mono'..."
```

### Layout
```
┌────────────────┬──────────────────────────────────────────────────┐
│ ChatHistoryRail│ Chat window                                       │
│ 286px          │  ChatHeader (sticky, blurred)                     │
│ warm white     │  WelcomeState (empty) OR Message stream           │
│ brand + search │  Composer (docked, tool row, Supervisor badge)    │
│ + chat list    │                                                   │
└────────────────┴──────────────────────────────────────────────────┘
```

Note: ChatPage has its own branded sidebar (`ChatHistoryRail`) — does NOT use the shared `AppSidebar`.

### Sub-components (all inline, not exported)
| Component | Responsibility |
|---|---|
| `ChatHistoryRail` | 286px aside; brand logo, New Chat button, search, grouped chat list (Today/Yesterday/Previous 7 days/Pinned), account footer |
| `ChatMenu` | 3-dot kebab per chat row; dropdown with Pin/Rename/Delete; click-outside-to-close via `useEffect` |
| `ChatHeader` | Sticky blurred header; chat title, agent avatar stack, "3 agents" label, Share button |
| `WelcomeState` | Floating orb mascot + greeting + big `Composer` (big=true) + 5 suggestion pills |
| `Composer` | Tool row chips (Attach/Research/Draft/Repurpose) + auto-sizing textarea + mic + send. `big` prop controls welcome vs docked variant. `hasLatestDraft` prop changes meta text and placeholder. |
| `UserMessage` | Right-aligned blue bubble; optional "Modification" amber pill for refine messages (`isRefine: true`) |
| `AIMessage` | Left-aligned card with agent icon tile, routing label, streaming cursor, action row (Approve / Make Changes / Decline / Copy), modify box with preset chips. `isRefinement` prop shows "refined" badge. |
| `AgentIcon` | SVG icon coloured per agent |
| `ThinkingDots` | 3-dot animated pulse during `routing` phase |
| `AngleCard` | One research angle: mono tag, serif title, argument text, "For: {audience}" line, optional expanded-summary inset, Expand / Draft this actions |

### Research angle cards (`msg.kind === 'angles'`)
Rendered inside the AI message body once `researcher_node` → `angle_review_node` produces the 5 `ResearchAngle`s and the graph pauses awaiting a pick (`status: 'awaiting_angle_selection'`). Container is a **single horizontally-scrolling row** (`display:flex;flex-direction:row;overflowX:'auto'` + scroll-snap), each `AngleCard` wrapped in a fixed `300px`-wide flex item — changed 2026-07-23 from a `display:grid;gridTemplateColumns:'1fr 1fr'` 2-column layout that wrapped to multiple rows. Below the row, a "None of these fit — let me describe it" link triggers `none_fit` (re-classification via `resumeAI`). Per-card actions: **Expand** (`expand` action → grounded summary shown inline) and **Draft this** (`pick` action → chains into the writer, opening a fresh `awaiting_approval` draft in the same message). Ported from the "Honne Chat v3" Claude Design project — note the source `.dc.html` itself shows angle cards in a vertical stack; the horizontal-scroll row is a deliberate deviation from that file, not an oversight.

### Chat history (real, client-side)
- Flat array: `{ id, title, snippet, dot, createdAt, pinned }`. Max 10, newest first.
- Auto-populated when the user's **first message** is sent — title = first 42 chars of the prompt.
- Snippet updates to `"Writer Agent · done"` when the AI finishes.
- Grouped by `groupChats(flat, search)` into: **Pinned** (top), **Today**, **Yesterday**, **Previous 7 days**.
- **Not persisted** — lives in React state, cleared on page reload. Backend persistence is a future feature.

### 3-dot menu per chat row (`ChatMenu`)
Each chat row has a 3-dot button (opacity 0, revealed by `.cc-chat-row:hover .cc-chat-menu`). Click opens dropdown:
- **Pin / Unpin** — moves to/from Pinned group at top
- **Rename** — switches to inline `<input>` in the row; blur or Enter commits, Escape cancels. State lives in `ChatHistoryRail` (`renamingId`, `renameValue`).
- **Delete** — removes from list; if the deleted chat was active, resets to welcome state

### Agent routing (client-side, cosmetic)
```js
const AGENTS = { Writer, Research, SEO, Editor }
// Regex routes on user text — UI labels only; actual routing done server-side by supervisor_node
```

### Message lifecycle
Each exchange creates two messages: a `user` message and an `ai` message. The AI message goes through phases:
- `routing` — ThinkingDots shown, routing label displayed
- `streaming` — text accumulates token by token, blinking cursor shown
- `done` — action row visible on hover (Approve / Make Changes / Decline / Copy)

### Two-path sending architecture
The `send()` function checks `latestDraft` state to route the message:

```
latestDraft is empty           → pushExchange()  → full pipeline (/api/ai/stream)
                                   First message auto-saves to chat history
latestDraft has content        → doRefine()      → lightweight (/api/ai/refine)
                                   Single LLM call, bypasses supervisor+style
```

`latestDraft` is set when the writer's SSE stream finishes (`status: 'awaiting_approval'`). Cleared on New Chat or Select Chat.

### API calls
```js
streamQuery(userText, onToken, onDone, onError)  // SSE full pipeline — first message
refineAI(draft, note)                            // POST /api/ai/refine — follow-ups when draft exists
resumeAI(thread_id, action, content)             // HITL resume — Approve/Decline
```
On SSE error → falls back to `simulateStream()` (character-by-character mock). On `refineAI` error → falls back to `simulateStream()` with mock refinement text.

### HITL / writer decision actions
| Action | What happens |
|---|---|
| **Approve** | `resumeAI(thread_id, 'approved')` (if thread exists) → green "Approved · added to draft" pill |
| **Make Changes** | Opens modify box; user types feedback + "Send to agent" → `doRefine(msg.text, note)` — single LLM call, **no supervisor** |
| **Decline** | `resumeAI(thread_id, 'rejected')` → red "Declined" pill + Regenerate button |
| **Regenerate** | Re-runs mock stream, sets `latestDraft` |
| **Type in composer** | If `latestDraft` set → `doRefine(latestDraft, text)` automatically — user can just type freely |

### What's real vs mock
| Feature | Status |
|---|---|
| SSE streaming to backend | ✅ Real — `streamQuery()` hits `/api/ai/stream` |
| HITL approve/decline | ✅ Real — `resumeAI()` hits `/api/ai/resume` |
| Draft refinement | ✅ Real — `refineAI()` hits `POST /api/ai/refine` (single LLM call, no graph) |
| Agent routing labels (Writer/Research/SEO/Editor) | ⚠️ Mock — client-side regex, cosmetic only |
| Chat history | ⚠️ Local state only — not persisted across reloads |
| Share button | ⚠️ No-op |
| Streaming fallback | ⚠️ Mock character simulation on SSE/refine error |

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

Redesigned to match `ContentCoachAI-TextEditor-ClaudeCode-Prompt.md` + the `image_text_editor.pdf` mockup, using dashboard tokens (`Newsreader`/`Hanken Grotesk`/`JetBrains Mono`, local JS consts — same as `DashboardPage.jsx`).

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
| `useAnalytics()` | `useAnalytics.js` | `GET /api/vault/analytics/summary` → real backend | ✅ Connected |
| `useIdeas()` | `useIdeas.js` | Mock list of 4 ideas (source: HN/News labels) | ⚠️ Mock — TODO: connect HN + Google News |
| `useResizableRail()` | `useResizableRail.js` | N/A — drag-to-resize a rail, `localStorage`-persisted (`cc_leftW`/`cc_rightW`) | ✅ Wired into `MyWorkPage.jsx`'s History rail + inspector rail |
| `useVault()` | `useVault.js` | Real backend — `getFolders`/`getPostsInFolder`/`createFolder`/`createPost` | ✅ Connected — feeds `MyWorkPage.jsx`'s Content Vault view; returns `{folders, postsByFolder, loading, refetch, addFolder, addPost, removePost, updatePost, removeFolder, updateFolder}` |
| `useAIChat()` | `components/AIAssistant/useAIChat.js` | `queryAI`/`resumeAI` via `api/ai.js` | ✅ Shared by `AIAssistant.jsx` (unmounted) and `MyWorkPage.jsx`'s `AICommandBar` |

**`useAnalytics()` return shape:**
```js
{ data: { impressions, avgLikes, topPlatform, weeklyTrend, byPlatform }, loading }
// weeklyTrend: [{month, impressions, reactions}, ...] — last 6 months from DB
// Falls back to {impressions:0, avgLikes:0, topPlatform:null, weeklyTrend:[], byPlatform:{}} on error
```

**`useIdeas()` return shape:**
```js
{ ideas: [{ id, title, source, saves }, ...] }
```

---

## Frontend Context (`src/context/`)

| Context | File | State | Backend |
|---|---|---|---|
| `ReviewQueueContext` | `ReviewQueueContext.jsx` | Local `useState` — array of `{id, title, platform}` | None (no backend queue endpoint) |

**Usage:** `useReviewQueue()` → `{ queue, addToQueue, removeFromQueue }`. Wrap `/dashboard` route with `<ReviewQueueProvider>` in `App.jsx`.

---

## AnalyticsPage.jsx (`/analytics`)

Stub page. Tab group (LinkedIn / X / Reddit). Per-platform stat cards using `useAnalytics()` data. Full per-platform breakdown pending real data from backend.

---

## AIAssistant Component (`components/AIAssistant/`)

Floating panel wired to the AI backend via `api/ai.js`. **Not currently mounted anywhere** — `DashboardPage.jsx` has its own separate inline `AIPanel`, and `MyWorkPage.jsx`'s `DocEditor` uses the bottom `AICommandBar` (built on the same shared `useAIChat()` hook this component also uses) instead of the floating FAB. The component/hook still exist and work; nothing currently renders `<AIAssistant/>` itself.

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

Separate Axios instance from `vault.js`. Same `X-User-Id` interceptor pattern.

```js
queryAI(prompt)                              → Promise<{status, answer?, draft?, thread_id?}>
resumeAI(thread_id, action, content='')     → Promise<{answer}>
refineAI(draft, note)                        → Promise<{refined_draft}>  // single LLM call, no graph
streamQuery(prompt, onToken, onDone, onErr)  → abortFn   // SSE — primary path used by ChatPage
```

`streamQuery` opens an SSE connection to `POST /api/ai/stream`, calls `onToken(chunk)` for each streamed token, `onDone(data)` when the `done` event fires, and `onError(err)` on failure. Returns an abort function.

`refineAI(draft, note)` calls `POST /api/ai/refine` — a lightweight endpoint that makes one direct LLM call to the writer model with the existing draft + feedback instruction. Used by ChatPage for all follow-up messages when a draft exists in the current session.

**Do NOT add `.data` at call site for `queryAI`/`resumeAI`/`refineAI`** — all already unwrap with `.then(r => r.data)`.

**ChatPage routing:** first message → `streamQuery`; follow-ups when draft exists → `refineAI`. Falls back to simulated mock stream on error.

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
