\# Build Prompt — ContentCoach AI Landing Page

Build a pixel-faithful, production landing page for \*\*ContentCoach AI\*\* — a SaaS that gives creators a team of 5 specialized AI agents (Research, Writer, SEO, Repurpose, Analytics) plus a Publisher. Use \*\*React \+ Vite \+ TypeScript\*\* with \*\*Tailwind CSS\*\* (or plain CSS modules — your call, but match every value below exactly). Single long-scroll marketing page. No backend. Static, responsive, smooth.

Match the spec below \*\*exactly\*\* — colors, pixel sizes, font sizes, copy, shadows, animations. Do not improvise content or restyle. This is a faithful rebuild of an approved design.

\---

\#\# 0\. Global Setup

\*\*Fonts (Google Fonts):\*\*  
\- \`Newsreader\` (serif) — weights 400, 500, 600; italic 400, 500\. Used for ALL headings, big numbers, logo letter "C", post avatars.  
\- \`Hanken Grotesk\` (sans) — weights 400, 500, 600, 700\. Body/default UI font.  
\- \`JetBrains Mono\` (mono) — weights 400, 500, 600\. Eyebrow labels, metadata, percentages, URLs, copyright.

Import:  
\`\`\`  
https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500\&family=Hanken+Grotesk:wght@400;500;600;700\&family=JetBrains+Mono:wght@400;500;600\&display=swap  
\`\`\`

\*\*Base styles:\*\*  
\- \`\* { box-sizing: border-box; }\`, \`html, body { margin:0; padding:0; }\`  
\- body: \`background:\#FFFFFF; font-family:'Hanken Grotesk', system-ui, sans-serif; \-webkit-font-smoothing:antialiased; color:\#111827;\`  
\- Wrap whole page in a container with \`overflow-x:hidden;\`

\*\*Color tokens:\*\*  
| Token | Hex | Use |  
|---|---|---|  
| Ink | \`\#111827\` | primary text, dark buttons |  
| Body gray | \`\#4B5563\` | paragraph text |  
| Muted gray | \`\#6B7280\` / \`\#9CA3AF\` | secondary/labels |  
| Blue (primary) | \`\#3B82F6\` | primary accent, CTAs |  
| Indigo | \`\#6366F1\` | Writer agent, accents |  
| Violet | \`\#8B5CF6\` | SEO agent, accents |  
| Sky | \`\#0EA5E9\` | Repurpose / blog accent |  
| Green | \`\#22C55E\` / \`\#16A34A\` | success/active dots & checks |  
| Page tint | \`\#F7FAFF\` | alternating section bg |  
| Hero badge bg | \`\#F7FAFF\` |  |  
| Dark bg | \`\#0B1220\` | dark sections \+ footer |  
| Dark card | \`\#121A2E\` | dark floating cards |  
| Agent icon bgs | Blue \`\#EAF0FF\`, Indigo \`\#EEF0FF\`, Violet \`\#F3EEFF\`, Sky \`\#E6F6FE\` |  
| Borders | \`rgba(17,24,39,.06–.12)\` light · \`rgba(255,255,255,.06–.1)\` dark |  
| Signature gradient | \`linear-gradient(135deg,\#3B82F6,\#8B5CF6)\` and \`(135deg,\#3B82F6,\#6366F1)\` |  
| Text gradient | \`linear-gradient(120deg,\#3B82F6,\#6366F1,\#8B5CF6)\` (clip to text) |

\*\*Keyframe animations (define globally, all \`ease-in-out infinite\` unless noted):\*\*  
\`\`\`css  
@keyframes ccFloatA { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-20px)} }  
@keyframes ccFloatB { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-30px)} }  
@keyframes ccFloatC { 0%,100%{transform:translateY(0) rotate(-1.5deg)} 50%{transform:translateY(-15px) rotate(-1.5deg)} }  
@keyframes ccFloatD { 0%,100%{transform:translateY(0) rotate(1.5deg)} 50%{transform:translateY(-24px) rotate(1.5deg)} }  
@keyframes ccPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.85)} }  
@keyframes ccBlob { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(50px,-40px) scale(1.15)} }  
@keyframes ccBlob2 { 0%,100%{transform:translate(0,0) scale(1.1)} 50%{transform:translate(-46px,40px) scale(1.2)} }  
@keyframes ccDash { to { stroke-dashoffset:-16 } }   /\* linear \*/  
@keyframes ccBlink { 0%,49%{opacity:1} 50%,100%{opacity:0} }  /\* steps(1) \*/  
@keyframes ccGrow { from { width:0 } }  
\`\`\`

\*\*Reusable patterns:\*\*  
\- \*\*Eyebrow label:\*\* JetBrains Mono, \`font-size:12px; letter-spacing:0.14em; text-transform:uppercase;\` colored per section (blue/indigo/violet), \`margin:0 0 14px\`.  
\- \*\*Section H2:\*\* Newsreader 400, \`font-size:48px; letter-spacing:-0.02em;\`.  
\- \*\*Section sub:\*\* \`font-size:17px; color:\#4B5563; line-height:1.6;\` centered, \`max-width:540–560px\`.  
\- \*\*Agent card icon tile:\*\* rounded square (\`border-radius:11–13px\`), tinted bg, centered 2px-stroke line icon (no fill) in the agent's color.  
\- \*\*"Active" status dot:\*\* 6px circle, agent color, \`animation:ccPulse\`.  
\- Card shadow (light): \`0 18–34px 40–70px \-22..-26px rgba(17,24,39,.22–.3)\`.  
\- Section max-width \`1200px\` (some \`1100px\`), \`margin:0 auto\`, horizontal padding \`32px\`.

\*\*Agent identity (use consistently everywhere):\*\*  
| Agent | Color | Icon (line, 2px stroke) | Icon tile bg |  
|---|---|---|---|  
| Research | \`\#3B82F6\` | magnifier (circle cx11 cy11 r7 \+ line to 21,21) | \`\#EAF0FF\` |  
| Writer | \`\#6366F1\` | pencil (\`M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z\`) | \`\#EEF0FF\` |  
| SEO | \`\#8B5CF6\` | trend-up (\`M3 17l6-6 4 4 8-8\` \+ \`M14 7h7v7\`) | \`\#F3EEFF\` |  
| Repurpose | \`\#0EA5E9\` | recycle/refresh arrows | \`\#E6F6FE\` |  
| Analytics | \`\#3B82F6\` | bar chart (3 vertical lines 6/12/18) | \`\#EAF0FF\` |  
| Publisher | white on gradient | paper-plane (\`M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z\`) | gradient \`135deg,\#3B82F6,\#6366F1\` |

Brand SVG icons used inline: \*\*LinkedIn\*\* (rounded \`\#0A66C2\` square \+ white "in"), \*\*Medium\*\* (rounded \`\#111827\` square \+ white M glyph), \*\*X\*\* (black square \+ white X path \`M18.244 2.25h3.308...\`), envelope, blog/book.

\---

\#\# 1\. NAV (sticky)  
\- \`position:sticky; top:0; z-index:50; background:rgba(255,255,255,.82); backdrop-filter:blur(14px); border-bottom:1px solid rgba(17,24,39,.06);\`  
\- Inner: max-width 1200, \`padding:16px 32px\`, flex space-between.  
\- \*\*Logo (left):\*\* 32×32 rounded-9px gradient tile \`135deg,\#3B82F6,\#8B5CF6\` with \`box-shadow:0 6px 16px \-6px rgba(59,130,246,.6)\`, Newsreader 19px white "C" (margin-top \-2px) \+ wordmark "ContentCoach" with " AI" in \`\#3B82F6\`, weight 600, 16.5px, \`letter-spacing:-0.01em\`.  
\- \*\*Right:\*\* links (14.5px \`\#4B5563\`): Platform · Agents · Pricing · Docs; then "Sign in" (14.5px \`\#111827\` weight 500); then \*\*Start Free\*\* button: 14px weight 600 white on \`\#111827\`, \`padding:10px 18px; border-radius:10px\`. Gap 32px.

\---

\#\# 2\. HERO  
Section \`position:relative; overflow:hidden; background:\#FFFFFF\`.

\*\*Ambient field (absolute, z0, pointer-events none):\*\*  
\- Top center ellipse: \`1100×700\`, \`radial-gradient(ellipse at center, rgba(59,130,246,.10), transparent 60%)\`, \`blur(20px)\`, top \-120, centered.  
\- Left blob: 380×380 circle \`rgba(99,102,241,.16)\` radial, \`blur(40px)\`, \`animation:ccBlob 20s\`, top 80 left 4%.  
\- Right blob: 420×420 \`rgba(139,92,246,.16)\`, \`blur(46px)\`, \`animation:ccBlob2 24s\`, top 200 right 2%.

\*\*Centered copy (z1, max-width 1200, padding \`84px 32px 40px\`, text-center):\*\*  
\- \*\*Badge:\*\* inline-flex pill, \`background:\#F7FAFF; border:1px solid rgba(17,24,39,.08); border-radius:999px; padding:7px 15px 7px 11px; margin-bottom:30px\`. Three 6px pulsing dots (\`\#3B82F6\`,\`\#6366F1\`,\`\#8B5CF6\` with 0/.3s/.6s delays) \+ text "5 specialized agents, one content team" (13px \`\#4B5563\` weight 500).  
\- \*\*H1:\*\* Newsreader 400, \`font-size:72px; line-height:1.02; letter-spacing:-0.025em; max-width:880px; margin:0 auto\`. Text: "Your AI content team," \`\<br\>\` then italic gradient-clipped span "running 24/7." (gradient \`120deg,\#3B82F6,\#6366F1,\#8B5CF6\`).  
\- \*\*Sub:\*\* 19px \`\#4B5563\` \`line-height:1.6\`, \`margin:28px auto 0; max-width:620px\`: "Research, write, optimize, repurpose, and publish content with specialized AI agents that learn your voice and work alongside you."  
\- \*\*CTA row\*\* (flex center gap 14, margin-top 36): primary \*\*Start Free\*\* (15.5px weight 600 white on \`\#3B82F6\`, \`padding:15px 28px; border-radius:12px; box-shadow:0 12px 30px \-8px rgba(59,130,246,.55)\`); secondary \*\*Watch Demo\*\* (play triangle \`\#3B82F6\` \+ label, 15.5px weight 500 \`\#111827\`, white bg, \`border:1px solid rgba(17,24,39,.12); padding:15px 22px; border-radius:12px\`).  
\- \*\*Fine print:\*\* 13px \`\#9CA3AF\`, \`margin-top:20px\`: "No credit card required · Free forever plan".

\*\*"Living ecosystem" stage\*\* — \`position:relative; max-width:1240px; margin:0 auto; height:600px; padding:0 32px\`. Absolutely-positioned floating cards, each white, \`border:1px solid rgba(17,24,39,.08)\`, rounded 18, padded \~17–20, card shadow, with a \`ccFloat\*\` animation. Place exactly:

1\. \*\*Research Agent\*\* — top:30 left:40, w256, \`ccFloatA 9s\`. Header: blue magnifier tile \+ "Research Agent" / "Active" (green dot). Body: "Found \*\*18 high-quality sources\*\*". Progress bar 74% blue (5px tall, track \`\#EEF2F7\`).  
2\. \*\*Writer Agent\*\* — top:330 left:90, w244, \`ccFloatC 11s\`. Indigo pencil tile \+ "Writer Agent" / "Drafting" (indigo dot). Body: "Generating LinkedIn article" \+ blinking indigo caret (2×13px, \`ccBlink\`).  
3\. \*\*LinkedIn post — Akash (center, z3)\*\* — top:64 left:50% translateX(-50%), w360, \`ccFloatB 10s\`, stronger shadow \`0 34px 70px \-26px rgba(17,24,39,.3)\`. 44px round gradient avatar "A" \+ "Akash B." (14.5px weight 700\) / "Founder @ ContentCoach AI" \+ LinkedIn icon. Body 14px line1.6: "The biggest mistake creators make isn't posting too little. It's creating content without a system." (blank line) "After testing AI agents for 90 days, we reduced our workflow from 6 hours to 45 minutes." Footer row (top border): 👍 1,284 · 💬 127 · 🔄 89\.  
4\. \*\*SEO Agent\*\* — top:24 right:56, w248, \`ccFloatD 12s\`. Violet trend tile \+ "SEO Agent" / "Optimizing". Body row: "SEO Score" left, big Newsreader 28px \`\#8B5CF6\` "92" \+ "/100" (15px \`\#9CA3AF\`).  
5\. \*\*Medium article (right-mid, z2)\*\* — top:250 right:30, w300, \`ccFloatA 13s\`, shadow \`0 30px 60px \-24px\`. Medium icon \+ mono label "MEDIUM · 8 MIN READ". Title Newsreader 19px: "How I Built a Content System That Writes With Me, Not For Me". Sub 13px \`\#6B7280\`: "Most AI tools generate content. The best ones create workflows." Then "Read More →" (13px \`\#3B82F6\` weight 600).  
6\. \*\*Analytics Agent\*\* — top:400 left:56%, w250, \`ccFloatC 10.5s\`, z2. Blue bar-chart tile \+ "Analytics Agent" / "Predicting". Body: "Expected engagement: \*\*8.3%\*\*".  
7\. \*\*LinkedIn post — Sara (bottom-left)\*\* — top:470 left:30, w322, \`ccFloatD 11.5s\`, shadow \`0 28px 56px \-24px\`. 40px round gradient avatar "S" (\`135deg,\#8B5CF6,\#6366F1\`) \+ "Sara Lin" / "Creator • 450k Followers" \+ LinkedIn icon. Body 13.5px: "One idea became:" → "→ LinkedIn Post → Newsletter → Blog → Thread" (blank) "The leverage is insane." Footer: 👍 2,481 · 💬 214 · 🔄 173\.

After the stage: a 40px gradient fade strip \`linear-gradient(to bottom, transparent, \#F7FAFF)\`.

\> Responsive note: the absolute-positioned ecosystem is desktop-only. Below \~1024px, collapse it into a simpler stacked/scaled arrangement (or hide the outer cards and keep the 2–3 hero cards) so nothing overlaps. Keep the float animations.

\---

\#\# 3\. SECTION — Build Your Content Team  
\`background:\#F7FAFF; padding:100px 32px\`. Centered header: eyebrow \`YOUR TEAM\` (blue), H2 "Build your content team", sub "Five specialized agents, each an expert at one job. Assemble the team your content actually needs."

5-column grid (\`repeat(5,1fr)\`, gap 18\) of agent cards — white, rounded 20, padded 22, shadow \`0 18px 40px \-26px rgba(17,24,39,.22)\`. Each card: 46px rounded-13 icon tile, name (16px weight 600), task sub (12.5px \`\#6B7280\`), status row (colored dot \+ status label 11.5px \+ right-aligned mono %), then a 5px progress bar filled to % in the agent color.

| Card | Task | Status | % |  
|---|---|---|---|  
| Research Agent | Scanning 40+ sources | Active (green dot) | 74% blue |  
| Writer Agent | LinkedIn article v3 | Drafting (indigo) | 58% indigo |  
| SEO Agent | Score 92/100 | Optimizing (violet) | 92% violet |  
| Repurpose Agent | 1 post → 5 formats | Splitting (sky) | 80% sky |  
| Analytics Agent | 8.3% engagement | Predicting (blue) | 66% blue |

\> Responsive: 5-col → 2 or 3-col → 1-col on mobile.

\---

\#\# 4\. SECTION — Teach Agents Your Voice (Voice Vault)  
\`background:\#fff; padding:110px 32px\`. Two-column grid \`1fr 1fr\` gap 64, items center.

\*\*Left:\*\* eyebrow \`VOICE VAULT\` (indigo), H2 (line-height 1.05) "Teach agents your voice", paragraph (17px, max-width 460): "Import your best work once. Every agent learns your rhythm, your phrases, your point of view — so everything they create already sounds like you." Stat row (margin-top 30): "\*\*94%\*\* voice match" (Newsreader 34px \`\#3B82F6\`) | divider | "\*\*47\*\* samples learned".

\*\*Right — Voice Vault UI card:\*\* outer \`\#F7FAFF\` rounded 24, padding 12, big shadow \`0 40px 80px \-40px rgba(17,24,39,.3)\`; inner white rounded 16 padding 24\. Header: 36px rounded-10 gradient tile (\`135deg,\#3B82F6,\#8B5CF6\`) with white mic icon \+ "Your Voice Vault" / "Active" (green dot). Then a vertical checklist (gap 13), each row \= 22px green-tinted (\`\#DCFCE7\`) circle with \`\#16A34A\` check \+ label (14px \`\#1F2937\`):  
1\. Writing samples imported  
2\. LinkedIn analyzed  
3\. Style memory created  
4\. Brand voice learned  
5\. Context vault active

\---

\#\# 5\. SECTION — Agents Work Together (Orchestration)  
\`background:\#F7FAFF; padding:110px 32px\`, max-width 1100, centered. Eyebrow \`ORCHESTRATION\` (violet), H2 "Agents work together", sub "A handoff pipeline, not a single bot. Each agent passes its work to the next — automatically."

Pipeline \= pill nodes connected by animated dashed arrows.  
\- \*\*Node pill:\*\* white, rounded 16, \`padding:18px 20px\`, shadow \`0 16px 36px \-24px\`, flex with 38px icon tile \+ label (14px weight 600), \`min-width:184px\`.  
\- \*\*Connector arrow SVG (44×24):\*\* dashed line \`stroke:\#C7D2FE; stroke-width:2; stroke-dasharray:4 4\` with \`animation:ccDash 1s linear infinite\`, plus an \`\#6366F1\` chevron head.  
\- Row 1: \*\*Research → Writer → SEO\*\*.  
\- Row 2 (margin-top 22): \*\*Analytics → Publisher\*\*. Publisher node is the gradient one (\`135deg,\#3B82F6,\#6366F1\`, white paper-plane icon \+ white label, shadow \`0 18px 40px \-18px rgba(59,130,246,.6)\`).

\> Wrap with flex-wrap; on narrow screens nodes stack and arrows can rotate/hide.

\---

\#\# 6\. SECTION — One Workspace (App mockup)  
\`background:\#fff; padding:110px 32px\`, max-width 1200\. Header: eyebrow \`THE WORKSPACE\` (blue), H2 "One workspace. Unlimited content.", sub "Your projects, your editor, and your agent team — together in one calm, focused view."

\*\*Browser-chrome mockup:\*\* outer \`border:1px solid rgba(17,24,39,.1); border-radius:22px; overflow:hidden; box-shadow:0 50px 100px \-45px rgba(17,24,39,.4); background:\#fff\`.  
\- \*\*Top bar (40px):\*\* \`\#F7FAFF\`, bottom border, three 11px gray dots, centered mono URL "app.contentcoach.ai".  
\- \*\*Body grid \`200px 1fr 268px\`, min-height 460:\*\*  
  \- \*\*Sidebar\*\* (\`\#FBFCFF\`, right border, padding \`18px 14px\`): nav items (icon \+ label, rounded 9, padding \`9px 11px\`): \*\*Projects\*\* (active — \`\#EAF0FF\` bg, \`\#3B82F6\` text weight 600, grid icon), Content Vault, Assets, Templates, Analytics (all \`\#4B5563\` 13.5px, line icons).  
  \- \*\*Editor\*\* (padding \`30px 34px\`): mono label "DRAFT · \~3 MIN READ"; H3 Newsreader 30px "The creator economy is moving from tools to teams"; body (14.5px line1.85 \`\#374151\`): para 1 "For a decade, creators bought tools. A scheduler here, a grammar checker there, an analytics dashboard nobody opened." para 2 "The next leap isn't another tool. It's a \[team that works while you sleep\]" where the bracketed phrase has a highlight (\`background:\#EAF0FF; border-bottom:2px solid \#3B82F6; border-radius:2px\`) followed by a blinking blue caret.  
  \- \*\*Agent workspace\*\* (\`\#FBFCFF\`, left border, padding 18): mono label "AGENT WORKSPACE"; stacked mini agent cards (white, rounded 12, padding 12, 30px icon tile \+ name \+ status):  
    \- Research — "Done · 18 sources" (green)  
    \- Writer — "Drafting v3…" (indigo)  
    \- SEO — "Queued" (gray)  
    \- Analytics — "Queued" (gray)

\---

\#\# 7\. SECTION — Create Everywhere (Repurpose)  
\`background:\#F7FAFF; padding:110px 32px\`, max-width 1200\. Eyebrow \`REPURPOSE\` (violet), H2 "Create everywhere", sub "One idea, every platform. Your agents reshape a single draft into native content for each channel."

3-column grid (\`repeat(3,1fr)\`, gap 20\) of format cards — white, rounded 18, padding 20, shadow \`0 20px 44px \-28px\`. Each card: brand-icon \+ label header, then content:  
1\. \*\*LinkedIn Post\*\* — "The biggest mistake creators make isn't posting too little. It's creating without a system. Here's the 45-minute workflow that replaced our 6-hour grind →"  
2\. \*\*Medium Article\*\* — Newsreader 18px title "The creator economy is moving from tools to teams" \+ sub "The next generation of content platforms won't be assistants. They'll be specialized AI teams."  
3\. \*\*Newsletter\*\* (indigo envelope tile) — Newsreader 17px "Issue \#24 — Build the team" \+ "This week: why systems beat hustle, and the 5 agents doing our heavy lifting."  
4\. \*\*Blog Post\*\* (sky book tile) — Newsreader 18px "A complete guide to AI content systems" \+ "SEO-optimized, 1,800 words, structured with H2s and a meta description."  
5\. \*\*X Thread\*\* (black X tile) — "1/ Everyone's drowning in content tools. / 2/ But tools don't create — teams do. / 3/ Here's how 5 AI agents replaced our content stack 🧵" (line breaks between).  
6\. \*\*Summary tile\*\* — gradient \`135deg,\#3B82F6,\#8B5CF6\`, rounded 18, padding 24, shadow \`0 24px 50px \-24px rgba(99,102,241,.6)\`. Newsreader 26px white "1 idea →" / "5 formats" \+ "Generated in under a minute, each one native to its platform."

\---

\#\# 8\. SECTION — Always On (Dark live activity)  
\`position:relative; overflow:hidden; background:\#0B1220; padding:110px 32px\`. Background blobs (absolute, z0): blue \`rgba(59,130,246,.28)\` 420px top-left \`ccBlob 22s\`; violet \`rgba(139,92,246,.26)\` 460px bottom-right \`ccBlob2 26s\`, both heavily blurred.

Content (z1, max-width 880, center): eyebrow \`ALWAYS ON\` (\`\#6FA8FF\`), H2 Newsreader 52px \`\#F4F7FF\` "Your agents never stop working.", sub (\`\#9AA6C4\`, max-width 500): "While you're offline, the team keeps researching, drafting, and optimizing — ready when you're back."

\*\*Activity feed card\*\* (\`background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); border-radius:18px; padding:12px; backdrop-filter:blur(8px); max-width:560px; text-align:left\`). Rows (each: pulsing colored dot \+ text \`\#DCE3F5\` with white bold agent name \+ right-aligned mono timestamp \`\#6B7794\`, separated by faint bottom borders):  
\- 🔵 \*\*Research Agent\*\* found 12 sources — 2s ago  
\- 🟣(indigo) \*\*Writer Agent\*\* generated draft — 18s ago  
\- 🟣(violet) \*\*SEO Agent\*\* improved readability — 41s ago  
\- 🔵(sky) \*\*Analytics Agent\*\* predicted 9.1% engagement — 1m ago

Dots pulse with staggered delays (0/.3/.6/.9s).

\---

\#\# 9\. SECTION — Social Proof  
\`background:\#fff; padding:110px 32px\`, max-width 1200\. Eyebrow \`CREATORS LOVE IT\` (blue), H2 "Built for people who publish".

3-column grid (gap 20\) of stat cards — \`\#F7FAFF\`, \`border:1px solid rgba(17,24,39,.07)\`, rounded 20, padding 26\. Each: big Newsreader 40px gradient-clipped stat \+ label (14px \`\#4B5563\`) \+ person row (40px round gradient avatar letter \+ name 13.5px weight 600 \+ role 12px \`\#6B7280\`):  
1\. \*\*+240%\*\* "Engagement growth" — Jordan Reyes · B2B creator · 120k (avatar "J", \`\#3B82F6→\#6366F1\`)  
2\. \*\*15 hrs\*\* "Saved every week" — Priya Nair · Founder · solo (avatar "P", \`\#8B5CF6→\#6366F1\`)  
3\. \*\*3×\*\* "Faster publishing" — Marcus Webb · Newsletter · 80k (avatar "M", \`\#0EA5E9→\#3B82F6\`)

\---

\#\# 10\. SECTION — Pricing  
\`background:\#F7FAFF; padding:110px 32px\`, max-width 1100\. Eyebrow \`PRICING\` (indigo), H2 "Start free. Scale your team." 3-column grid (gap 20, \`align-items:start\`).

\- \*\*Starter\*\* — white, \`border:1px solid rgba(17,24,39,.1)\`, rounded 22, padding 30\. "Starter" / "For getting started" / Newsreader 46px \*\*$19\*\* \+ "/mo". Button "Start Free" (\`\#F7FAFF\` bg, ink text, bordered). Features (blue check \+ label): 1 Agent · Voice Vault · 50 Credits.  
\- \*\*Pro (highlighted)\*\* — \`position:relative\`, \`border:2px solid \#3B82F6\`, rounded 22, padding 30, \`box-shadow:0 0 0 6px rgba(59,130,246,.1), 0 40px 80px \-34px rgba(59,130,246,.55)\`, \`transform:translateY(-12px)\`. Ribbon (absolute top \-13, centered): "MOST POPULAR" pill (\`\#3B82F6\` bg, white, 11.5px weight 600, rounded 999). Title "Pro" in \`\#3B82F6\` / "For serious creators" / \*\*$49\*\*/mo. Button "Start Free" solid \`\#3B82F6\` white with shadow. Features: 5 Agents · Unlimited Projects · Analytics · Repurposing.  
\- \*\*Team\*\* — like Starter. "Team" / "For growing studios" / \*\*$99\*\*/mo. Button "Start Free" (light). Features: Unlimited Agents · Collaboration · Advanced Analytics.

Checks: 15px SVG, \`stroke:\#3B82F6; stroke-width:2.6; M20 6L9 17l-5-5\`.

\---

\#\# 11\. FINAL CTA (Dark)  
\`position:relative; overflow:hidden; background:\#0B1220; padding:130px 32px\`. Background (z0): three faint floating dark mini-cards (\`\#121A2E\`, \`border:1px solid rgba(255,255,255,.06)\`, rounded 16, padding 15, opacity .4–.5), each an agent chip with icon tile \+ label, floating:  
\- top 10% left 6%, \`ccFloatA 11s\` — "Research · Active" (blue magnifier)  
\- bottom 14% right 7%, \`ccFloatD 13s\` — "SEO · 92/100" (violet trend)  
\- top 24% right 16%, \`ccFloatB 12s\` — "Writer · Drafting" (indigo pencil)

Content (z1, max-width 720, center): H2 Newsreader 60px \`\#F4F7FF\` "Stop creating content alone."; sub (18px \`\#9AA6C4\`, max-width 520): "Build an AI content team that learns your voice and grows with you."; \*\*Start Free Today\*\* button (16px weight 600 white on \`\#3B82F6\`, \`padding:16px 34px; border-radius:13px; box-shadow:0 16px 40px \-10px rgba(59,130,246,.7)\`); fine print (13px \`\#6B7794\`): "No credit card required · Free forever plan".

\---

\#\# 12\. FOOTER  
\`background:\#0B1220; border-top:1px solid rgba(255,255,255,.07); padding:40px 32px\`. Max-width 1200, flex space-between, wrap, gap 16:  
\- Left: 28px rounded-8 gradient logo tile (Newsreader 16px white "C") \+ "ContentCoach AI" (14.5px weight 600 \`\#E5EAF6\`).  
\- Center: links (13.5px \`\#8893AE\`, gap 26): Platform · Agents · Pricing · Privacy · Terms.  
\- Right: mono 11.5px \`\#6B7794\` "© 2026 ContentCoach AI".

\---

\#\# Build Requirements  
1\. \*\*Match every value above\*\* — px sizes, colors, copy, shadows, animations. Don't substitute fonts or "improve" spacing.  
2\. \*\*Componentize\*\* sensibly: \`Nav\`, \`Hero\` (+ \`FloatingCard\`, \`AgentCard\`, \`SocialPost\`), \`TeamGrid\`, \`VoiceVault\`, \`Orchestration\`, \`WorkspaceMockup\`, \`Repurpose\`, \`AlwaysOn\`, \`SocialProof\`, \`Pricing\`, \`FinalCTA\`, \`Footer\`. Drive repeated cards (agents, pricing tiers, format cards, stat cards) from data arrays.  
3\. \*\*Icons:\*\* inline SVGs as shown (line icons 2px stroke; brand marks as specified). A small \`\<Icon\>\` set is fine.  
4\. \*\*Animations:\*\* CSS keyframes (\`prefers-reduced-motion\` → disable floats/blobs/pulses). No JS animation libs needed.  
5\. \*\*Responsive:\*\* desktop-first to match the design; gracefully collapse the absolute hero ecosystem and multi-column grids on tablet/mobile (breakpoints \~1024 / 768). Nav → hamburger on mobile.  
6\. \*\*Accessibility:\*\* semantic landmarks (\`nav\`/\`main\`/\`section\`/\`footer\`), \`aria-label\` on brand icon SVGs, sufficient contrast, focus states on buttons/links.  
7\. \*\*Buttons/links\*\* are static (no routing needed) — but make them real \`\<button\>\`/\`\<a\>\` with hover states (slight lift / brightness on primary CTAs).  
8\. Clean, typed, formatted (Prettier). Provide \`npm install && npm run dev\` working out of the box.

Deliver the full project. Don't ask follow-ups — build it exactly as specified.

\---

\# MOBILE VERSION (build at the same time)

Build the mobile/responsive version \*\*together with desktop in the same components\*\* — do NOT make a separate mobile page or app. Use CSS media queries / Tailwind responsive prefixes. Everything above is the \*\*desktop (≥1024px)\*\* spec. Below are the rules for \*\*tablet (768–1023px)\*\* and \*\*phone (≤767px)\*\*. When a section isn't mentioned for a breakpoint, it keeps the desktop behavior scaled down by the global rules.

\#\#\# Breakpoints  
\- \*\*Desktop:\*\* ≥ 1024px — exactly as specified above.  
\- \*\*Tablet:\*\* 768–1023px — multi-column grids reduce, hero ecosystem simplifies.  
\- \*\*Phone:\*\* ≤ 767px — single column, stacked, larger touch targets.

\#\#\# Global mobile rules  
\- \*\*Section padding:\*\* reduce horizontal \`32px → 20px\` (phone). Reduce vertical \`100–130px → 56–64px\` (phone), \`→ 80px\` (tablet).  
\- \*\*Container:\*\* all \`max-width\` blocks become \`width:100%\` with the padding above.  
\- \*\*Type scale (phone):\*\*  
  \- Hero H1 \`72px → 40px\` (\`line-height:1.05\`); tablet \`→ 56px\`.  
  \- Section H2 \`48px → 30px\`; tablet \`→ 40px\`.  
  \- Always-On H2 \`52px → 30px\`; Final CTA H2 \`60px → 34px\`.  
  \- Body sub \`19px → 16px\`, \`17px → 15px\`. Never below 14px for body, 13px for fine print.  
  \- Big stat numbers (40px) → \`32px\`; pricing \`$\` (46px) → \`38px\`.  
\- \*\*Touch targets:\*\* all buttons/links min-height \*\*44px\*\*, min horizontal padding 20px. Increase tap spacing in nav.  
\- \*\*Hover → tap:\*\* keep hover styles for desktop but ensure tap/\`:active\` states exist; don't rely on hover to reveal anything.  
\- \*\*No horizontal scroll:\*\* keep \`overflow-x:hidden\`; verify nothing overflows at 360px width.  
\- \*\*Animations:\*\* keep \`ccPulse\`/\`ccBlink\`/\`ccDash\` and blob drifts (they're cheap), but the heavy floating hero cards become static on phone (see Hero). Honor \`prefers-reduced-motion\`.

\#\#\# 1\. Nav (mobile)  
\- Collapse the link row into a \*\*hamburger menu\*\*. Logo stays left, hamburger icon (24px, ink) right.  
\- Tap opens a full-width dropdown/sheet under the sticky bar (white, blurred, soft shadow): stacked links Platform · Agents · Pricing · Docs · Sign in (each ≥44px row, 16px), then a full-width \*\*Start Free\*\* button (\`\#111827\`, white, rounded 10, 14px weight 600).  
\- Keep nav sticky \+ blurred. Reduce nav padding to \`14px 20px\`.

\#\#\# 2\. Hero (mobile) — most important change  
The absolute 600px "living ecosystem" stage is \*\*desktop/tablet only\*\*. On phone:  
\- \*\*Hide the absolute-positioned stage entirely.\*\* Replace with a simple vertical stack of \*\*3 representative cards\*\* (in the page flow, centered, \`gap:16px\`, each \`max-width:340px; margin:0 auto\`): \*\*Research Agent\*\* card, the \*\*Akash LinkedIn post\*\*, and the \*\*SEO Agent\*\* card (in that order). Keep their existing inner markup/styling; just stack them — no absolute positioning, no float animation (gentle \`ccFloatA\` optional but subtle).  
\- Center copy stays: badge → H1 (40px) → sub → CTA row → fine print. \*\*CTA row stacks vertically\*\* on phone (\`flex-direction:column; gap:12px\`), both buttons full-width (max-width 340, centered).  
\- Hero top padding \`84px → 40px\`.  
\- \*\*Tablet:\*\* keep the absolute ecosystem but scale the stage down (\`height \~480px\`, reduce card widths \~15%, pull edge cards inward) OR fall back to the same simplified stack if overlap occurs — prefer no overlap over fidelity.  
\- Keep the ambient gradient blobs (they're background, harmless).

\#\#\# 3\. Build Your Content Team (mobile)  
\- 5-col grid → \*\*tablet: 3-col then 2-col\*\*, \*\*phone: 1-col\*\* (full-width cards stacked, \`gap:14px\`). Progress bars and content unchanged.

\#\#\# 4\. Voice Vault (mobile)  
\- Two-column \`1fr 1fr\` → \*\*single column\*\*, text block first, then the Voice Vault UI card below (full-width, \`max-width:420px; margin:0 auto\`). Gap \`64 → 32\`. Stat row stays inline.

\#\#\# 5\. Orchestration (mobile)  
\- Pipeline nodes \*\*stack vertically\*\*, full-width (max-width 320, centered). Replace the horizontal dashed arrows with \*\*downward\*\* chevron connectors between stacked nodes (rotate the arrow SVG 90°, keep the \`ccDash\` animation). Order: Research → Writer → SEO → Analytics → Publisher in one vertical chain.

\#\#\# 6\. Workspace Mockup (mobile)  
\- The \`200px 1fr 268px\` 3-column app is too wide for phone. On phone, \*\*stack the three panes vertically\*\* inside the browser chrome: Sidebar becomes a \*\*horizontal scrollable row of nav chips\*\* (or a compact 2-row list) at top; then the Editor; then the Agent Workspace cards below. Keep the browser top bar (dots \+ URL). Reduce editor padding to \`20px\`.   
\- \*\*Tablet:\*\* drop to \`1fr 240px\` (hide or collapse the left sidebar to icons-only) or stack editor \+ agent panel.  
\- Ensure the mockup never forces horizontal page scroll — let its internal content scroll or wrap instead.

\#\#\# 7\. Create Everywhere (mobile)  
\- 3-col grid → \*\*tablet: 2-col\*\*, \*\*phone: 1-col\*\*. The gradient summary tile goes last, full-width.

\#\#\# 8\. Always On — dark feed (mobile)  
\- Center copy scales (H2 30px). Activity feed card stays full-width (\`max-width:560 → 100%\`). Each row: if the timestamp \+ text crowd at 360px, allow text to wrap and keep the timestamp right-aligned on its own line, or shrink text to 13px. Keep pulsing dots.

\#\#\# 9\. Social Proof (mobile)  
\- 3-col stat grid → \*\*2-col (tablet)\*\* → \*\*1-col (phone)\*\*, stacked full-width.

\#\#\# 10\. Pricing (mobile)  
\- 3-col → \*\*1-col stacked\*\* (phone), \`gap:18px\`. \*\*Remove the Pro \`translateY(-12px)\` lift\*\* when stacked (it looks broken vertically) — instead keep its blue border \+ "MOST POPULAR" ribbon and optionally order Pro \*\*first\*\* or middle. Cards full-width, \`max-width:400px; margin:0 auto\`. Buttons already full-width — keep ≥44px.  
\- \*\*Tablet:\*\* can keep 3-col if it fits, else 1-col.

\#\#\# 11\. Final CTA (mobile)  
\- Hide the 3 floating background agent chips on phone (decorative, they overlap). H2 → 34px. Button full-width-ish (max-width 320, centered), ≥44px. Keep dark bg \+ fine print.

\#\#\# 12\. Footer (mobile)  
\- Flex row → \*\*stack vertically, centered\*\* (\`flex-direction:column; align-items:center; gap:20px; text-align:center\`). Logo row, then wrapped link row (allow wrap, gap 18), then copyright last.

\#\#\# Mobile build requirements  
\- \*\*Same components, responsive\*\* — do not duplicate the page. Use Tailwind responsive prefixes (\`md:\`/\`lg:\`) or media queries; author mobile-first or desktop-first consistently.  
\- Test layouts at \*\*360px, 390px, 768px, 1024px, 1440px\*\* — no horizontal overflow, no overlapping cards, no text clipping, all tap targets ≥44px at every width.  
\- The hero ecosystem simplification (hide absolute stage → 3 stacked cards on phone) is the single most important mobile change — get it right.  
\- Keep all copy identical across breakpoints; only layout/scale changes.

\# Build Prompt — ContentCoach AI Landing Page

Build a pixel-faithful, production landing page for \*\*ContentCoach AI\*\* — a SaaS that gives creators a team of 5 specialized AI agents (Research, Writer, SEO, Repurpose, Analytics) plus a Publisher. Use \*\*React \+ Vite \+ TypeScript\*\* with \*\*Tailwind CSS\*\* (or plain CSS modules — your call, but match every value below exactly). Single long-scroll marketing page. No backend. Static, responsive, smooth.

Match the spec below \*\*exactly\*\* — colors, pixel sizes, font sizes, copy, shadows, animations. Do not improvise content or restyle. This is a faithful rebuild of an approved design.

\---

\#\# 0\. Global Setup

\*\*Fonts (Google Fonts):\*\*  
\- \`Newsreader\` (serif) — weights 400, 500, 600; italic 400, 500\. Used for ALL headings, big numbers, logo letter "C", post avatars.  
\- \`Hanken Grotesk\` (sans) — weights 400, 500, 600, 700\. Body/default UI font.  
\- \`JetBrains Mono\` (mono) — weights 400, 500, 600\. Eyebrow labels, metadata, percentages, URLs, copyright.

Import:  
\`\`\`  
https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500\&family=Hanken+Grotesk:wght@400;500;600;700\&family=JetBrains+Mono:wght@400;500;600\&display=swap  
\`\`\`

\*\*Base styles:\*\*  
\- \`\* { box-sizing: border-box; }\`, \`html, body { margin:0; padding:0; }\`  
\- body: \`background:\#FFFFFF; font-family:'Hanken Grotesk', system-ui, sans-serif; \-webkit-font-smoothing:antialiased; color:\#111827;\`  
\- Wrap whole page in a container with \`overflow-x:hidden;\`

\*\*Color tokens:\*\*  
| Token | Hex | Use |  
|---|---|---|  
| Ink | \`\#111827\` | primary text, dark buttons |  
| Body gray | \`\#4B5563\` | paragraph text |  
| Muted gray | \`\#6B7280\` / \`\#9CA3AF\` | secondary/labels |  
| Blue (primary) | \`\#3B82F6\` | primary accent, CTAs |  
| Indigo | \`\#6366F1\` | Writer agent, accents |  
| Violet | \`\#8B5CF6\` | SEO agent, accents |  
| Sky | \`\#0EA5E9\` | Repurpose / blog accent |  
| Green | \`\#22C55E\` / \`\#16A34A\` | success/active dots & checks |  
| Page tint | \`\#F7FAFF\` | alternating section bg |  
| Hero badge bg | \`\#F7FAFF\` |  |  
| Dark bg | \`\#0B1220\` | dark sections \+ footer |  
| Dark card | \`\#121A2E\` | dark floating cards |  
| Agent icon bgs | Blue \`\#EAF0FF\`, Indigo \`\#EEF0FF\`, Violet \`\#F3EEFF\`, Sky \`\#E6F6FE\` |  
| Borders | \`rgba(17,24,39,.06–.12)\` light · \`rgba(255,255,255,.06–.1)\` dark |  
| Signature gradient | \`linear-gradient(135deg,\#3B82F6,\#8B5CF6)\` and \`(135deg,\#3B82F6,\#6366F1)\` |  
| Text gradient | \`linear-gradient(120deg,\#3B82F6,\#6366F1,\#8B5CF6)\` (clip to text) |

\*\*Keyframe animations (define globally, all \`ease-in-out infinite\` unless noted):\*\*  
\`\`\`css  
@keyframes ccFloatA { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-20px)} }  
@keyframes ccFloatB { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-30px)} }  
@keyframes ccFloatC { 0%,100%{transform:translateY(0) rotate(-1.5deg)} 50%{transform:translateY(-15px) rotate(-1.5deg)} }  
@keyframes ccFloatD { 0%,100%{transform:translateY(0) rotate(1.5deg)} 50%{transform:translateY(-24px) rotate(1.5deg)} }  
@keyframes ccPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.85)} }  
@keyframes ccBlob { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(50px,-40px) scale(1.15)} }  
@keyframes ccBlob2 { 0%,100%{transform:translate(0,0) scale(1.1)} 50%{transform:translate(-46px,40px) scale(1.2)} }  
@keyframes ccDash { to { stroke-dashoffset:-16 } }   /\* linear \*/  
@keyframes ccBlink { 0%,49%{opacity:1} 50%,100%{opacity:0} }  /\* steps(1) \*/  
@keyframes ccGrow { from { width:0 } }  
\`\`\`

\*\*Reusable patterns:\*\*  
\- \*\*Eyebrow label:\*\* JetBrains Mono, \`font-size:12px; letter-spacing:0.14em; text-transform:uppercase;\` colored per section (blue/indigo/violet), \`margin:0 0 14px\`.  
\- \*\*Section H2:\*\* Newsreader 400, \`font-size:48px; letter-spacing:-0.02em;\`.  
\- \*\*Section sub:\*\* \`font-size:17px; color:\#4B5563; line-height:1.6;\` centered, \`max-width:540–560px\`.  
\- \*\*Agent card icon tile:\*\* rounded square (\`border-radius:11–13px\`), tinted bg, centered 2px-stroke line icon (no fill) in the agent's color.  
\- \*\*"Active" status dot:\*\* 6px circle, agent color, \`animation:ccPulse\`.  
\- Card shadow (light): \`0 18–34px 40–70px \-22..-26px rgba(17,24,39,.22–.3)\`.  
\- Section max-width \`1200px\` (some \`1100px\`), \`margin:0 auto\`, horizontal padding \`32px\`.

\*\*Agent identity (use consistently everywhere):\*\*  
| Agent | Color | Icon (line, 2px stroke) | Icon tile bg |  
|---|---|---|---|  
| Research | \`\#3B82F6\` | magnifier (circle cx11 cy11 r7 \+ line to 21,21) | \`\#EAF0FF\` |  
| Writer | \`\#6366F1\` | pencil (\`M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z\`) | \`\#EEF0FF\` |  
| SEO | \`\#8B5CF6\` | trend-up (\`M3 17l6-6 4 4 8-8\` \+ \`M14 7h7v7\`) | \`\#F3EEFF\` |  
| Repurpose | \`\#0EA5E9\` | recycle/refresh arrows | \`\#E6F6FE\` |  
| Analytics | \`\#3B82F6\` | bar chart (3 vertical lines 6/12/18) | \`\#EAF0FF\` |  
| Publisher | white on gradient | paper-plane (\`M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z\`) | gradient \`135deg,\#3B82F6,\#6366F1\` |

Brand SVG icons used inline: \*\*LinkedIn\*\* (rounded \`\#0A66C2\` square \+ white "in"), \*\*Medium\*\* (rounded \`\#111827\` square \+ white M glyph), \*\*X\*\* (black square \+ white X path \`M18.244 2.25h3.308...\`), envelope, blog/book.

\---

\#\# 1\. NAV (sticky)  
\- \`position:sticky; top:0; z-index:50; background:rgba(255,255,255,.82); backdrop-filter:blur(14px); border-bottom:1px solid rgba(17,24,39,.06);\`  
\- Inner: max-width 1200, \`padding:16px 32px\`, flex space-between.  
\- \*\*Logo (left):\*\* 32×32 rounded-9px gradient tile \`135deg,\#3B82F6,\#8B5CF6\` with \`box-shadow:0 6px 16px \-6px rgba(59,130,246,.6)\`, Newsreader 19px white "C" (margin-top \-2px) \+ wordmark "ContentCoach" with " AI" in \`\#3B82F6\`, weight 600, 16.5px, \`letter-spacing:-0.01em\`.  
\- \*\*Right:\*\* links (14.5px \`\#4B5563\`): Platform · Agents · Pricing · Docs; then "Sign in" (14.5px \`\#111827\` weight 500); then \*\*Start Free\*\* button: 14px weight 600 white on \`\#111827\`, \`padding:10px 18px; border-radius:10px\`. Gap 32px.

\---

\#\# 2\. HERO  
Section \`position:relative; overflow:hidden; background:\#FFFFFF\`.

\*\*Ambient field (absolute, z0, pointer-events none):\*\*  
\- Top center ellipse: \`1100×700\`, \`radial-gradient(ellipse at center, rgba(59,130,246,.10), transparent 60%)\`, \`blur(20px)\`, top \-120, centered.  
\- Left blob: 380×380 circle \`rgba(99,102,241,.16)\` radial, \`blur(40px)\`, \`animation:ccBlob 20s\`, top 80 left 4%.  
\- Right blob: 420×420 \`rgba(139,92,246,.16)\`, \`blur(46px)\`, \`animation:ccBlob2 24s\`, top 200 right 2%.

\*\*Centered copy (z1, max-width 1200, padding \`84px 32px 40px\`, text-center):\*\*  
\- \*\*Badge:\*\* inline-flex pill, \`background:\#F7FAFF; border:1px solid rgba(17,24,39,.08); border-radius:999px; padding:7px 15px 7px 11px; margin-bottom:30px\`. Three 6px pulsing dots (\`\#3B82F6\`,\`\#6366F1\`,\`\#8B5CF6\` with 0/.3s/.6s delays) \+ text "5 specialized agents, one content team" (13px \`\#4B5563\` weight 500).  
\- \*\*H1:\*\* Newsreader 400, \`font-size:72px; line-height:1.02; letter-spacing:-0.025em; max-width:880px; margin:0 auto\`. Text: "Your AI content team," \`\<br\>\` then italic gradient-clipped span "running 24/7." (gradient \`120deg,\#3B82F6,\#6366F1,\#8B5CF6\`).  
\- \*\*Sub:\*\* 19px \`\#4B5563\` \`line-height:1.6\`, \`margin:28px auto 0; max-width:620px\`: "Research, write, optimize, repurpose, and publish content with specialized AI agents that learn your voice and work alongside you."  
\- \*\*CTA row\*\* (flex center gap 14, margin-top 36): primary \*\*Start Free\*\* (15.5px weight 600 white on \`\#3B82F6\`, \`padding:15px 28px; border-radius:12px; box-shadow:0 12px 30px \-8px rgba(59,130,246,.55)\`); secondary \*\*Watch Demo\*\* (play triangle \`\#3B82F6\` \+ label, 15.5px weight 500 \`\#111827\`, white bg, \`border:1px solid rgba(17,24,39,.12); padding:15px 22px; border-radius:12px\`).  
\- \*\*Fine print:\*\* 13px \`\#9CA3AF\`, \`margin-top:20px\`: "No credit card required · Free forever plan".

\*\*"Living ecosystem" stage\*\* — \`position:relative; max-width:1240px; margin:0 auto; height:600px; padding:0 32px\`. Absolutely-positioned floating cards, each white, \`border:1px solid rgba(17,24,39,.08)\`, rounded 18, padded \~17–20, card shadow, with a \`ccFloat\*\` animation. Place exactly:

1\. \*\*Research Agent\*\* — top:30 left:40, w256, \`ccFloatA 9s\`. Header: blue magnifier tile \+ "Research Agent" / "Active" (green dot). Body: "Found \*\*18 high-quality sources\*\*". Progress bar 74% blue (5px tall, track \`\#EEF2F7\`).  
2\. \*\*Writer Agent\*\* — top:330 left:90, w244, \`ccFloatC 11s\`. Indigo pencil tile \+ "Writer Agent" / "Drafting" (indigo dot). Body: "Generating LinkedIn article" \+ blinking indigo caret (2×13px, \`ccBlink\`).  
3\. \*\*LinkedIn post — Akash (center, z3)\*\* — top:64 left:50% translateX(-50%), w360, \`ccFloatB 10s\`, stronger shadow \`0 34px 70px \-26px rgba(17,24,39,.3)\`. 44px round gradient avatar "A" \+ "Akash B." (14.5px weight 700\) / "Founder @ ContentCoach AI" \+ LinkedIn icon. Body 14px line1.6: "The biggest mistake creators make isn't posting too little. It's creating content without a system." (blank line) "After testing AI agents for 90 days, we reduced our workflow from 6 hours to 45 minutes." Footer row (top border): 👍 1,284 · 💬 127 · 🔄 89\.  
4\. \*\*SEO Agent\*\* — top:24 right:56, w248, \`ccFloatD 12s\`. Violet trend tile \+ "SEO Agent" / "Optimizing". Body row: "SEO Score" left, big Newsreader 28px \`\#8B5CF6\` "92" \+ "/100" (15px \`\#9CA3AF\`).  
5\. \*\*Medium article (right-mid, z2)\*\* — top:250 right:30, w300, \`ccFloatA 13s\`, shadow \`0 30px 60px \-24px\`. Medium icon \+ mono label "MEDIUM · 8 MIN READ". Title Newsreader 19px: "How I Built a Content System That Writes With Me, Not For Me". Sub 13px \`\#6B7280\`: "Most AI tools generate content. The best ones create workflows." Then "Read More →" (13px \`\#3B82F6\` weight 600).  
6\. \*\*Analytics Agent\*\* — top:400 left:56%, w250, \`ccFloatC 10.5s\`, z2. Blue bar-chart tile \+ "Analytics Agent" / "Predicting". Body: "Expected engagement: \*\*8.3%\*\*".  
7\. \*\*LinkedIn post — Sara (bottom-left)\*\* — top:470 left:30, w322, \`ccFloatD 11.5s\`, shadow \`0 28px 56px \-24px\`. 40px round gradient avatar "S" (\`135deg,\#8B5CF6,\#6366F1\`) \+ "Sara Lin" / "Creator • 450k Followers" \+ LinkedIn icon. Body 13.5px: "One idea became:" → "→ LinkedIn Post → Newsletter → Blog → Thread" (blank) "The leverage is insane." Footer: 👍 2,481 · 💬 214 · 🔄 173\.

After the stage: a 40px gradient fade strip \`linear-gradient(to bottom, transparent, \#F7FAFF)\`.

\> Responsive note: the absolute-positioned ecosystem is desktop-only. Below \~1024px, collapse it into a simpler stacked/scaled arrangement (or hide the outer cards and keep the 2–3 hero cards) so nothing overlaps. Keep the float animations.

\---

\#\# 3\. SECTION — Build Your Content Team  
\`background:\#F7FAFF; padding:100px 32px\`. Centered header: eyebrow \`YOUR TEAM\` (blue), H2 "Build your content team", sub "Five specialized agents, each an expert at one job. Assemble the team your content actually needs."

5-column grid (\`repeat(5,1fr)\`, gap 18\) of agent cards — white, rounded 20, padded 22, shadow \`0 18px 40px \-26px rgba(17,24,39,.22)\`. Each card: 46px rounded-13 icon tile, name (16px weight 600), task sub (12.5px \`\#6B7280\`), status row (colored dot \+ status label 11.5px \+ right-aligned mono %), then a 5px progress bar filled to % in the agent color.

| Card | Task | Status | % |  
|---|---|---|---|  
| Research Agent | Scanning 40+ sources | Active (green dot) | 74% blue |  
| Writer Agent | LinkedIn article v3 | Drafting (indigo) | 58% indigo |  
| SEO Agent | Score 92/100 | Optimizing (violet) | 92% violet |  
| Repurpose Agent | 1 post → 5 formats | Splitting (sky) | 80% sky |  
| Analytics Agent | 8.3% engagement | Predicting (blue) | 66% blue |

\> Responsive: 5-col → 2 or 3-col → 1-col on mobile.

\---

\#\# 4\. SECTION — Teach Agents Your Voice (Voice Vault)  
\`background:\#fff; padding:110px 32px\`. Two-column grid \`1fr 1fr\` gap 64, items center.

\*\*Left:\*\* eyebrow \`VOICE VAULT\` (indigo), H2 (line-height 1.05) "Teach agents your voice", paragraph (17px, max-width 460): "Import your best work once. Every agent learns your rhythm, your phrases, your point of view — so everything they create already sounds like you." Stat row (margin-top 30): "\*\*94%\*\* voice match" (Newsreader 34px \`\#3B82F6\`) | divider | "\*\*47\*\* samples learned".

\*\*Right — Voice Vault UI card:\*\* outer \`\#F7FAFF\` rounded 24, padding 12, big shadow \`0 40px 80px \-40px rgba(17,24,39,.3)\`; inner white rounded 16 padding 24\. Header: 36px rounded-10 gradient tile (\`135deg,\#3B82F6,\#8B5CF6\`) with white mic icon \+ "Your Voice Vault" / "Active" (green dot). Then a vertical checklist (gap 13), each row \= 22px green-tinted (\`\#DCFCE7\`) circle with \`\#16A34A\` check \+ label (14px \`\#1F2937\`):  
1\. Writing samples imported  
2\. LinkedIn analyzed  
3\. Style memory created  
4\. Brand voice learned  
5\. Context vault active

\---

\#\# 5\. SECTION — Agents Work Together (Orchestration)  
\`background:\#F7FAFF; padding:110px 32px\`, max-width 1100, centered. Eyebrow \`ORCHESTRATION\` (violet), H2 "Agents work together", sub "A handoff pipeline, not a single bot. Each agent passes its work to the next — automatically."

Pipeline \= pill nodes connected by animated dashed arrows.  
\- \*\*Node pill:\*\* white, rounded 16, \`padding:18px 20px\`, shadow \`0 16px 36px \-24px\`, flex with 38px icon tile \+ label (14px weight 600), \`min-width:184px\`.  
\- \*\*Connector arrow SVG (44×24):\*\* dashed line \`stroke:\#C7D2FE; stroke-width:2; stroke-dasharray:4 4\` with \`animation:ccDash 1s linear infinite\`, plus an \`\#6366F1\` chevron head.  
\- Row 1: \*\*Research → Writer → SEO\*\*.  
\- Row 2 (margin-top 22): \*\*Analytics → Publisher\*\*. Publisher node is the gradient one (\`135deg,\#3B82F6,\#6366F1\`, white paper-plane icon \+ white label, shadow \`0 18px 40px \-18px rgba(59,130,246,.6)\`).

\> Wrap with flex-wrap; on narrow screens nodes stack and arrows can rotate/hide.

\---

\#\# 6\. SECTION — One Workspace (App mockup)  
\`background:\#fff; padding:110px 32px\`, max-width 1200\. Header: eyebrow \`THE WORKSPACE\` (blue), H2 "One workspace. Unlimited content.", sub "Your projects, your editor, and your agent team — together in one calm, focused view."

\*\*Browser-chrome mockup:\*\* outer \`border:1px solid rgba(17,24,39,.1); border-radius:22px; overflow:hidden; box-shadow:0 50px 100px \-45px rgba(17,24,39,.4); background:\#fff\`.  
\- \*\*Top bar (40px):\*\* \`\#F7FAFF\`, bottom border, three 11px gray dots, centered mono URL "app.contentcoach.ai".  
\- \*\*Body grid \`200px 1fr 268px\`, min-height 460:\*\*  
  \- \*\*Sidebar\*\* (\`\#FBFCFF\`, right border, padding \`18px 14px\`): nav items (icon \+ label, rounded 9, padding \`9px 11px\`): \*\*Projects\*\* (active — \`\#EAF0FF\` bg, \`\#3B82F6\` text weight 600, grid icon), Content Vault, Assets, Templates, Analytics (all \`\#4B5563\` 13.5px, line icons).  
  \- \*\*Editor\*\* (padding \`30px 34px\`): mono label "DRAFT · \~3 MIN READ"; H3 Newsreader 30px "The creator economy is moving from tools to teams"; body (14.5px line1.85 \`\#374151\`): para 1 "For a decade, creators bought tools. A scheduler here, a grammar checker there, an analytics dashboard nobody opened." para 2 "The next leap isn't another tool. It's a \[team that works while you sleep\]" where the bracketed phrase has a highlight (\`background:\#EAF0FF; border-bottom:2px solid \#3B82F6; border-radius:2px\`) followed by a blinking blue caret.  
  \- \*\*Agent workspace\*\* (\`\#FBFCFF\`, left border, padding 18): mono label "AGENT WORKSPACE"; stacked mini agent cards (white, rounded 12, padding 12, 30px icon tile \+ name \+ status):  
    \- Research — "Done · 18 sources" (green)  
    \- Writer — "Drafting v3…" (indigo)  
    \- SEO — "Queued" (gray)  
    \- Analytics — "Queued" (gray)

\---

\#\# 7\. SECTION — Create Everywhere (Repurpose)  
\`background:\#F7FAFF; padding:110px 32px\`, max-width 1200\. Eyebrow \`REPURPOSE\` (violet), H2 "Create everywhere", sub "One idea, every platform. Your agents reshape a single draft into native content for each channel."

3-column grid (\`repeat(3,1fr)\`, gap 20\) of format cards — white, rounded 18, padding 20, shadow \`0 20px 44px \-28px\`. Each card: brand-icon \+ label header, then content:  
1\. \*\*LinkedIn Post\*\* — "The biggest mistake creators make isn't posting too little. It's creating without a system. Here's the 45-minute workflow that replaced our 6-hour grind →"  
2\. \*\*Medium Article\*\* — Newsreader 18px title "The creator economy is moving from tools to teams" \+ sub "The next generation of content platforms won't be assistants. They'll be specialized AI teams."  
3\. \*\*Newsletter\*\* (indigo envelope tile) — Newsreader 17px "Issue \#24 — Build the team" \+ "This week: why systems beat hustle, and the 5 agents doing our heavy lifting."  
4\. \*\*Blog Post\*\* (sky book tile) — Newsreader 18px "A complete guide to AI content systems" \+ "SEO-optimized, 1,800 words, structured with H2s and a meta description."  
5\. \*\*X Thread\*\* (black X tile) — "1/ Everyone's drowning in content tools. / 2/ But tools don't create — teams do. / 3/ Here's how 5 AI agents replaced our content stack 🧵" (line breaks between).  
6\. \*\*Summary tile\*\* — gradient \`135deg,\#3B82F6,\#8B5CF6\`, rounded 18, padding 24, shadow \`0 24px 50px \-24px rgba(99,102,241,.6)\`. Newsreader 26px white "1 idea →" / "5 formats" \+ "Generated in under a minute, each one native to its platform."

\---

\#\# 8\. SECTION — Always On (Dark live activity)  
\`position:relative; overflow:hidden; background:\#0B1220; padding:110px 32px\`. Background blobs (absolute, z0): blue \`rgba(59,130,246,.28)\` 420px top-left \`ccBlob 22s\`; violet \`rgba(139,92,246,.26)\` 460px bottom-right \`ccBlob2 26s\`, both heavily blurred.

Content (z1, max-width 880, center): eyebrow \`ALWAYS ON\` (\`\#6FA8FF\`), H2 Newsreader 52px \`\#F4F7FF\` "Your agents never stop working.", sub (\`\#9AA6C4\`, max-width 500): "While you're offline, the team keeps researching, drafting, and optimizing — ready when you're back."

\*\*Activity feed card\*\* (\`background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); border-radius:18px; padding:12px; backdrop-filter:blur(8px); max-width:560px; text-align:left\`). Rows (each: pulsing colored dot \+ text \`\#DCE3F5\` with white bold agent name \+ right-aligned mono timestamp \`\#6B7794\`, separated by faint bottom borders):  
\- 🔵 \*\*Research Agent\*\* found 12 sources — 2s ago  
\- 🟣(indigo) \*\*Writer Agent\*\* generated draft — 18s ago  
\- 🟣(violet) \*\*SEO Agent\*\* improved readability — 41s ago  
\- 🔵(sky) \*\*Analytics Agent\*\* predicted 9.1% engagement — 1m ago

Dots pulse with staggered delays (0/.3/.6/.9s).

\---

\#\# 9\. SECTION — Social Proof  
\`background:\#fff; padding:110px 32px\`, max-width 1200\. Eyebrow \`CREATORS LOVE IT\` (blue), H2 "Built for people who publish".

3-column grid (gap 20\) of stat cards — \`\#F7FAFF\`, \`border:1px solid rgba(17,24,39,.07)\`, rounded 20, padding 26\. Each: big Newsreader 40px gradient-clipped stat \+ label (14px \`\#4B5563\`) \+ person row (40px round gradient avatar letter \+ name 13.5px weight 600 \+ role 12px \`\#6B7280\`):  
1\. \*\*+240%\*\* "Engagement growth" — Jordan Reyes · B2B creator · 120k (avatar "J", \`\#3B82F6→\#6366F1\`)  
2\. \*\*15 hrs\*\* "Saved every week" — Priya Nair · Founder · solo (avatar "P", \`\#8B5CF6→\#6366F1\`)  
3\. \*\*3×\*\* "Faster publishing" — Marcus Webb · Newsletter · 80k (avatar "M", \`\#0EA5E9→\#3B82F6\`)

\---

\#\# 10\. SECTION — Pricing  
\`background:\#F7FAFF; padding:110px 32px\`, max-width 1100\. Eyebrow \`PRICING\` (indigo), H2 "Start free. Scale your team." 3-column grid (gap 20, \`align-items:start\`).

\- \*\*Starter\*\* — white, \`border:1px solid rgba(17,24,39,.1)\`, rounded 22, padding 30\. "Starter" / "For getting started" / Newsreader 46px \*\*$19\*\* \+ "/mo". Button "Start Free" (\`\#F7FAFF\` bg, ink text, bordered). Features (blue check \+ label): 1 Agent · Voice Vault · 50 Credits.  
\- \*\*Pro (highlighted)\*\* — \`position:relative\`, \`border:2px solid \#3B82F6\`, rounded 22, padding 30, \`box-shadow:0 0 0 6px rgba(59,130,246,.1), 0 40px 80px \-34px rgba(59,130,246,.55)\`, \`transform:translateY(-12px)\`. Ribbon (absolute top \-13, centered): "MOST POPULAR" pill (\`\#3B82F6\` bg, white, 11.5px weight 600, rounded 999). Title "Pro" in \`\#3B82F6\` / "For serious creators" / \*\*$49\*\*/mo. Button "Start Free" solid \`\#3B82F6\` white with shadow. Features: 5 Agents · Unlimited Projects · Analytics · Repurposing.  
\- \*\*Team\*\* — like Starter. "Team" / "For growing studios" / \*\*$99\*\*/mo. Button "Start Free" (light). Features: Unlimited Agents · Collaboration · Advanced Analytics.

Checks: 15px SVG, \`stroke:\#3B82F6; stroke-width:2.6; M20 6L9 17l-5-5\`.

\---

\#\# 11\. FINAL CTA (Dark)  
\`position:relative; overflow:hidden; background:\#0B1220; padding:130px 32px\`. Background (z0): three faint floating dark mini-cards (\`\#121A2E\`, \`border:1px solid rgba(255,255,255,.06)\`, rounded 16, padding 15, opacity .4–.5), each an agent chip with icon tile \+ label, floating:  
\- top 10% left 6%, \`ccFloatA 11s\` — "Research · Active" (blue magnifier)  
\- bottom 14% right 7%, \`ccFloatD 13s\` — "SEO · 92/100" (violet trend)  
\- top 24% right 16%, \`ccFloatB 12s\` — "Writer · Drafting" (indigo pencil)

Content (z1, max-width 720, center): H2 Newsreader 60px \`\#F4F7FF\` "Stop creating content alone."; sub (18px \`\#9AA6C4\`, max-width 520): "Build an AI content team that learns your voice and grows with you."; \*\*Start Free Today\*\* button (16px weight 600 white on \`\#3B82F6\`, \`padding:16px 34px; border-radius:13px; box-shadow:0 16px 40px \-10px rgba(59,130,246,.7)\`); fine print (13px \`\#6B7794\`): "No credit card required · Free forever plan".

\---

\#\# 12\. FOOTER  
\`background:\#0B1220; border-top:1px solid rgba(255,255,255,.07); padding:40px 32px\`. Max-width 1200, flex space-between, wrap, gap 16:  
\- Left: 28px rounded-8 gradient logo tile (Newsreader 16px white "C") \+ "ContentCoach AI" (14.5px weight 600 \`\#E5EAF6\`).  
\- Center: links (13.5px \`\#8893AE\`, gap 26): Platform · Agents · Pricing · Privacy · Terms.  
\- Right: mono 11.5px \`\#6B7794\` "© 2026 ContentCoach AI".

\---

\#\# Build Requirements  
1\. \*\*Match every value above\*\* — px sizes, colors, copy, shadows, animations. Don't substitute fonts or "improve" spacing.  
2\. \*\*Componentize\*\* sensibly: \`Nav\`, \`Hero\` (+ \`FloatingCard\`, \`AgentCard\`, \`SocialPost\`), \`TeamGrid\`, \`VoiceVault\`, \`Orchestration\`, \`WorkspaceMockup\`, \`Repurpose\`, \`AlwaysOn\`, \`SocialProof\`, \`Pricing\`, \`FinalCTA\`, \`Footer\`. Drive repeated cards (agents, pricing tiers, format cards, stat cards) from data arrays.  
3\. \*\*Icons:\*\* inline SVGs as shown (line icons 2px stroke; brand marks as specified). A small \`\<Icon\>\` set is fine.  
4\. \*\*Animations:\*\* CSS keyframes (\`prefers-reduced-motion\` → disable floats/blobs/pulses). No JS animation libs needed.  
5\. \*\*Responsive:\*\* desktop-first to match the design; gracefully collapse the absolute hero ecosystem and multi-column grids on tablet/mobile (breakpoints \~1024 / 768). Nav → hamburger on mobile.  
6\. \*\*Accessibility:\*\* semantic landmarks (\`nav\`/\`main\`/\`section\`/\`footer\`), \`aria-label\` on brand icon SVGs, sufficient contrast, focus states on buttons/links.  
7\. \*\*Buttons/links\*\* are static (no routing needed) — but make them real \`\<button\>\`/\`\<a\>\` with hover states (slight lift / brightness on primary CTAs).  
8\. Clean, typed, formatted (Prettier). Provide \`npm install && npm run dev\` working out of the box.

Deliver the full project. Don't ask follow-ups — build it exactly as specified.

\---

\# MOBILE VERSION (build at the same time)

Build the mobile/responsive version \*\*together with desktop in the same components\*\* — do NOT make a separate mobile page or app. Use CSS media queries / Tailwind responsive prefixes. Everything above is the \*\*desktop (≥1024px)\*\* spec. Below are the rules for \*\*tablet (768–1023px)\*\* and \*\*phone (≤767px)\*\*. When a section isn't mentioned for a breakpoint, it keeps the desktop behavior scaled down by the global rules.

\#\#\# Breakpoints  
\- \*\*Desktop:\*\* ≥ 1024px — exactly as specified above.  
\- \*\*Tablet:\*\* 768–1023px — multi-column grids reduce, hero ecosystem simplifies.  
\- \*\*Phone:\*\* ≤ 767px — single column, stacked, larger touch targets.

\#\#\# Global mobile rules  
\- \*\*Section padding:\*\* reduce horizontal \`32px → 20px\` (phone). Reduce vertical \`100–130px → 56–64px\` (phone), \`→ 80px\` (tablet).  
\- \*\*Container:\*\* all \`max-width\` blocks become \`width:100%\` with the padding above.  
\- \*\*Type scale (phone):\*\*  
  \- Hero H1 \`72px → 40px\` (\`line-height:1.05\`); tablet \`→ 56px\`.  
  \- Section H2 \`48px → 30px\`; tablet \`→ 40px\`.  
  \- Always-On H2 \`52px → 30px\`; Final CTA H2 \`60px → 34px\`.  
  \- Body sub \`19px → 16px\`, \`17px → 15px\`. Never below 14px for body, 13px for fine print.  
  \- Big stat numbers (40px) → \`32px\`; pricing \`$\` (46px) → \`38px\`.  
\- \*\*Touch targets:\*\* all buttons/links min-height \*\*44px\*\*, min horizontal padding 20px. Increase tap spacing in nav.  
\- \*\*Hover → tap:\*\* keep hover styles for desktop but ensure tap/\`:active\` states exist; don't rely on hover to reveal anything.  
\- \*\*No horizontal scroll:\*\* keep \`overflow-x:hidden\`; verify nothing overflows at 360px width.  
\- \*\*Animations:\*\* keep \`ccPulse\`/\`ccBlink\`/\`ccDash\` and blob drifts (they're cheap), but the heavy floating hero cards become static on phone (see Hero). Honor \`prefers-reduced-motion\`.

\#\#\# 1\. Nav (mobile)  
\- Collapse the link row into a \*\*hamburger menu\*\*. Logo stays left, hamburger icon (24px, ink) right.  
\- Tap opens a full-width dropdown/sheet under the sticky bar (white, blurred, soft shadow): stacked links Platform · Agents · Pricing · Docs · Sign in (each ≥44px row, 16px), then a full-width \*\*Start Free\*\* button (\`\#111827\`, white, rounded 10, 14px weight 600).  
\- Keep nav sticky \+ blurred. Reduce nav padding to \`14px 20px\`.

\#\#\# 2\. Hero (mobile) — most important change  
The absolute 600px "living ecosystem" stage is \*\*desktop/tablet only\*\*. On phone:  
\- \*\*Hide the absolute-positioned stage entirely.\*\* Replace with a simple vertical stack of \*\*3 representative cards\*\* (in the page flow, centered, \`gap:16px\`, each \`max-width:340px; margin:0 auto\`): \*\*Research Agent\*\* card, the \*\*Akash LinkedIn post\*\*, and the \*\*SEO Agent\*\* card (in that order). Keep their existing inner markup/styling; just stack them — no absolute positioning, no float animation (gentle \`ccFloatA\` optional but subtle).  
\- Center copy stays: badge → H1 (40px) → sub → CTA row → fine print. \*\*CTA row stacks vertically\*\* on phone (\`flex-direction:column; gap:12px\`), both buttons full-width (max-width 340, centered).  
\- Hero top padding \`84px → 40px\`.  
\- \*\*Tablet:\*\* keep the absolute ecosystem but scale the stage down (\`height \~480px\`, reduce card widths \~15%, pull edge cards inward) OR fall back to the same simplified stack if overlap occurs — prefer no overlap over fidelity.  
\- Keep the ambient gradient blobs (they're background, harmless).

\#\#\# 3\. Build Your Content Team (mobile)  
\- 5-col grid → \*\*tablet: 3-col then 2-col\*\*, \*\*phone: 1-col\*\* (full-width cards stacked, \`gap:14px\`). Progress bars and content unchanged.

\#\#\# 4\. Voice Vault (mobile)  
\- Two-column \`1fr 1fr\` → \*\*single column\*\*, text block first, then the Voice Vault UI card below (full-width, \`max-width:420px; margin:0 auto\`). Gap \`64 → 32\`. Stat row stays inline.

\#\#\# 5\. Orchestration (mobile)  
\- Pipeline nodes \*\*stack vertically\*\*, full-width (max-width 320, centered). Replace the horizontal dashed arrows with \*\*downward\*\* chevron connectors between stacked nodes (rotate the arrow SVG 90°, keep the \`ccDash\` animation). Order: Research → Writer → SEO → Analytics → Publisher in one vertical chain.

\#\#\# 6\. Workspace Mockup (mobile)  
\- The \`200px 1fr 268px\` 3-column app is too wide for phone. On phone, \*\*stack the three panes vertically\*\* inside the browser chrome: Sidebar becomes a \*\*horizontal scrollable row of nav chips\*\* (or a compact 2-row list) at top; then the Editor; then the Agent Workspace cards below. Keep the browser top bar (dots \+ URL). Reduce editor padding to \`20px\`.   
\- \*\*Tablet:\*\* drop to \`1fr 240px\` (hide or collapse the left sidebar to icons-only) or stack editor \+ agent panel.  
\- Ensure the mockup never forces horizontal page scroll — let its internal content scroll or wrap instead.

\#\#\# 7\. Create Everywhere (mobile)  
\- 3-col grid → \*\*tablet: 2-col\*\*, \*\*phone: 1-col\*\*. The gradient summary tile goes last, full-width.

\#\#\# 8\. Always On — dark feed (mobile)  
\- Center copy scales (H2 30px). Activity feed card stays full-width (\`max-width:560 → 100%\`). Each row: if the timestamp \+ text crowd at 360px, allow text to wrap and keep the timestamp right-aligned on its own line, or shrink text to 13px. Keep pulsing dots.

\#\#\# 9\. Social Proof (mobile)  
\- 3-col stat grid → \*\*2-col (tablet)\*\* → \*\*1-col (phone)\*\*, stacked full-width.

\#\#\# 10\. Pricing (mobile)  
\- 3-col → \*\*1-col stacked\*\* (phone), \`gap:18px\`. \*\*Remove the Pro \`translateY(-12px)\` lift\*\* when stacked (it looks broken vertically) — instead keep its blue border \+ "MOST POPULAR" ribbon and optionally order Pro \*\*first\*\* or middle. Cards full-width, \`max-width:400px; margin:0 auto\`. Buttons already full-width — keep ≥44px.  
\- \*\*Tablet:\*\* can keep 3-col if it fits, else 1-col.

\#\#\# 11\. Final CTA (mobile)  
\- Hide the 3 floating background agent chips on phone (decorative, they overlap). H2 → 34px. Button full-width-ish (max-width 320, centered), ≥44px. Keep dark bg \+ fine print.

\#\#\# 12\. Footer (mobile)  
\- Flex row → \*\*stack vertically, centered\*\* (\`flex-direction:column; align-items:center; gap:20px; text-align:center\`). Logo row, then wrapped link row (allow wrap, gap 18), then copyright last.

\#\#\# Mobile build requirements  
\- \*\*Same components, responsive\*\* — do not duplicate the page. Use Tailwind responsive prefixes (\`md:\`/\`lg:\`) or media queries; author mobile-first or desktop-first consistently.  
\- Test layouts at \*\*360px, 390px, 768px, 1024px, 1440px\*\* — no horizontal overflow, no overlapping cards, no text clipping, all tap targets ≥44px at every width.  
\- The hero ecosystem simplification (hide absolute stage → 3 stacked cards on phone) is the single most important mobile change — get it right.  
\- Keep all copy identical across breakpoints; only layout/scale changes.

ENGINEERING, SECURITY, PERFORMANCE, AND SCALABILITY REQUIREMENTS

GENERAL PRINCIPLES  
\- Write production-grade code only.  
\- Prioritize simplicity, maintainability, readability, and scalability.  
\- Avoid over-engineering and unnecessary abstractions.  
\- Follow SOLID principles where appropriate.  
\- Prefer composition over inheritance.  
\- Remove duplicate code and logic.  
\- Use TypeScript strict mode.  
\- No dead code, unused dependencies, unused imports, or commented legacy code.  
\- Keep components small and focused on a single responsibility.  
\- Optimize for long-term maintenance by multiple developers.

UI/FRONTEND ARCHITECTURE  
\- Use feature-based folder structure.  
\- Separate UI, business logic, API services, hooks, and utilities.  
\- Reusable UI components must be generic and configurable.  
\- Avoid prop drilling; use Context only when necessary.  
\- Use server state management separately from UI state.  
\- Lazy load routes and heavy components.  
\- Implement proper loading, empty, and error states.  
\- Follow responsive-first design.  
\- Ensure accessibility (ARIA labels, keyboard navigation, focus management).  
\- Support desktop, tablet, and mobile layouts.  
\- Use consistent design tokens for spacing, colors, typography, and sizing.

REACT BEST PRACTICES  
\- Functional components only.  
\- Custom hooks for reusable logic.  
\- Memoize expensive operations only when beneficial.  
\- Prevent unnecessary re-renders.  
\- Use code splitting.  
\- Use dynamic imports for large modules.  
\- Avoid large monolithic components.  
\- Target maximum component size of \~200 lines.  
\- Avoid deeply nested component trees.  
\- Use strong typing for props, APIs, and state.

API & DATA LAYER  
\- Centralized API layer.  
\- No direct API calls inside UI components.  
\- Standardized request and response handling.  
\- Global error handling.  
\- Retry strategy for transient failures.  
\- Request timeout handling.  
\- Pagination for large datasets.  
\- Filtering and sorting on backend where possible.  
\- Avoid unnecessary API calls.  
\- Implement caching where appropriate.

SECURITY REQUIREMENTS  
\- Assume all client-side input is malicious.  
\- Validate and sanitize all user inputs.  
\- Never trust frontend validation alone.  
\- Use secure authentication flows.  
\- Store tokens in secure HttpOnly cookies.  
\- Never store secrets in frontend code.  
\- Prevent XSS vulnerabilities.  
\- Prevent CSRF vulnerabilities.  
\- Escape user-generated content before rendering.  
\- Never expose internal errors, stack traces, or secrets.  
\- Implement role-based access control (RBAC).  
\- Enforce authorization checks on backend.  
\- Use HTTPS everywhere.  
\- Apply rate limiting on APIs.  
\- Apply request validation on every endpoint.  
\- Use secure headers.  
\- Follow OWASP Top 10 recommendations.  
\- Log security-sensitive events.

PERFORMANCE REQUIREMENTS  
\- Optimize for Core Web Vitals.  
\- Keep bundle size minimal.  
\- Tree-shake unused code.  
\- Avoid unnecessary dependencies.  
\- Use optimized image loading.  
\- Implement lazy loading.  
\- Virtualize large tables and lists.  
\- Debounce search inputs.  
\- Cache expensive calculations.  
\- Prevent unnecessary renders.  
\- Target sub-second page transitions where possible.

DATABASE & BACKEND SCALABILITY  
\- Design APIs to be stateless.  
\- Use pagination everywhere.  
\- Use indexed database queries.  
\- Avoid N+1 query problems.  
\- Use connection pooling.  
\- Use background jobs for heavy processing.  
\- Use caching for frequently accessed data.  
\- Support horizontal scaling.  
\- Design for eventual growth from 3,000 users to 10,000+ users without major refactoring.

OBSERVABILITY  
\- Structured logging.  
\- Centralized error handling.  
\- Health check endpoints.  
\- Performance monitoring.  
\- Audit logs for critical actions.  
\- Track API latency and failures.  
\- Monitor resource usage.

CODE QUALITY  
\- ESLint and Prettier enforced.  
\- Strict TypeScript configuration.  
\- Consistent naming conventions.  
\- Clear folder structure.  
\- Clear separation of concerns.  
\- No magic numbers or hardcoded values.  
\- Environment-based configuration.  
\- Comprehensive error handling.  
\- Write self-documenting code.  
\- Prefer readability over cleverness.

TESTING  
\- Unit tests for business logic.  
\- Integration tests for APIs.  
\- End-to-end tests for critical user flows.  
\- Test authentication and authorization paths.  
\- Test failure scenarios.  
\- Test validation and security edge cases.

DEPLOYMENT & OPERATIONS  
\- Environment separation (dev, staging, production).  
\- CI/CD ready architecture.  
\- Container-friendly deployment.  
\- Infrastructure as Code friendly.  
\- Zero hardcoded environment values.  
\- Support rolling deployments.  
\- Support horizontal scaling behind load balancers.

FINAL RULE  
Generate code as if this SaaS application will grow from 3,000 users today to 10,000+ users in the future. Prioritize maintainability, security, performance, and scalability over shortcuts.

