# Content Coach — UI State & Design System
> Single source of truth for all UI decisions. Never deviate from constraints without updating this file.
> Last updated: 2026-06-02

---

## Product Identity

- **Name:** Content Coach (internal: LinkedIn Coach)
- **Tagline:** "Git for writing — version-controlled LinkedIn content vault"
- **User:** Solo LinkedIn creators, bootstrapped founders, self-employed professionals
- **Constraint:** Self-hosted first, bootstrapped — every KB of JS bundle matters

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
| Styling (landing/dashboard) | Inline styles + `var(--cc-*)` | See token table |
| Styling (vault app) | CSS Modules + `--color-*` | Legacy vault components |
| Icons | `lucide-react` | Tree-shakeable; import only what is used |

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

### `--color-*` — vault app components (CSS modules)

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

| Font | Use |
|---|---|
| `DM Sans` (400/500/600) | All UI — labels, nav, buttons, body, dashboard |
| `IBM Plex Mono` (400/500) | Version labels, code, metadata badges |
| `Fraunces` (variable 100–900) | Display / hero headlines only |

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
| `/vault` | `pages/MyWorkPage.jsx` | RequireAuth | ✅ Built |
| `/my-work` | `pages/MyWorkPage.jsx` (alias) | RequireAuth | ✅ Built |
| `/app` | Legacy vault UI (MainApp) | RequireAuth | ⚠️ Legacy |

**Post-login redirect:** login + register → `/dashboard`

---

## Landing Page Architecture

```
frontend/src/pages/landing/
├── landingContent.js    ← COPY object — ALL text, zero JSX. Edit copy here only.
└── LandingPage.jsx      ← Single file; all sections as named functions
```

All other `landing/*.jsx` (Hero, Navbar, Features, etc.) — **DEAD CODE**. Do not import or edit.

### Sections (order in LandingPage.jsx)
1. `Navbar` — sticky blur, hamburger mobile (`cc-hide-mobile` / `cc-show-mobile`)
2. `Hero` — 2-col grid (collapses at 900px via `.cc-hero-grid`), diff card, platform badges
3. `ProblemStrip` — `id="problem"`, light blue bg, 3 pain-point cards
4. `Features` — `id="features"`, 4 cards, hover border highlight
5. `HowItWorks` — 3-step numbered grid
6. `Platforms` — LinkedIn / Medium / AI cards with inline SVG logos
7. `Pricing` — `id="pricing"`, Free + Pro; Pro: blue border + "Most popular"
8. `FinalCTA` — full-width dark blue
9. `Footer`

### CTA wiring
- `ctaPrimary` / "Get started" → `navigate('/login')`
- `ctaSecondary` / "See how it works" → `document.getElementById('problem').scrollIntoView({behavior:'smooth'})`
- Navbar "Log in" → `navigate('/login')` · "Get started free" → `navigate('/register')`
- Pricing Free CTA + FinalCTA → `navigate('/register')`

---

## HomePage.jsx (Login / Register / Forgot)

Single file, 3 modes via `useState(initialMode)`.

- **Layout:** full-page `var(--cc-bg-soft)`, flex center
- **Card:** white · `borderRadius:16` · `maxWidth:420` · `boxShadow:0 4px 24px rgba(37,99,235,0.07)`
- **Inputs:** label above · focus ring via `onFocus/onBlur` toggling `borderColor`
- **Error:** red strip (`--cc-red-light` bg / `--cc-red-text` color) between button and footer
- **Footer:** divider · "Sign up free"/"Log in" toggle · "← Back to home" link

**Do NOT touch:** `handleLogin`, `handleRegister`, API calls, localStorage writes, error state, `switchMode`.

---

## DashboardPage.jsx

Post-login home. Single file; all sub-components defined inline.

```
┌──────────────┬─────────────────────────────────────────┐
│ Sidebar 220px│ TopBar (hamburger)                       │
│ collapsible  │ Greeting hero                            │
│              │ 2-col: Schedule | Pinned Posts           │
│              │ 2-col: My Posts | Recent Drafts          │
│              │ [Fixed AI bar — bottom]                  │
└──────────────┴─────────────────────────────────────────┘
```

- Sidebar: `width`/`min-width` animate `transition:0.25s ease`; open on desktop (≥768px), closed on mobile
- Fixed AI bar tracks sidebar: `left: sidebarOpen ? 220 : 0` with matching transition
- Data: `getFolders()` → `Promise.all(getPostsInFolder per folder)` → flatten + sort by `updated_at`
- `pinnedPosts = recentPosts.filter(p => p.is_pinned)` — derived, no extra API call
- Grid: `repeat(auto-fit, minmax(280px,1fr))`
- **MiniCalendar:** pure inline component, highlights today in `--cc-blue`, no deps

**Sidebar nav:** `Home→/dashboard` · `My Work→/my-work` · `New Post→/my-work` · `Folders→/my-work` · `Context Vault→/my-work`
**Card routing:** "Create New Post" → `/my-work` (not `/app`)

---

## MyWorkPage.jsx (`/vault`, `/my-work`)

3-column workspace. Inline styles + `--cc-*`. All sub-components inline.

```
┌──────────────┬────────────────┬──────────────────────────┐
│ Col1 Sidebar │ Col2 Folders   │ Col3 Canvas              │
│ 220px        │ 280px          │ PostList OR DocEditor    │
│ sidebarOpen  │ folderPanelOpen│ driven by activePost     │
└──────────────┴────────────────┴──────────────────────────┘
```

Columns collapse via `width:0; overflow:hidden; transition:0.25s ease-in-out`.

**State:**
- `sidebarOpen` — Col1 visibility
- `folderPanelOpen` — Col2 visibility
- `activePost` — `null`=PostList · `{id,title,status}`=DocEditor
- `panelsCollapsed = !sidebarOpen && !folderPanelOpen` — focus mode flag

**Panel toggle mechanics:**
- Col2 `PanelLeftClose` → collapses **both** Col1+Col2 (focus mode)
- DocEditor `PanelLeftOpen` → restores both (shown only when `panelsCollapsed`)
- `Menu` in Col2 header → toggles Col1 only

**Create Post flow:**
1. Select folder (Col2) → click "Create Post" (Col3 header)
2. `createPost(folder.id, 'Untitled Post')` → new post in list
3. `setActivePost(post)` + `setSidebarOpen(false)` + `setFolderPanelOpen(false)` → panels sweep left
4. DocEditor fills screen

**DocEditor (inline component):**
- Header: `PanelLeftOpen` (restore, when collapsed) · ← Back · status chip · `PanelLeftClose`
- Version pills: IBM Plex Mono; active=`--cc-blue`; latest has dot indicator
- Title input: centered · `fontSize:22` · `maxWidth:640px` · border on focus only · saved on blur via `renamePost`
- Textarea: `padding:0 10%` · `lineHeight:1.85` · `flex:1` · transparent bg · read-only for older versions
- Bottom toolbar: version label input + "Save as vN" → `saveVersion(postId, content, label)`
- Read-only banner shown for non-latest versions

**Context menus (`CtxMenu` inline component, `zIndex:99` backdrop):**
- Folders: Rename (inline input) / Delete (`window.confirm`)
- Posts: Rename (inline input) / Pin to dashboard / Unpin / Delete

---

## Inline Style Conventions (landing + dashboard)

```jsx
// Correct
<div style={{ background: 'var(--cc-bg-soft)', borderRadius: 14 }}>

// Wrong — do NOT mix Tailwind into inline-style pages
<div className="bg-[--cc-bg-soft] rounded-xl">
```

Shared style constants → local `const S = { ... }` at top of file.

---

## Component Rules (vault app — CSS module pages)

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
- Sub-components (inside single file): plain functions, not exported
- Hooks: `camelCase.js` prefixed `use`
- API modules: `camelCase.js`
- Content/copy: `camelCase.js` (e.g. `landingContent.js`)

---

## What NOT to Do

- No hardcoded text in JSX — all landing copy in `landingContent.js` COPY object
- No `styled-components`, no Emotion
- No `useState` for server data in vault app — use hooks (`useFolders`, `usePosts`)
- No `console.log` in production code
- No placeholder images (Unsplash/Lorem) — use SVG or CSS shapes
- Do not mix Tailwind into inline-style pages (landing/dashboard)
- Do not add npm packages without noting them here
