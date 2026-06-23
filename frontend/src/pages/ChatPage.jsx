import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReducedMotion, motion, AnimatePresence } from 'framer-motion'
import { streamQuery, resumeAI } from '../api/ai'
import { AppSidebar } from '../components/shared/AppSidebar'

// ── Warm palette (chat surface) ─────────────────────────────────────────────
const CANVAS      = '#FAF6EF'
const WARM_WHITE  = '#FFFEFB'
const WARM_INPUT  = '#F6F1E8'
const WARM_HOVER  = '#F3EDE2'
const INK         = '#2A241D'
const BODY        = '#3A332A'
const MUTED       = '#8E8472'
const FAINT       = '#A99E8C'
const WARM_BDR    = 'rgba(80,64,46,0.10)'
const WARM_BDR_MD = 'rgba(80,64,46,0.16)'
// Brand accents (unchanged)
const BLUE        = '#2563EB'
const INDIGO      = '#6366F1'
const GREEN       = '#16A34A'
const RED         = '#B42318'
const AMBER       = '#B45309'

const FONT  = "'Hanken Grotesk',system-ui,sans-serif"
const SERIF = "'Newsreader',Georgia,serif"
const MONO  = "'JetBrains Mono','Fira Code',monospace"

// ── Agent config ────────────────────────────────────────────────────────────
const AGENTS = {
  Writer:   { name: 'Writer Agent',   color: INDIGO, tint: '#EEF0FF', path: 'M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z' },
  Research: { name: 'Research Agent', color: BLUE,   tint: '#EAF0FF', path: 'M11 4a7 7 0 105.2 11.7M21 21l-4.3-4.3' },
  SEO:      { name: 'SEO Agent',      color: '#0F9D6B', tint: '#E7F6EF', path: 'M5 20V9M12 20V4M19 20v-7' },
  Editor:   { name: 'Editor Agent',   color: AMBER, tint: '#FCEED6', path: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z' },
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

// ── Mock responses (fallback when API returns no content) ───────────────────
const DRAFT_TEXT = `Most SaaS tools are about to become invisible.

For a decade we paid per seat to click around dashboards. The dashboard was the product. But a dashboard is just a place where work waits for a human.

AI agents skip the waiting. They read the data, make the decision, and act — no tab, no login, no "where's that setting again?"

The winners of the next cycle won't sell software you operate. They'll sell outcomes you approve.

Your move: which tool in your stack is just a dashboard wearing a logo?`

const MOCK_RESPONSES = {
  Research: `Here's what the Research Agent surfaced:\n\n• 41% of teams now run at least one autonomous agent in production (State of AI, 2026).\n• "Outcome-based" pricing grew 3× faster than per-seat last year.\n• The most-shared angle this week: "your stack is a dashboard graveyard."\n\nWant me to weave these into the post as cited proof points?`,
  SEO: `SEO Agent read the intent behind your topic.\n\nPrimary angle: "AI agents replacing SaaS" — high curiosity, low competition on LinkedIn.\nHook with a contrarian claim, then pay it off with one concrete number.\n\nShall I draft three opener variations tuned for reach?`,
  Editor: `Editor Agent tightened the draft:\n\n• Cut 22% of the words without losing the argument.\n• Made every sentence active voice.\n• Strengthened the closing line into a direct question.\n\nApprove to apply these edits to your document.`,
  Writer: DRAFT_TEXT,
}
function mockResponseFor(agent, note) {
  if (note) return `Revised per your note — "${note}".\n\n${DRAFT_TEXT.replace(/^Most SaaS tools/, 'Quick truth: most SaaS tools')}\n\n(Shorter, sharper, and it now opens on a stat-ready hook.)`
  return MOCK_RESPONSES[agent] || DRAFT_TEXT
}

// ── Mock chat history ────────────────────────────────────────────────────────
const MOCK_CHATS = [
  { group: 'Today', items: [
    { id: 'c1', title: 'AI agents vs. SaaS — LinkedIn', snippet: 'Writer Agent · draft ready to review', dot: GREEN },
    { id: 'c2', title: 'Newsletter hook ideas',          snippet: '12 openers generated',               dot: INDIGO },
  ]},
  { group: 'Yesterday', items: [
    { id: 'c3', title: 'Repurpose webinar → X thread', snippet: 'Editor Agent · 7 tweets',       dot: AMBER },
    { id: 'c4', title: 'Q3 content calendar',           snippet: 'Research Agent · 18 topics',   dot: BLUE },
  ]},
  { group: 'Previous 7 days', items: [
    { id: 'c5', title: 'Carousel: creator onboarding', snippet: '8 slides drafted',             dot: '#0F9D6B' },
    { id: 'c6', title: 'Cold outreach rewrite',         snippet: 'Approved · sent to vault',    dot: FAINT },
    { id: 'c7', title: 'Brand voice tuning',            snippet: 'Voice profile updated',       dot: FAINT },
  ]},
]

// ── Sub-components ───────────────────────────────────────────────────────────

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

function UserMessage({ msg, reduced }) {
  return (
    <motion.div
      style={{ display: 'flex', justifyContent: 'flex-end' }}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
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
    </motion.div>
  )
}

function AIMessage({ msg, onApprove, onDecline, onOpenModify, onCancelModify, onModifyChange, onSendModify, onRegen, reduced }) {
  const a = AGENTS[msg.agent] || AGENTS.Writer
  const done = msg.phase === 'done'
  const hasBody = msg.phase === 'streaming' || done
  const showActions = done && !msg.decision
  const cardBorder = msg.decision === 'approved'
    ? 'rgba(22,163,74,.4)'
    : msg.decision === 'declined' ? 'rgba(180,35,24,.3)' : WARM_BDR

  return (
    <motion.div className="cc-aimsg"
      style={{ display: 'flex', gap: 13 }}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 11, background: a.tint,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 2,
      }}>
        <AgentIcon agent={msg.agent} size={17} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* routing label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.06em', color: FAINT }}>Supervisor</span>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#C4B9A6" strokeWidth={2.4}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: a.color }}>{a.name}</span>
        </div>

        {/* thinking state */}
        {msg.phase === 'routing' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '13px 16px', background: WARM_WHITE,
            border: `1px solid ${WARM_BDR}`, borderRadius: 16, width: 'fit-content',
          }}>
            <ThinkingDots />
            <span style={{ fontSize: 12.5, color: FAINT, fontStyle: 'italic', fontFamily: SERIF }}>
              {routingTextFor(msg.agent)}
            </span>
          </div>
        )}

        {/* answer body */}
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
                {msg.phase === 'streaming' && !reduced && (
                  <span style={{
                    display: 'inline-block', width: 2, height: 17, marginLeft: 2,
                    background: BLUE, verticalAlign: '-3px', borderRadius: 1,
                    animation: 'ccBlink 1s step-end infinite',
                  }} />
                )}
              </div>

              {/* approved pill */}
              {msg.decision === 'approved' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 13, borderTop: `1px solid rgba(80,64,46,.08)` }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    fontSize: 12.5, fontWeight: 600, color: '#15803D', background: '#DCFCE7',
                    padding: '6px 12px', borderRadius: 999,
                  }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth={2.6}><path d="M20 6L9 17l-5-5" /></svg>
                    Approved · added to draft
                  </span>
                  <span style={{ fontSize: 12, color: FAINT }}>Writer Agent will keep this in the document.</span>
                </div>
              )}

              {/* declined pill */}
              {msg.decision === 'declined' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 13, borderTop: `1px solid rgba(80,64,46,.08)` }}>
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
            </div>

            {/* action row: approve / modify / decline / copy */}
            {showActions && (
              <div className="cc-msg-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
                <button onClick={() => onApprove(msg.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    height: 36, padding: '0 15px', border: 'none', borderRadius: 10,
                    fontFamily: FONT, fontSize: 13, fontWeight: 600, color: '#fff',
                    cursor: 'pointer', background: GREEN,
                    boxShadow: '0 10px 22px -12px rgba(22,163,74,.7)',
                  }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4}><path d="M20 6L9 17l-5-5" /></svg>
                  Approve
                </button>
                <button onClick={() => onOpenModify(msg.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    height: 36, padding: '0 15px',
                    border: `1px solid ${msg.modifyOpen ? 'rgba(37,99,235,.5)' : WARM_BDR_MD}`,
                    background: msg.modifyOpen ? '#EAF0FF' : WARM_WHITE,
                    borderRadius: 10, fontFamily: FONT, fontSize: 13, fontWeight: 600,
                    color: msg.modifyOpen ? BLUE : '#6B6151', cursor: 'pointer',
                  }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z" /></svg>
                  Modify
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
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={2}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                </button>
              </div>
            )}

            {/* modify box */}
            {msg.modifyOpen && (
              <div style={{
                marginTop: 11, padding: 14, background: '#FFF9EE',
                border: '1px solid #F4DFB6', borderRadius: 14,
                animation: 'ccRise .18s ease-out',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2}><path d="M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z" /></svg>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#92660C' }}>Tell the agent what to change</span>
                </div>
                <textarea
                  value={msg.modifyText || ''}
                  onChange={e => onModifyChange(msg.id, e.target.value)}
                  placeholder="e.g. Make it shorter, add a real stat, end with a question…"
                  rows={2}
                  style={{
                    width: '100%', border: '1px solid #EAD3A3', borderRadius: 11,
                    padding: '11px 13px', fontFamily: FONT, fontSize: 13.5, lineHeight: 1.55,
                    color: BODY, background: '#fff', resize: 'vertical',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#E0A93A'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(224,169,58,.18)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#EAD3A3'; e.currentTarget.style.boxShadow = 'none' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  {['Shorter', 'Add a stat', 'End with a question'].map(chip => (
                    <button key={chip} onClick={() => onModifyChange(msg.id,
                      chip === 'Shorter' ? 'Make it noticeably shorter'
                      : chip === 'Add a stat' ? 'Add one concrete, credible statistic'
                      : 'End on a sharp question to drive comments')}
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
                    style={{ height: 34, padding: '0 13px', border: 'none', background: 'none', borderRadius: 9, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: MUTED, cursor: 'pointer' }}
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
                    }}>
                    Send to agent
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

// ── Chat history rail ────────────────────────────────────────────────────────
function ChatHistoryRail({ chats, search, onSearch, activeChat, onSelect, onDelete, onNewChat }) {
  const displayName = localStorage.getItem('display_name') ?? localStorage.getItem('username') ?? 'User'
  const initial = displayName[0]?.toUpperCase() ?? 'U'

  const filtered = chats.map(g => ({
    ...g,
    items: g.items.filter(c =>
      !search || (c.title + ' ' + c.snippet).toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(g => g.items.length > 0)

  return (
    <aside style={{
      width: 286, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: WARM_WHITE, borderRight: `1px solid ${WARM_BDR}`,
      fontFamily: FONT,
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
        <button onClick={onNewChat}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            width: '100%', height: 42, border: 'none', borderRadius: 12,
            fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer',
            background: BLUE, boxShadow: '0 10px 22px -10px rgba(37,99,235,.6)',
          }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.06)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.3} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New chat
        </button>
      </div>

      {/* search */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, height: 38, padding: '0 12px',
          background: WARM_INPUT, border: `1px solid rgba(80,64,46,.08)`, borderRadius: 11,
        }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#9C9082" strokeWidth={2}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" /></svg>
          <input value={search} onChange={e => onSearch(e.target.value)}
            placeholder="Search chats"
            style={{ flex: 1, border: 'none', background: 'none', fontFamily: FONT, fontSize: 13, color: INK, padding: 0, outline: 'none' }} />
        </div>
      </div>

      {/* list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 10px 10px' }}>
        {filtered.map(g => (
          <div key={g.group} style={{ marginBottom: 6 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase', color: FAINT, padding: '12px 8px 6px' }}>
              {g.group}
            </div>
            {g.items.map(c => {
              const isActive = c.id === activeChat
              return (
                <div key={c.id} className="cc-chat-row"
                  onClick={() => onSelect(c.id)}
                  style={{
                    position: 'relative', display: 'flex', flexDirection: 'column', gap: 2,
                    padding: '9px 11px', borderRadius: 11, cursor: 'pointer',
                    background: isActive ? '#EAF0FF' : 'transparent',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = WARM_HOVER }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: c.dot }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? BLUE : '#3A332A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.title}
                    </span>
                    <button className="cc-chat-del"
                      onClick={e => { e.stopPropagation(); onDelete(c.id) }}
                      title="Delete"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 20, border: 'none', background: 'none',
                        borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(80,64,46,.12)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#9C9082" strokeWidth={2.2}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
                    </button>
                  </div>
                  <span style={{ fontSize: 11.5, color: FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: 14 }}>
                    {c.snippet}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* account footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderTop: `1px solid ${WARM_BDR}` }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg,#2563EB,#6366F1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          fontFamily: SERIF, fontSize: 15,
        }}>
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: INK }}>{displayName}</p>
          <p style={{ margin: 0, fontSize: 11.5, color: FAINT }}>Pro plan</p>
        </div>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth={1.9}><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </div>
    </aside>
  )
}

// ── Chat header ──────────────────────────────────────────────────────────────
function ChatHeader({ title, agentStack }) {
  return (
    <header style={{
      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 26px', borderBottom: `1px solid rgba(80,64,46,.09)`,
      background: 'rgba(250,246,239,.82)', backdropFilter: 'blur(12px)', zIndex: 5,
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: INK }}>
          {title}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN, animation: 'ccPulse 2.4s ease-in-out infinite' }} />
          <span style={{ fontSize: 12, color: MUTED, fontFamily: FONT }}>
            Supervisor coordinating <strong style={{ color: '#6B6151', fontWeight: 600 }}>3 agents</strong>
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* agent avatar stack */}
        <div style={{ display: 'flex', alignItems: 'center', marginRight: 4 }}>
          {agentStack.map((key, i) => {
            const a = AGENTS[key]
            return (
              <span key={key} title={a.name} style={{
                width: 30, height: 30, borderRadius: '50%', background: a.tint,
                border: `2px solid ${CANVAS}`, display: 'flex', alignItems: 'center',
                justifyContent: 'center', marginLeft: i === 0 ? 0 : -7,
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
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#7C7264" strokeWidth={2}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
          Share
        </button>
      </div>
    </header>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onChip }) {
  const chips = [
    { label: 'Write a LinkedIn post', prefix: 'Write a LinkedIn post about ' },
    { label: 'Find trending angles',  prefix: 'Find trending angles on ' },
    { label: 'Make it shorter',       prefix: 'Make the latest draft shorter' },
    { label: 'Stronger hook',         prefix: 'Write a stronger hook for this' },
  ]
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32 }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,#2563EB,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 28px -10px rgba(37,99,235,.5)' }}>
        <span style={{ fontFamily: SERIF, fontSize: 30, color: '#fff', marginTop: -2 }}>C</span>
      </div>
      <p style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 400, color: INK, margin: 0, textAlign: 'center' }}>
        What should the team work on?
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {chips.map(c => (
          <button key={c.label} onClick={() => onChip(c.prefix)}
            style={{
              height: 36, padding: '0 15px', border: `1px solid ${WARM_BDR_MD}`,
              background: WARM_WHITE, borderRadius: 999, fontFamily: FONT,
              fontSize: 13, fontWeight: 600, color: '#6B6151', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,.4)'; e.currentTarget.style.color = BLUE }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = WARM_BDR_MD; e.currentTarget.style.color = '#6B6151' }}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Composer ─────────────────────────────────────────────────────────────────
function Composer({ draft, onChange, onKeyDown, onSend, taRef, disabled }) {
  const chips = [
    { label: 'Write a LinkedIn post', prefix: 'Write a LinkedIn post about ',    stroke: INDIGO },
    { label: 'Find trending angles',  prefix: 'Find trending angles on ',         stroke: BLUE },
    { label: 'Make it shorter',       prefix: 'Make the latest draft shorter',    stroke: AMBER },
    { label: 'Stronger hook',         prefix: 'Write a stronger hook for this',   stroke: '#0F9D6B' },
  ]
  const canSend = !!draft.trim() && !disabled

  function autosize(el) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(160, el.scrollHeight) + 'px'
  }

  return (
    <div style={{ flexShrink: 0, padding: '8px 26px 18px', background: CANVAS }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* quick chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {chips.map(c => (
            <button key={c.label} onClick={() => { onChange(c.prefix); setTimeout(() => taRef.current?.focus(), 0) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 13px',
                border: `1px solid ${WARM_BDR_MD}`, background: WARM_WHITE, borderRadius: 999,
                fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: '#6B6151', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,.4)'; e.currentTarget.style.color = BLUE }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = WARM_BDR_MD; e.currentTarget.style.color = '#6B6151' }}>
              {c.label}
            </button>
          ))}
        </div>

        {/* input row */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 10,
          padding: '10px 10px 10px 16px', background: WARM_WHITE,
          border: `1px solid ${WARM_BDR_MD}`, borderRadius: 18,
          boxShadow: '0 16px 38px -24px rgba(60,48,30,.5)',
          transition: 'border-color .18s, box-shadow .18s',
        }}
        onFocusCapture={e => { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.boxShadow = `0 0 0 4px rgba(37,99,235,.1),0 16px 38px -24px rgba(60,48,30,.5)` }}
        onBlurCapture={e => { e.currentTarget.style.borderColor = WARM_BDR_MD; e.currentTarget.style.boxShadow = '0 16px 38px -24px rgba(60,48,30,.5)' }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            padding: '7px 10px', borderRadius: 9,
            background: 'linear-gradient(135deg,#2563EB,#6366F1)',
            color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.03em', alignSelf: 'center',
          }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="#fff"><path d="M12 2l1.6 4.6L18 8l-4.4 1.4L12 14l-1.6-4.6L6 8l4.4-1.4z"/></svg>
            Supervisor
          </span>
          <textarea
            ref={taRef}
            value={draft}
            onChange={e => { onChange(e.target.value); autosize(e.target) }}
            onKeyDown={onKeyDown}
            placeholder="Ask the agents to research, write, rewrite, or repurpose anything…"
            rows={1}
            style={{
              flex: 1, border: 'none', background: 'none', fontFamily: FONT,
              fontSize: 14.5, lineHeight: 1.55, color: INK, padding: '8px 2px',
              resize: 'none', maxHeight: 160, overflowY: 'auto', outline: 'none',
            }}
          />
          <button onClick={onSend} disabled={!canSend} title="Send"
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 42, height: 42, border: 'none', borderRadius: 13, cursor: canSend ? 'pointer' : 'default',
              background: canSend ? BLUE : '#D8CFC0',
              boxShadow: canSend ? '0 10px 22px -10px rgba(37,99,235,.7)' : 'none',
              opacity: canSend ? 1 : 0.7, transition: 'background .18s, opacity .18s',
            }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#B5AB99', fontFamily: FONT, margin: '9px 0 0' }}>
          Agents can make mistakes — review drafts before publishing.
        </p>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const navigate = useNavigate()
  const reduced  = useReducedMotion()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [draft,       setDraft]       = useState('')
  const [search,      setSearch]      = useState('')
  const [activeChat,  setActiveChat]  = useState('c1')
  const [chatTitle,   setChatTitle]   = useState('AI agents vs. SaaS — LinkedIn post')
  const [chats,       setChats]       = useState(MOCK_CHATS)
  const [messages,    setMessages]    = useState([])
  const [seq,         setSeq]         = useState(100)

  const busy      = useRef(false)
  const abortRef  = useRef(null)
  const scrollRef = useRef(null)
  const taRef     = useRef(null)

  // Seed initial exchange so the HITL UI is visible immediately
  useEffect(() => {
    setMessages([
      { id: 1, role: 'user',  text: 'Write a punchy LinkedIn post arguing that AI agents will quietly replace most SaaS tools.', isRefine: false },
      { id: 2, role: 'ai',   agent: 'Writer', phase: 'done', text: DRAFT_TEXT, decision: null, modifyOpen: false, modifyText: '', thread_id: null },
    ])
  }, [])

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
      if (nearBottom) el.scrollTop = el.scrollHeight
    })
  }, [])

  function patch(id, fields) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...fields } : m))
  }

  // ── Send a message ──────────────────────────────────────────────────────
  function send() {
    const text = draft.trim()
    if (!text || busy.current) return
    busy.current = true
    pushExchange(text, false)
    setDraft('')
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  function pushExchange(userText, isRefine, noteForFallback) {
    const agent  = routeFor(userText)
    const uid    = seq + 1
    const aid    = seq + 2
    setSeq(s => s + 2)

    const userMsg = { id: uid, role: 'user', text: userText, isRefine }
    const aiMsg   = { id: aid, role: 'ai', agent, phase: 'routing', text: '', decision: null, modifyOpen: false, modifyText: '', thread_id: null }

    setMessages(prev => [...prev, userMsg, aiMsg])
    setTimeout(scrollDown, 50)

    // Try real SSE stream first; fall back to simulated on error
    setTimeout(() => {
      patch(aid, { phase: 'streaming', text: '' })
      let accumulated = ''

      const abort = streamQuery(
        userText,
        (token) => {
          accumulated += token
          patch(aid, { text: accumulated })
          scrollDown()
        },
        (doneData) => {
          // SSE done — if answer came via done event use it, else keep accumulated
          const finalText = doneData?.answer || doneData?.draft || accumulated || mockResponseFor(agent, noteForFallback)
          const threadId  = doneData?.thread_id || null
          const isHITL    = doneData?.status === 'awaiting_approval'
          patch(aid, { phase: 'done', text: finalText, thread_id: threadId, decision: isHITL ? null : 'auto' })
          busy.current = false
          scrollDown()
        },
        (_err) => {
          // SSE failed — simulate streaming from mock response
          simulateStream(aid, mockResponseFor(agent, noteForFallback))
        }
      )
      abortRef.current = abort
    }, 800)
  }

  function simulateStream(id, fullText) {
    let i = 0
    const step = 3
    const timer = setInterval(() => {
      i += step + Math.floor(Math.random() * 3)
      if (i >= fullText.length) {
        i = fullText.length
        clearInterval(timer)
        patch(id, { phase: 'done', text: fullText })
        busy.current = false
        scrollDown()
        return
      }
      patch(id, { text: fullText.slice(0, i) })
      if (i % 60 < step + 3) scrollDown()
    }, 24)
  }

  // ── HITL actions ────────────────────────────────────────────────────────
  async function handleApprove(id) {
    const msg = messages.find(m => m.id === id)
    if (!msg) return
    if (msg.thread_id) {
      try { await resumeAI(msg.thread_id, 'approved') } catch {}
    }
    patch(id, { decision: 'approved', modifyOpen: false })
  }

  async function handleDecline(id) {
    const msg = messages.find(m => m.id === id)
    if (!msg) return
    if (msg.thread_id) {
      try { await resumeAI(msg.thread_id, 'rejected') } catch {}
    }
    patch(id, { decision: 'declined', modifyOpen: false })
  }

  function handleOpenModify(id) {
    setMessages(prev => prev.map(m => ({ ...m, modifyOpen: m.id === id ? true : m.modifyOpen })))
    setTimeout(scrollDown, 50)
  }
  function handleCancelModify(id) { patch(id, { modifyOpen: false }) }
  function handleModifyChange(id, val) { patch(id, { modifyText: val }) }

  async function handleSendModify(id) {
    const msg = messages.find(m => m.id === id)
    if (!msg) return
    const note = (msg.modifyText || '').trim() || 'Make it tighter and punchier'

    if (msg.thread_id) {
      try { await resumeAI(msg.thread_id, 'edited', note) } catch {}
    }

    patch(id, { modifyOpen: false, modifyText: '', decision: 'superseded' })
    busy.current = true
    pushExchange(note, true, note)
  }

  function handleRegen(id) {
    const msg = messages.find(m => m.id === id)
    if (!msg) return
    patch(id, { decision: null, phase: 'routing', text: '' })
    busy.current = true
    setTimeout(() => simulateStream(id, mockResponseFor(msg.agent)), 700)
  }

  // ── Chat rail actions ────────────────────────────────────────────────────
  function handleNewChat() {
    if (abortRef.current) { abortRef.current(); abortRef.current = null }
    busy.current = false
    setMessages([])
    setDraft('')
    setActiveChat('new')
    setChatTitle('New chat')
  }

  function handleSelectChat(id) {
    setActiveChat(id)
    const all = MOCK_CHATS.flatMap(g => g.items)
    const c = all.find(x => x.id === id)
    setChatTitle(c ? c.title : 'Chat')
  }

  function handleDeleteChat(id) {
    if (!window.confirm('Delete this conversation?')) return
    setChats(prev => prev.map(g => ({ ...g, items: g.items.filter(c => c.id !== id) })).filter(g => g.items.length))
    if (activeChat === id) handleNewChat()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const isEmpty = messages.length === 0

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: CANVAS, fontFamily: FONT, color: INK }}>
      {/* ── App shell sidebar (shared component) ── */}
      <AppSidebar
        navigate={navigate}
        activeKey="chat"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
      />

      {/* ── Chat history rail ── */}
      <ChatHistoryRail
        chats={chats}
        search={search}
        onSearch={setSearch}
        activeChat={activeChat}
        onSelect={handleSelectChat}
        onDelete={handleDeleteChat}
        onNewChat={handleNewChat}
      />

      {/* ── Chat window ── */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: CANVAS }}>
        <ChatHeader
          title={chatTitle}
          agentStack={['Research', 'Writer', 'Editor']}
        />

        {/* message stream */}
        <div
          ref={scrollRef}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}
          aria-live="polite"
          aria-label="Chat messages"
        >
          {isEmpty ? (
            <EmptyState onChip={text => { setDraft(text); setTimeout(() => taRef.current?.focus(), 0) }} />
          ) : (
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '30px 26px 18px', display: 'flex', flexDirection: 'column', gap: 22 }}>
              <AnimatePresence initial={false}>
                {messages.map(m => (
                  m.role === 'user'
                    ? <UserMessage key={m.id} msg={m} reduced={reduced} />
                    : <AIMessage   key={m.id} msg={m} reduced={reduced}
                        onApprove={handleApprove}
                        onDecline={handleDecline}
                        onOpenModify={handleOpenModify}
                        onCancelModify={handleCancelModify}
                        onModifyChange={handleModifyChange}
                        onSendModify={handleSendModify}
                        onRegen={handleRegen}
                      />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        <Composer
          draft={draft}
          onChange={setDraft}
          onKeyDown={handleKeyDown}
          onSend={send}
          taRef={taRef}
          disabled={busy.current}
        />
      </main>
    </div>
  )
}
