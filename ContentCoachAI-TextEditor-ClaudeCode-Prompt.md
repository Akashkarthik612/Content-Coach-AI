# Build Prompt — ContentCoach AI · Text Editor (DocEditor) Page

## ⚠️ READ FIRST
This is the **writing canvas** of ContentCoach AI — the "Git for writing" version-controlled post editor. It lives as the **third column (Canvas → DocEditor)** of `MyWorkPage.jsx` (routes `/my-work`, `/vault`). You are building/redesigning **only the editor experience**; the 3-column shell, sidebar, folder panel, and all backend wiring already exist (see §A). **Reuse the existing architecture and API — do not rewrite the backend, the routing, or the vault hooks.** Match the **ContentCoach AI visual system** (the same fonts/colors/feel as the already-built landing + dashboard) so the editor looks like one product with them.

Front-end only changes. Where a feature needs data, use the **existing API functions** in §A.4 or leave a clearly-marked `// TODO: connect` hook returning mock data. No new backend, no fake server.

---

# §A. EXISTING ARCHITECTURE (do not break — reuse exactly)

**Stack:** React 19 · Vite · React Router v6 · Axios · `lucide-react` icons. State = `useState`/`useContext` (no Redux). Animation = Framer Motion for high-impact moments ONLY; CSS `transition`/`hover` for the rest.

### A.1 The page shell (already built — keep)
`MyWorkPage.jsx` is a **3-column workspace**, inline styles + `var(--cc-*)` tokens, all sub-components inline:
```
┌──────────────┬────────────────┬──────────────────────────┐
│ Col1 Sidebar │ Col2 Folders   │ Col3 Canvas              │
│ 220px        │ 280px          │ PostList OR DocEditor     │
│ sidebarOpen  │ folderPanelOpen│ driven by activePost      │
└──────────────┴────────────────┴──────────────────────────┘
```
- Columns collapse via `width:0; overflow:hidden; transition:0.25s ease-in-out`.
- **Both side rails are user-resizable.** A 6px drag handle sits on the inner edge of each rail (`cursor:col-resize`, accent highlight on hover, a 3px pill grip centered). Drag to resize; left history rail clamps **190–420px**, right inspector rail **240–460px**. Persist both widths to `localStorage` (`cc_leftW` / `cc_rightW`) and restore on mount. Drag uses window `mousemove`/`mouseup` listeners (not per-element) so the drag doesn't drop when the cursor outruns the handle.
- State: `sidebarOpen`, `folderPanelOpen`, `activePost` (`null`=PostList · `{id,title,status}`=DocEditor), `panelsCollapsed = !sidebarOpen && !folderPanelOpen` (focus mode).
- Create-post flow: select folder → "Create Post" → `createPost(folder.id,'Untitled Post')` → `setActivePost(post)` + collapse both panels → **DocEditor fills the screen (focus mode)**.
- **The text editor = "focus mode": both side panels swept away, the canvas is the writing surface.** This is the page we are designing.

### A.2 Current DocEditor (the thing to elevate — keep its mechanics)
- **Header:** `PanelLeftOpen` (restore panels, shown only when `panelsCollapsed`) · `← Back` · status chip · `PanelLeftClose`.
- **Version pills:** IBM Plex Mono; active = `--cc-blue`; latest version has a dot indicator. Clicking a pill loads that version (older versions are **read-only**).
- **Title input:** centered · `fontSize:22` · `maxWidth:640px` · border only on focus · saved on blur via `renamePost(id, title)`.
- **Body textarea:** `padding:0 10%` · `lineHeight:1.85` · `flex:1` · transparent bg · read-only when viewing a non-latest version.
- **Bottom toolbar:** version-label input + **"Save as vN"** → `saveVersion(postId, content, label)`.
- **Read-only banner** shown for non-latest versions.
- **Post context menu** (`CtxMenu` inline, `zIndex:99` backdrop): Rename (inline input) / Pin to dashboard / Unpin / Delete.

### A.3 Data model (relevant tables)
- `posts(id, folder_id, title, status[enum], is_pinned, current_version, scheduled_at, created_at, updated_at)`
- `post_versions(id, post_id, version_number, content, source, change_summary, char_count, created_at)` — **named, immutable snapshots = the "git history".**
- `post_publish_log(id, post_id, version_id, platform, published_at)`
- `post_analytics(id, post_id UNIQUE, user_id, impressions, reactions, updated_at)` — **user-logged metrics, one row per post.**

### A.4 API (already wired in `api/vault.js` / `api/ai.js` — resolve `.data`, do NOT add `.data` at call site)
```
renamePost(id, title)               → post
saveVersion(postId, content, label) → version      // creates new immutable version
getVersions(postId)                 → version[]
getVersion(versionId)               → version
renameVersion(versionId, label)     → version
deleteVersion(versionId)            → {}
pinPost(id, is_pinned)              → post
deletePost(id)                      → {}
// analytics (metrics box) — superseded MetricsForm:
PATCH /posts/{id}/analytics  {impressions, reactions}   // upsert user-logged metrics
// AI:
queryAI(prompt)                     → {status, answer?, draft?, thread_id?}
resumeAI(thread_id, action, content)→ {answer}   // action: 'approved'|'edited'|'rejected'
```
> **Note:** scheduling/publish endpoints and a `/posts/{id}/review` action are **not built yet** — build the UI and call a `// TODO` stub (see §C5, §C6). Embedding-on-save already fires automatically on `saveVersion` (background task) — you don't touch it.

---

# §B. VISUAL SYSTEM (match the built ContentCoach AI landing + dashboard)

Make the editor a sibling of the dashboard, not the old vault look. Reuse the **dashboard's tokens, fonts, and card language**:
- **Fonts:** `Newsreader` (serif — the post title, big numbers, any display heading), `Hanken Grotesk` (sans — all UI, toolbar, body **and the post body textarea** so drafts read cleanly), `JetBrains Mono` (mono — version pills, metadata, char counts, timestamps, %).
- **Colors:** white `#FFFFFF`; page/canvas tint `#EEF2F9` / `#F7FAFF`; ink `#111827`; body `#4B5563`; muted `#6B7280`/`#9CA3AF`; **Blue `#3B82F6`** (primary), Indigo `#6366F1`, Violet `#8B5CF6`, Sky `#0EA5E9`, Green `#16A34A`, Amber `#B45309`; borders `rgba(17,24,39,.06–.10)`.
- **Platform identity (this app publishes to LinkedIn · X · Reddit — NO Medium):** LinkedIn `#0A66C2`, X black `#111827`, Reddit `#FF4500`. Use these brand marks anywhere a platform is shown.
- **Cards:** white, `border:1px solid rgba(17,24,39,.08)`, `border-radius:14–20px`, soft shadow `0 16px 38px -28px rgba(17,24,39,.2)`. Status pills = `inline-flex` rounded-999 with a 6px dot.
- **Motion (Emil Kowalski + taste skills, polish only):** enter `ease-out` `cubic-bezier(.16,1,.3,1)` 150–260ms; press states `active:scale-[.97]`; panels slide from their edge; menus scale from trigger origin; version-pill switch + save get a quiet confirmation, not a bounce. Respect `prefers-reduced-motion`. No decorative motion.

---

# §C. THE EDITOR — design spec

A calm, full-bleed writing surface (focus mode). Centered column of measure ~680px on the `#F7FAFF`/white canvas. Top utility bar, the writing surface, a right **inspector rail**, and a bottom save toolbar.

### C1. Top bar (sticky, height ~56px, white, bottom border)
- **Left:** `PanelLeftOpen` restore button (only when `panelsCollapsed`) · `←` Back to posts · folder breadcrumb ("Folder name / Post").
- **Center:** **status chip** reflecting `post.status` — Draft (gray) · In review (amber) · Scheduled (blue) · Published (green). Dot + label, JetBrains Mono-ish.
- **Right:** autosave indicator ("Saved · 2s ago", mono `#9CA3AF`) · **"✦ AI Assistance"** toggle (gradient-active `135deg,#3B82F6,#8B5CF6`) → opens the AI panel (§C7) · **primary "Publish"** button (opens Schedule/Publish sheet §C6).

### C2. Version rail (git history)
Horizontal row of **version pills** under the top bar (JetBrains Mono): `v1 v2 v3 …` — active pill filled `#3B82F6` white; latest pill has a small dot; each pill shows its label on hover (`change_summary`). A **"+ New version"** affordance is the Save action (§C5). Older versions load **read-only** (show the read-only banner: "Viewing v2 — read only. Restore or branch from here." with a **"Restore this version"** action that copies its content into a new latest version).
- Right of the rail: a small **diff/compare** toggle (stub) and a char-count (`char_count`, mono).
- **Per-version row actions (on hover):** each version exposes **Rename** (`renameVersion`) and **Delete** (`deleteVersion`, red on hover) inline, plus a **⋯ overflow button** (3 dots) that opens a small menu — behaves like a right-click — with **Pin to top · Review later · Mark milestone**. (Note: the older inline **Restore** / **Branch** buttons are replaced by Rename / Delete; restore now lives only in the read-only banner above.) The ⋯ menu anchors to the button, scales in from its origin, and closes on outside-click / right-click / Esc.

### C3. Title
Newsreader 400, `font-size:34px; letter-spacing:-0.02em; text-align:left; max-width:680px;` borderless, placeholder "Untitled post". Saves on blur via `renamePost`. (Center it only if you prefer — match the dashboard's editorial feel.)

### C4. Writing surface
- Body `<textarea>` (or contentEditable) — Hanken Grotesk, `font-size:17px; line-height:1.85; color:#1F2937; max-width:680px;` centered measure on the canvas, transparent bg, no visible border, generous vertical padding. Feels like a clean page, not a form field.
- **Empty state:** faint placeholder + 2–3 **"Start from…"** chips (mock): "Blank", "LinkedIn hook", "Thread outline" — and a hint "Ask AI Assistance to draft in your voice →".
- **Live word/char count** bottom-left of the surface (mono, muted). Optional reading-time estimate.
- Read-only dimming + lock when viewing an old version.

### C5. Bottom save toolbar (sticky, the "commit" bar)
- Left: small platform target selector (LinkedIn / X / Reddit chips — which platform this draft is shaped for).
- Center/right: **version-label input** (placeholder "What changed?") + **"Save as v{N}"** primary button → `saveVersion(postId, content, label)`. After save: pill rail appends the new version, autosave indicator updates, quiet success pulse.
- **Right-click context menu on the Save button / surface** must include **"Send to review"** → moves the post into the Review stage (sets status → in-review and pushes to the dashboard Review column). Build it and call a `// TODO: PATCH /posts/{id}/review → review queue` stub now. Also keep Rename / Pin / Delete from the existing post context menu.

### C6. Schedule / Publish sheet (from "Publish" button) — **Pro-gated**
Slide-in sheet / modal:
- **Platform toggles:** LinkedIn · X · Reddit (multi-select). Medium removed.
- **Schedule:** "Publish now" or date/time picker → sets `scheduled_at`.
- On confirm → the post appears in the dashboard **Published** column (most recent published post) and writes `post_publish_log{platform, version_id}`.
- **Gating:** publishing/scheduling integrations are **not live at launch → Pro feature.** Show a **"Pro" lock badge** + tooltip "Available on Pro · integrations coming soon"; gate by a `plan:'free'|'plus'|'pro'` prop/context (default `'pro'` in the demo, but mark integrations "coming soon"). `// TODO: connect publish/schedule integrations`.

### C7. Inspector rail (right, ~300px, collapsible) — context for the post
A quiet right rail (toggled by the AI Assistance button or always-on at wide widths) with stacked cards matching dashboard card style:

1. **Metrics box (the source of dashboard analytics).** Header "Performance". After publish, the user logs this post's **Impressions** and **Likes/Reactions** in two number inputs + **"Update"** button → `PATCH /posts/{id}/analytics {impressions, reactions}`. Editable/updatable anytime. Show last-updated (mono). These numbers feed the dashboard **Analytics Agent** card and the combined **Likes + Impressions** growth trend. Before publish, show a muted "Publish to start tracking" state. (This replaces the broken `MetricsForm`/`upsertMetrics`.)
2. **AI Assistance panel** (reuse existing `AIAssistant` component + `api/ai.js`). Chat thread: user bubbles (right), assistant bubbles (left), and the **draft card** ("Draft post ready" + **Approve / Edit / Reject**) for the HITL flow:
   - response `status==='awaiting_approval'` → render `{role:'draft', content:draft}`;
   - **Edit** → inline textarea → "Confirm" → `resumeAI(threadId,'edited',editContent)`;
   - **Approve** → `resumeAI(threadId,'approved')`; **Reject** → `resumeAI(threadId,'rejected')`;
   - after resume → push `{role:'assistant', content:answer}`, clear `threadId`.
   - Enter sends (no Shift+Enter); auto-focus on open; auto-scroll to bottom. **Approved drafts can be inserted into the editor** as the working content (then the user saves a version).
3. **Writing actions card.** Two clean, marketing-worded actions — **no score/percentage gauge** (the old "Sounds like you · 96%" bar is removed):
   - **“Rewrite in your voice”** — does **not** run an inline rewrite; it **opens the Style & Agent Behavior page (§C8)** where the user tunes voice + agent behavior. Subline: “Tune your style & how agents work”, trailing ↗ (navigates-away) glyph.
   - **“Sounds like me?”** — quick check of the current draft against the saved voice. Subline: “Check the draft against your voice”, trailing › chevron.
   (The old **“Hook suggestions”** action is removed.)

> The metrics box and AI panel are the two rail cards that matter; keep the rail calm — no clutter.

### C8. Style & Agent Behavior page (the “voice/SEO” settings) — opened from “Rewrite in your voice”
A centered modal page (~560px, scrollable, sticky header + footer) where the user teaches the agents **how they sound and how the agents should work**. This is where voice now lives — it is no longer a passive % chip. Sections:
1. **Your voice** — a multi-line textarea describing the user’s tone/style in their own words (seeded with a sensible default, fully editable).
2. **Tone** — three sliders with labeled poles: **Casual–Formal**, **Concise–Detailed**, **Friendly–Bold** (`accent-color` = indigo, 0–100).
3. **Agent behavior** — toggle rows (custom pill switches, animated knob): **Auto-suggest hooks** (“surface stronger openers as you write”), **Always cite sources** (“attach links when research is inserted”), **Auto-draft variations** (“generate native formats on publish”).
- Header: settings-gear glyph + “Style & agent behavior” (Newsreader) + subline “Teach the agents how you sound — and how they should work.”, close ✕.
- Footer (sticky): **Cancel** + primary **“Save style & train agents”**. Persist to a `// TODO: PATCH /me/style {voice, tone, behavior}` stub (style memory) returning mock data. Sheet fades a scrim + scales/rises in (origin-aware), respects `prefers-reduced-motion`.

---

# §D. Build requirements
1. **Reuse the existing `MyWorkPage` shell, vault hooks, and API** (§A) — only build/redesign the **DocEditor/focus-mode editor** + its sheets/rail. Don't fork routing or rewrite the backend.
2. Match the **ContentCoach AI visual system** (§B) — Newsreader/Hanken Grotesk/JetBrains Mono, the blue/indigo/violet palette, the dashboard's card + pill language. The editor must look like the same product as the dashboard.
3. **Version control is the spine** — pills, immutable `saveVersion`, read-only old versions, restore-from-old. Don't reduce it to a single autosaved blob.
4. **New features:** metrics box (`PATCH /posts/{id}/analytics`), **right-click "Send to review"**, **Pro-gated Schedule/Publish to LinkedIn·X·Reddit** (no Medium), AI Assistance HITL panel, **resizable left/right rails** (§A.1, persisted to `localStorage`), **per-version Rename/Delete + ⋯ menu** (Pin / Review later / Mark milestone, §C2), and the **Style & Agent Behavior page** (§C8) opened from "Rewrite in your voice". The old voice **"96%"** gauge and the **"Hook suggestions"** action are removed. Leave unbuilt endpoints as `// TODO` stubs returning mock data — no fake backend.
5. **Plan gating** via a single `plan` prop/context (default `'pro'`).
6. Apply **Emil Kowalski + taste** for motion/polish only (§B) — origin-aware sheets, quiet save/version confirmations, `active:scale`, staggered rail card entrance, `prefers-reduced-motion`. Nothing decorative.
7. Accessible + responsive: real `<button>`/`<input>`/`<textarea>`, labels tied to inputs, focus-visible rings; at narrow widths the inspector rail collapses behind the AI Assistance toggle and the editor stays full-measure. No horizontal scroll.
8. **Paste the actual current `MyWorkPage.jsx` (and the dashboard file) into Claude Code as the source of truth** — reproduce/extend it faithfully; the real code wins over this prose if they conflict.

**Build the editor faithfully on top of the existing architecture. Apply §C features and §B/§D6 polish only. Don't ask follow-ups.**
