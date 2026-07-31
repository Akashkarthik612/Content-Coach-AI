import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  getVersions, getVersion, saveVersion, renamePost, deletePost,
} from '../api/vault'
import { queryAI } from '../api/ai'
import { useVault } from '../hooks/useVault'

/* ────────────────────────────────────────────────────────────────────────
   Design tokens — ported from "ContentCoach AI - Vault.dc.html" (Claude
   Design project ff122375-c3bc-4438-aece-706b0bd557b0), the same Honne
   design system already used by ChatPage.jsx. Colors/fonts/radii match the
   source .dc.html exactly.
   ──────────────────────────────────────────────────────────────────────── */
const PAPER  = '#F4F2EA'
const ASIDE_BG = '#EFEDE3'
const INK    = '#1B1C14'
const ACCENT = '#14663B'
const SERIF  = "'EB Garamond', serif"
const SANS   = "'Hanken Grotesk', system-ui, sans-serif"
const MONO   = "'JetBrains Mono', monospace"

const NOISE_STYLE = {
  position: 'fixed', inset: 0, zIndex: 2, pointerEvents: 'none',
  mixBlendMode: 'overlay', opacity: 0.04,
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
}

const KEYFRAMES = `
.honne-vault-root, .honne-vault-root *{box-sizing:border-box}
.honne-vault-root textarea,.honne-vault-root input,.honne-vault-root button{font-family:inherit}
.honne-vault-root textarea:focus,.honne-vault-root input:focus{outline:none}
.honne-vault-root ::selection{background:#CDEBD6;color:#1B1C14}
.honne-vault-root ::-webkit-scrollbar{width:10px;height:10px}
.honne-vault-root ::-webkit-scrollbar-thumb{background:rgba(27,28,20,.14);border-radius:999px;border:3px solid transparent;background-clip:padding-box}
.honne-vault-root ::-webkit-scrollbar-thumb:hover{background:rgba(27,28,20,.26);background-clip:padding-box}
@keyframes vRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes vFade{from{opacity:0}to{opacity:1}}
@keyframes vSlide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
@keyframes vCaret{50%{opacity:0}}
@keyframes vCard{from{opacity:0;transform:translate3d(0,14px,0) scale(.985)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}
.honne-vault-root [data-stagger]>*{animation:vCard .52s cubic-bezier(.22,1,.36,1) both;will-change:transform,opacity}
.honne-vault-root [data-stagger]>*:nth-child(1){animation-delay:.01s}
.honne-vault-root [data-stagger]>*:nth-child(2){animation-delay:.05s}
.honne-vault-root [data-stagger]>*:nth-child(3){animation-delay:.09s}
.honne-vault-root [data-stagger]>*:nth-child(4){animation-delay:.13s}
.honne-vault-root [data-stagger]>*:nth-child(5){animation-delay:.17s}
.honne-vault-root [data-stagger]>*:nth-child(6){animation-delay:.21s}
.honne-vault-root [data-stagger]>*:nth-child(7){animation-delay:.25s}
.honne-vault-root [data-stagger]>*:nth-child(8){animation-delay:.29s}
.honne-vault-root [data-stagger]>*:nth-child(n+9){animation-delay:.32s}
@media (prefers-reduced-motion:reduce){.honne-vault-root *{animation:none!important;transition:none!important}}
`

// Content-type categories. Every post the app creates today is tagged 'IDEA'
// (there is no UI, here or upstream, that ever assigns a different one) —
// the map/ORDER stay in full so filter chips + colors are ready the moment
// something starts setting a real tag.
const CATS = {
  LINKEDIN:     { bg: '#D9E4F2', fg: '#2E5E8F', label: 'LinkedIn' },
  'X THREAD':   { bg: '#E2E1DA', fg: '#3A3C30', label: 'X Thread' },
  REDDIT:       { bg: '#F2DFD3', fg: '#A5583C', label: 'Reddit' },
  BLOG:         { bg: '#D3E7D7', fg: '#2C6B44', label: 'Blog' },
  NEWSLETTER:   { bg: '#E7DEF3', fg: '#6A4C9C', label: 'Newsletter' },
  ESSAY:        { bg: '#F1E6C6', fg: '#8A6A1C', label: 'Essay' },
  IDEA:         { bg: '#E5E3D8', fg: '#6B6E5C', label: 'Idea' },
}
const ORDER = ['ALL', 'LINKEDIN', 'X THREAD', 'REDDIT', 'BLOG', 'NEWSLETTER', 'ESSAY', 'IDEA']
const tagOf = () => 'IDEA'

const RESEARCH_SUGGESTIONS = [
  'Find recent stats to back this up',
  'Give me a contrarian angle',
  'Summarize the current debate',
]

// ── Utilities ─────────────────────────────────────────────────────────────
function wordCount(text) {
  const s = (text || '').trim()
  return s ? s.split(/\s+/).length : 0
}
function readLabel(words) {
  if (!words) return 'Empty'
  const secs = Math.round((words / 200) * 60)
  if (secs < 60) return Math.max(5, Math.round(secs / 5) * 5) + ' sec read'
  return Math.max(1, Math.round(secs / 60)) + ' min read'
}
function relativeTime(dateStr) {
  if (!dateStr) return ''
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = diffMs / 60000
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${Math.round(mins)}m ago`
  const hrs = mins / 60
  if (hrs < 24) return `${Math.round(hrs)}h ago`
  const days = hrs / 24
  if (days < 2) return 'Yesterday'
  if (days < 7) return `${Math.round(days)}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function flatten(text) {
  return (text || '').replace(/\s+/g, ' ').trim()
}

// ── Magnetic primary CTA — pointer-fine only, reduced-motion safe ──────────
function useMagnetic() {
  const cleanupRef = useRef(null)
  return useCallback((el) => {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null }
    if (!el) return
    const fine  = window.matchMedia('(hover:hover) and (pointer:fine)').matches
    const still = window.matchMedia('(prefers-reduced-motion:reduce)').matches
    if (!fine || still) return
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - (r.left + r.width / 2)) * 0.28
      const y = (e.clientY - (r.top + r.height / 2)) * 0.4
      el.style.transform = `translate3d(${x}px,${y}px,0)`
    }
    const onLeave = () => { el.style.transform = 'translate3d(0,0,0)' }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    cleanupRef.current = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [])
}

// ── Inline icons (ported 1:1 from the .dc.html source, not lucide) ────────
const IconPlus   = ({ size = 15 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
const IconSearch = ({ size = 16, color = '#A6A895' }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
const IconClose  = ({ size = 12, color = '#6B6E5C' }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" /></svg>
const IconArrow  = ({ size = 13 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
const IconBack   = ({ size = 15 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
const IconResearch = ({ size = 15 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
const IconDone   = ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
const IconSend   = ({ size = 15, color }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M12 5l-6 6M12 5l6 6" /></svg>
const IconEmpty  = ({ size = 26 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#C4C6B6" strokeWidth="1.7"><path d="M4 6a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>
// ── Vault — one draft card ─────────────────────────────────────────────────
function VaultCard({ post, onOpen }) {
  const cat = CATS[tagOf(post)] || CATS.IDEA
  const words = post.word_count || 0
  const preview = post.preview || 'Empty draft — open to start writing.'
  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex', flexDirection: 'column', minHeight: 196, background: '#fff',
        border: '1px solid rgba(27,28,20,.07)', borderRadius: 16, padding: '18px 18px 15px',
        boxShadow: '0 1px 3px rgba(27,28,20,.05)', cursor: 'pointer',
        transition: 'transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s ease, border-color .2s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 20px 42px -26px rgba(27,28,20,.4)'; e.currentTarget.style.borderColor = 'rgba(27,28,20,.1)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(27,28,20,.05)'; e.currentTarget.style.borderColor = 'rgba(27,28,20,.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 6, background: cat.bg, color: cat.fg, fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{cat.label}</span>
        <span style={{ fontSize: 12, color: '#A6A895', fontWeight: 500, whiteSpace: 'nowrap' }}>{relativeTime(post.updated_at)}</span>
      </div>
      <h3 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 20, lineHeight: 1.15, letterSpacing: '-.01em', margin: '0 0 8px', color: INK, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.title || 'Untitled draft'}</h3>
      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#7A7C6C', margin: 0, letterSpacing: '-.003em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{preview}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 'auto', paddingTop: 14, borderTop: '1px solid rgba(27,28,20,.06)' }}>
        <span style={{ fontSize: 12, color: '#A6A895', letterSpacing: '-.003em' }}>{readLabel(words)} · {words} {words === 1 ? 'word' : 'words'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: '#8A8C7C' }}>Open <IconArrow /></span>
      </div>
    </div>
  )
}

// ── Vault — flat grid view (every draft, one place) ─────────────────────────
// Ported from "ContentCoach AI - Vault.dc.html" (Claude Design project
// ff122375-c3bc-4438-aece-706b0bd557b0): a single flat, searchable/filterable
// list of every draft — no folder-grouping tier. Folders still exist on the
// backend (every post still has a folder_id — e.g. chat-approved drafts land
// in an auto-created "AI Drafts" folder, see sql_fetch_node.py), they're just
// not a browsing layer in this UI; per-platform (LinkedIn/X/Reddit) grouping
// is a planned follow-up.
function VaultView({ posts, onOpen, onNewDraft, creatingDraft }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [searchFocused, setSearchFocused] = useState(false)
  const magRef = useMagnetic()

  const q = query.trim().toLowerCase()
  const hasQuery = q.length > 0

  const present = ORDER.filter(t => t === 'ALL' || posts.some(p => tagOf(p) === t))
  const chips = present.map(t => {
    const on = filter === t && !hasQuery
    return {
      key: t,
      label: t === 'ALL' ? 'All' : (CATS[t]?.label || t),
      onClick: () => { setFilter(t); setQuery('') },
      bg: on ? ACCENT : '#fff',
      border: on ? ACCENT : 'rgba(27,28,20,.1)',
      color: on ? '#F4F2EA' : '#5A5C4C',
    }
  })

  let list = posts
  if (hasQuery) {
    list = list.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.preview || '').toLowerCase().includes(q) ||
      tagOf(p).toLowerCase().includes(q))
  } else if (filter !== 'ALL') {
    list = list.filter(p => tagOf(p) === filter)
  }
  list = list.slice().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))

  const countLabel = `${list.length} ${list.length === 1 ? 'draft' : 'drafts'}`
  const emptyMsg = hasQuery ? 'No drafts match your search. Try another word.' : 'Nothing saved yet — start a new draft, or approve one from Chat.'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'vFade .35s ease both' }}>
      <header style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, padding: '30px 40px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <span style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: 12, background: '#fff', border: '1px solid rgba(27,28,20,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(27,28,20,.05)' }}>
            <span style={{ fontFamily: SERIF, fontSize: 24, color: ACCENT, fontStyle: 'italic', fontWeight: 500 }}>H</span>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.2em', textTransform: 'uppercase', color: '#A6A895', marginBottom: 8 }}>Honne · Library</div>
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(34px,3.4vw,46px)', lineHeight: 1, letterSpacing: '-.02em', margin: 0 }}>The Vault</h1>
            <p style={{ fontSize: 14, color: '#7A7C6C', margin: '9px 0 0', letterSpacing: '-.005em' }}>Every draft, one place. Open one to shape the post inside.</p>
          </div>
        </div>
        <button onClick={onNewDraft} ref={magRef} disabled={creatingDraft}
          style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 9, height: 44, padding: '0 20px', border: 'none', borderRadius: 12, background: ACCENT, color: '#F4F2EA', fontSize: 13.5, fontWeight: 600, letterSpacing: '-.005em', cursor: creatingDraft ? 'default' : 'pointer', boxShadow: '0 12px 26px -14px rgba(20,102,59,.7)', transition: 'box-shadow .2s ease, transform .32s cubic-bezier(.22,1,.36,1)', opacity: creatingDraft ? 0.7 : 1 }}
          onMouseEnter={e => { if (!creatingDraft) e.currentTarget.style.boxShadow = '0 16px 30px -14px rgba(20,102,59,.85)' }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 12px 26px -14px rgba(20,102,59,.7)' }}>
          <IconPlus /> {creatingDraft ? 'Creating…' : 'New draft'}
        </button>
      </header>

      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 16, padding: '0 40px 18px', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 11, height: 42, padding: '0 15px', background: '#fff',
          border: `1px solid ${searchFocused ? 'rgba(20,102,59,.5)' : 'rgba(27,28,20,.1)'}`, borderRadius: 12,
          minWidth: 280, flex: '0 1 340px', transition: 'border-color .22s ease, box-shadow .22s ease',
          boxShadow: searchFocused ? '0 0 0 3px rgba(20,102,59,.08)' : 'none',
        }}>
          <IconSearch />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search your drafts…"
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', fontSize: 14, color: INK, letterSpacing: '-.005em' }}
          />
          {hasQuery && (
            <button onClick={() => setQuery('')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, border: 'none', background: 'rgba(27,28,20,.06)', borderRadius: 6, cursor: 'pointer' }}>
              <IconClose />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {chips.map(c => (
            <button key={c.key} onClick={c.onClick}
              style={{ height: 34, padding: '0 14px', border: `1px solid ${c.border}`, background: c.bg, color: c.color, borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: '.01em', cursor: 'pointer', transition: 'border-color .18s ease, background .18s ease, color .18s ease' }}>
              {c.label}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11, letterSpacing: '.06em', color: '#A6A895' }}>{countLabel}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 40px 48px' }}>
        {list.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 18 }} data-stagger>
            {list.map(p => <VaultCard key={p.id} post={p} onOpen={() => onOpen(p)} />)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '90px 20px', textAlign: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 60, height: 60, borderRadius: 16, background: '#fff', border: '1px solid rgba(27,28,20,.08)' }}><IconEmpty /></span>
            <div style={{ fontFamily: SERIF, fontSize: 20, color: '#3A3C30' }}>Nothing here yet</div>
            <div style={{ fontSize: 13.5, color: '#9A9C8C', maxWidth: 300, lineHeight: 1.5 }}>{emptyMsg}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Editor — research agent aside ───────────────────────────────────────────
function ResearchAside({ onClose, rMsgs, rDraft, setRDraft, onSend, rBusy, rScrollRef, onAddToDraft }) {
  const rCanSend = !!rDraft.trim()
  return (
    <aside style={{ flex: '0 0 400px', width: 400, display: 'flex', flexDirection: 'column', background: ASIDE_BG, borderLeft: '1px solid rgba(27,28,20,.08)', overflow: 'hidden', animation: 'vSlide .4s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '15px 15px 13px', borderBottom: '1px solid rgba(27,28,20,.07)' }}>
        <span style={{ width: 30, height: 30, flex: '0 0 30px', borderRadius: 9, background: '#fff', border: '1px solid rgba(27,28,20,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: SERIF, fontSize: 17, color: ACCENT, fontStyle: 'italic', fontWeight: 500 }}>H</span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, letterSpacing: '-.005em' }}>Research agent</div>
          <div style={{ fontSize: 11.5, color: '#9A9C8C' }}>Look things up without leaving the draft</div>
        </div>
        <button onClick={onClose} title="Close research" style={{ width: 28, height: 28, flex: '0 0 28px', border: 'none', background: 'none', borderRadius: 8, color: '#8A8C7C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconClose size={15} color="currentColor" />
        </button>
      </div>

      <div ref={rScrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 15px 8px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {rMsgs.length === 0 ? (
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 20, color: '#3A3C30', lineHeight: 1.25, marginBottom: 7 }}>What should we look into?</div>
            <div style={{ fontSize: 13, color: '#9A9C8C', lineHeight: 1.5, marginBottom: 16 }}>The agent searches your vault and hands you facts you can drop straight into the draft.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {RESEARCH_SUGGESTIONS.map(s => (
                <button key={s} onClick={() => onSend(s)} style={{ textAlign: 'left', border: '1px solid rgba(27,28,20,.1)', background: '#fff', borderRadius: 11, padding: '11px 13px', fontSize: 13, color: '#3A3C30', cursor: 'pointer', transition: 'border-color .18s ease, transform .16s cubic-bezier(.22,1,.36,1)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(20,102,59,.4)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(27,28,20,.1)'; e.currentTarget.style.transform = 'none' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          rMsgs.map(m => m.role === 'user' ? (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ maxWidth: '82%', padding: '10px 14px', borderRadius: '14px 14px 4px 14px', background: ACCENT, color: '#F4F2EA', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{m.text}</div>
            </div>
          ) : (
            <div key={m.id} style={{ display: 'flex', gap: 10 }}>
              <span style={{ width: 26, height: 26, flex: '0 0 26px', borderRadius: 8, background: '#fff', border: '1px solid rgba(27,28,20,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                <span style={{ fontFamily: SERIF, fontSize: 15, color: ACCENT, fontStyle: 'italic' }}>H</span>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.65, color: '#26281C', whiteSpace: 'pre-wrap' }}>
                  {m.text}
                  {m.streaming && <span style={{ display: 'inline-block', width: 2, height: 15, marginLeft: 2, background: ACCENT, verticalAlign: -2, animation: 'vCaret .9s step-end infinite' }} />}
                </div>
                {m.done && (
                  <button onClick={() => onAddToDraft(m.text)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 11, height: 30, padding: '0 12px', border: '1px solid rgba(20,102,59,.3)', background: 'rgba(20,102,59,.06)', borderRadius: 9, fontSize: 12, fontWeight: 600, color: ACCENT, cursor: 'pointer' }}>
                    <IconPlus size={13} /> Add to draft
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ flex: '0 0 auto', padding: '10px 13px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(27,28,20,.12)', borderRadius: 14, padding: '4px 4px 4px 14px' }}>
          <input
            value={rDraft}
            onChange={e => setRDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSend() } }}
            placeholder="Ask the research agent…"
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', fontSize: 13.5, color: INK, padding: '8px 0', letterSpacing: '-.005em' }}
          />
          <button onClick={() => onSend()} title="Send" disabled={!rCanSend || rBusy}
            style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: 'none', borderRadius: 10, cursor: rCanSend ? 'pointer' : 'default', background: rCanSend ? ACCENT : '#E4E2D6', transition: 'background .22s ease' }}>
            <IconSend color={rCanSend ? '#F4F2EA' : '#B0B2A2'} />
          </button>
        </div>
      </div>
    </aside>
  )
}

// ── Editor view ──────────────────────────────────────────────────────────────
function EditorView({ post, onBack, onPostSynced }) {
  const [title, setTitle] = useState(post.title || '')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(true)
  const [researchOpen, setResearchOpen] = useState(false)
  const [rMsgs, setRMsgs] = useState([])
  const [rDraft, setRDraft] = useState('')
  const [rBusy, setRBusy] = useState(false)

  const titleValueRef = useRef(title)
  const bodyValueRef  = useRef(body)
  const bodyTaRef     = useRef(null)
  const rScrollRef    = useRef(null)
  const saveTimerRef  = useRef(null)
  const streamTimerRef = useRef(null)
  const rSeqRef       = useRef(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getVersions(post.id).then(async (list) => {
      if (cancelled) return
      let content = ''
      if (list.length > 0) {
        const latest = await getVersion(list[list.length - 1].id)
        content = latest.content
      }
      if (cancelled) return
      bodyValueRef.current = content
      setBody(content)
      setLoading(false)
      requestAnimationFrame(autosize)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [post.id])

  useEffect(() => () => {
    clearTimeout(saveTimerRef.current)
    clearInterval(streamTimerRef.current)
  }, [])

  function autosize() {
    const el = bodyTaRef.current
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
  }

  async function persistNow() {
    const currentTitle = titleValueRef.current.trim()
    const currentBody  = bodyValueRef.current
    const updates = {}
    if (currentTitle !== (post.title || '')) {
      const updated = await renamePost(post.id, currentTitle || 'Untitled draft')
      updates.title = updated.title
    }
    if (currentBody.trim()) {
      await saveVersion(post.id, currentBody, null, false)
      const flat = flatten(currentBody)
      updates.preview = flat.slice(0, 220)
      updates.word_count = flat ? flat.split(' ').length : 0
      updates.updated_at = new Date().toISOString()
    }
    if (Object.keys(updates).length) onPostSynced(post.id, updates)
  }

  function schedulePersist() {
    setSaved(false)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      persistNow().catch(err => console.error('Autosave failed:', err)).finally(() => setSaved(true))
    }, 650)
  }

  function handleTitleChange(e) {
    const v = e.target.value
    titleValueRef.current = v
    setTitle(v)
    schedulePersist()
  }
  function handleBodyChange(e) {
    const v = e.target.value
    bodyValueRef.current = v
    setBody(v)
    autosize()
    schedulePersist()
  }

  function addToDraft(text) {
    const base = bodyValueRef.current
    const next = (base.trim() ? base.trim() + '\n\n' : '') + text
    bodyValueRef.current = next
    setBody(next)
    requestAnimationFrame(autosize)
    schedulePersist()
  }

  function scrollResearch() {
    requestAnimationFrame(() => { const el = rScrollRef.current; if (el) el.scrollTop = el.scrollHeight })
  }

  function startResearchStream(id, full) {
    let i = 0
    clearInterval(streamTimerRef.current)
    streamTimerRef.current = setInterval(() => {
      i += 3 + Math.round(Math.random() * 3)
      if (i >= full.length) {
        i = full.length
        clearInterval(streamTimerRef.current)
        setRMsgs(prev => prev.map(m => m.id === id ? { ...m, text: full, streaming: false, done: true } : m))
        setRBusy(false)
        scrollResearch()
        return
      }
      setRMsgs(prev => prev.map(m => m.id === id ? { ...m, text: full.slice(0, i) } : m))
      scrollResearch()
    }, 24)
  }

  async function sendResearch(preset) {
    const q = (preset ?? rDraft).trim()
    if (!q || rBusy) return
    setRBusy(true)
    const uid = ++rSeqRef.current
    const aid = ++rSeqRef.current
    setRMsgs(prev => [...prev, { id: uid, role: 'user', text: q }, { id: aid, role: 'ai', text: '', streaming: true, done: false }])
    setRDraft('')
    scrollResearch()

    let answer
    try {
      const res = await queryAI(q)
      if (res.status === 'awaiting_angle_selection') {
        answer = res.summary || 'That reads like a request to draft a whole new post — ask a narrower research question, or use Chat to draft it.'
      } else if (res.status === 'awaiting_approval') {
        answer = 'That turned into a full draft rather than a quick answer — open Chat to continue that flow.'
      } else {
        answer = res.answer || 'No direct answer found — try rephrasing your question.'
      }
    } catch {
      answer = 'Something went wrong reaching the research agent. Try again in a moment.'
    }
    startResearchStream(aid, answer)
  }

  async function handleDone() {
    clearTimeout(saveTimerRef.current)
    const isEmpty = !titleValueRef.current.trim() && !bodyValueRef.current.trim()
    if (!isEmpty) {
      try { await persistNow() } catch (err) { console.error('Save on close failed:', err) }
    }
    onBack(post.id, isEmpty)
  }

  const words = wordCount(body)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'vFade .35s ease both' }}>
      <header style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 28px', background: 'rgba(244,242,234,.72)', backdropFilter: 'saturate(140%) blur(14px)', borderBottom: '1px solid rgba(27,28,20,.08)', zIndex: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <button onClick={handleDone} title="Back to the Vault"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px 0 10px', border: '1px solid rgba(27,28,20,.12)', background: '#fff', borderRadius: 10, fontSize: 12.5, fontWeight: 600, color: '#3A3C30', cursor: 'pointer' }}>
            <IconBack /> Vault
          </button>
          <span style={{ width: 1, height: 18, background: 'rgba(27,28,20,.12)' }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 6, background: CATS.IDEA.bg, color: CATS.IDEA.fg, fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{CATS.IDEA.label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.06em', color: '#7A7C6C', background: 'rgba(27,28,20,.05)', borderRadius: 999, padding: '4px 10px' }}>{readLabel(words)}</span>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.06em', color: '#7A7C6C', background: 'rgba(27,28,20,.05)', borderRadius: 999, padding: '4px 10px' }}>{words} words</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setResearchOpen(o => !o)} title="Research while you write"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', border: `1px solid ${researchOpen ? 'rgba(20,102,59,.4)' : 'rgba(27,28,20,.12)'}`, background: researchOpen ? 'rgba(20,102,59,.1)' : '#fff', borderRadius: 10, fontSize: 12.5, fontWeight: 600, color: researchOpen ? ACCENT : '#3A3C30', cursor: 'pointer', transition: 'border-color .2s ease, background .2s ease, color .2s ease' }}>
            <IconResearch /> Research
          </button>
          <span style={{ width: 1, height: 18, background: 'rgba(27,28,20,.12)' }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#8A8C7C', fontWeight: 500 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: saved ? '#2FA35B' : '#C9A227' }} />
            {saved ? 'Saved' : 'Saving…'}
          </span>
          <button onClick={handleDone}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 16px', border: 'none', background: ACCENT, borderRadius: 10, fontSize: 12.5, fontWeight: 600, color: '#F4F2EA', cursor: 'pointer', boxShadow: '0 10px 22px -12px rgba(20,102,59,.7)' }}>
            <IconDone /> Done
          </button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: 'radial-gradient(120% 80% at 50% 0%, rgba(20,102,59,.05), transparent 55%)' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '44px 32px 96px' }}>
            {loading ? (
              <div style={{ color: '#9A9C8C', fontSize: 14, textAlign: 'center', padding: '60px 0' }}>Loading…</div>
            ) : (
              <>
                <input
                  value={title}
                  onChange={handleTitleChange}
                  placeholder="Untitled draft"
                  style={{ display: 'block', width: '100%', border: 'none', background: 'none', fontFamily: SERIF, fontWeight: 600, fontSize: 38, lineHeight: 1.1, letterSpacing: '-.02em', color: INK, padding: 0 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 22px', fontSize: 13, color: '#9A9C8C', letterSpacing: '-.003em' }}>
                  <span>Updated {relativeTime(post.updated_at)}</span><span>·</span><span>{words} words</span><span>·</span><span>{readLabel(words)}</span>
                </div>
                <div style={{ height: 1, background: 'rgba(27,28,20,.1)', marginBottom: 26 }} />
                <textarea
                  value={body}
                  onChange={handleBodyChange}
                  ref={bodyTaRef}
                  placeholder="Start writing…"
                  style={{ display: 'block', width: '100%', border: 'none', background: 'none', fontFamily: SERIF, fontSize: 19, lineHeight: 1.75, color: '#26281C', letterSpacing: '.004em', resize: 'none', overflow: 'hidden', minHeight: 340, whiteSpace: 'pre-wrap' }}
                />
              </>
            )}
          </div>
        </div>

        {researchOpen && (
          <ResearchAside
            onClose={() => setResearchOpen(false)}
            rMsgs={rMsgs}
            rDraft={rDraft}
            setRDraft={setRDraft}
            onSend={sendResearch}
            rBusy={rBusy}
            rScrollRef={rScrollRef}
            onAddToDraft={addToDraft}
          />
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
// Two-view state machine ported from "ContentCoach AI - Vault.dc.html":
// Vault (every draft, flat) → Editor (one post). Folders are still real
// backend data (useVault) and every post still belongs to one — chat-approved
// drafts land in an auto-created "AI Drafts" folder (sql_fetch_node.py),
// manual "New draft" falls back to the first existing folder or creates one —
// but folders are no longer a browsing layer here, so all posts across all
// folders are flattened into one list. Versions/content persistence is
// untouched — EditorView still saves via saveVersion/getVersions.
export default function MyWorkPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { folders, postsByFolder, loading, addFolder, addPost, removePost, updatePost } = useVault()

  const [activePost, setActivePost] = useState(null)
  const [creatingDraft, setCreatingDraft] = useState(false)

  const allPosts = useMemo(() => Object.values(postsByFolder).flat(), [postsByFolder])

  const handleNewDraft = useCallback(async () => {
    if (creatingDraft) return
    setCreatingDraft(true)
    try {
      let targetFolderId = folders[0]?.id
      if (!targetFolderId) {
        const folder = await addFolder('Quick Drafts')
        targetFolderId = folder.id
      }
      const post = await addPost(targetFolderId, '')
      setActivePost(post)
    } catch (err) {
      console.error('Failed to create draft:', err)
    } finally {
      setCreatingDraft(false)
    }
  }, [creatingDraft, folders, addFolder, addPost])

  // Dashboard's "Start Writing" nav item lands on /my-work?new=1 — auto-create
  // a draft (falling back to a folder if none exists yet) and jump straight
  // into the editor, bypassing the Vault browsing view.
  useEffect(() => {
    const wantsNew = new URLSearchParams(location.search).get('new') === '1'
    if (!wantsNew || loading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleNewDraft().then(() => navigate('/my-work', { replace: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, loading])

  function handleOpen(post) { setActivePost(post) }

  function handlePostSynced(postId, updates) {
    updatePost(postId, updates)
    setActivePost(prev => (prev?.id === postId ? { ...prev, ...updates } : prev))
  }

  async function handleBack(postId, isEmpty) {
    if (isEmpty) {
      try { await deletePost(postId); removePost(postId) } catch (err) { console.error('Discard empty draft failed:', err) }
    }
    setActivePost(null)
  }

  return (
    <div className="honne-vault-root" style={{ height: '100vh', overflow: 'hidden', background: PAPER, color: INK, fontFamily: SANS, position: 'relative' }}>
      <style>{KEYFRAMES}</style>
      <div style={NOISE_STYLE} />
      {activePost ? (
        <EditorView post={activePost} onBack={handleBack} onPostSynced={handlePostSynced} />
      ) : loading ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9A9C8C', fontSize: 14 }}>Loading…</div>
      ) : (
        <VaultView
          posts={allPosts}
          onOpen={handleOpen}
          onNewDraft={handleNewDraft}
          creatingDraft={creatingDraft}
        />
      )}
    </div>
  )
}
