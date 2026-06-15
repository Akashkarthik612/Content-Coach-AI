# Build Prompt — ContentCoach AI Dashboard (EXACT reproduction + scoped changes)

## ⚠️ READ FIRST — this is a FAITHFUL PORT, not a redesign

You are reproducing an **already-approved dashboard design** (`ContentCoach AI - Dashboard.dc.html`) **pixel-for-pixel** in React + Vite + TypeScript + Tailwind/CSS, using the **same fonts and color tokens as the landing/login pages**. The full exact spec is in §A below — every color, size, copy string, and layout value is taken directly from the approved file. **Match it exactly.** Then apply ONLY the scoped changes in §B. Do not invent layout, do not "improve" it, do not change copy, do not drop sections.

**A previous attempt got this badly wrong — explicitly DO NOT repeat these mistakes:**
- ❌ The sidebar was made **dark/navy**. → It is **WHITE (`#FFFFFF`)** with a light right border.
- ❌ The greeting was changed to "Good evening, akash_writes". → It is **"Good morning, Abinesh 👋"** in Newsreader 36px.
- ❌ The **4-card agent grid was reduced to 3** (Research dropped). → There are **FOUR** agent cards: **Research, Writer, SEO, Analytics**.
- ❌ Sidebar nav was changed to "Analytics / My Work / Context Vault". → Nav is **Dashboard, Content, Agents, Content Vault, Analytics, Templates**.
- ❌ Whole sections were dropped (calendar widget, Voice Vault gradient card, Analytics stat cards, Growth trend chart). → **ALL sections below must be present.**
- ❌ The colorful, lively look was flattened into sparse minimal cards. → Keep the **soft-shadow, tinted-icon, gradient-accent** visual language exactly.

If anything is ambiguous, the approved HTML wins. Reproduce first; only then layer §B changes.

---

# §A. EXACT BASE SPEC (reproduce 1:1)

## Global tokens
- **Fonts (Google):** `Newsreader` (serif: 400/500/600 + italic 400) — headings, big numbers, logo "C", platform titles. `Hanken Grotesk` (sans: 400/500/600/700) — all UI/body. `JetBrains Mono` (mono: 400/500/600) — eyebrow labels, %, dates, timestamps.
- **Page bg:** `#EEF2F9`. Body font Hanken Grotesk, color `#111827`, antialiased.
- **Color tokens:** Ink `#111827`; body `#4B5563`; muted `#6B7280`/`#9CA3AF`; Blue `#3B82F6`; Indigo `#6366F1`; Violet `#8B5CF6`; Sky `#0EA5E9`; Green `#22C55E`/`#16A34A`; Amber `#F59E0B`/`#B45309`; tint `#F7FAFF`; card white `#FFFFFF`; borders `rgba(17,24,39,.06–.08)`.
- **Keyframes:** `ccPulse` (0/100%: opacity1 scale1; 50%: opacity.4 scale.8) and `ccBlink` (0/49% opacity1; 50/100% opacity0).
- **Hover utilities:** `cc-hover` → `transition: transform .25s cubic-bezier(.2,.7,.3,1), box-shadow .25s; :hover { translateY(-3px); box-shadow 0 24px 50px -24px rgba(17,24,39,.28) }`. `cc-nav:hover { background:#EAF0FF }`. `cc-qa:hover { translateY(-2px); border-color:#3B82F6; box-shadow 0 12px 26px -16px rgba(59,130,246,.5) }`. `cc-scrim`/`cc-panel` transitions for the side panel.

## Layout shell
`display:flex; min-height:100vh; background:#EEF2F9`. Left = fixed sidebar (248px), right = scrolling `<main>`.

## SIDEBAR — width 248px, **white**, sticky
`background:#FFFFFF; border-right:1px solid rgba(17,24,39,.07); display:flex; flex-direction:column; padding:22px 16px; position:sticky; top:0; height:100vh;`
1. **Logo row** (padding `0 8px 24px`, gap 11): 34×34 rounded-10 tile, `linear-gradient(135deg,#3B82F6,#8B5CF6)`, `box-shadow:0 6px 16px -6px rgba(59,130,246,.6)`, Newsreader 20px white **"C"** (margin-top -2). Wordmark **"ContentCoach"** + **" AI"** in `#3B82F6`, weight 600, 15.5px, `letter-spacing:-0.01em`.
2. **Nav** (flex column, gap 3). Each item: `padding:10px 12px; border-radius:11px; gap:12px; font-size:14px;` with a 17px line icon (stroke `#6B7280`). Items in order:
   - **Dashboard** — ACTIVE: `background:#EAF0FF; color:#3B82F6; font-weight:600;` icon stroke `#3B82F6`. (home icon: `M3 11l9-8 9 8M5 10v10h14V10`)
   - **Content** — `#4B5563`, pencil icon
   - **Agents** — `#4B5563`, chip/robot icon (`rect 4,7 16×13 rx2` + antennae/eyes)
   - **Content Vault** — `#4B5563`, grid icon (`rect 3,3 18×18 rx2` + `M3 9h18 M9 21V9`)
   - **Analytics** — `#4B5563`, bars icon (3 vertical lines 6/12/18)
   - **Templates** — `#4B5563`, nodes icon (3 connected circles)
3. **Bottom block** (`margin-top:auto`):
   - **Calendar widget** (clickable → `openPanel`): `cursor:pointer; background:#F7FAFF; border:1px solid rgba(17,24,39,.08); border-radius:16px; padding:15px;` Header: "June 2026" (13.5px weight 600) + calendar icon (blue). Three date rows (mono number 18px-wide + colored dot cluster + right "N posts" 11.5px `#9CA3AF`): **13** (blue/indigo/violet dots, "3 posts", number `#3B82F6` weight 600) · **14** (indigo/sky dots, "2 posts") · **15** (violet dot, "1 post"). Footer (top border): "Open calendar →" 12px `#3B82F6` weight 600 + arrow icon.
   - **User row** (padding `14px 8px 4px`, gap 11): 34px round gradient avatar (`135deg,#3B82F6,#6366F1`) Newsreader 15px white **"A"**; **"Abinesh"** 13px weight 600 / **"Pro plan"** 11.5px `#9CA3AF`; trailing vertical-dots (kebab) icon `#9CA3AF`.

## MAIN — `flex:1; min-width:0; padding:28px 32px`

### Header (`flex; align-items:flex-start; justify-content:space-between; margin-bottom:28px`)
- **Left:** H1 Newsreader 400, 36px, `letter-spacing:-0.015em`, margin `0 0 14px`: **"Good morning, Abinesh 👋"**. Status pills row (gap 10) — each: `inline-flex; gap:8px; background:#fff; border:1px solid rgba(17,24,39,.08); border-radius:999px; padding:7px 14px; font-size:13px; color:#374151;` with a 7px dot:
  - green pulse dot + **"5 Agents Active"** (bold "5")
  - blue pulse dot + **"12 Tasks Running"** (bold "12")
  - amber dot + **"3 Drafts Need Review"** (bold "3")
- **Right** (flex, gap 10): 40px white rounded-11 **bell** button with red notification dot; dark **"Quick Actions"** button (`background:#111827; color:#fff; font-size:13.5px; weight 600; padding:11px 16px; border-radius:11px;` lightning bolt icon); 40px round gradient avatar Newsreader 16px white **"A"**.

### Section: Your agents (`margin-bottom:26px`)
Header row: H2 **"Your agents"** 17px weight 600 + right link **"View all →"** 13px `#3B82F6`. Grid `repeat(4,1fr)` gap 16. Each card: `cc-hover`, white, `border:1px solid rgba(17,24,39,.08); border-radius:20px; padding:20px; box-shadow:0 16px 38px -28px rgba(17,24,39,.2);`. Top row: 42px rounded-12 tinted icon tile + status pill (`inline-flex; gap:6px; font-size:11.5px; weight 600; padding:4px 9px; border-radius:999px` with 6px pulsing dot). Then name (15px weight 600), task sub (13px `#6B7280`, margin-bottom 16), then the metric.
1. **Research** — tile `#EAF0FF` blue magnifier; pill **"Active"** green (`#16A34A`/`#DCFCE7`); "Research Agent" / "Finding AI Trends"; metric = **Progress / 82%** (mono blue) + 6px bar filled 82% `linear-gradient(90deg,#3B82F6,#6366F1)` on track `#EEF2F7`.
2. **Writer** — tile `#EEF0FF` indigo pencil; pill **"Drafting"** indigo; "Writer Agent" / "Drafting LinkedIn Post"; metric = **Progress / 64%** indigo bar `(90deg,#6366F1,#8B5CF6)`.
3. **SEO** — tile `#F3EEFF` violet trend-up; pill **"Optimizing"** violet; "SEO Agent" / "Optimizing Content"; metric = "SEO Score" label + Newsreader **92**`/100` (28px/14px) violet `#8B5CF6`.
4. **Analytics** — tile `#E6F6FE` sky bars; pill **"Processing"** sky; "Analytics Agent" / "Analyzing Performance"; metric = 5-bar mini chart (heights 40/70/55/100/80%, colors `#BAE6FD`→`#0EA5E9`).

### Section: Content pipeline (`margin-bottom:26px`)
Header: H2 **"Content pipeline"** + right "5 stages · 11 items" 13px `#6B7280`. Grid `repeat(5,1fr)` gap 14. Columns: `background:#F7FAFF; border:1px solid rgba(17,24,39,.06); border-radius:16px; padding:13px;`. Column header (gap 8): colored dot + name 12.5px weight 600 + right count 11.5px `#9CA3AF`. Cards: `cc-hover`, white, `border:1px solid rgba(17,24,39,.07); border-radius:12px; padding:12px; box-shadow:0 6px 16px -12px rgba(17,24,39,.2);` with platform icon + label header + title (13px weight 500, line-height 1.4).
- **Ideas** (gray dot, **3**): "Why systems beat hustle" (LinkedIn); "Creator economy 2026" (Newsletter — indigo `#6366F1` square).
- **Research** (blue dot, **2**): "The future of AI teams" (Medium) + small "Research · 82%" chip with magnifier.
- **Drafting** (indigo dot, **2**): "AI won't replace creators" (LinkedIn) + 4px 64% indigo bar; "Guide to AI workflows" (Blog — sky `#0EA5E9` square).
- **Review** (amber dot, **3**): "5 mistakes creators make" (LinkedIn, **amber** border `#FCE7B5`, "Needs review" `#B45309`); "X thread: agent stack" (X — black `#111827` square, "Needs review").
- **Published** (green dot, **1**): "Building in public truth" (LinkedIn, "Live" `#16A34A`) + 👍 1.2k · 💬 127.

### Section: Recent content + Voice Vault (`grid:1.6fr 1fr; gap:16px; margin-bottom:26px`)
- **Recent content** (left): H2 "Recent content". Three `cc-hover` cards (white, rounded 18, padding 18, soft shadow), each = platform icon + meta label (12px `#6B7280`) → Newsreader 19px title → metrics row (13px `#6B7280`):
  1. **LinkedIn Post · 2d ago** — "AI Will Not Replace Creators" — 👍 1,284 · 💬 127 · 🔄 89
  2. **Medium Article · 8 min read** — "The Future Of AI Teams" — 👁 3,452 views · 👏 412
  3. **Newsletter · Issue #24** — "Weekly Creator Digest" — ✉ 2,143 opens · 📈 41% open rate
- **Voice Vault** (right): H2 "Voice Vault". Card: `linear-gradient(160deg,#3B82F6,#6366F1 55%,#8B5CF6); border-radius:20px; padding:24px; color:#fff; box-shadow:0 24px 50px -24px rgba(99,102,241,.6); height:calc(100% - 33px);`. Header: 38px rounded-11 `rgba(255,255,255,.18)` tile + white mic icon + "Your Voice" 15px weight 600. Mono "VOICE ACCURACY" label; Newsreader **56px "96%"**; then 4 checklist rows (20px translucent circle + white check + 13.5px label): "Writing Samples Imported", "LinkedIn History Analyzed", "Style Memory Active", "Brand Voice Learned".

### Section: Analytics
H2 "Analytics". Stat grid `repeat(4,1fr)` gap 16 (margin-bottom 16) — each card white rounded 18 padding 20: mono label + Newsreader 32px number + delta line:
- **VIEWS** "128k" / "↑ 18% this month" (green)
- **ENGAGEMENT** "8.4%" (`#3B82F6`) / "↑ 2.1% this month"
- **FOLLOWERS** "+2,341" (`#6366F1`) / "↑ 12% this month"
- **POSTS PUBLISHED** "46" (`#8B5CF6`) / "across 4 platforms" (`#6B7280`)
Then **Growth trend** card (white rounded 20 padding 24): header "Growth trend" + sub "Views over the last 7 months" + legend chip "Views" (blue). SVG area+line chart (`viewBox 0 0 760 200`, gradient fill `#3B82F6` 0.28→0, 2.5px blue line, end dot, 3 horizontal gridlines `#EEF2F7`). X-axis (mono 11px): Dec Jan Feb Mar Apr May Jun.

### Side panel mechanism
Keep the `panelOpen` state + scrim + slide-in panel (`cc-scrim` opacity, `cc-panel` `translateX`) opened by the calendar widget. In React: `const [panelOpen,setPanelOpen]` + a fixed scrim (opacity/pointer-events) + a right drawer that slides in.

---

# §B. SCOPED CHANGES (the ONLY deviations from §A)

Apply these on top of the faithful base. Everything not listed here stays exactly as §A.

**B0. Platform set (global):** publishing platforms are now **LinkedIn, X, Reddit** — **remove Medium** as a publishing target; swap Medium icon/label for **X** (black square, white X glyph) and **Reddit** (`#FF4500` circle + alien) wherever a *publishing platform* appears (pipeline, published, analytics, trend). LinkedIn icon stays `#0A66C2`. (Historical "Recent content" Medium card may stay as an example unless it conflicts.)

**B1. Agent cards.**
- **Writer** sub → **dynamic active draft title** ("Drafting: *<title>*"), from `currentDraft` state (mock default; "No active draft" when empty). Keep indigo + 64% bar.
- **SEO** → don't show only "92/100"; reframe as a **performance/benefit signal**: keep score + add an outcome line ("Discoverable — est. +34% reach" or "Ranking for 6 keywords") + a small green trend chip. Keep violet identity.
- **Analytics** → replace the abstract mini-bars with **real motivating metrics**: **Impressions** (e.g. 24.8k) + **Avg likes/post** (e.g. 312) as two label+number rows, plus a **"View detailed analytics →"** link → Detailed Analytics page (B6b). Data from a `useAnalytics()` hook (mock now), `// TODO: connect live metrics entered in editor`.
- **Keep the Research card unchanged** in the 4-grid.

**B2. Pipeline connections.** Add visible **flow connectors between the 5 columns** (Ideas→Research→Drafting→Review→Published) — thin animated dashed line + indigo chevron (reuse a `ccDash` keyframe, `stroke:#C7D2FE`), so it reads as one pipeline.

**B3. Ideas column** → surface **trending topics from Hacker News + Google News** as idea cards (source tag + headline + "Draft this →"). `useIdeas()` hook returns mock `IdeaItem[]` ({source,title,url}) now; `// TODO: connect HN + Google News`. ~3 items.

**B4. Research column** → add CTA **"Research my past writing & docs →"** (runs research over the user's prior writing + uploaded docs). **Pro-only**: hidden for Free/Plus; for Pro also show **"Customize research style"**. Gate via `plan:'free'|'plus'|'pro'` (default `'pro'`). `// TODO: Pro-only — vector embeddings over user writing + docs`.

**B5. Review column** → add **"Add files to review →"** button, connected to a right-click **"Send to review"** context-menu action on the editor's Save/page. Both ends share a `reviewQueue` store (mock); `// TODO: wire editor right-click → review queue`. Also stub `updatePostMetrics(postId,{impressions,likes})` for the editor's post-publish metrics box that feeds B1/B7.

**B6. Published + Detailed Analytics.**
- **Published** shows the **most recent published post** after the user clicks **Schedule** to LinkedIn/X/Reddit. **Publishing/scheduling is Pro** → show a **"Pro" lock badge** + "Available on Pro" tooltip (integrations not live at launch); gate by `plan`.
- **New `/analytics` route** (linked from B1 Analytics card + sidebar Analytics) = **stub shell**: header + "Detailed analytics — coming soon" + structure for **per-platform breakdown** (LinkedIn / X / Reddit). `// TODO: detailed analytics types TBD`.

**B7. Growth trend** → plot **Likes + Impressions combined across all platforms (LinkedIn+X+Reddit)** as **two series** with a legend (Impressions `#3B82F6`, Likes `#8B5CF6`); keep the area/axis styling. Per-platform individual trends live on the Detailed Analytics page (B6b). Data via `useAnalytics()` (mock), `// TODO: combine per-platform metrics`.

**B8. Header changes.**
- **Remove** the **"12 Tasks Running"** pill (keep "5 Agents Active").
- Add a polished **"AI Assistance" toggle tab** ("Click here for AI assistance" / "✦ AI Assistance") with clear on/off state, AI sparkle icon, gradient active fill (`135deg,#3B82F6,#8B5CF6`); toggling **on** opens an **AI Assistance slide-in panel** (reuse the existing scrim/panel transition) with an input + mock suggestion chips; `// TODO: connect AI assistant`.
- Move **"Drafts Need Review (3)"** to the **left** and make it a real **tab** (active/inactive) — selecting it focuses/filters the drafts awaiting review. Build it as a left **tab group** e.g. **"Overview" | "Needs review (3)"** (amber accent on the count).

---

# §C. Apply your UI skills — Emil Kowalski "Animations" + "Taste" (MOTION/POLISH ONLY)

Use the **Emil Kowalski animation** principles and the **taste** skill to refine *interaction and motion quality* — **without changing the locked visual design in §A**. Specifically:

- **Easing & duration:** enter with `ease-out` (e.g. `cubic-bezier(.16,1,.3,1)`), fast (150–260ms); avoid linear and avoid sluggish >400ms except large panel slides. Hover/press feedback ~120–180ms.
- **Origin-aware transforms:** panels slide from their edge; dropdowns/menus scale from their trigger origin; the AI Assistance + calendar drawers use a single spring-like ease, not a jarring snap.
- **Press states:** buttons (Quick Actions, AI Assistance toggle, CTAs) get a subtle `active:scale-[.97]` + shadow compression — tactile, not bouncy.
- **Staggered reveals:** on first load, stagger the 4 agent cards and the pipeline columns in by ~40–60ms each (opacity+translateY 6–8px). Subtle.
- **Tab transitions:** the "Overview / Needs review" tab uses an animated underline/indicator that slides between tabs (shared-layout style), not an instant jump.
- **Pulse/blink:** keep the existing `ccPulse` status dots and the pipeline dashed-flow animation.
- **Restraint (taste):** motion is supportive and quiet — no gratuitous parallax, no long fades, no spinning. Respect **`prefers-reduced-motion`** (disable transforms/stagger/pulse, keep instant state changes). Polish micro-details: consistent corner radii, optical alignment of icons, hover affordances on every clickable element, focus-visible rings.

The aesthetic stays 100% as §A; these skills only make it *feel* refined.

---

# §D. Build requirements
1. **Reproduce §A exactly**, then apply **only §B**, with §C motion polish. Re-verify against the "DO NOT" list at top.
2. Reuse landing-page **fonts + color tokens**; match the existing card/shadow/hover language for any new UI.
3. Single **`plan:'free'|'plus'|'pro'`** prop/context (default `'pro'`) gates Pro-only items (research-my-work, customize style, publish/schedule).
4. **Leave every live-data point as an open hook** returning mock data + `// TODO`: `useAnalytics()`, `useIdeas()`, `reviewQueue`, `updatePostMetrics()`, publishing integrations, AI assistant. No fake backend.
5. New **`/analytics`** route = stub (shell + per-platform structure + "coming soon").
6. Componentize sensibly (Sidebar, Header, AgentCard, Pipeline+PipelineColumn+PipelineCard, RecentContent, VoiceVault, AnalyticsStats, GrowthTrend, SidePanel, AIAssistantPanel) and drive repeated cards from data arrays. Accessible + responsive (grids collapse: 4→2→1, pipeline 5→horizontal-scroll on small screens), real `<button>`/`<a>` with hover/focus.

**Reproduce the approved dashboard faithfully — do not redesign. Apply §B and §C only. Don't ask follow-ups.**
