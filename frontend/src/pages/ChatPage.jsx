import { useState, useRef, useCallback, useEffect } from 'react'
import { streamQuery, resumeAI, refineAI } from '../api/ai'

// Local cap on how many chats are kept in the sidebar. Chat history is
// in-memory only for the lifetime of this page — there is no backend
// persistence (no chat_sessions / checkpointer) to restore it from.
const RECENT_CHATS_LIMIT = 10

// ── Design tokens ─────────────────────────────────────────────────────────────
const CANVAS      = '#FAF6EF'
const WARM_WHITE  = '#FFFEFB'
const WARM_INPUT  = '#F6F1E8'
const WARM_HOVER  = '#F3EDE2'
const INK         = '#2A241D'
const BODY        = '#3A332A'
const MUTED       = '#8E8472'
const FAINT       = '#A99E8C'
const LABEL       = '#B3A896'
const WARM_BDR    = 'rgba(80,64,46,0.10)'
const WARM_BDR_MD = 'rgba(80,64,46,0.16)'
const BLUE        = '#2563EB'
const INDIGO      = '#6366F1'
const GREEN       = '#16A34A'
const RED         = '#B42318'
const AMBER       = '#B45309'
const FONT        = "'Hanken Grotesk',system-ui,sans-serif"
const SERIF       = "'Newsreader',Georgia,serif"
const MONO        = "'JetBrains Mono','Fira Code',monospace"

// ── CSS keyframes ─────────────────────────────────────────────────────────────
const CSS = `
  @keyframes ccBlink  { 0%,49%{opacity:1}50%,100%{opacity:0} }
  @keyframes ccPulse  { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)} }
  @keyframes ccBounce { 0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1} }
  @keyframes ccRise   { from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1} }
  @keyframes ccFloat  { 0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)} }
  @keyframes ccRing   { 0%{transform:scale(1);opacity:.55}70%{opacity:0}100%{transform:scale(1.65);opacity:0} }
  ::-webkit-scrollbar { width:10px }
  ::-webkit-scrollbar-thumb { background:rgba(80,64,46,.16);border-radius:999px;border:2px solid transparent;background-clip:padding-box }
  ::-webkit-scrollbar-thumb:hover { background:rgba(80,64,46,.28);background-clip:padding-box }
  .cc-chat-row:hover .cc-chat-menu { opacity:1!important }
  .cc-aimsg:hover .cc-msg-actions { opacity:1!important }
  @media(prefers-reduced-motion:reduce){*{animation:none!important}}
`

// ── Agent config ──────────────────────────────────────────────────────────────
const AGENTS = {
  Writer:   { name: 'Writer Agent',   color: INDIGO,    tint: '#EEF0FF', path: 'M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z' },
  Research: { name: 'Research Agent', color: BLUE,      tint: '#EAF0FF', path: 'M11 4a7 7 0 105.2 11.7M21 21l-4.3-4.3' },
  SEO:      { name: 'SEO Agent',      color: '#0F9D6B', tint: '#E7F6EF', path: 'M5 20V9M12 20V4M19 20v-7' },
  Editor:   { name: 'Editor Agent',   color: AMBER,     tint: '#FCEED6', path: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z' },
}

const ROUTE = [
  { rx: /(research|trend|find|source|data|stat)/i, agent: 'Research' },
  { rx: /(seo|keyword|rank|search)/i,              agent: 'SEO' },
  { rx: /(edit|proofread|grammar|tighten|polish)/i, agent: 'Editor' },
]
function routeFor(text) {
  for (const r of ROUTE) if (r.rx.test(text)) return r.agent
  return 'Writer'
}
function routingTextFor(agent) {
  return ({
    Writer:   'Routing to the Writer Agent…',
    Research: 'Pulling sources via the Research Agent…',
    SEO:      'Checking intent with the SEO Agent…',
    Editor:   'Handing off to the Editor Agent…',
  })[agent] || 'Coordinating agents…'
}

// ── Fallback mock responses (used when backend is unreachable) ────────────────
const DRAFT_TEXT = `Most SaaS tools are about to become invisible.

For a decade we paid per seat to click around dashboards. The dashboard was the product. But a dashboard is just a place where work waits for a human.

AI agents skip the waiting. They read the data, make the decision, and act — no tab, no login, no "where's that setting again?"

The winners of the next cycle won't sell software you operate. They'll sell outcomes you approve.

Your move: which tool in your stack is just a dashboard wearing a logo?`

const MOCK = {
  Research: `Here's what the Research Agent surfaced:\n\n• 41% of teams now run at least one autonomous agent in production (State of AI, 2026).\n• "Outcome-based" pricing grew 3× faster than per-seat last year.\n• The most-shared angle this week: "your stack is a dashboard graveyard."\n\nWant me to weave these into the post as cited proof points?`,
  SEO:      `SEO Agent read the intent behind your topic.\n\nPrimary angle: "AI agents replacing SaaS" — high curiosity, low competition on LinkedIn.\nHook with a contrarian claim, then pay it off with one concrete number.\n\nShall I draft three opener variations tuned for reach?`,
  Editor:   `Editor Agent tightened the draft:\n\n• Cut 22% of the words without losing the argument.\n• Made every sentence active voice.\n• Strengthened the closing line into a direct question.\n\nApprove to apply these edits to your document.`,
  Writer:   DRAFT_TEXT,
}
function mockFor(agent, note) {
  if (note) return `Revised per your note — "${note}".\n\n${DRAFT_TEXT.replace(/^Most SaaS tools/, 'Quick truth: most SaaS tools')}\n\n(Shorter, sharper, and it now opens on a stat-ready hook.)`
  return MOCK[agent] || DRAFT_TEXT
}

// ── Chat history helpers ──────────────────────────────────────────────────────
// chats is a flat array: { id, title, snippet, dot, createdAt, pinned }
function groupChats(flatChats, search = '') {
  const q    = search.trim().toLowerCase()
  const list = q
    ? flatChats.filter(c => (c.title + ' ' + (c.snippet || '')).toLowerCase().includes(q))
    : flatChats

  const pinned   = list.filter(c => c.pinned)
  const unpinned = list.filter(c => !c.pinned)

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const yestStart  = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1)
  const weekStart  = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7)
  const ts = todayStart.getTime(), ys = yestStart.getTime(), ws = weekStart.getTime()

  const groups = []
  if (pinned.length) groups.push({ group: 'Pinned', items: pinned })
  const today = unpinned.filter(c => c.createdAt >= ts)
  const yest  = unpinned.filter(c => c.createdAt >= ys && c.createdAt < ts)
  const week  = unpinned.filter(c => c.createdAt >= ws && c.createdAt < ys)
  if (today.length) groups.push({ group: 'Today',           items: today })
  if (yest.length)  groups.push({ group: 'Yesterday',       items: yest })
  if (week.length)  groups.push({ group: 'Previous 7 days', items: week })
  return groups
}

// ── SVG helpers ───────────────────────────────────────────────────────────────
function AgentIcon({ agent, size = 17 }) {
  const a = AGENTS[agent] || AGENTS.Writer
  const paths = a.path.split('M').filter(Boolean).map(p => 'M' + p)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={a.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[0, 0.15, 0.3].map((delay, i) => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: '#C4B9A6',
          display: 'inline-block',
          animation: `ccBounce 1.2s ease-in-out ${delay}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ── 3-dot kebab menu for chat rows ───────────────────────────────────────────
function ChatMenu({ chatId, pinned, onPin, onStartRename, onDelete }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function close(e) { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const items = [
    {
      label: pinned ? 'Unpin' : 'Pin',
      icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 2l2.5 5H20l-4.5 3.5 1.5 5.5L12 13l-5 3 1.5-5.5L4 7h5.5z"/></svg>,
      action: () => { onPin(chatId); setOpen(false) },
      danger: false,
    },
    {
      label: 'Rename',
      icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/></svg>,
      action: () => { onStartRename(chatId); setOpen(false) },
      danger: false,
    },
    {
      label: 'Delete',
      icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>,
      action: () => { onDelete(chatId); setOpen(false) },
      danger: true,
    },
  ]

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        className="cc-chat-menu"
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        title="More options"
        style={{
          opacity: 0, transition: 'opacity .15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, border: 'none', background: 'none',
          borderRadius: 6, cursor: 'pointer',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(80,64,46,.12)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
        <svg width={3} height={13} viewBox="0 0 3 13" fill="none">
          <circle cx="1.5" cy="1.5"  r="1.5" fill="#9C9082"/>
          <circle cx="1.5" cy="6.5"  r="1.5" fill="#9C9082"/>
          <circle cx="1.5" cy="11.5" r="1.5" fill="#9C9082"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50,
          background: WARM_WHITE, border: `1px solid ${WARM_BDR_MD}`, borderRadius: 11,
          boxShadow: '0 12px 28px -8px rgba(60,48,30,.3)', padding: 4, minWidth: 136,
          animation: 'ccRise .14s ease-out',
        }}>
          {items.map(item => (
            <button key={item.label} onClick={item.action}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                padding: '8px 10px', border: 'none', background: 'none', borderRadius: 8,
                fontFamily: FONT, fontSize: 13, fontWeight: 500,
                color: item.danger ? RED : INK, cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = item.danger ? '#FEE4E2' : WARM_HOVER}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── User message ──────────────────────────────────────────────────────────────
function UserMessage({ msg }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', animation: 'ccRise .22s ease-out' }}>
      <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        {msg.isRefine && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
            color: AMBER, background: '#FCEED6', padding: '3px 9px', borderRadius: 999,
          }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2.4}><path d="M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z" /></svg>
            Modification
          </span>
        )}
        <div style={{
          padding: '12px 16px', borderRadius: '18px 18px 6px 18px',
          background: BLUE, color: '#fff', fontSize: 14.5, lineHeight: 1.6,
          boxShadow: '0 10px 24px -14px rgba(37,99,235,.7)', whiteSpace: 'pre-wrap',
        }}>
          {msg.text}
        </div>
      </div>
    </div>
  )
}

// ── AI message ────────────────────────────────────────────────────────────────
function AIMessage({ msg, onApprove, onDecline, onOpenModify, onCancelModify, onModifyChange, onSendModify, onRegen, onRetryFailed, onPickAngle }) {
  const a    = AGENTS[msg.agent] || AGENTS.Writer
  const done = msg.phase === 'done'
  const hasBody    = msg.phase === 'streaming' || done
  const showActions = done && !msg.decision && !msg.awaitingAngle
  const cardBorder = msg.decision === 'approved'   ? 'rgba(22,163,74,.4)'
    : msg.decision === 'declined' || msg.decision === 'failed' || msg.decision === 'error' ? 'rgba(180,35,24,.3)' : WARM_BDR

  return (
    <div className="cc-aimsg" style={{ display: 'flex', gap: 13, animation: 'ccRise .24s ease-out' }}>
      <div style={{
        width: 34, height: 34, borderRadius: 11, background: a.tint,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 2,
      }}>
        <AgentIcon agent={msg.agent} size={17} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.06em', color: FAINT }}>Supervisor</span>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#C4B9A6" strokeWidth={2.4}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: a.color }}>{a.name}</span>
          {msg.isRefinement && (
            <span style={{
              fontSize: 10.5, fontFamily: MONO, letterSpacing: '.06em',
              color: AMBER, background: '#FCEED6', padding: '2px 8px', borderRadius: 999,
            }}>refined</span>
          )}
        </div>

        {/* TEMP debug strip — proves the backend's real supervisor decision
            reached the client, instead of trusting the pre-request routeFor()
            text-pattern guess. */}
        {msg.route && msg.phase === 'done' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            marginBottom: 8, fontFamily: MONO, fontSize: 10.5, color: FAINT,
          }}>
            <span style={{
              padding: '2px 7px', borderRadius: 999, background: '#F1EDE3', color: '#7C7264',
            }}>route: {msg.route}</span>
          </div>
        )}

        {msg.phase === 'routing' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '13px 16px', background: WARM_WHITE,
            border: `1px solid ${WARM_BDR}`, borderRadius: 16, width: 'fit-content',
          }}>
            <ThinkingDots />
            <span style={{ fontSize: 12.5, color: FAINT, fontStyle: 'italic', fontFamily: SERIF }}>
              {msg.isRefinement ? 'Applying your changes…' : routingTextFor(msg.agent)}
            </span>
          </div>
        )}

        {hasBody && (
          <>
            <div style={{
              padding: '16px 18px', background: WARM_WHITE,
              border: `1px solid ${cardBorder}`, borderRadius: 16,
              boxShadow: '0 14px 34px -28px rgba(60,48,30,.5)',
              transition: 'border-color .3s',
            }}>
              <div style={{ fontSize: 14.5, lineHeight: 1.78, color: BODY, whiteSpace: 'pre-wrap' }}>
                {msg.text}
                {msg.phase === 'streaming' && (
                  <span style={{
                    display: 'inline-block', width: 8, height: 17, marginLeft: 1,
                    borderRadius: 1, background: BLUE, verticalAlign: '-3px',
                    animation: 'ccBlink 1s step-end infinite',
                  }} />
                )}
              </div>

              {msg.decision === 'approved' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 13, borderTop: '1px solid rgba(80,64,46,.08)' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    fontSize: 12.5, fontWeight: 600, color: '#15803D', background: '#DCFCE7',
                    padding: '6px 12px', borderRadius: 999,
                  }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth={2.6}><path d="M20 6L9 17l-5-5" /></svg>
                    Approved · added to draft
                  </span>
                </div>
              )}

              {msg.decision === 'declined' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 13, borderTop: '1px solid rgba(80,64,46,.08)' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    fontSize: 12.5, fontWeight: 600, color: RED, background: '#FEE4E2',
                    padding: '6px 12px', borderRadius: 999,
                  }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.6}><path d="M6 6l12 12M18 6L6 18" /></svg>
                    Declined
                  </span>
                  <button onClick={() => onRegen(msg.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: 30, padding: '0 12px', border: `1px solid ${WARM_BDR_MD}`,
                      background: '#fff', borderRadius: 9, fontFamily: FONT,
                      fontSize: 12.5, fontWeight: 600, color: MUTED, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,.5)'; e.currentTarget.style.color = BLUE }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = WARM_BDR_MD; e.currentTarget.style.color = MUTED }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>
                    Regenerate
                  </button>
                </div>
              )}

              {msg.decision === 'failed' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 13, borderTop: '1px solid rgba(80,64,46,.08)' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    fontSize: 12.5, fontWeight: 600, color: RED, background: '#FEE4E2',
                    padding: '6px 12px', borderRadius: 999,
                  }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.6}><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                    Couldn't save — try again
                  </span>
                  <button onClick={() => onApprove(msg.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: 30, padding: '0 12px', border: `1px solid ${WARM_BDR_MD}`,
                      background: '#fff', borderRadius: 9, fontFamily: FONT,
                      fontSize: 12.5, fontWeight: 600, color: MUTED, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,.5)'; e.currentTarget.style.color = BLUE }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = WARM_BDR_MD; e.currentTarget.style.color = MUTED }}>
                    Retry
                  </button>
                </div>
              )}

              {msg.decision === 'error' && (
                <div style={{ marginTop: 14, paddingTop: 13, borderTop: '1px solid rgba(80,64,46,.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                    <span style={{ fontSize: 12.5, color: RED, fontFamily: MONO, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {msg.errorMessage || 'Something went wrong.'}
                    </span>
                  </div>
                  {msg.retryPayload && (
                    <button onClick={() => onRetryFailed(msg.id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
                        height: 30, padding: '0 12px', border: `1px solid ${WARM_BDR_MD}`,
                        background: '#fff', borderRadius: 9, fontFamily: FONT,
                        fontSize: 12.5, fontWeight: 600, color: MUTED, cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,.5)'; e.currentTarget.style.color = BLUE }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = WARM_BDR_MD; e.currentTarget.style.color = MUTED }}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>
                      Try again
                    </button>
                  )}
                </div>
              )}
            </div>

            {msg.awaitingAngle && !msg.decision && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {msg.pickError && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 12.5, color: RED, fontFamily: MONO,
                  }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.4}><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                    {msg.pickError}
                  </div>
                )}
                {(msg.angles || []).map((angle, idx) => (
                  <div key={idx} style={{
                    padding: '14px 16px', background: WARM_WHITE,
                    border: `1px solid ${WARM_BDR_MD}`, borderRadius: 14,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 4 }}>{angle.title}</div>
                    <div style={{ fontSize: 13, color: BODY, lineHeight: 1.55, marginBottom: 8 }}>{angle.argument}</div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                      fontFamily: MONO, fontSize: 11, color: FAINT, marginBottom: 10,
                    }}>
                      <span>Audience: {angle.audience}</span>
                      <span>·</span>
                      <span>Provokes {angle.provokes_type}</span>
                    </div>
                    <button onClick={() => onPickAngle(msg.id, idx)}
                      style={{
                        height: 32, padding: '0 14px', border: 'none', borderRadius: 9,
                        fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer',
                        background: BLUE, boxShadow: '0 8px 18px -10px rgba(37,99,235,.7)',
                      }}
                      onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.06)'}
                      onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
                      Write this
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showActions && (
              <div className="cc-msg-actions"
                style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, opacity: 0, transition: 'opacity .18s' }}>
                <button onClick={() => onApprove(msg.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    height: 36, padding: '0 15px', border: 'none', borderRadius: 10,
                    fontFamily: FONT, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer',
                    background: GREEN, boxShadow: '0 10px 22px -12px rgba(22,163,74,.7)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.06)'}
                  onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4}><path d="M20 6L9 17l-5-5" /></svg>
                  Approve
                </button>

                <button onClick={() => onOpenModify(msg.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    height: 36, padding: '0 15px', borderRadius: 10,
                    border: `1px solid ${msg.modifyOpen ? 'rgba(37,99,235,.5)' : WARM_BDR_MD}`,
                    background: msg.modifyOpen ? '#EAF0FF' : WARM_WHITE,
                    fontFamily: FONT, fontSize: 13, fontWeight: 600,
                    color: msg.modifyOpen ? BLUE : '#6B6151', cursor: 'pointer',
                  }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z" /></svg>
                  Make changes
                </button>

                <button onClick={() => onDecline(msg.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    height: 36, padding: '0 15px',
                    border: `1px solid ${WARM_BDR_MD}`, background: WARM_WHITE,
                    borderRadius: 10, fontFamily: FONT, fontSize: 13, fontWeight: 600,
                    color: MUTED, cursor: 'pointer', transition: 'border-color .15s,color .15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(180,35,24,.45)'; e.currentTarget.style.color = RED }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = WARM_BDR_MD; e.currentTarget.style.color = MUTED }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M6 6l12 12M18 6L6 18" /></svg>
                  Decline
                </button>

                <span style={{ flex: 1 }} />

                <button onClick={() => { try { navigator.clipboard.writeText(msg.text) } catch {} }}
                  title="Copy"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 36, height: 36, border: `1px solid rgba(80,64,46,.14)`,
                    background: WARM_WHITE, borderRadius: 10, cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = WARM_INPUT}
                  onMouseLeave={e => e.currentTarget.style.background = WARM_WHITE}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={2}>
                    <rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>
                  </svg>
                </button>
              </div>
            )}

            {msg.modifyOpen && (
              <div style={{
                marginTop: 11, padding: 14, background: '#FFF9EE',
                border: '1px solid #F4DFB6', borderRadius: 14, animation: 'ccRise .18s ease-out',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2}><path d="M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z" /></svg>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#92660C' }}>Tell the agent what to change</span>
                  <span style={{ fontSize: 11.5, color: FAINT }}>(or just type in the chat box below)</span>
                </div>
                <textarea
                  value={msg.modifyText || ''}
                  onChange={e => onModifyChange(msg.id, e.target.value)}
                  placeholder="e.g. Make it shorter, add a real stat, end with a question…"
                  rows={2}
                  style={{
                    width: '100%', border: '1px solid #EAD3A3', borderRadius: 11,
                    padding: '11px 13px', fontFamily: FONT, fontSize: 13.5, lineHeight: 1.55,
                    color: BODY, background: '#fff', resize: 'vertical', outline: 'none',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#E0A93A'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(224,169,58,.18)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#EAD3A3'; e.currentTarget.style.boxShadow = 'none' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  {[
                    ['Shorter',             'Make it noticeably shorter'],
                    ['Add a stat',          'Add one concrete, credible statistic'],
                    ['End with a question', 'End on a sharp question to drive comments'],
                  ].map(([chip, val]) => (
                    <button key={chip} onClick={() => onModifyChange(msg.id, val)}
                      style={{
                        height: 28, padding: '0 11px', border: '1px solid #EAD3A3',
                        background: '#fff', borderRadius: 999,
                        fontFamily: FONT, fontSize: 11.5, fontWeight: 600, color: '#92660C', cursor: 'pointer',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#FCEED6'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                      {chip}
                    </button>
                  ))}
                  <span style={{ flex: 1 }} />
                  <button onClick={() => onCancelModify(msg.id)}
                    style={{
                      height: 34, padding: '0 13px', border: 'none', background: 'none',
                      borderRadius: 9, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: MUTED, cursor: 'pointer',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(80,64,46,.07)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    Cancel
                  </button>
                  <button onClick={() => onSendModify(msg.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      height: 34, padding: '0 15px', border: 'none', borderRadius: 9,
                      fontFamily: FONT, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer',
                      background: 'linear-gradient(135deg,#F59E0B,#EA8A06)',
                      boxShadow: '0 9px 20px -10px rgba(234,138,6,.7)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.05)'}
                    onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
                    Send to agent
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Composer ──────────────────────────────────────────────────────────────────
function Composer({ draft, onChange, onKeyDown, onSend, taRef, micActive, onToggleMic, onChip, big = false, hasLatestDraft = false }) {
  const canSend = !!draft.trim()
  const btnSize = big ? 42 : 40
  const radius  = big ? 22 : 18

  function autosize(el) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(big ? 180 : 160, el.scrollHeight) + 'px'
  }

  const toolChips = [
    { label: 'Attach',    stroke: '#8E8472', icon: 'M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L9.9 18.36a2 2 0 0 1-2.83-2.83l8.49-8.49', onClick: () => {} },
    { label: 'Research',  stroke: BLUE,      icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M21 21l-4.3-4.3',                                                                         onClick: () => onChip('Research the latest on ') },
    { label: 'Draft',     stroke: INDIGO,    icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',                                                                         onClick: () => onChip('Draft a LinkedIn post about ') },
    { label: 'Repurpose', stroke: '#0F9D6B', icon: 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8',                                                                                       onClick: () => onChip('Repurpose this into ') },
  ]

  const composerShadow = big
    ? '0 26px 60px -30px rgba(60,48,30,.6)'
    : '0 16px 38px -24px rgba(60,48,30,.5)'

  return (
    <div style={{
      width: '100%', background: WARM_WHITE,
      border: `1px solid ${WARM_BDR_MD}`, borderRadius: radius,
      boxShadow: composerShadow, transition: 'border-color .18s, box-shadow .18s',
    }}
    onFocusCapture={e => { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.boxShadow = `0 0 0 4px rgba(37,99,235,.1),${composerShadow}` }}
    onBlurCapture={e => { e.currentTarget.style.borderColor = WARM_BDR_MD; e.currentTarget.style.boxShadow = composerShadow }}>
      {/* meta strip */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: big ? '13px 16px 0' : '11px 14px 0',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: big ? '6px 10px' : '5px 9px', borderRadius: big ? 9 : 8,
          background: 'linear-gradient(135deg,#2563EB,#6366F1)',
          color: '#fff', fontSize: big ? 11 : 10.5, fontWeight: 700, letterSpacing: '.03em',
        }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="#fff">
            <path d="M12 2l1.6 4.6L18 8l-4.4 1.4L12 14l-1.6-4.6L6 8z"/>
          </svg>
          Supervisor
        </span>
        <span style={{ fontSize: big ? 11.5 : 11, color: FAINT }}>
          {hasLatestDraft ? 'refines the draft directly · no supervisor overhead' : 'routes to the right agent automatically'}
        </span>
      </div>

      <textarea
        ref={taRef}
        value={draft}
        onChange={e => { onChange(e.target.value); autosize(e.target) }}
        onKeyDown={onKeyDown}
        rows={big ? 2 : 1}
        placeholder={hasLatestDraft ? 'Tell the agent what to change — or ask something new…' : 'Ask your agents to research, write, rewrite, or repurpose anything…'}
        style={{
          display: 'block', width: '100%', border: 'none', background: 'none',
          fontFamily: FONT, fontSize: big ? 15.5 : 14.5, lineHeight: 1.6, color: INK,
          padding: big ? '14px 16px 6px' : '10px 14px 4px',
          resize: 'none', maxHeight: big ? 180 : 160, overflowY: 'auto', outline: 'none',
        }}
      />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: big ? '8px 12px 12px' : '6px 10px 10px',
      }}>
        {toolChips.map(t => {
          const paths = t.icon.split('M').filter(Boolean).map(p => 'M' + p)
          return (
            <button key={t.label} onClick={t.onClick}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: big ? 34 : 32, padding: `0 ${big ? 12 : 11}px`,
                border: `1px solid ${WARM_BDR_MD}`, background: WARM_WHITE, borderRadius: 10,
                fontFamily: FONT, fontSize: big ? 12.5 : 12, fontWeight: 600, color: '#6B6151', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,.4)'; e.currentTarget.style.color = BLUE }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = WARM_BDR_MD; e.currentTarget.style.color = '#6B6151' }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={t.stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                {paths.map((d, i) => <path key={i} d={d} />)}
              </svg>
              {t.label}
            </button>
          )
        })}
        <span style={{ flex: 1 }} />
        <button onClick={onToggleMic} title="Voice input" style={{
          position: 'relative', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: btnSize, height: btnSize,
          border: `1px solid ${WARM_BDR_MD}`, borderRadius: big ? 13 : 12,
          background: micActive ? '#EF4444' : WARM_INPUT, cursor: 'pointer',
        }}>
          {micActive && <span style={{ position: 'absolute', inset: -3, borderRadius: big ? 15 : 14, border: '2px solid #EF4444', animation: 'ccRing 1.5s ease-out infinite' }} />}
          <svg width={big ? 17 : 16} height={big ? 17 : 16} viewBox="0 0 24 24" fill="none" stroke={micActive ? '#fff' : '#7C7264'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>
          </svg>
        </button>
        <button onClick={onSend} title="Send" style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: btnSize, height: btnSize, border: 'none', borderRadius: big ? 13 : 12,
          cursor: canSend ? 'pointer' : 'default',
          background: canSend ? BLUE : '#D8CFC0',
          boxShadow: canSend ? '0 10px 22px -10px rgba(37,99,235,.7)' : 'none',
          opacity: canSend ? 1 : 0.7, transition: 'background .18s, opacity .18s',
        }}
        onMouseEnter={e => { if (canSend) e.currentTarget.style.filter = 'brightness(1.06)' }}
        onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
          <svg width={big ? 18 : 17} height={big ? 18 : 17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Welcome / empty state ─────────────────────────────────────────────────────
function WelcomeState({ draft, onChange, onKeyDown, onSend, taRef, micActive, onToggleMic, onChip }) {
  const displayName = localStorage.getItem('display_name') ?? localStorage.getItem('username') ?? 'User'

  const suggestChips = [
    { label: 'Write a LinkedIn post',   prefix: 'Write a LinkedIn post about ' },
    { label: 'Draft a newsletter',      prefix: 'Draft a newsletter issue on ' },
    { label: 'Turn into an X thread',   prefix: 'Turn this into an X thread: ' },
    { label: 'Find trending angles',    prefix: 'Find trending angles on ' },
    { label: 'Plan a content calendar', prefix: 'Plan a 2-week content calendar for ' },
  ]

  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'safe center', padding: '26px 26px 14px',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(58% 50% at 50% 34%, rgba(37,99,235,.10), rgba(99,102,241,.05) 42%, transparent 72%)',
      }} />

      <div style={{
        position: 'relative', width: '100%', maxWidth: 680, margin: 'auto 0',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      }}>
        {/* mascot */}
        <div style={{ position: 'relative', width: 420, maxWidth: '100%', height: 104 }}>
          <div style={{
            position: 'absolute', left: 12, top: 58, whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 8,
            background: WARM_WHITE, border: `1px solid ${WARM_BDR}`,
            padding: '7px 11px', borderRadius: '14px 14px 14px 5px',
            boxShadow: '0 14px 28px -20px rgba(60,48,30,.55)',
          }}>
            <span style={{ width: 18, height: 18, borderRadius: 6, background: '#EEF0FF', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={INDIGO} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16z"/></svg>
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: '#5B5142' }}>Ready when you are</span>
          </div>
          <div style={{
            position: 'absolute', right: 12, top: 8, whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 8,
            background: WARM_WHITE, border: `1px solid ${WARM_BDR}`,
            padding: '7px 11px', borderRadius: '14px 14px 5px 14px',
            boxShadow: '0 14px 28px -20px rgba(60,48,30,.55)',
          }}>
            <span style={{ width: 18, height: 18, borderRadius: 6, background: '#EAF0FF', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2.4}><circle cx="11" cy="11" r="6"/><path d="M21 21l-3.5-3.5"/></svg>
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: '#5B5142' }}>4 agents on standby</span>
          </div>
          <div style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)' }}>
            <div style={{ position: 'relative', animation: 'ccFloat 5.5s ease-in-out infinite' }}>
              <span style={{ position: 'absolute', inset: -12, borderRadius: 28, background: 'radial-gradient(closest-side, rgba(37,99,235,.4), transparent)', animation: 'ccRing 2.8s ease-out infinite' }} />
              <div style={{ position: 'relative', width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg,#2563EB,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 24px 46px -20px rgba(37,99,235,.8), inset 0 2px 7px rgba(255,255,255,.28)' }}>
                <svg width={37} height={37} viewBox="0 0 24 24" fill="#fff">
                  <path d="M12 2.4l1.9 5.3L19.3 9l-5.4 1.9L12 16.4l-1.9-5.5L4.7 9l5.4-1.3z"/>
                  <circle cx="18.6" cy="5.4" r="1.5"/>
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1.15, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 8px', color: INK }}>
            <span style={{ color: LABEL }}>Hi {displayName},</span>
            {' '}ready to create<br />something worth publishing?
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED, margin: '0 auto', maxWidth: 460 }}>
            One prompt to the Supervisor and it routes to your Writer, Research, SEO &amp; Editor agents — then hands back a draft for you to approve.
          </p>
        </div>

        <Composer draft={draft} onChange={onChange} onKeyDown={onKeyDown} onSend={onSend}
          taRef={taRef} micActive={micActive} onToggleMic={onToggleMic} onChip={onChip} big={true} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          {suggestChips.map(s => (
            <button key={s.label} onClick={() => onChip(s.prefix)}
              style={{
                height: 34, padding: '0 14px', border: `1px solid ${WARM_BDR_MD}`,
                background: WARM_WHITE, borderRadius: 999, fontFamily: FONT,
                fontSize: 12.5, fontWeight: 600, color: '#6B6151', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,.4)'; e.currentTarget.style.color = BLUE; e.currentTarget.style.background = '#F8F4EC' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = WARM_BDR_MD; e.currentTarget.style.color = '#6B6151'; e.currentTarget.style.background = WARM_WHITE }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Chat history sidebar ──────────────────────────────────────────────────────
function ChatHistoryRail({ chats, search, onSearch, activeChat, onSelect, onNew, onPin, onRename, onDelete }) {
  const displayName = localStorage.getItem('display_name') ?? localStorage.getItem('username') ?? 'User'
  const initial     = displayName[0]?.toUpperCase() ?? 'U'

  const [renamingId,  setRenamingId]  = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef(null)

  useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus()
  }, [renamingId])

  function commitRename(id) {
    const val = renameValue.trim()
    if (val) onRename(id, val)
    setRenamingId(null)
    setRenameValue('')
  }

  const groups = groupChats(chats, search)

  return (
    <aside style={{
      width: 286, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: WARM_WHITE, borderRight: `1px solid ${WARM_BDR}`, fontFamily: FONT,
    }}>
      {/* brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '18px 18px 14px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
          background: 'linear-gradient(135deg,#2563EB,#6366F1)',
          boxShadow: '0 6px 16px -7px rgba(37,99,235,.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontFamily: SERIF, fontSize: 19, color: '#fff', marginTop: -2 }}>C</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.01em', color: INK }}>
          ContentCoach<span style={{ color: BLUE }}> AI</span>
        </span>
      </div>

      {/* new chat */}
      <div style={{ padding: '4px 14px 12px' }}>
        <button onClick={onNew}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            width: '100%', height: 42, border: 'none', borderRadius: 12,
            fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer',
            background: BLUE, boxShadow: '0 10px 22px -10px rgba(37,99,235,.6)',
          }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.06)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.3} strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New chat
        </button>
      </div>

      {/* search */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, height: 38, padding: '0 12px',
          background: WARM_INPUT, border: `1px solid rgba(80,64,46,.08)`, borderRadius: 11,
        }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#9C9082" strokeWidth={2}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input value={search} onChange={e => onSearch(e.target.value)}
            placeholder="Search chats"
            style={{ flex: 1, border: 'none', background: 'none', fontFamily: FONT, fontSize: 13, color: INK, padding: 0, outline: 'none' }} />
        </div>
      </div>

      {/* chat list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 10px 10px' }}>
        {groups.length === 0 && (
          <p style={{ textAlign: 'center', fontSize: 12.5, color: FAINT, margin: '24px 0', fontFamily: FONT }}>
            {search ? 'No chats match your search.' : 'No chats yet — start one above.'}
          </p>
        )}

        {groups.map(g => (
          <div key={g.group} style={{ marginBottom: 6 }}>
            <div style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase',
              color: FAINT, padding: '12px 8px 6px',
            }}>
              {g.group}
            </div>

            {g.items.map(c => {
              const isActive   = c.id === activeChat
              const isRenaming = c.id === renamingId

              return (
                <div key={c.id} className="cc-chat-row"
                  onClick={() => !isRenaming && onSelect(c.id)}
                  style={{
                    position: 'relative', display: 'flex', flexDirection: 'column', gap: 2,
                    padding: '9px 11px', borderRadius: 11,
                    cursor: isRenaming ? 'default' : 'pointer',
                    background: isActive ? '#EAF0FF' : 'transparent',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => { if (!isActive && !isRenaming) e.currentTarget.style.background = WARM_HOVER }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {c.pinned
                      ? <svg width={10} height={10} viewBox="0 0 24 24" fill={BLUE} style={{ flexShrink: 0 }}><path d="M12 2l2.5 5H20l-4.5 3.5 1.5 5.5L12 13l-5 3 1.5-5.5L4 7h5.5z"/></svg>
                      : <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: c.dot }} />
                    }

                    {isRenaming ? (
                      <input
                        ref={renameRef}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  { e.preventDefault(); commitRename(c.id) }
                          if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
                        }}
                        onBlur={() => commitRename(c.id)}
                        onClick={e => e.stopPropagation()}
                        style={{
                          flex: 1, minWidth: 0, border: `1px solid ${BLUE}`, borderRadius: 6,
                          padding: '2px 6px', fontFamily: FONT, fontSize: 13, fontWeight: 600,
                          color: INK, background: '#fff', outline: 'none',
                          boxShadow: '0 0 0 3px rgba(37,99,235,.12)',
                        }}
                      />
                    ) : (
                      <span style={{
                        flex: 1, minWidth: 0, fontSize: 13, fontWeight: isActive ? 700 : 500,
                        color: isActive ? BLUE : '#3A332A',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {c.title}
                      </span>
                    )}

                    <ChatMenu
                      chatId={c.id}
                      pinned={c.pinned}
                      onPin={onPin}
                      onStartRename={id => { setRenamingId(id); setRenameValue(c.title) }}
                      onDelete={onDelete}
                    />
                  </div>

                  {!isRenaming && (
                    <span style={{
                      fontSize: 11.5, color: FAINT, paddingLeft: 14,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {c.snippet}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* user footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderTop: `1px solid ${WARM_BDR}` }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg,#2563EB,#6366F1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontFamily: SERIF, fontSize: 15,
        }}>
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</p>
          <p style={{ margin: 0, fontSize: 11.5, color: FAINT }}>Pro plan</p>
        </div>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth={1.9}>
          <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
        </svg>
      </div>
    </aside>
  )
}

// ── Chat header ───────────────────────────────────────────────────────────────
function ChatHeader({ title, isEmpty }) {
  const agentStack = ['Research', 'Writer', 'Editor']
  return (
    <header style={{
      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 26px', borderBottom: `1px solid rgba(80,64,46,.09)`,
      background: 'rgba(250,246,239,.82)', backdropFilter: 'blur(12px)', zIndex: 5,
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{
          fontFamily: SERIF, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em',
          margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: INK,
        }}>
          {title}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN, animation: 'ccPulse 2.4s ease-in-out infinite' }} />
          <span style={{ fontSize: 12, color: MUTED, fontFamily: FONT }}>
            {isEmpty
              ? 'Supervisor ready · 4 agents on standby'
              : <>Supervisor coordinating <strong style={{ color: '#6B6151', fontWeight: 600 }}>3 agents</strong></>}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginRight: 4 }}>
          {agentStack.map((key, i) => {
            const a = AGENTS[key]
            return (
              <span key={key} title={a.name} style={{
                width: 30, height: 30, borderRadius: '50%', background: a.tint,
                border: `2px solid ${CANVAS}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginLeft: i === 0 ? 0 : -7,
              }}>
                <AgentIcon agent={key} size={14} />
              </span>
            )
          })}
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px',
          border: `1px solid rgba(80,64,46,.14)`, background: WARM_WHITE,
          borderRadius: 10, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: '#5B5142', cursor: 'pointer',
        }}
        onMouseEnter={e => e.currentTarget.style.background = WARM_INPUT}
        onMouseLeave={e => e.currentTarget.style.background = WARM_WHITE}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#7C7264" strokeWidth={2}>
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>
          </svg>
          Share
        </button>
      </div>
    </header>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [draft,       setDraft]       = useState('')
  const [search,      setSearch]      = useState('')
  const [activeChat,  setActiveChat]  = useState(null)
  const [chatTitle,   setChatTitle]   = useState('New chat')
  // flat list, newest first, max RECENT_CHATS_LIMIT — built up locally as chats
  // are created this session; nothing is persisted server-side.
  const [chats,       setChats]       = useState([])
  const [messages,    setMessages]    = useState([])
  const [micActive,   setMicActive]   = useState(false)
  const [seq,         setSeq]         = useState(100)
  // tracks the most recent writer draft so follow-up messages can use /refine
  const [latestDraft, setLatestDraft] = useState('')

  const busy          = useRef(false)
  const abortRef      = useRef(null)
  const scrollRef     = useRef(null)
  const taRef         = useRef(null)
  // ref mirrors activeChat so async stream callbacks can read current value
  const activeChatRef = useRef(null)
  // in-memory-only message cache per chat id, so switching between chats
  // created this session restores their messages without any backend call
  const chatMessagesRef = useRef({})

  useEffect(() => { activeChatRef.current = activeChat }, [activeChat])

  useEffect(() => {
    if (activeChat) chatMessagesRef.current[activeChat] = messages
  }, [messages, activeChat])

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight
    })
  }, [])

  function patch(id, fields) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...fields } : m))
  }

  // ── Chat history management ─────────────────────────────────────────────────

  function addChatToHistory(userText, agent) {
    const title = userText.length > 42 ? userText.slice(0, 42).trimEnd() + '…' : userText
    const entry = {
      id:        `chat-${Date.now()}`,
      title,
      snippet:   `${AGENTS[agent].name} · responding`,
      dot:       AGENTS[agent].color,
      createdAt: Date.now(),
      pinned:    false,
    }
    setChats(prev => [entry, ...prev].slice(0, RECENT_CHATS_LIMIT))
    setActiveChat(entry.id)
    activeChatRef.current = entry.id
    setChatTitle(title)
    return entry.id
  }

  function updateChatSnippet(chatId, agentName) {
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, snippet: `${agentName} · done` } : c))
  }

  function handlePinChat(id) {
    setChats(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c))
  }

  function handleRenameChat(id, newTitle) {
    setChats(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c))
    if (id === activeChat) setChatTitle(newTitle)
  }

  function handleDeleteChat(id) {
    setChats(prev => prev.filter(c => c.id !== id))
    if (activeChat === id) handleNewChat()
  }

  // ── Sending messages ────────────────────────────────────────────────────────

  function send() {
    const text = draft.trim()
    if (!text || busy.current) return
    busy.current = true
    setDraft('')
    if (taRef.current) taRef.current.style.height = 'auto'

    if (latestDraft) {
      // Follow-up in an active writing session → direct refinement, no supervisor
      doRefine(latestDraft, text)
    } else {
      // First message or non-writing session → full pipeline
      pushExchange(text, false)
    }
  }

  function _extractErrorMessage(err) {
    if (!err) return 'Something went wrong.'
    if (typeof err === 'string') return err
    return err?.response?.data?.detail || err?.message || 'Something went wrong.'
  }

  // Shows the REAL failure instead of masking it with mock/demo content — a
  // request that fails (network error, 5xx, or a 200 with no usable text) must
  // never look like a successful agent response. retryPayload lets the message
  // offer a "Try again" button that re-runs the exact same request.
  function handleGenerationError(id, err, retryPayload) {
    patch(id, { phase: 'done', text: '', decision: 'error', errorMessage: _extractErrorMessage(err), retryPayload })
    busy.current = false
    scrollDown()
  }

  function handleRetryFailed(id) {
    const msg = messages.find(m => m.id === id)
    if (!msg?.retryPayload || busy.current) return
    busy.current = true
    const p = msg.retryPayload
    if (p.type === 'exchange') pushExchange(p.userText, p.isRefine)
    else if (p.type === 'refine') doRefine(p.baseDraft, p.note)
  }

  function pushExchange(userText, isRefine) {
    const agent = routeFor(userText)
    const uid   = seq + 1
    const aid   = seq + 2
    setSeq(s => s + 2)

    // Auto-register new chat on the first message
    let chatId = activeChatRef.current
    if (!isRefine && messages.length === 0) {
      chatId = addChatToHistory(userText, agent)
    }

    setMessages(prev => [
      ...prev,
      { id: uid, role: 'user', text: userText, isRefine },
      { id: aid, role: 'ai', agent, phase: 'routing', text: '', decision: null, modifyOpen: false, modifyText: '', thread_id: null },
    ])
    setTimeout(scrollDown, 50)

    setTimeout(() => {
      patch(aid, { phase: 'streaming', text: '' })
      let accumulated = ''

      const abort = streamQuery(
        userText,
        token => { accumulated += token; patch(aid, { text: accumulated }); scrollDown() },
        doneData => {
          // Research route pauses for an angle pick instead of returning text —
          // angles live in doneData.angles, not answer/draft, so this has to be
          // handled before the empty-finalText check below would misfire on it.
          if (doneData?.status === 'awaiting_angle_selection') {
            patch(aid, {
              phase: 'done', agent: 'Research', route: 'research',
              thread_id: doneData.thread_id || null,
              awaitingAngle: true, angles: doneData.angles || [],
              text: 'Pick an angle to write from:', decision: null,
            })
            if (chatId) updateChatSnippet(chatId, AGENTS.Research.name)
            busy.current = false
            scrollDown()
            return
          }

          // Truthful routing signal from the backend's actual supervisor decision —
          // overrides the pre-request routeFor() text-pattern guess, which only
          // exists to pick an icon before the response arrives.
          const backendRoute = doneData?.route || null
          const routedAgent  = backendRoute === 'research'        ? 'Research'
                              : backendRoute === 'style_retrieval' ? 'Writer'
                              : agent
          const finalText = doneData?.answer || doneData?.draft || accumulated
          if (!finalText) {
            handleGenerationError(aid, 'The agent returned an empty response — please try again.', { type: 'exchange', userText, isRefine })
            return
          }
          const threadId  = doneData?.thread_id || null
          const isHITL    = doneData?.status === 'awaiting_approval'
          patch(aid, {
            phase: 'done', text: finalText, thread_id: threadId, decision: isHITL ? null : 'auto',
            agent: routedAgent, route: backendRoute,
          })
          // Store the draft so follow-up messages can use /refine
          if (isHITL) setLatestDraft(finalText)
          if (chatId) updateChatSnippet(chatId, AGENTS[routedAgent].name)
          busy.current = false
          scrollDown()
        },
        err => handleGenerationError(aid, err, { type: 'exchange', userText, isRefine })
      )
      abortRef.current = abort
    }, 850)
  }

  // Lightweight refinement — single LLM call, bypasses graph
  function doRefine(baseDraft, note) {
    const agent = 'Writer'
    const uid   = seq + 1
    const aid   = seq + 2
    setSeq(s => s + 2)

    setMessages(prev => [
      ...prev,
      { id: uid, role: 'user', text: note, isRefine: true },
      { id: aid, role: 'ai', agent, phase: 'routing', text: '', decision: null, modifyOpen: false, modifyText: '', thread_id: null, isRefinement: true },
    ])
    setTimeout(scrollDown, 50)

    const chatId = activeChatRef.current
    ;(async () => {
      patch(aid, { phase: 'streaming', text: '' })
      try {
        const data    = await refineAI(baseDraft, note)
        const refined = data.refined_draft
        if (!refined) {
          handleGenerationError(aid, 'The agent returned an empty response — please try again.', { type: 'refine', baseDraft, note })
          return
        }
        patch(aid, { phase: 'done', text: refined, decision: null })
        setLatestDraft(refined)
        if (chatId) updateChatSnippet(chatId, AGENTS[agent].name)
        busy.current = false
        scrollDown()
      } catch (err) {
        handleGenerationError(aid, err, { type: 'refine', baseDraft, note })
      }
    })()
  }

  function simulateStream(id, fullText, chatId, agent, setDraftWhenDone = false) {
    let i = 0
    const timer = setInterval(() => {
      i += 3 + Math.floor(Math.random() * 3)
      if (i >= fullText.length) {
        clearInterval(timer)
        patch(id, { phase: 'done', text: fullText })
        if (setDraftWhenDone) setLatestDraft(fullText)
        if (chatId) updateChatSnippet(chatId, AGENTS[agent]?.name || 'Writer Agent')
        busy.current = false
        scrollDown()
        return
      }
      patch(id, { text: fullText.slice(0, i) })
      if (i % 60 < 5) scrollDown()
    }, 24)
  }

  // ── HITL decisions ──────────────────────────────────────────────────────────

  async function handleApprove(id) {
    const msg = messages.find(m => m.id === id)
    if (msg?.thread_id) {
      try {
        await resumeAI(msg.thread_id, 'approved')
      } catch (err) {
        console.error('[chat] approve failed:', err)
        patch(id, { decision: 'failed' })
        return
      }
    }
    patch(id, { decision: 'approved', modifyOpen: false })
    // Draft's fate is decided — clear the sticky /refine flag so the NEXT message
    // starts a fresh turn instead of silently editing a resolved draft.
    setLatestDraft('')
  }

  async function handleDecline(id) {
    const msg = messages.find(m => m.id === id)
    if (msg?.thread_id) {
      try {
        await resumeAI(msg.thread_id, 'rejected')
      } catch (err) {
        console.error('[chat] decline failed:', err)
        patch(id, { decision: 'failed' })
        return
      }
    }
    patch(id, { decision: 'declined', modifyOpen: false })
    setLatestDraft('')
  }

  // Angle pick — resumes angle_review_node, which chains through
  // map_chosen_angle_node -> style_retriever_node -> writer_node into
  // human_approval_node's own interrupt. The same message flips from an
  // angle-picker into a normal draft-approval card on success.
  async function handlePickAngle(id, angleId) {
    const msg = messages.find(m => m.id === id)
    if (!msg?.thread_id) return
    patch(id, { pickError: '' })
    try {
      const response = await resumeAI(msg.thread_id, 'pick', '', angleId)
      if (response.status === 'awaiting_approval' && response.draft) {
        patch(id, {
          awaitingAngle: false, angles: [],
          text: response.draft, thread_id: response.thread_id || msg.thread_id,
          decision: null, agent: 'Writer',
        })
        setLatestDraft(response.draft)
        const chatId = activeChatRef.current
        if (chatId) updateChatSnippet(chatId, AGENTS.Writer.name)
      } else if (response.status === 'awaiting_approval' && !response.draft) {
        // Writer returned empty content (Gemini refused/failed silently) —
        // keep the angle cards intact instead of wiping them with a blank bubble.
        patch(id, { pickError: 'The writer returned an empty draft — please try again.' })
      } else if (response.status === 'awaiting_angle_selection') {
        // Invalid angle_id — angle_review_node re-surfaced the same angles.
        patch(id, { angles: response.angles || [], text: response.error || 'Pick an angle to write from:' })
      } else {
        patch(id, { awaitingAngle: false, angles: [], text: response.answer || '', decision: 'auto' })
      }
      scrollDown()
    } catch (err) {
      console.error('[chat] pick angle failed:', err)
      patch(id, { decision: 'error', errorMessage: 'Failed to pick that angle — please try again.' })
    }
  }

  function handleOpenModify(id) {
    setMessages(prev => prev.map(m => ({ ...m, modifyOpen: m.id === id ? true : m.modifyOpen })))
    setTimeout(scrollDown, 50)
  }
  function handleCancelModify(id)      { patch(id, { modifyOpen: false }) }
  function handleModifyChange(id, val) { patch(id, { modifyText: val }) }

  async function handleSendModify(id) {
    const msg  = messages.find(m => m.id === id)
    const note = (msg?.modifyText || '').trim() || 'Make it tighter and punchier'
    // Mark the old response as superseded
    patch(id, { modifyOpen: false, modifyText: '', decision: 'superseded' })
    // Refine using the draft in this specific message (not latestDraft, in case user goes back up)
    const base = msg?.text || latestDraft
    busy.current = true
    doRefine(base, note)
  }

  function handleRegen(id) {
    const msg = messages.find(m => m.id === id)
    if (!msg) return
    patch(id, { decision: null, phase: 'routing', text: '' })
    busy.current = true
    setTimeout(() => simulateStream(id, mockFor(msg.agent), activeChatRef.current, msg.agent, true), 700)
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  function handleNewChat() {
    if (abortRef.current) { abortRef.current(); abortRef.current = null }
    busy.current = false
    setMessages([])
    setDraft('')
    setLatestDraft('')
    setActiveChat(null)
    activeChatRef.current = null
    setChatTitle('New chat')
  }

  function handleSelectChat(id) {
    setActiveChat(id)
    activeChatRef.current = id
    const c = chats.find(x => x.id === id)
    setChatTitle(c ? c.title : 'Chat')
    setLatestDraft('')
    // No backend persistence — restore from this session's in-memory cache only.
    setMessages(chatMessagesRef.current[id] || [])
    setTimeout(scrollDown, 50)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function handleChip(text) {
    setDraft(text)
    setTimeout(() => {
      taRef.current?.focus()
      if (taRef.current) {
        taRef.current.style.height = 'auto'
        taRef.current.style.height = Math.min(180, taRef.current.scrollHeight) + 'px'
      }
    }, 0)
  }

  const isEmpty = messages.length === 0

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: CANVAS, fontFamily: FONT, color: INK, WebkitFontSmoothing: 'antialiased',
    }}>
      <style>{CSS}</style>

      <ChatHistoryRail
        chats={chats}
        search={search}
        onSearch={setSearch}
        activeChat={activeChat}
        onSelect={handleSelectChat}
        onNew={handleNewChat}
        onPin={handlePinChat}
        onRename={handleRenameChat}
        onDelete={handleDeleteChat}
      />

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: CANVAS }}>
        <ChatHeader title={chatTitle} isEmpty={isEmpty} />

        {isEmpty ? (
          <WelcomeState
            draft={draft} onChange={setDraft} onKeyDown={handleKeyDown}
            onSend={send} taRef={taRef}
            micActive={micActive} onToggleMic={() => setMicActive(m => !m)}
            onChip={handleChip}
          />
        ) : (
          <>
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}
              aria-live="polite" aria-label="Chat messages">
              <div style={{ maxWidth: 760, margin: '0 auto', padding: '30px 26px 18px', display: 'flex', flexDirection: 'column', gap: 22 }}>
                {messages.map(m => (
                  m.role === 'user'
                    ? <UserMessage key={m.id} msg={m} />
                    : <AIMessage key={m.id} msg={m}
                        onApprove={handleApprove}
                        onDecline={handleDecline}
                        onOpenModify={handleOpenModify}
                        onCancelModify={handleCancelModify}
                        onModifyChange={handleModifyChange}
                        onSendModify={handleSendModify}
                        onRegen={handleRegen}
                        onRetryFailed={handleRetryFailed}
                        onPickAngle={handlePickAngle}
                      />
                ))}
              </div>
            </div>

            <div style={{ flexShrink: 0, padding: '10px 26px 16px' }}>
              <div style={{ maxWidth: 760, margin: '0 auto' }}>
                <Composer
                  draft={draft} onChange={setDraft} onKeyDown={handleKeyDown}
                  onSend={send} taRef={taRef}
                  micActive={micActive} onToggleMic={() => setMicActive(m => !m)}
                  onChip={handleChip}
                  big={false}
                  hasLatestDraft={!!latestDraft}
                />
                <p style={{ textAlign: 'center', fontSize: 11, color: '#B5AB99', fontFamily: FONT, margin: '9px 0 0' }}>
                  Agents can make mistakes — review drafts before publishing.
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
