import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  getVersions, getVersion, saveVersion, renamePost, deletePost,
} from '../api/vault'
import { queryAI } from '../api/ai'
import { publishToLinkedIn } from '../api/linkedin'
import { useVault } from '../hooks/useVault'

/* ────────────────────────────────────────────────────────────────────────
   Ported 1:1 from "ContentCoach AI - Vault.dc.html" (Claude Design project
   ff122375-c3bc-4438-aece-706b0bd557b0). Colors/fonts/radii/spacing match
   the source .dc.html exactly, including its Component script's render
   logic (chip filtering, coin/wash category styling, the full rich-text
   editor toolbar). Two deliberate departures from the mock, both because
   the mock has no backend behind it:
   - every real post is tagged 'LINKEDIN' (the app has no per-post platform
     field yet, and LinkedIn is the only platform actually wired to publish)
   - the source's `ed.onTitle` handler is referenced but never defined in
     the .dc.html script (title editing is dead in the mock) — implemented
     for real here.
   ──────────────────────────────────────────────────────────────────────── */
const PAPER      = '#ECEAE1'
const EDITOR_BG  = '#E7E5DC'
const ASIDE_BG   = '#EFEDE3'
const INK        = '#1B1C14'
const ACCENT     = '#14663B'
const SERIF      = "'EB Garamond', serif"
const SANS       = "'Hanken Grotesk', system-ui, sans-serif"
const MONO       = "'JetBrains Mono', monospace"
const GEIST      = "'Geist', sans-serif"

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
.honne-vault-root [data-doc] ul{list-style:disc;margin:0 0 1em;padding-left:1.4em}
.honne-vault-root [data-doc] ol{list-style:decimal;margin:0 0 1em;padding-left:1.4em}
.honne-vault-root [data-doc] li{margin:.25em 0}
.honne-vault-root [data-doc] a{text-decoration:underline}
@keyframes vRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes vFade{from{opacity:0}to{opacity:1}}
@keyframes vSlide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
@keyframes vCaret{50%{opacity:0}}
@keyframes vCard{from{opacity:0;transform:translate3d(0,14px,0) scale(.985)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}
@keyframes coinPop{0%{opacity:0;transform:scale(.2)}62%{opacity:1;transform:scale(1.12)}100%{opacity:1;transform:scale(1)}}
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

// Content-platform categories — copied verbatim from the .dc.html CATS map
// (coin gradient + wash + brand SVG path per platform). Only LINKEDIN is
// reachable today (see file header), X THREAD/REDDIT are kept in full so
// the chips/coins are ready the moment a post carries a different tag.
const CATS = {
  LINKEDIN: {
    label: 'LinkedIn', bg: '#D9E4F2', fg: '#2E5E8F',
    coinBg: 'linear-gradient(150deg,#0A66C2,#004182)', wash: '#DCE7F5',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
  'X THREAD': {
    label: 'X Thread', bg: '#E2E1DA', fg: '#2B2B2B',
    coinBg: 'linear-gradient(150deg,#3A3A3A,#000)', wash: '#E4E3DC',
    path: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  },
  REDDIT: {
    label: 'Reddit', bg: '#F6DFD1', fg: '#C1441B',
    coinBg: 'linear-gradient(150deg,#FF5A1F,#D93A00)', wash: '#F6E0D3',
    path: 'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z',
  },
}
const ORDER = ['ALL', 'LINKEDIN', 'X THREAD', 'REDDIT']
const tagOf = () => 'LINKEDIN'

const FONTS = [
  { label: 'Geist', css: "'Geist', sans-serif" },
  { label: 'EB Garamond', css: "'EB Garamond', serif" },
  { label: 'Arial', css: 'Arial, sans-serif' },
  { label: 'Georgia', css: 'Georgia, serif' },
  { label: 'Times New Roman', css: "'Times New Roman', serif" },
  { label: 'Verdana', css: 'Verdana, sans-serif' },
  { label: 'Courier New', css: "'Courier New', monospace" },
  { label: 'JetBrains Mono', css: "'JetBrains Mono', monospace" },
]
const SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 36]

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
// Plain text ↔ contentEditable HTML, ported verbatim from the .dc.html
// Component's `esc`/`textToHtml` — double newline starts a new <p>, single
// newline becomes <br>.
function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function textToHtml(t) {
  const blocks = (t || '').split(/\n{2,}/).map(b => '<p>' + (b.split('\n').map(l => escHtml(l)).join('<br>') || '<br>') + '</p>')
  return blocks.join('') || '<p><br></p>'
}

// ── Inline icons (ported 1:1 from the .dc.html source, not lucide) ────────
const IconPlus      = ({ size = 15 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
const IconSearch    = ({ size = 16, color = '#A6A895' }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
const IconClose     = ({ size = 12, color = '#6B6E5C' }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" /></svg>
const IconArrow     = ({ size = 13 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
const IconBack      = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
const IconResearch  = ({ size = 15 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
const IconDone      = ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
const IconSend      = ({ size = 15, color }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M12 5l-6 6M12 5l6 6" /></svg>
const IconEmpty     = ({ size = 26 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#C4C6B6" strokeWidth="1.7"><path d="M4 6a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>
const IconLinkedIn  = ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
const IconUndo      = ({ size = 17 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></svg>
const IconRedo      = ({ size = 17 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h1" /></svg>
const IconMinus     = ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14" /></svg>
const IconHighlight  = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l-4 4v3h3l4-4" /><path d="M13 7l4 4" /><path d="M15 5l4 4-7 7-4-4z" /></svg>
const IconLink       = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
const IconAlignLeft    = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 6h16M4 12h10M4 18h13" /></svg>
const IconAlignCenter  = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 6h16M7 12h10M6 18h12" /></svg>
const IconAlignRight   = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 6h16M10 12h10M7 18h13" /></svg>
const IconAlignJustify = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
const IconUl = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.3" fill="currentColor" stroke="none" /></svg>
const IconOl = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 4v3M3 10h2l-2 2h2M3 16h1.6a.9.9 0 0 1 .4 1.7L3 19h2" strokeWidth="1.5" /></svg>
const IconOutdent = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6H10M20 12h-8M20 18H10M7 9l-4 3 4 3" /></svg>
const IconIndent  = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M12 12h8M4 18h16M3 9l4 3-4 3" /></svg>

// ── Toolbar button/select style constants (ported from `ed.tbtn`/`ed.tsel`/`ed.tdiv`) ──
const TBTN = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 32, flex: '0 0 auto', border: 'none', borderRadius: 7, cursor: 'pointer', color: '#3A3C30', background: 'transparent', transition: 'background .15s ease, color .15s ease' }
const TDIV = { width: 1, height: 20, background: 'rgba(27,28,20,.12)', margin: '0 5px', flex: '0 0 auto' }
const TSEL = { height: 32, border: '1px solid rgba(27,28,20,.14)', background: '#fff', borderRadius: 7, padding: '0 8px', fontSize: 12.5, color: '#1B1C14', cursor: 'pointer', fontFamily: GEIST }
const toggleBg = (on) => (on ? 'rgba(20,102,59,.14)' : 'transparent')
const toggleFg = (on) => (on ? ACCENT : '#3A3C30')

// A hover-only toolbar button (undo/redo/size stepper — the only ones the
// .dc.html source gives a `style-hover`; the toggle buttons below rely
// solely on their active/inactive background, matching the source exactly).
function ToolButton({ onClick, title, children, width, style }) {
  return (
    <button
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      title={title}
      style={{ ...TBTN, ...(width ? { width } : {}), ...style }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(27,28,20,.07)' }}
      onMouseLeave={e => { e.currentTarget.style.background = (style && style.background) || 'transparent' }}
    >
      {children}
    </button>
  )
}
// A toggle-state toolbar button (bold/italic/align/lists/…) — background
// reflects on/off state only, no separate hover treatment in the source.
function ToggleButton({ onClick, title, active, children, extraStyle }) {
  return (
    <button
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      title={title}
      style={{ ...TBTN, background: toggleBg(active), color: toggleFg(active), ...extraStyle }}
    >
      {children}
    </button>
  )
}

// ── Category "coin" avatar with decorative radial highlight + brand icon ──
function PlatformCoin({ cat }) {
  return (
    <div style={{ position: 'relative', width: 48, height: 48, flex: '0 0 48px', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: cat.coinBg, boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.42), inset 0 -5px 9px rgba(0,0,0,.28), 0 8px 16px -6px rgba(0,0,0,.42)', animation: 'coinPop .5s cubic-bezier(.34,1.56,.64,1) both' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(55% 42% at 32% 26%, rgba(255,255,255,.55), rgba(255,255,255,0) 62%)' }} />
      <svg width="23" height="23" viewBox="0 0 24 24" style={{ position: 'relative' }}><path fill="#fff" d={cat.path} /></svg>
    </div>
  )
}

// ── Vault — one draft card ─────────────────────────────────────────────────
function VaultCard({ post, onOpen }) {
  const cat = CATS[tagOf(post)] || CATS.LINKEDIN
  const words = post.word_count || 0
  const preview = post.preview || 'Empty draft — open to start writing.'
  return (
    <div
      onClick={onOpen}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 214, background: '#fff',
        border: '1px solid rgba(27,28,20,.07)', borderRadius: 18, padding: '20px 20px 16px',
        boxShadow: '0 1px 3px rgba(27,28,20,.05)', cursor: 'pointer', overflow: 'hidden',
        transition: 'transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s ease, border-color .2s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 24px 46px -26px rgba(27,28,20,.42)'; e.currentTarget.style.borderColor = 'rgba(27,28,20,.1)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(27,28,20,.05)'; e.currentTarget.style.borderColor = 'rgba(27,28,20,.07)' }}>
      <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: cat.wash, opacity: 0.5, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 15 }}>
        <PlatformCoin cat={cat} />
        <span style={{ fontSize: 12, color: '#A6A895', fontWeight: 500, whiteSpace: 'nowrap', marginTop: 3 }}>{relativeTime(post.updated_at)}</span>
      </div>
      <div style={{ position: 'relative', fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: cat.fg, marginBottom: 8 }}>{cat.label}</div>
      <h3 style={{ position: 'relative', fontFamily: SERIF, fontWeight: 600, fontSize: 20, lineHeight: 1.15, letterSpacing: '-.01em', margin: '0 0 7px', color: INK, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.title || 'Untitled draft'}</h3>
      <p style={{ position: 'relative', fontSize: 13.5, lineHeight: 1.55, color: '#7A7C6C', margin: 0, letterSpacing: '-.003em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{preview}</p>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 'auto', paddingTop: 14, borderTop: '1px solid rgba(27,28,20,.06)' }}>
        <span style={{ fontSize: 12, color: '#A6A895', letterSpacing: '-.003em' }}>{readLabel(words)} · {words} {words === 1 ? 'word' : 'words'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: '#8A8C7C' }}>Open <IconArrow /></span>
      </div>
    </div>
  )
}

// ── Vault — flat grid view (every draft, one place) ─────────────────────────
function VaultView({ posts, onOpen, onNewDraft, creatingDraft }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [searchFocused, setSearchFocused] = useState(false)

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
      (CATS[tagOf(p)]?.label || '').toLowerCase().includes(q))
  } else if (filter !== 'ALL') {
    list = list.filter(p => tagOf(p) === filter)
  }
  list = list.slice().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))

  const countLabel = `${list.length} ${list.length === 1 ? 'draft' : 'drafts'}`
  const emptyMsg = hasQuery ? 'No drafts match your search. Try another word.' : 'Nothing saved yet — start a new draft, or approve one from Chat.'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'vFade .35s ease both' }}>
      <header style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, padding: '34px 44px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <span style={{ width: 46, height: 46, flex: '0 0 46px', borderRadius: 13, background: '#fff', border: '1px solid rgba(27,28,20,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(27,28,20,.05)' }}>
            <span style={{ fontFamily: SERIF, fontSize: 25, color: ACCENT, fontStyle: 'italic', fontWeight: 500 }}>H</span>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.2em', textTransform: 'uppercase', color: '#A6A895', marginBottom: 8 }}>Honne · Library</div>
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(36px,3.6vw,50px)', lineHeight: 1, letterSpacing: '-.02em', margin: 0 }}>The Vault</h1>
            <p style={{ fontSize: 14, color: '#7A7C6C', margin: '9px 0 0', letterSpacing: '-.005em' }}>Every draft, one place. Open one to shape the post inside.</p>
          </div>
        </div>
        <button onClick={onNewDraft} disabled={creatingDraft}
          className="v-press-97"
          style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 9, height: 44, padding: '0 20px', border: 'none', borderRadius: 12, background: ACCENT, color: '#F4F2EA', fontSize: 13.5, fontWeight: 600, letterSpacing: '-.005em', cursor: creatingDraft ? 'default' : 'pointer', boxShadow: '0 12px 26px -14px rgba(20,102,59,.7)', transition: 'box-shadow .2s ease, transform .2s cubic-bezier(.22,1,.36,1)', opacity: creatingDraft ? 0.7 : 1 }}
          onMouseEnter={e => { if (!creatingDraft) e.currentTarget.style.boxShadow = '0 16px 30px -14px rgba(20,102,59,.85)' }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 12px 26px -14px rgba(20,102,59,.7)' }}>
          <IconPlus /> {creatingDraft ? 'Creating…' : 'New draft'}
        </button>
      </header>

      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 16, padding: '0 44px 18px', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 11, height: 42, padding: '0 15px', background: '#fff',
          border: `1px solid ${searchFocused ? 'rgba(20,102,59,.5)' : 'rgba(27,28,20,.1)'}`, borderRadius: 12,
          minWidth: 280, flex: '0 1 320px', transition: 'border-color .22s ease, box-shadow .22s ease',
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
            <button onClick={() => setQuery('')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, border: 'none', background: 'rgba(27,28,20,.06)', borderRadius: 6, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(27,28,20,.12)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(27,28,20,.06)' }}>
              <IconClose />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {chips.map(c => (
            <button key={c.key} onClick={c.onClick}
              style={{ height: 34, padding: '0 14px', border: `1px solid ${c.border}`, background: c.bg, color: c.color, borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: '.01em', cursor: 'pointer', transition: 'border-color .18s ease, background .18s ease, color .18s ease' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(20,102,59,.4)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = c.border }}>
              {c.label}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11, letterSpacing: '.06em', color: '#A6A895' }}>{countLabel}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 44px 52px' }}>
        {list.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 20 }} data-stagger>
            {list.map(p => <VaultCard key={p.id} post={p} onOpen={() => onOpen(p)} />)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '80px 20px', textAlign: 'center' }}>
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
        <button onClick={onClose} title="Close research" style={{ width: 28, height: 28, flex: '0 0 28px', border: 'none', background: 'none', borderRadius: 8, color: '#8A8C7C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(27,28,20,.06)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
          <IconClose size={15} color="currentColor" />
        </button>
      </div>

      <div ref={rScrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 15px 8px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {rMsgs.length === 0 ? (
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 20, color: '#3A3C30', lineHeight: 1.25, marginBottom: 7 }}>What should we look into?</div>
            {/* The .dc.html copy claims live web research ("searches, reads, and
                hands you facts"); the real backend behind this box answers via
                queryAI (vault + tool search), so the copy is adjusted to match
                what actually happens rather than promise capabilities it lacks. */}
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
            className="v-press-90"
            style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: 'none', borderRadius: 10, cursor: rCanSend ? 'pointer' : 'default', background: rCanSend ? ACCENT : '#E4E2D6', transition: 'background .22s ease' }}>
            <IconSend color={rCanSend ? '#F4F2EA' : '#B0B2A2'} />
          </button>
        </div>
      </div>
    </aside>
  )
}

// ── Editor view — rich-text document editor, ported 1:1 from the .dc.html
//    isEditor block (doc topbar, formatting toolbar, 816px paper canvas,
//    research aside). Uses the same contentEditable + document.execCommand
//    approach the source specifies. Only plain text (el.innerText) is
//    persisted to the backend on autosave — the backend's PostVersion.content
//    has no rich-text format, so bold/italic/color/etc. are in-session
//    formatting affordances, matching the source's toolbar exactly, but are
//    flattened to plain paragraphs the next time this draft is opened. ──────
function EditorView({ post, onBack, onPostSynced }) {
  const [title, setTitle] = useState(post.title || '')
  const [saved, setSaved] = useState(true)
  const [researchOpen, setResearchOpen] = useState(false)
  const [rMsgs, setRMsgs] = useState([])
  const [rDraft, setRDraft] = useState('')
  const [rBusy, setRBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false, strike: false, ul: false, ol: false, align: 'left', font: FONTS[0].css, size: 16 })
  const [zoom, setZoom] = useState(100)
  const [textColor, setTextColor] = useState('#1B1C14')

  const titleRef       = useRef(title)
  const docRef          = useRef(null)
  const rScrollRef      = useRef(null)
  const saveTimerRef    = useRef(null)
  const streamTimerRef  = useRef(null)
  const rSeqRef         = useRef(0)
  const textColorInputRef = useRef(null)
  const hiInputRef      = useRef(null)

  useEffect(() => {
    let cancelled = false
    getVersions(post.id).then(async (list) => {
      let content = ''
      if (list.length > 0) {
        const latest = await getVersion(list[list.length - 1].id)
        content = latest.content
      }
      if (cancelled) return
      if (docRef.current) docRef.current.innerHTML = textToHtml(content)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [post.id])

  useEffect(() => () => {
    clearTimeout(saveTimerRef.current)
    clearInterval(streamTimerRef.current)
  }, [])

  async function persistNow(final = false) {
    const currentTitle = titleRef.current.trim()
    const el = docRef.current
    const currentBody = el ? el.innerText : ''
    const updates = {}
    if (currentTitle !== (post.title || '')) {
      const updated = await renamePost(post.id, currentTitle || 'Untitled draft')
      updates.title = updated.title
    }
    if (currentBody.trim()) {
      await saveVersion(post.id, currentBody, null, final)
      const flat = flatten(currentBody)
      updates.preview = flat.slice(0, 220)
      updates.word_count = wordCount(currentBody)
      updates.updated_at = new Date().toISOString()
    }
    if (Object.keys(updates).length) onPostSynced(post.id, updates)
  }

  function schedulePersist() {
    setSaved(false)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      persistNow().catch(err => console.error('Autosave failed:', err)).finally(() => setSaved(true))
    }, 550)
  }

  function handleTitleChange(e) {
    const v = e.target.value
    titleRef.current = v
    setTitle(v)
    schedulePersist()
  }

  function onDocInput() { schedulePersist() }

  function cmd(name, val) {
    if (docRef.current) docRef.current.focus()
    try { document.execCommand(name, false, val) } catch { /* unsupported in this browser */ }
    onDocInput()
  }
  const prevent = e => e.preventDefault()
  const undo = () => cmd('undo')
  const redo = () => cmd('redo')
  const bold = () => cmd('bold')
  const italic = () => cmd('italic')
  const underline = () => cmd('underline')
  const strike = () => cmd('strikeThrough')
  const link = () => { const u = window.prompt('Link URL', 'https://'); if (u) cmd('createLink', u) }
  const alignLeft = () => cmd('justifyLeft')
  const alignCenter = () => cmd('justifyCenter')
  const alignRight = () => cmd('justifyRight')
  const alignJustify = () => cmd('justifyFull')
  const ul = () => cmd('insertUnorderedList')
  const ol = () => cmd('insertOrderedList')
  const indent = () => cmd('indent')
  const outdent = () => cmd('outdent')

  function onFont(e) {
    const css = e.target.value
    if (docRef.current) docRef.current.focus()
    try { document.execCommand('styleWithCSS', false, true); document.execCommand('fontName', false, css) } catch { /* unsupported */ }
    setFmt(f => ({ ...f, font: css }))
    onDocInput()
  }
  function applySize(px) {
    if (docRef.current) docRef.current.focus()
    try {
      document.execCommand('styleWithCSS', false, false)
      document.execCommand('fontSize', false, '7')
      docRef.current?.querySelectorAll('font[size="7"]').forEach(f => { f.removeAttribute('size'); f.style.fontSize = px + 'px' })
    } catch { /* unsupported */ }
    setFmt(f => ({ ...f, size: px }))
    onDocInput()
  }
  const onSize = e => applySize(parseInt(e.target.value, 10))
  const sizeUp = () => { const i = SIZES.indexOf(fmt.size); applySize(SIZES[Math.min(SIZES.length - 1, (i < 0 ? 5 : i) + 1)]) }
  const sizeDown = () => { const i = SIZES.indexOf(fmt.size); applySize(SIZES[Math.max(0, (i < 0 ? 5 : i) - 1)]) }
  const onZoom = e => setZoom(parseInt(e.target.value, 10))

  const pickTextColor = () => textColorInputRef.current?.click()
  const pickHi = () => hiInputRef.current?.click()
  function onTextColorInput(e) { setTextColor(e.target.value); cmd('foreColor', e.target.value) }
  function onHiColorInput(e) {
    const v = e.target.value
    if (docRef.current) docRef.current.focus()
    try { if (!document.execCommand('hiliteColor', false, v)) document.execCommand('backColor', false, v) } catch { /* unsupported */ }
    onDocInput()
  }
  function syncSel() {
    try {
      const align = document.queryCommandState('justifyCenter') ? 'center' : document.queryCommandState('justifyRight') ? 'right' : document.queryCommandState('justifyFull') ? 'justify' : 'left'
      setFmt(f => ({ ...f, bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), underline: document.queryCommandState('underline'), strike: document.queryCommandState('strikeThrough'), ul: document.queryCommandState('insertUnorderedList'), ol: document.queryCommandState('insertOrderedList'), align }))
    } catch { /* unsupported */ }
  }

  function addToDraft(text) {
    const el = docRef.current
    if (!el) return
    const frag = textToHtml(text)
    if (el.innerHTML.replace(/<p><br><\/p>/g, '').trim() === '') el.innerHTML = frag
    else el.insertAdjacentHTML('beforeend', frag)
    onDocInput()
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

  async function handleExit() {
    clearTimeout(saveTimerRef.current)
    const isEmpty = !titleRef.current.trim() && !(docRef.current?.innerText || '').trim()
    if (!isEmpty) {
      try { await persistNow(true) } catch (err) { console.error('Save on close failed:', err) }
    }
    onBack(post.id, isEmpty)
  }

  async function handlePublish() {
    if (publishing) return
    setPublishing(true)
    try {
      await persistNow(true)
      const result = await publishToLinkedIn(post.id)
      if (result.needs_auth && result.auth_url) { window.location.href = result.auth_url; return }
      if (result.published) window.alert('Published to LinkedIn.')
      else window.alert(result.duplicate ? 'Already published recently.' : (result.reason || 'Publish failed.'))
    } catch {
      window.alert('Something went wrong publishing this post.')
    } finally {
      setPublishing(false)
    }
  }

  const cat = CATS[tagOf(post)] || CATS.LINKEDIN
  const isLinkedIn = tagOf(post) === 'LINKEDIN'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: EDITOR_BG, animation: 'vFade .35s ease both' }}>
      {/* doc topbar */}
      <header style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '11px 20px 10px', background: '#fff', borderBottom: '1px solid rgba(27,28,20,.09)', zIndex: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button onClick={handleExit} title="Back to the Vault"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flex: '0 0 36px', border: 'none', background: 'none', borderRadius: 9, color: '#5A5C4C', cursor: 'pointer', transition: 'background .18s ease, color .18s ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(27,28,20,.06)'; e.currentTarget.style.color = ACCENT }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#5A5C4C' }}>
            <IconBack />
          </button>
          <span style={{ width: 30, height: 30, flex: '0 0 30px', borderRadius: 8, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: SERIF, fontSize: 18, color: '#F4F2EA', fontStyle: 'italic', fontWeight: 500 }}>H</span>
          </span>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <input
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled draft"
              style={{ display: 'block', width: '100%', maxWidth: 420, border: 'none', background: 'none', fontFamily: GEIST, fontWeight: 600, fontSize: 18, lineHeight: 1.2, letterSpacing: '-.01em', color: INK, padding: '2px 4px', borderRadius: 6 }}
              onFocus={e => { e.currentTarget.style.background = 'rgba(27,28,20,.05)' }}
              onBlur={e => { e.currentTarget.style.background = 'none' }}
              onMouseEnter={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.background = 'rgba(27,28,20,.04)' }}
              onMouseLeave={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.background = 'none' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingLeft: 4 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 7px', borderRadius: 5, background: cat.bg, color: cat.fg, fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>{cat.label}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#9A9C8C' }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: saved ? '#2FA35B' : '#C9A227' }} />
                {saved ? 'Saved' : 'Saving…'}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
          <button onClick={() => setResearchOpen(o => !o)} title="Research while you write"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', border: `1px solid ${researchOpen ? 'rgba(20,102,59,.4)' : 'rgba(27,28,20,.12)'}`, background: researchOpen ? 'rgba(20,102,59,.1)' : '#fff', borderRadius: 10, fontSize: 12.5, fontWeight: 600, color: researchOpen ? ACCENT : '#3A3C30', cursor: 'pointer', transition: 'border-color .2s ease, background .2s ease, color .2s ease' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(20,102,59,.5)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = researchOpen ? 'rgba(20,102,59,.4)' : 'rgba(27,28,20,.12)' }}>
            <IconResearch /> Research
          </button>
          {isLinkedIn && (
            <button onClick={handlePublish} disabled={publishing}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 16px', border: '1px solid #0A66C2', background: '#fff', borderRadius: 10, fontSize: 12.5, fontWeight: 600, color: '#0A66C2', cursor: publishing ? 'default' : 'pointer', opacity: publishing ? 0.7 : 1, transition: 'background .18s ease' }}
              onMouseEnter={e => { if (!publishing) e.currentTarget.style.background = '#E9F1FB' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
              <IconLinkedIn /> {publishing ? 'Publishing…' : 'Publish to LinkedIn'}
            </button>
          )}
          <button onClick={handleExit} className="v-press-98"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 16px', border: 'none', background: ACCENT, borderRadius: 10, fontSize: 12.5, fontWeight: 600, color: '#F4F2EA', cursor: 'pointer', boxShadow: '0 10px 22px -12px rgba(20,102,59,.7)', transition: 'transform .2s cubic-bezier(.22,1,.36,1)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}>
            <IconDone /> Done
          </button>
        </div>
      </header>

      {/* formatting toolbar */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', padding: '7px 16px', background: '#F4F2EA', borderBottom: '1px solid rgba(27,28,20,.08)', zIndex: 6 }}>
        <ToolButton onClick={undo} title="Undo"><IconUndo /></ToolButton>
        <ToolButton onClick={redo} title="Redo"><IconRedo /></ToolButton>
        <span style={TDIV} />

        <select value={String(zoom)} onChange={onZoom} title="Zoom" style={{ ...TSEL, width: 64 }}>
          <option value="50">50%</option><option value="75">75%</option><option value="90">90%</option><option value="100">100%</option><option value="125">125%</option><option value="150">150%</option>
        </select>
        <span style={TDIV} />

        <select value={fmt.font} onChange={onFont} title="Font" style={{ ...TSEL, minWidth: 150, fontFamily: fmt.font }}>
          {FONTS.map(f => <option key={f.label} value={f.css}>{f.label}</option>)}
        </select>
        <span style={TDIV} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <ToolButton onClick={sizeDown} title="Smaller" width={26}><IconMinus /></ToolButton>
          <select value={String(fmt.size)} onChange={onSize} title="Font size" style={{ ...TSEL, width: 56, textAlign: 'center' }}>
            {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ToolButton onClick={sizeUp} title="Larger" width={26}><IconPlus size={14} /></ToolButton>
        </div>
        <span style={TDIV} />

        <ToggleButton onClick={bold} title="Bold" active={fmt.bold} extraStyle={{ fontWeight: 700, fontSize: 16 }}>B</ToggleButton>
        <ToggleButton onClick={italic} title="Italic" active={fmt.italic} extraStyle={{ fontStyle: 'italic', fontFamily: SERIF, fontSize: 17 }}>I</ToggleButton>
        <ToggleButton onClick={underline} title="Underline" active={fmt.underline} extraStyle={{ textDecoration: 'underline', textUnderlineOffset: 2, fontSize: 15 }}>U</ToggleButton>
        <ToggleButton onClick={strike} title="Strikethrough" active={fmt.strike} extraStyle={{ textDecoration: 'line-through', fontSize: 15 }}>S</ToggleButton>
        <button onMouseDown={prevent} onClick={pickTextColor} title="Text color" style={{ ...TBTN, flexDirection: 'column', gap: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>A</span>
          <span style={{ width: 15, height: 3, borderRadius: 2, background: textColor }} />
        </button>
        <ToolButton onClick={pickHi} title="Highlight"><IconHighlight /></ToolButton>
        <span style={TDIV} />

        <ToolButton onClick={link} title="Insert link"><IconLink /></ToolButton>
        <span style={TDIV} />

        <ToggleButton onClick={alignLeft} title="Left" active={fmt.align === 'left'}><IconAlignLeft /></ToggleButton>
        <ToggleButton onClick={alignCenter} title="Center" active={fmt.align === 'center'}><IconAlignCenter /></ToggleButton>
        <ToggleButton onClick={alignRight} title="Right" active={fmt.align === 'right'}><IconAlignRight /></ToggleButton>
        <ToggleButton onClick={alignJustify} title="Justify" active={fmt.align === 'justify'}><IconAlignJustify /></ToggleButton>
        <span style={TDIV} />

        <ToggleButton onClick={ul} title="Bulleted list" active={fmt.ul}><IconUl /></ToggleButton>
        <ToggleButton onClick={ol} title="Numbered list" active={fmt.ol}><IconOl /></ToggleButton>
        <ToolButton onClick={outdent} title="Decrease indent"><IconOutdent /></ToolButton>
        <ToolButton onClick={indent} title="Increase indent"><IconIndent /></ToolButton>

        <input ref={textColorInputRef} type="color" onInput={onTextColorInput} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
        <input ref={hiInputRef} type="color" onInput={onHiColorInput} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      </div>

      {/* canvas */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '30px 30px 90px' }}>
          <div style={{ width: 816, maxWidth: '100%', margin: '0 auto', zoom: String(zoom / 100) }}>
            <div style={{ background: '#fff', borderRadius: 3, boxShadow: '0 1px 3px rgba(27,28,20,.16), 0 12px 40px -18px rgba(27,28,20,.35)', padding: '92px 96px 120px', minHeight: 1056 }}>
              <div
                ref={docRef}
                contentEditable
                spellCheck
                onInput={onDocInput}
                onKeyUp={syncSel}
                onMouseUp={syncSel}
                data-doc="true"
                style={{ outline: 'none', minHeight: 760, fontFamily: fmt.font, fontSize: fmt.size, lineHeight: 1.6, color: INK, letterSpacing: '.002em' }}
              />
            </div>
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
// but folders are no longer a browsing layer here, matching the source .dc.html
// (which has no folder-browsing screen either), so all posts across all
// folders are flattened into one list.
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
      <style>{KEYFRAMES}{`
.v-press-97:active{transform:scale(.97)}
.v-press-98:active{transform:scale(.98)}
.v-press-90:active{transform:scale(.9)}
`}</style>
      <div style={NOISE_STYLE} />
      {activePost ? (
        <EditorView key={activePost.id} post={activePost} onBack={handleBack} onPostSynced={handlePostSynced} />
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
