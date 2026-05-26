# Content Coach — UI State & Design System

> Feed this file to Claude at the start of every frontend session.
> It is the single source of truth for all UI decisions.
> Never deviate from constraints defined here without updating this file first.
> Last updated: 2026-05-26

---

## Product Identity

- **Name:** Content Coach (internal codename: LinkedIn Coach)
- **Tagline:** "Git for writing — version-controlled LinkedIn content vault"
- **Target user:** Solo LinkedIn creators, bootstrapped founders, self-employed professionals
- **Build constraint:** Self-hosted first, bootstrapped — every KB of JS bundle matters

---

## Tech Stack (Frontend Only)

| Concern | Choice | Notes |
|---|---|---|
| Framework | React 19 | No legacy class components |
| Build tool | Vite | No CRA, no Next.js |
| Routing | React Router v6 | `<BrowserRouter>` in `main.jsx` |
| HTTP | Axios | Interceptor adds `X-User-Id` header |
| State | `useState` + `useContext` | No Redux, no Zustand, no Jotai |
| Animation | Framer Motion | Only for high-impact moments — not decorative filler |
| Styling (landing/dashboard) | Inline styles + `var(--cc-*)` CSS variables | See token table below |
| Styling (vault app) | CSS Modules + `--color-*` variables | Legacy vault components |
| Icons | `lucide-react` | Tree-shakeable; import only what is used |

---

## CSS Variable Namespaces

Two namespaces exist in `index.css`. Use the correct one per context:

### `--cc-*` tokens — use in landing page and dashboard (inline-style pages)

```css
:root {
  --cc-white:       #FFFFFF;
  --cc-bg-soft:     #F8FAFF;
  --cc-bg-subtle:   #EEF2FF;
  --cc-blue:        #2563EB;
  --cc-blue-hover:  #1D4ED8;
  --cc-blue-light:  #DBEAFE;
  --cc-blue-dark:   #1E40AF;
  --cc-text:        #0F172A;
  --cc-text-muted:  #475569;
  --cc-text-faint:  #94A3B8;
  --cc-border:      #E2E8F0;
  --cc-accent:      #FEE2E2;   /* soft red */
  --cc-green-light: #DCFCE7;
  --cc-green-text:  #15803D;
  --cc-red-light:   #FEF2F2;
  --cc-red-text:    #B91C1C;
}
```

### `--color-*` tokens — legacy vault app components (CSS modules)

```css
:root {
  --color-bg:              #FFFFFF;
  --color-bg-soft:         #F8FAFF;
  --color-bg-subtle:       #EEF2FF;
  --color-blue-primary:    #2563EB;
  --color-blue-light:      #DBEAFE;
  --color-blue-dark:       #1D4ED8;
  --color-text:            #0F172A;
  --color-text-muted:      #64748B;
  --color-text-faint:      #94A3B8;
  --color-border:          #E2E8F0;
  --color-border-focus:    #2563EB;
  --color-accent:          #FEE2E2;
  --color-accent-dark:     #EF4444;
  --color-success:         #10B981;
  --color-warning:         #F59E0B;
}
```

---

## Typography

Three fonts loaded via Google Fonts in `index.css`:

| Font | Use |
|---|---|
| `DM Sans` (400/500/600) | All UI text — labels, nav, buttons, body, dashboard |
| `IBM Plex Mono` (400/500) | Version labels, code, metadata badges |
| `Fraunces` (variable, 100–900) | Display / hero headlines only |

**Body default:** `font-family: 'DM Sans', system-ui, sans-serif`

---

## Layout Utilities (index.css)

```css
@media (max-width: 768px)  { .cc-hide-mobile { display: none !important; } }
@media (min-width: 769px)  { .cc-show-mobile { display: none !important; } }
@media (max-width: 900px)  { .cc-hero-grid   { grid-template-columns: 1fr !important; } }
```

---

## Page Map

| Route | Component | Auth | Status |
|---|---|---|---|
| `/` | `pages/landing/LandingPage.jsx` | Public | ✅ Built |
| `/login` | `pages/HomePage.jsx` (mode=login) | Public | ✅ Built |
| `/register` | `pages/HomePage.jsx` (mode=register) | Public | ✅ Built |
| `/dashboard` | `pages/DashboardPage.jsx` | RequireAuth | ✅ Built |
| `/vault` | `pages/MyWorkPage.jsx` (3-col workspace) | RequireAuth | ✅ Built |
| `/my-work` | `pages/MyWorkPage.jsx` (alias) | RequireAuth | ✅ Built |
| `/app` | Legacy vault UI (MainApp) | RequireAuth | ⚠️ Legacy |

**Post-login redirect:** Both login and register → `/dashboard`

---

## Landing Page Architecture

Landing page lives entirely in two files:

```
frontend/src/pages/landing/
├── landingContent.js    ← COPY object — ALL text strings, zero JSX. Edit copy here only.
└── LandingPage.jsx      ← Single file, all sections as functions inside one module
```

All other files in `landing/` (Hero.jsx, Navbar.jsx, Features.jsx, etc.) are **dead code** — superseded by the single-file approach. Do not import or edit them.

### Sections in order (all inside LandingPage.jsx)
1. `Navbar` — sticky, blur, hamburger on mobile (useState toggle), `cc-hide-mobile` / `cc-show-mobile`
2. `Hero` — 2-col grid (collapses at 900px via `.cc-hero-grid`), diff card, platform badges
3. `ProblemStrip` — light blue bg, 3 pain-point cards, `id="problem"` (scroll target)
4. `Features` — 4 cards, `id="features"` (nav anchor), hover border highlight
5. `HowItWorks` — 3-step numbered grid
6. `Platforms` — LinkedIn / Medium / AI cards with inline SVG logos
7. `Pricing` — Free + Pro, `id="pricing"` (nav anchor), Pro has blue border + "Most popular" badge
8. `FinalCTA` — full-width dark blue section
9. `Footer` — brand + links + copyright

### CTA wiring
- **"Get started" / ctaPrimary** → `navigate('/login')`
- **"See how it works" / ctaSecondary** → `document.getElementById('problem').scrollIntoView({ behavior: 'smooth' })`
- **Navbar "Log in"** → `navigate('/login')`
- **Navbar "Get started free"** → `navigate('/register')`
- **Pricing Free CTA** → `navigate('/register')`
- **FinalCTA button** → `navigate('/register')`

---

## HomePage.jsx (Login / Register / Forgot)

Single file, 3 modes switched with `useState(initialMode)`.

### Visual spec
- Full-page: `var(--cc-bg-soft)` background, flex center
- Card: white, `borderRadius: 16`, `maxWidth: 420`, `boxShadow: 0 4px 24px rgba(37,99,235,0.07)`
- Logo + wordmark at top of card (always shown)
- Mode-specific title + subtitle below logo
- Input fields: labels above, focus ring via `onFocus/onBlur` toggling `borderColor`
- Error: red strip (`var(--cc-red-light)` bg, `var(--cc-red-text)` color) between button and footer
- Footer: divider, "Sign up free" / "Log in" toggle, "← Back to home" link

### What NOT to touch
- Auth logic (`handleLogin`, `handleRegister`)
- API calls (`login()`, `register()`)
- localStorage writes
- Error state management
- Mode switching (`switchMode`)

---

## DashboardPage.jsx

Post-login home. Single file. All sub-components defined inside.

### Layout
```
┌──────────────┬──────────────────────────────────┐
│ Sidebar 220px│ Main content (flex: 1)            │
│ (collapsible)│  TopBar (hamburger)               │
│              │  Greeting hero                    │
│              │  2-col: Schedule | Pinned Posts   │
│              │  2-col: My posts | Recent drafts  │
│              │  [Fixed AI bar at bottom]         │
└──────────────┴──────────────────────────────────┘
```

### Key behaviours
- Sidebar toggles with `setSidebarOpen` via hamburger — `width`/`min-width` animate with `transition: 0.25s ease`
- Sidebar starts open on desktop (`window.innerWidth >= 768`), closed on mobile
- Fixed AI bar tracks sidebar: `left: sidebarOpen ? 220 : 0` with matching transition
- Data: `getFolders()` → `Promise.all(getPostsInFolder per folder)` → flatten + sort by `updated_at`
- `pinnedPosts = recentPosts.filter(p => p.is_pinned)` — live from fetched data, no extra API call
- Grid: `repeat(auto-fit, minmax(280px,1fr))` — collapses to 1 col on narrow screens

### Sidebar nav structure
```
PLAN:   Home → /dashboard | My Work → /my-work
CREATE: New Post → /my-work | Folders → /my-work
STORE:  Context Vault → /my-work
```

### Card routing
- "Create New Post" button → `/my-work` (not `/app` — user must pick folder first)
- "Pinned Posts" card shows `recentPosts.filter(p => p.is_pinned)` — live data

### MiniCalendar
Pure component defined above `DashboardPage`. Highlights today's date in `var(--cc-blue)`. No external dependencies.

---

## Inline Style Conventions (landing + dashboard)

New pages (LandingPage, DashboardPage, HomePage) use inline styles with `var(--cc-*)` tokens, NOT Tailwind classes (except `.cc-hide-mobile` etc. utility classes).

```jsx
// Correct
<div style={{ background: 'var(--cc-bg-soft)', borderRadius: 14 }}>

// Wrong — do not mix Tailwind utilities into inline-style pages
<div className="bg-[--cc-bg-soft] rounded-xl">
```

Shared style constants go in a local `const S = { ... }` object at the top of the file.

---

## Component Rules (vault app — CSS module pages)

### Buttons
```jsx
// Primary
<button className="bg-[--color-blue-primary] hover:bg-[--color-blue-dark] text-white
                   px-5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150">

// Secondary (outline)
<button className="border border-[--color-border] hover:border-[--color-blue-primary]
                   text-[--color-text] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150">

// Ghost
<button className="text-[--color-text-muted] hover:text-[--color-text] hover:bg-[--color-bg-subtle]
                   px-4 py-2 rounded-lg text-sm transition-colors duration-150">
```

---

## Animation Budget

| Location | Animation | Implementation |
|---|---|---|
| Landing Hero text | `fadeInUp` stagger | Framer Motion — once on mount |
| Landing Hero diff card arrow | bounce | CSS `animate-bounce` |
| Feature cards | hover lift | CSS `transition: box-shadow` |
| Page transitions | none | deferred |

**Rule:** If CSS `transition-` or `hover:` can do it, do NOT use Framer Motion.

---

## File Naming Conventions

- Pages: `PascalCase.jsx`
- Sub-components (inside a single file): plain functions, not exported
- Hooks: `camelCase.js` prefixed `use`
- API modules: `camelCase.js`
- Content/copy: `camelCase.js` (e.g. `landingContent.js`)

---

## What NOT to Do

- Do not hardcode text strings in JSX — all landing copy lives in `landingContent.js` COPY object
- No `styled-components`, no Emotion
- No `useState` for server data in vault app — use hooks (`useFolders`, `usePosts`)
- No `console.log` left in production code
- No placeholder images from Unsplash/Lorem — use SVG or pure CSS shapes
- Do not mix Tailwind class styling into inline-style pages (landing/dashboard)
- Do not add new npm packages without noting them here

---

## MyWorkPage.jsx (`/vault`, `/my-work`)

3-column workspace. Uses inline styles + `--cc-*` tokens. All sub-components defined inline.

### Column layout
```
┌──────────────┬────────────────┬──────────────────────────────────┐
│ Col 1        │ Col 2          │ Col 3 (Dynamic Canvas)           │
│ Sidebar Nav  │ Folder Panel   │ Post List  OR  DocEditor         │
│ 220px        │ 280px          │ flex: 1                          │
│ sidebarOpen  │ folderPanelOpen│ driven by activePost state       │
└──────────────┴────────────────┴──────────────────────────────────┘
```
Both columns collapse via `width: 0, overflow: hidden` with `transition: 0.25s ease-in-out`.

### State
- `sidebarOpen` — Col 1 visibility
- `folderPanelOpen` — Col 2 visibility
- `activePost` — `null` = post list, `{id, title, status}` = DocEditor
- `panelsCollapsed = !sidebarOpen && !folderPanelOpen` — focus mode flag

### Panel toggle mechanics
- Col 2 header `PanelLeftClose` icon → collapses **both** Col 1 + Col 2 (focus mode)
- DocEditor header `PanelLeftOpen` icon → restores both (only shown when `panelsCollapsed`)
- `Menu` icon in Col 2 header → toggles Col 1 only

### Create Post flow
1. User selects a folder (Col 2), clicks "Create Post" (Col 3 header)
2. `createPost(folder.id, 'Untitled Post')` → new post added to list
3. `setActivePost(post)` + `setSidebarOpen(false)` + `setFolderPanelOpen(false)` — panels sweep left instantly
4. DocEditor fills screen; user edits title inline, writes, saves versions

### DocEditor (inline component inside MyWorkPage)
- **Header:** `PanelLeftOpen` (restore, when collapsed) | ← Back | status chip | `PanelLeftClose` (enter focus)
- **Version pills:** IBM Plex Mono pill buttons; active = `--cc-blue`; latest has a dot indicator
- **Title input:** centered, `fontSize: 22`, `maxWidth: 640px`, border appears only on focus; saved on blur via `renamePost`
- **Textarea:** `0 10%` padding, `lineHeight: 1.85`, `flex: 1`, transparent background, read-only for older versions
- **Bottom toolbar:** version label input + "Save as vN" button → calls `saveVersion(postId, content, label)`
- Reads-only banner shown when viewing a non-latest version

### Context menus
- Folders: **Rename** (inline input) / **Delete** (window.confirm)
- Posts: **Rename** (inline input) / **Pin to dashboard** / **Unpin** / **Delete**
- `CtxMenu` is an inline functional component; backdrop `div` (`zIndex: 99`) closes it on outside click
