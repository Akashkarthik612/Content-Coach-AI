# Build Prompt — ContentCoach AI Content Vault (EXACT reproduction + hooks)

## ⚠️ READ FIRST — this is a FAITHFUL PORT, not a redesign

You are reproducing an **already-approved screen** (`ContentCoach AI - Vault.dc.html`) **pixel-for-pixel** in React + Vite + TypeScript + Tailwind/CSS, using the **same fonts and color tokens as the landing/login/dashboard pages**. The full exact spec is in §A — every color, size, copy string, and layout value is taken directly from the approved file. **Match it exactly.** Then apply ONLY the scoped items in §B (live-data hooks) and §C (motion polish). Do not invent layout, do not "improve" it, do not change copy, do not drop sections.

**Things that have gone wrong on sibling screens — explicitly DO NOT repeat:**
- ❌ Sidebars made dark/navy. → This screen has **no app sidebar** — it is the Vault content area itself (header → search → two-panel folders/posts). If you embed it in the app shell, the shell sidebar stays **white** as on the Dashboard.
- ❌ Folder list flattened or recolored. → Keep the **five folders** with their exact names, counts, and per-folder tint/icon colors.
- ❌ Post cards stripped of platform pills, version count, or the hover lift. → Keep the **soft-shadow, platform-pill, version-count, "Open ↗"** card language exactly.
- ❌ Search reduced to a folder filter. → Search queries **across every folder** (title + folder name + platform) and swaps the middle panel into a "Search results" view.

If anything is ambiguous, the approved HTML wins. Reproduce first; only then layer §B/§C.

---

# §A. EXACT BASE SPEC (reproduce 1:1)

## Global tokens
- **Fonts (Google):** `Newsreader` (serif: 400/500/600 + italic 400) — page title `Content Vault`, panel headings, post titles. `Hanken Grotesk` (sans: 400/500/600/700) — all UI/body. `JetBrains Mono` (mono: 400/500/600) — eyebrow labels (`FOLDERS`, `FOLDER`, kicker), version counts.
- **Surface:** root `background:#FFFFFF`, body font Hanken Grotesk, color `#111827`, antialiased. Main posts panel sits on `#F8FAFC`; left folder rail on `#FCFDFF`.
- **Color tokens:** Ink `#111827`; body/muted `#6B7280` / `#9CA3AF`; accent **Blue `#2563EB`** (driven by an `accentColor` prop, default `#2494eb`); borders `rgba(17,24,39,.06–.12)`; search field bg `#F8FAFC`; active-folder bg `#EAF0FF` + border `rgba(37,99,235,.35)`.
- **Custom scrollbar:** 9px, thumb `rgba(17,24,39,.13)` (hover `.22`), `border-radius:999px`, 2px white inset border.
- **Keyframes:** `ccRise` (opacity0/translateY8px → opacity1/translateY0) and `ccFade` (opacity0→1). Respect **`prefers-reduced-motion`** (disable all animation/transition).

## Layout shell — full-height, no scroll on the frame
Outer: `height:100vh; display:flex; flex-direction:column; background:#fff; overflow:hidden`. Three stacked regions: **header** (auto) → **search** (auto) → **body grid** (`flex:1; min-height:0`). Approved preview size **1320×860**.

### 1) Header — `padding:24px 28px 18px`, space-between, align top
- **Left:** H1 Newsreader 600, **32px**, `letter-spacing:-0.02em`, `margin:0 0 5px` — **"Content Vault"**. Sub 14px `#6B7280` — **"Pick a folder, then open any post in the editor."**
- **Right** (flex gap 10):
  - **Import Content** — secondary button: `height:40px; padding:0 16px; border:1px solid rgba(17,24,39,.12); background:#fff; border-radius:11px; font-size:13.5px; weight 600;` upload icon (stroke `#6B7280`); hover `background:#F8FAFC`.
  - **New Folder** — primary button: `height:40px; padding:0 18px; border:none; border-radius:11px; font-size:13.5px; weight 600; color:#fff; background:{accent}; box-shadow:0 10px 24px -10px rgba(37,99,235,.6);` plus icon; hover `filter:brightness(1.06)`, active `scale(.98)`.

### 2) Search — `padding:0 28px 18px`
Field: `display:flex; align-items:center; gap:12px; height:48px; padding:0 16px; background:#F8FAFC; border:1px solid rgba(17,24,39,.08); border-radius:14px;` magnifier icon (stroke `#9CA3AF`) + input placeholder **"Search posts across every folder…"** (14.5px). `focus-within` → border `#2563EB`, bg `#fff`, ring `0 0 0 4px rgba(37,99,235,.1)`. When query non-empty, show a **clear (✕) button**: 24×24, `background:#E9EDF3`, radius 7, hover `#dde2ea`.

### 3) Body — `display:grid; grid-template-columns:260px minmax(0,1fr); border-top:1px solid rgba(17,24,39,.08)`

#### LEFT — Folders rail
`border-right:1px solid rgba(17,24,39,.08); background:#FCFDFF; padding:16px 14px; overflow-y:auto`. Mono eyebrow **"FOLDERS"** (10.5px, `letter-spacing:.12em`, `#9CA3AF`, padding `4px 8px 12px`). Then a flex-column (gap 6) of **folder buttons**. Each: `display:flex; gap:12px; width:100%; padding:11px 12px; border:1px solid <border>; background:<bg>; border-radius:13px;` left = 38×38 rounded-11 tinted tile with a folder icon stroked in the folder color; right = name (14px weight 600, truncate) over count (12px `#6B7280`). **Active** (selected folder, no active query): bg `#EAF0FF`, border `rgba(37,99,235,.35)`; inactive bg `#fff`, border `rgba(17,24,39,.08)`. Hover → border `rgba(37,99,235,.3)`. Clicking a folder selects it **and clears any search**.

Folders, in order (name · count · color · tint):
1. **LinkedIn Posts** · 124 posts · `#2563EB` · `#EAF0FF`
2. **Blog Articles** · 67 posts · `#0EA5E9` · `#E6F6FE`
3. **Newsletters** · 32 posts · `#6366F1` · `#EEF0FF`
4. **Reddit Threads** · 18 threads · `#FF4500` · `#FFF1EC`
5. **Research Library** · 241 sources · `#8B5CF6` · `#F3EEFF`

#### MAIN — Posts in folder
`background:#F8FAFC; overflow-y:auto; padding:22px 26px 60px`.
- **Panel header** (`flex; align-items:flex-end; justify-content:space-between; margin-bottom:18px`): mono kicker (10.5px `#9CA3AF`) over H2 Newsreader 600 **24px** title; right = count (13px `#9CA3AF`). When a folder is active: kicker = **"FOLDER"**, title = folder name (e.g. "LinkedIn Posts"). When searching: kicker = **"Across all folders"**, title = **"Search results"**.
- **Post grid:** `display:grid; grid-template-columns:repeat(auto-fill,minmax(268px,1fr)); gap:14px`. Each post card is an **`<a>` linking to the Editor** (`ContentCoach AI - Editor.dc.html` / the editor route), `title="Open in editor"`: white, `border:1px solid rgba(17,24,39,.08); border-radius:16px; padding:16px 16px 14px; box-shadow:0 8px 22px -18px rgba(17,24,39,.4);` flex-column gap 14. Hover → `translateY(-3px)`, deeper shadow, border `rgba(37,99,235,.35)`, transition `.16s cubic-bezier(.16,1,.3,1)`.
  - **Top row:** platform pill (`height:26px; padding:0 10px; border-radius:999px; font-size:11.5px; weight 600;` platform tint bg + platform color text + inline platform icon) ↔ right version chip (mono 11px `#9CA3AF`, history/clock-rewind icon + "N versions").
  - **Title:** Newsreader 600, **19px**, line-height 1.25, clamped to **2 lines** (`-webkit-line-clamp:2`, `min-height:48px`).
  - **Footer** (`margin-top:auto; padding-top:12px; border-top:1px solid rgba(17,24,39,.06)`): left "Updated <time> · <N> words" (12px `#9CA3AF`), right **"Open ↗"** (12px weight 600, accent color, arrow icon).
- **Empty state** (folder empty, or no search matches): centered column, 60×60 rounded-16 white tile + folder icon (`#CBD5E1`), then message 14px `#6B7280` — "This folder is empty." / "No posts match your search."

## Platform identity (pill color · tint · icon)
- **LinkedIn** — `#0A66C2` · `#EAF0FF` · LinkedIn glyph (blue rounded square, white "in").
- **Blog** — `#0EA5E9` · `#E6F6FE` · document icon.
- **Newsletter** — `#6366F1` · `#EEF0FF` · envelope icon.
- **Reddit** — `#EA580C` (pill) / `#FF4500` (folder) · `#FFF1EC` · Reddit alien.
- **Research** — `#8B5CF6` · `#F3EEFF` · magnifier.

## Mock data (folders → posts)
Reproduce exactly; each post has `{ id, title, plat, updated, versions, words }`. Version chip = "N version"/"N versions" (singular at 1). Words formatted with thousands separators + " words".
- **linkedin:** "The Future of AI Content Creation" (2h ago, 4, 624) · "Content Operating System" (Yesterday, 3, 498) · "Creator Economy 2026" (3 days ago, 2, 432)
- **blog:** "A Complete Guide to AI Content Systems" (1 day ago, 3, 1820) · "From Tools to Teams" (4 days ago, 2, 1240)
- **news:** "Issue #24 — Build the Team" (2 days ago, 2, 760) · "Issue #23 — Voice & Systems" (1 week ago, 1, 690)
- **reddit:** "How 5 AI agents replaced our content stack" (5 days ago, 2, 410)
- **research:** "State of AI — 2026 (OpenAI)" (6 days ago, 1, 240) · "The Creator Economy (McKinsey)" (1 week ago, 1, 210)

Default selected folder: **linkedin**.

## Search behaviour
Trim + lowercase the query. When non-empty: search across **all** folders, matching post `title`, the post's **folder name**, OR `platform`. Middle panel switches to the "Search results / Across all folders" view; folder rail shows **no active item**. Clearing search (✕ or empty input) returns to the selected folder.

---

# §B. SCOPED ITEMS (the ONLY deviations from §A — live-data hooks)

Apply on top of the faithful base. Leave every live-data point as an open hook returning mock data + `// TODO`. No fake backend.

- **B1. `useVault()` hook** — returns `{ folders, postsByFolder }` (mock = §A data) so the screen renders from data, not hardcoded JSX. `// TODO: connect content store`.
- **B2. Post → Editor link** — each card links to the editor with the post id (e.g. `/editor/:postId`). Wire the route param; `// TODO: load post + versions by id`.
- **B3. New Folder** — opens a small inline create-folder affordance (name + color/platform), optimistic add to the list; `// TODO: persist folder`.
- **B4. Import Content** — opens a file/URL import entry point (stub modal or trigger); `// TODO: import pipeline (paste, upload, URL)`.
- **B5. Search** — keep client-side over the mock set; structure it so it can later hit a server search. `// TODO: server-side search across vault`.
- **B6. Accent** — keep a single **`accentColor`** prop/context (default `#2494eb`) driving the primary button, focus ring, and "Open" link, exactly as the approved file's `accentColor` prop.

---

# §C. Apply your UI skills — Emil Kowalski "Animations" + "Taste" (MOTION/POLISH ONLY)

Refine *interaction and motion quality* — **without changing the locked visual design in §A**.
- **Easing & duration:** card hover-lift uses `cubic-bezier(.16,1,.3,1)` ~160ms; folder bg/border crossfade `.15s ease`. No linear, nothing sluggish.
- **Press states:** primary/secondary buttons get a subtle `active:scale-[.97]`; "New Folder" already specifies `scale(.98)` active.
- **Staggered reveal:** on first paint of a folder's posts, stagger cards in with `ccRise` ~40–60ms apart (opacity + 8px translateY). Re-trigger gently when switching folders / entering search. Subtle.
- **Search focus:** the `focus-within` ring expands smoothly; the clear button fades in (`ccFade`).
- **Restraint (taste):** quiet, supportive motion — no parallax, no long fades, no spin. Respect **`prefers-reduced-motion`** (disable transforms/stagger, keep instant state changes). Polish micro-details: consistent radii, optical icon alignment, hover affordance on every clickable element, `focus-visible` rings.

---

# §D. Build requirements
1. **Reproduce §A exactly**, then apply **only §B/§C**. Re-verify against the "DO NOT" list at top.
2. Reuse landing/dashboard **fonts + color tokens**; match the existing card/shadow/hover language for any new UI.
3. Drive folders + posts from the `useVault()` data arrays (mock now) — no hardcoded card JSX.
4. Componentize sensibly: `Vault` (page), `VaultHeader`, `VaultSearch`, `FolderRail` + `FolderButton`, `PostGrid` + `PostCard`, `EmptyState`, plus a `PlatformGlyph`/`platformMeta` helper for pill color/tint/icon.
5. Accessible + responsive: real `<button>`/`<a>` with hover/focus; folder rail collapses to a horizontal scroller (or a select) under ~720px; post grid already reflows via `auto-fill minmax(268px,1fr)`. Keep the full-height frame (`100vh`, internal panels scroll, frame doesn't).

**Reproduce the approved Vault faithfully — do not redesign. Apply §B/§C only. Don't ask follow-ups.**
