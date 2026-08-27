/* ────────────────────────────────────────────────────────────────────────
   Post-structure templates — ported from the "Honne Chat v3" design (Claude
   Design project ff122375-c3bc-4438-aece-706b0bd557b0, `Honne Chat v3.dc.html`),
   shared between `TemplatesPage.jsx` (the full gallery) and `ChatPage.jsx`'s
   personalize-the-hook → pick-a-structure modal.

   Each `id` here MUST match a key in backend's
   backend/ai/templates/data.py::TEMPLATE_DEFINITIONS exactly — the frontend
   only ever sends the id (via `template_id` on /api/ai/resume), never the
   full JSON; the backend is the source of truth for the actual structure
   fed to the writer agent. The `desc`/`bestFor`/`pv` fields here are display
   metadata only, kept in sync by hand with the backend copy.
   ──────────────────────────────────────────────────────────────────────── */

export const TEMPLATE_STORAGE_KEY = 'honne_template';
export const DEFAULT_TEMPLATE_ID = 'clean_paragraphs';

export const TEMPLATES = [
  {
    id: 'clean_paragraphs',
    name: 'Clean Paragraphs',
    desc: 'Short paragraphs, one idea each, plain sentences. No formatting tricks.',
    bestFor: 'Default · any topic',
    pv: [
      { kind: 'hook', text: 'This Developer Hub is a goldmine if you want to learn AI and edge infrastructure practically.' },
      { kind: 'para', text: 'A lot of infrastructure content shows you the final architecture. You see the diagram, the code, the working demo.', top: '9px' },
      { kind: 'para', text: 'But you don’t see the messy part — the tradeoffs, what broke, what changed before shipping.', top: '8px' },
      { kind: 'para', text: 'That’s where a lot of the real learning happens.', top: '8px' },
    ],
  },
  {
    id: 'storytelling',
    name: 'Storytelling',
    desc: 'Opens on a specific moment, then widens to the lesson.',
    bestFor: 'Personal & founder posts',
    pv: [
      { kind: 'hook', text: 'Most infrastructure content shows you the finished diagram.' },
      { kind: 'para', text: 'Then I sat in on a live coding session where the Developer Advocates architected, debugged and deployed a real app — unscripted.', top: '9px' },
      { kind: 'para', text: 'They hit a limit, talked through the tradeoff, and changed the design on the spot.', top: '8px' },
      { kind: 'lesson', text: 'Watch engineers troubleshoot, not present.', top: '10px' },
    ],
  },
  {
    id: 'bullet_breakdown',
    name: 'Bullet Breakdown',
    desc: 'A one-line frame, then the points stacked as a scannable list.',
    bestFor: 'Frameworks & how-to',
    pv: [
      { kind: 'hook', text: 'What the polished demo never shows you:' },
      { kind: 'bullet', text: 'What tradeoffs did engineers make?', top: '9px' },
      { kind: 'bullet', text: 'What broke?', top: '5px' },
      { kind: 'bullet', text: 'Where did they hit a limit?', top: '5px' },
      { kind: 'bullet', text: 'What changed before shipping?', top: '5px' },
    ],
  },
  {
    id: 'before_after',
    name: 'Before → After',
    desc: 'The old way, the shift, the new way. Contrast carries the argument.',
    bestFor: 'Change & results',
    pv: [
      { kind: 'label', text: 'Before' },
      { kind: 'para', text: 'Polished slides and pre-baked scripts. You see the final architecture and none of the decisions behind it.', top: '4px' },
      { kind: 'rule', top: '9px' },
      { kind: 'label', text: 'After', top: '9px' },
      { kind: 'para', text: 'Live coding sessions and office hours where engineers plan, debug and deploy production apps in real time.', top: '4px' },
    ],
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    desc: 'Three or four lines total. One claim, nothing supporting it.',
    bestFor: 'High-signal takes',
    center: true,
    pv: [
      { kind: 'statement', text: 'Don’t study the architecture diagram. Watch it get built.' },
      { kind: 'para', text: 'That’s where the real learning is.', top: '12px' },
    ],
  },
  {
    id: 'ai_decides',
    name: 'AI Decides',
    desc: 'No fixed shape — the writer picks whatever structure fits the topic best.',
    bestFor: 'When you’re not sure',
    center: true,
    pv: [
      { kind: 'statement', text: 'Let the writer choose the structure.' },
      { kind: 'para', text: 'Best fit for the topic, picked automatically.', top: '12px' },
    ],
  },
];

export function getTemplateById(id) {
  return TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
}

export function readSelectedTemplateId() {
  try {
    const v = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    return TEMPLATES.some(t => t.id === v) ? v : DEFAULT_TEMPLATE_ID;
  } catch {
    return DEFAULT_TEMPLATE_ID;
  }
}

export function writeSelectedTemplateId(id) {
  try { localStorage.setItem(TEMPLATE_STORAGE_KEY, id); } catch { /* storage unavailable */ }
}

/* Abstract 4-row bar preview for the compact structure-picker tile (as
   opposed to TemplatesPage's full text preview) — mirrors the source
   design's `pickTiles[].mini` mapping. */
export function templateMiniBars(t) {
  return t.pv.slice(0, 4).map((p) => ({
    w: p.kind === 'bullet' ? '70%' : (p.kind === 'label' ? '46%' : (p.kind === 'hook' || p.kind === 'statement' ? '86%' : '96%')),
    h: (p.kind === 'hook' || p.kind === 'statement' || p.kind === 'label') ? '3.5px' : '2.5px',
    bg: (p.kind === 'hook' || p.kind === 'statement') ? 'rgba(27,28,20,.34)' : (p.kind === 'lesson' ? 'rgba(20,102,59,.5)' : 'rgba(27,28,20,.13)'),
    dot: p.kind === 'bullet',
  }));
}
