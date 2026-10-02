import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

/* ─── Design tokens (Honne Home) ─────────────────────────────────────────── */
const C = {
  bg: '#F8F7F4',
  sidebarBg: '#F2F0EC',
  ink: '#1C1A17',
  body: '#57534C',
  muted: '#6B665E',
  faint: '#77726A',
  faint2: '#8A857C',
  border: 'rgba(28,26,23,.08)',
  borderSoft: 'rgba(28,26,23,.07)',
  orange: '#F0662A',
  orangeDeep: '#C4501E',
  green: '#4A8A62',
  greenDeep: '#3F7A56',
  amber: '#C28A2C',
  avatarBg: '#E4DFD6',
  avatarFg: '#3D3933',
  chipBg: '#F4F1EC',
  panelBg: '#FBFAF8',
}
const FONT = {
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'Geist', ui-sans-serif, system-ui, sans-serif",
  mono: "'Geist Mono', ui-monospace, monospace",
}

/* ─── Mock content (knowledge sources and agents aren't wired to
     a backend yet — see CLAUDE.md's knowledge_sources table, not designed) ── */
const SRC = [
  { id: 'drive', name: 'Google Drive', desc: 'Docs and Sheets', count: '8 docs', mono: 'G' },
  { id: 'notion', name: 'Notion', desc: 'Pages and databases', count: '4 pages', mono: 'N' },
  { id: 'github', name: 'GitHub', desc: 'READMEs and docs', count: '2 repos', mono: 'Gh' },
  { id: 'word', name: 'Microsoft Word', desc: '.docx files', count: '3 files', mono: 'W' },
  { id: 'files', name: 'Uploaded files', desc: 'PDF, Markdown, text', count: '5 files', mono: 'F' },
]
const AGENTS = [
  { id: 'auto', name: 'Auto', desc: 'Honne picks the right agent' },
  { id: 'researcher', name: 'Researcher', desc: 'Researches a topic across the web and your sources' },
  { id: 'angles', name: 'Angles', desc: 'Finds what you could post about' },
  { id: 'series', name: 'Series', desc: 'Plans a week of content in one sitting' },
  { id: 'writer', name: 'Writer', desc: 'Drafts a post from an idea or angle' },
]
const ACTIONS = {
  ideas: { tag: 'Find content ideas', agent: 'angles', prompt: 'Find content ideas in what I wrote this month' },
  series: { tag: 'Content series', agent: 'series', prompt: 'Turn my notes on building Honne into a 5-post series for this week' },
  research: { tag: 'Research', agent: 'researcher', prompt: 'Research what people are saying about ' },
  repurpose: { tag: 'Repurpose', agent: 'writer', prompt: 'Repurpose "Lessons from building Honne" as a thread for X' },
}
const PLATS = [
  { id: 'linkedin', title: 'LinkedIn Post & Marketing', desc: 'Thought leadership and launch posts in your voice.', tint: 'rgba(10,102,194,.55)', glow: 'rgba(10,102,194,.16)', bdHover: 'rgba(10,102,194,.35)', iconBg: '#0A66C2', ink: '#0A66C2' },
  { id: 'reddit', title: 'Reddit Post & Marketing', desc: 'Community-first posts that read native to the subreddit.', tint: 'rgba(255,69,0,.5)', glow: 'rgba(255,69,0,.15)', bdHover: 'rgba(255,69,0,.35)', iconBg: '#FF4500', ink: '#D23A00', prompt: 'Write a Reddit post for r/ about ' },
  { id: 'x', title: 'X Post & Marketing', desc: 'Sharp posts and threads built from your notes.', tint: 'rgba(28,26,23,.4)', glow: 'rgba(28,26,23,.1)', bdHover: 'rgba(28,26,23,.3)', iconBg: '#1C1A17', ink: '#1C1A17', prompt: 'Write an X thread about ' },
]
const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8|M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'create', label: 'Create', icon: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7|M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z' },
  { id: 'posts', label: 'Posts', icon: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z|M14 2v4a2 2 0 0 0 2 2h4|M16 13H8|M16 17H8' },
  { id: 'sources', label: 'Sources', icon: 'E:9,12,5,5,3' },
  { id: 'agents', label: 'Agents', icon: 'M12 8V4H8|M4 8h16v12H4z|M2 14h2|M20 14h2|M15 13v2|M9 13v2', rect: '4,8,16,12,2' },
  { id: 'analytics', label: 'Analytics', icon: 'M3 3v16a2 2 0 0 0 2 2h16|M18 17V9|M13 17V5|M8 17v-3' },
]

/* ─── Icons ──────────────────────────────────────────────────────────────── */
function NavIcon({ d, size = 16, color = 'currentColor' }) {
  if (d.startsWith('E:')) {
    const [cx, cy, rx, ry] = d.slice(2).split(',').map(Number)
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
        <path d={`M3 5V19A9 3 0 0 0 21 19V5`} />
        <path d="M3 12A9 3 0 0 0 21 12" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {d.split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}
function AgentsGlyph({ size = 16, color = 'currentColor' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
    </svg>
  )
}
function CheckIcon({ size = 14, color = 'currentColor' }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
}
function ChevronDown({ size = 13, color = '#8A857C' }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
}
function SendIcon({ size = 16 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
}
function ExpandIcon({ size = 15 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
}
function CollapseIcon({ size = 16 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></svg>
}
function SettingsIcon({ size = 16 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>
}
function XIcon({ size = 14 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
}
function MenuIcon({ size = 18 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></svg>
}
function IdeaIcon({ size = 15 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#8A857C" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg>
}
function SeriesIcon({ size = 15 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#8A857C" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></svg>
}
function ResearchIcon({ size = 15 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#8A857C" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
}
function RepurposeIcon({ size = 15 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#8A857C" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
}
function ArrowRight({ size = 13, x = 0 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `translateX(${x}px)`, transition: 'transform .3s' }}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
}
function PlatformLogo({ id }) {
  if (id === 'linkedin') return <svg viewBox="0 0 24 24" width="18" height="18" fill="#FFFFFF"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452z" /></svg>
  if (id === 'reddit') return (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <circle cx="18.5" cy="4.5" r="1.6" fill="#FFFFFF" /><path d="M12 8.5 13.2 3.6l5.3 1" fill="none" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" />
      <ellipse cx="12" cy="14.5" rx="8" ry="5.6" fill="#FFFFFF" /><circle cx="4.6" cy="10.6" r="1.9" fill="#FFFFFF" /><circle cx="19.4" cy="10.6" r="1.9" fill="#FFFFFF" />
      <circle cx="9" cy="13.6" r="1.25" fill="#FF4500" /><circle cx="15" cy="13.6" r="1.25" fill="#FF4500" /><path d="M9.2 16.8c1.6 1.1 4 1.1 5.6 0" fill="none" stroke="#FF4500" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="#FFFFFF"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" /></svg>
}
function BackArrow({ size = 15 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
}
function AttachIcon({ size = 16 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
}
function Spinner({ size = 11 }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', border: '1.5px solid rgba(28,26,23,.18)', borderTopColor: C.ink, animation: 'hn-home-spin .7s linear infinite', display: 'block' }} />
}
function LogoMark() {
  return (
    <span style={{ position: 'relative', width: 22, height: 22, borderRadius: 6, background: C.ink, flex: 'none', display: 'block' }}>
      <span style={{ position: 'absolute', right: 4, bottom: 4, width: 7, height: 7, borderRadius: '50%', background: C.orange, display: 'block' }} />
    </span>
  )
}

/* ─── Hooks ──────────────────────────────────────────────────────────────── */
function useViewportCategory() {
  const [cat, setCat] = useState(() => {
    if (typeof window === 'undefined') return 'desktop'
    const w = window.innerWidth
    return w < 720 ? 'mobile' : w < 1080 ? 'tablet' : 'desktop'
  })
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      setCat(w < 720 ? 'mobile' : w < 1080 ? 'tablet' : 'desktop')
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return cat
}

/* ─────────────────────────────────────────────────────────────────────────── */
export default function HomeDashboardPage() {
  const navigate = useNavigate()
  const cat = useViewportCategory()
  const mobile = cat === 'mobile'
  const tablet = cat === 'tablet'

  const displayName = (localStorage.getItem('display_name') ?? localStorage.getItem('username') ?? 'there').split(' ')[0]
  const initial = displayName[0]?.toUpperCase() ?? 'U'

  const [collapsed, setCollapsed] = useState(tablet)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [activeNav, setActiveNav] = useState('home')
  const [stub, setStub] = useState(null) // { name } — in-page placeholder for undesigned sections (Sources)

  const [text, setText] = useState('')
  const [taFocus, setTaFocus] = useState(false)
  const [cmpHover, setCmpHover] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [selectedAction, setSelectedAction] = useState(null)
  const [knowledge, setKnowledge] = useState('all')
  const [agent, setAgent] = useState('auto')
  const [pop, setPop] = useState(null) // 'knowledge' | 'agent' | null

  const [connected, setConnected] = useState({ drive: 1, notion: 1, github: 1, files: 1 })
  const [connecting, setConnecting] = useState({})
  const [promptDismissed, setPromptDismissed] = useState(false)

  const [platHover, setPlatHover] = useState(null)
  const [platGlow, setPlatGlow] = useState({}) // card index → { x, y } cursor position in %

  const taRef = useRef(null)
  const rootRef = useRef(null)

  // Auto-collapse on entering the tablet breakpoint (adjusted during render,
  // not an effect, so the user's manual toggle isn't clobbered on every pass).
  const [prevTablet, setPrevTablet] = useState(tablet)
  if (tablet !== prevTablet) {
    setPrevTablet(tablet)
    setCollapsed(tablet)
  }

  const autosize = useCallback(() => {
    const t = taRef.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = Math.min(t.scrollHeight, 340) + 'px'
  }, [])
  const focusTa = useCallback(() => {
    setTimeout(() => { const t = taRef.current; if (!t) return; t.focus(); const n = t.value.length; t.setSelectionRange(n, n); autosize() }, 0)
  }, [autosize])

  // Close popovers on outside click / Escape; ⌘K focuses the composer, ⌘\ toggles the sidebar.
  useEffect(() => {
    const onDoc = e => {
      if (pop && !(e.target.closest && e.target.closest('[data-pop]'))) setPop(null)
    }
    const onKey = e => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setStub(null); setActiveNav('home'); focusTa() }
      if (mod && e.key === '\\') { e.preventDefault(); if (mobile) setMobileNavOpen(o => !o); else setCollapsed(c => !c) }
      if (e.key === 'Escape') { setPop(null); setMobileNavOpen(false) }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [pop, mobile, focusTa])

  const connectedIds = SRC.filter(x => connected[x.id]).map(x => x.id)
  const anyConnected = connectedIds.length > 0
  const hasUnconnected = SRC.length > connectedIds.length
  const focused = taFocus || pop === 'knowledge' || pop === 'agent'
  const hasText = text.trim().length > 0
  const showKnowledgePrompt = !anyConnected && !promptDismissed

  function connectSource(id) {
    if (connecting[id]) return
    setConnecting(c => ({ ...c, [id]: true }))
    setTimeout(() => setConnecting(c => ({ ...c, [id]: false })), 1100)
    setTimeout(() => setConnected(c => ({ ...c, [id]: 1 })), 1100)
  }
  function pickAction(id) {
    const a = ACTIONS[id]
    setText(a.prompt); setAgent(a.agent); setSelectedAction(id); setPop(null)
    focusTa()
  }
  function clearAction(e) {
    e.stopPropagation()
    setSelectedAction(null); setText(''); setAgent('auto')
    focusTa()
  }
  function startPlatform(p) {
    if (p.id === 'linkedin') { navigate('/linkedin'); return }
    if (p.id === 'x') { navigate('/x'); return }
    if (p.id === 'reddit') { navigate('/reddit'); return }
    setText(p.prompt); setAgent('writer'); setSelectedAction(null); setPop(null)
    focusTa()
  }
  function submit() {
    const t = text.trim()
    if (!t) return
    navigate('/linkedin', { state: { prompt: t } })
  }
  function goNav(id) {
    setPop(null); setMobileNavOpen(false)
    if (id === 'home') { setStub(null); setActiveNav('home'); return }
    if (id === 'create') { navigate('/linkedin'); return }
    if (id === 'posts') { navigate('/my-work'); return }
    if (id === 'agents') { navigate('/agents'); return }
    if (id === 'analytics') { navigate('/analytics'); return }
    // 'sources' has no real page yet — show the same in-app placeholder the
    // design itself uses for destinations outside this page's scope.
    setActiveNav(id)
    setStub({ name: 'Sources' })
  }
  function onLogoClick() {
    if (mobile) { setMobileNavOpen(false); return }
    if (collapsed) { setCollapsed(false); return }
    setStub(null); setActiveNav('home')
  }

  const h = new Date().getHours()
  const greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  const statusLine = anyConnected ? `${connectedIds.length} ${connectedIds.length === 1 ? 'source' : 'sources'} connected · style memory on` : 'No knowledge connected yet'
  const kSel = knowledge === 'all' ? null : SRC.find(x => x.id === knowledge)
  const kLabel = !anyConnected ? 'None connected' : kSel ? kSel.name : 'All sources'
  const kOpts = anyConnected ? [{ id: 'all', name: 'All sources', mono: '∗', count: `${connectedIds.length} ${connectedIds.length === 1 ? 'source' : 'sources'}` }].concat(SRC.filter(x => connected[x.id])) : []
  const kConnect = SRC.filter(x => !connected[x.id])
  const agentName = AGENTS.find(a => a.id === agent).name

  const sbWidth = mobile ? 272 : collapsed ? 60 : 248
  const showSidebarLabels = !collapsed

  return (
    <div ref={rootRef} style={{ height: '100vh', width: '100%', display: 'flex', overflow: 'auto', background: C.bg, fontFamily: FONT.sans, color: C.ink }} className="hn-home">
      <style>{`
        .hn-home { -webkit-font-smoothing: antialiased; }
        .hn-home * { box-sizing: border-box; }
        .hn-home a { color: ${C.ink}; text-decoration: underline; text-underline-offset: 2px; }
        .hn-home a:hover { color: ${C.orange}; }
        .hn-home button { font: inherit; color: inherit; }
        .hn-home textarea::placeholder, .hn-home input::placeholder { color: #9A958C; }
        @keyframes hn-home-spin { to { transform: rotate(360deg); } }
        @keyframes hn-home-drift-a { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(4%,-3%) scale(1.06); } }
        @keyframes hn-home-drift-b { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-3%,3%) scale(0.95); } }
        @media (prefers-reduced-motion: reduce) { .hn-home [style*="animation"] { animation: none !important; } }
        .hn-home-navbtn:hover { background: rgba(28,26,23,.045); }
        .hn-home-iconbtn:hover { background: rgba(28,26,23,.06); color: ${C.ink}; }
        .hn-home-qa:hover { background: #FFFFFF !important; border-color: rgba(28,26,23,.18) !important; }
      `}</style>

      {mobile && mobileNavOpen && (
        <div onClick={() => setMobileNavOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,15,.28)', zIndex: 30 }} />
      )}

      {/* SIDEBAR */}
      <aside style={{
        position: mobile ? 'absolute' : 'relative', top: 0, left: 0, bottom: 0, zIndex: 40, flex: 'none',
        width: sbWidth, transform: mobile ? (mobileNavOpen ? 'translateX(0)' : 'translateX(-105%)') : 'none',
        boxShadow: mobile && mobileNavOpen ? '0 20px 60px -10px rgba(28,26,23,.3)' : 'none',
        display: 'flex', flexDirection: 'column', background: C.sidebarBg, borderRight: `1px solid ${C.borderSoft}`, padding: 12,
        transition: 'width .2s cubic-bezier(.2,.7,.2,1), transform .22s cubic-bezier(.2,.7,.2,1)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 36, marginBottom: 18 }}>
          <button onClick={onLogoClick} title={collapsed ? 'Expand sidebar' : 'Honne'} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 6px 0 7px', border: 0, background: 'transparent', borderRadius: 8, cursor: 'pointer', minWidth: 0 }}>
            <LogoMark />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', opacity: showSidebarLabels ? 1 : 0, transition: 'opacity .15s' }}>Honne</span>
          </button>
          <div style={{ flex: 1 }} />
          {showSidebarLabels && (
            <button onClick={() => setCollapsed(true)} title="Collapse sidebar" className="hn-home-iconbtn" style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 7, background: 'transparent', color: C.faint, cursor: 'pointer', flex: 'none' }}>
              <CollapseIcon />
            </button>
          )}
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(n => {
            const active = activeNav === n.id
            return (
              <button
                key={n.id} onClick={() => goNav(n.id)} title={n.label}
                className="hn-home-navbtn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, height: 34, padding: '0 10px', border: 0, borderRadius: 8, cursor: 'pointer',
                  textAlign: 'left', fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap',
                  background: active ? '#FFFFFF' : 'transparent', color: active ? C.ink : C.body,
                  boxShadow: active ? '0 0 0 1px rgba(28,26,23,.07), 0 1px 2px rgba(28,26,23,.05)' : 'none',
                  transition: 'background .12s, color .12s',
                }}
              >
                <span style={{ display: 'flex', flex: 'none' }}>
                  {n.id === 'agents' ? <AgentsGlyph size={16} color={active ? C.orange : 'currentColor'} /> : <NavIcon d={n.icon} size={16} color={active ? C.orange : 'currentColor'} />}
                </span>
                <span style={{ opacity: showSidebarLabels ? 1 : 0, transition: 'opacity .15s' }}>{n.label}</span>
              </button>
            )
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px 2px 4px', borderTop: `1px solid ${C.borderSoft}` }}>
          <div title={displayName} style={{ width: 30, height: 30, borderRadius: '50%', background: C.avatarBg, color: C.avatarFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flex: 'none', marginLeft: 1 }}>{initial}</div>
          <div style={{ flex: 1, minWidth: 0, opacity: showSidebarLabels ? 1 : 0, transition: 'opacity .15s', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{displayName}</div>
            <div style={{ fontSize: 12, color: C.faint }}>Personal workspace</div>
          </div>
          <button title="Settings" onClick={() => navigate('/settings')} className="hn-home-iconbtn" style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 7, background: 'transparent', color: C.faint, cursor: 'pointer', flex: 'none', opacity: showSidebarLabels ? 1 : 0 }}>
            <SettingsIcon />
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {mobile && (
          <div style={{ height: 52, flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 0 8px', borderBottom: `1px solid ${C.borderSoft}`, background: C.bg }}>
            <button onClick={() => setMobileNavOpen(true)} title="Menu" className="hn-home-iconbtn" style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 8, background: 'transparent', color: '#3D3933', cursor: 'pointer' }}>
              <MenuIcon />
            </button>
            <LogoMark />
            <span style={{ fontSize: 15, fontWeight: 600 }}>{stub ? stub.name : 'Honne'}</span>
            <div style={{ flex: 1 }} />
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: C.avatarBg, color: C.avatarFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>{initial}</div>
          </div>
        )}

        {!stub ? (
          <div style={{ position: 'relative', flex: 1, overflowY: 'auto' }}>
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 560, overflow: 'hidden', pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', left: '50%', top: -220, width: 720, height: 520, marginLeft: -520, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(246,161,91,.42), rgba(246,161,91,0))', filter: 'blur(20px)', animation: 'hn-home-drift-a 11s ease-in-out infinite' }} />
              <div style={{ position: 'absolute', left: '50%', top: -260, width: 680, height: 520, marginLeft: -80, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(111,167,179,.34), rgba(111,167,179,0))', filter: 'blur(20px)', animation: 'hn-home-drift-b 13s ease-in-out infinite' }} />
              <div style={{ position: 'absolute', left: '50%', top: -120, width: 420, height: 320, marginLeft: -260, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(240,102,42,.22), rgba(240,102,42,0))', filter: 'blur(24px)', animation: 'hn-home-drift-a 9s ease-in-out infinite' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(248,247,244,0) 40%, #F8F7F4 100%)' }} />
            </div>

            <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto', padding: `${mobile ? 28 : tablet ? 72 : 'clamp(56px, 12vh, 128px)'}px ${mobile ? 16 : 40}px 72px` }}>

              <header style={{ marginBottom: 30 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 26, padding: '0 10px 0 8px', borderRadius: 999, background: 'rgba(255,255,255,.7)', border: `1px solid ${C.borderSoft}`, fontSize: 12, color: C.body, marginBottom: 18, whiteSpace: 'nowrap' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: anyConnected ? C.green : '#C9C3B8' }} />
                  {statusLine}
                </div>
                <h1 style={{ margin: 0, fontFamily: FONT.serif, fontSize: mobile ? 38 : 52, lineHeight: 1.02, fontWeight: 400, letterSpacing: '-0.03em', color: C.ink }}>
                  {greeting}, <span style={{ fontStyle: 'italic', color: C.orangeDeep }}>{displayName}.</span>
                </h1>
                <p style={{ margin: '8px 0 0', fontSize: 16, lineHeight: 1.5, color: C.muted }}>What are you creating today?</p>
              </header>

              {/* Composer */}
              <div style={{ position: 'relative', zIndex: 5 }}>
                <div
                  onClick={e => { if (!e.target.closest('button')) focusTa() }}
                  onMouseEnter={() => setCmpHover(true)} onMouseLeave={() => setCmpHover(false)}
                  style={{
                    background: '#FFFFFF', borderRadius: 18, cursor: 'text',
                    border: `1px solid ${focused ? 'rgba(240,102,42,.45)' : cmpHover ? 'rgba(28,26,23,.16)' : 'rgba(28,26,23,.10)'}`,
                    boxShadow: focused ? '0 0 0 4px rgba(240,102,42,.10), 0 1px 2px rgba(28,26,23,.04), 0 24px 48px -24px rgba(196,80,30,.35)' : '0 1px 2px rgba(28,26,23,.04), 0 12px 32px -18px rgba(28,26,23,.18)',
                    transition: 'border-color .25s ease, box-shadow .25s ease',
                  }}
                >
                  {selectedAction && (
                    <div style={{ display: 'flex', padding: '14px 16px 0' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 6px 0 9px', borderRadius: 6, background: C.chipBg, fontSize: 12, color: C.body }}>
                        {ACTIONS[selectedAction].tag}
                        <button onMouseDown={e => { if (taFocus) e.preventDefault() }} onClick={clearAction} title="Clear" style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 4, background: 'transparent', color: C.faint2, cursor: 'pointer', padding: 0 }}>
                          <XIcon size={12} />
                        </button>
                      </span>
                    </div>
                  )}
                  <textarea
                    ref={taRef} value={text}
                    onChange={e => { setText(e.target.value); if (!e.target.value) setSelectedAction(null); autosize() }}
                    onFocus={() => setTaFocus(true)} onBlur={() => setTaFocus(false)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
                    rows={2}
                    placeholder="Ask Honne what to create, find an angle, research a topic, or turn your knowledge into a post..."
                    style={{ display: 'block', width: '100%', border: 0, outline: 0, resize: 'none', background: 'transparent', padding: selectedAction ? '10px 18px 6px' : '18px 18px 6px', fontFamily: 'inherit', fontSize: 15, lineHeight: 1.55, color: C.ink, minHeight: expanded ? 260 : mobile ? 76 : 88, maxHeight: 340, transition: 'min-height .2s cubic-bezier(.2,.7,.2,1)' }}
                  />
                  <div onMouseDown={e => { if (taFocus) e.preventDefault() }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px 10px 10px', opacity: focused || hasText ? 1 : 0.72, transition: 'opacity .18s' }}>
                    <button title="Attach a file" className="hn-home-iconbtn" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 8, background: 'transparent', color: C.muted, cursor: 'pointer', flex: 'none' }}>
                      <AttachIcon />
                    </button>
                    <button
                      data-pop="k-toggle" onClick={() => setPop(p => p === 'knowledge' ? null : 'knowledge')} title="Choose which knowledge Honne uses"
                      style={{ display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 8px 0 9px', border: `1px solid ${pop === 'knowledge' ? 'rgba(28,26,23,.18)' : 'rgba(28,26,23,.09)'}`, borderRadius: 8, background: pop === 'knowledge' ? '#F6F4F0' : '#FFFFFF', color: '#3D3933', fontSize: 12.5, cursor: 'pointer', flex: 'none', whiteSpace: 'nowrap' }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: anyConnected ? C.green : '#C9C3B8', flex: 'none' }} />
                      {!mobile && <span style={{ color: C.faint }}>Knowledge</span>}
                      <span style={{ fontWeight: 500, whiteSpace: 'nowrap', flex: 'none' }}>{kLabel}</span>
                      <ChevronDown />
                    </button>
                    <button data-pop="a-toggle" onClick={() => setPop(p => p === 'agent' ? null : 'agent')} title="Agent" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 8px', border: 0, borderRadius: 8, background: pop === 'agent' ? 'rgba(28,26,23,.05)' : 'transparent', color: C.body, fontSize: 12.5, cursor: 'pointer', flex: 'none' }}>
                      <AgentsGlyph size={15} color="currentColor" />
                      <span style={{ fontWeight: 500 }}>{agentName}</span>
                      <ChevronDown />
                    </button>
                    <div style={{ flex: 1 }} />
                    {!mobile && <span style={{ fontFamily: FONT.mono, fontSize: 11, color: '#9A958C', whiteSpace: 'nowrap', marginRight: 4 }}>{focused ? '↵ send · ⇧↵ new line' : '⌘K'}</span>}
                    {!mobile && (
                      <button onClick={() => { setExpanded(x => !x); focusTa() }} title={expanded ? 'Collapse composer' : 'Expand composer'} className="hn-home-iconbtn" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 8, background: 'transparent', color: C.faint, cursor: 'pointer', flex: 'none' }}>
                        <ExpandIcon />
                      </button>
                    )}
                    <button onClick={submit} title="Send (↵)" style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 9, background: hasText ? C.orange : '#ECE9E3', color: hasText ? '#FFFFFF' : '#A8A298', cursor: hasText ? 'pointer' : 'default', flex: 'none', transition: 'background .15s, color .15s' }}>
                      <SendIcon />
                    </button>
                  </div>
                </div>

                {pop === 'knowledge' && (
                  <div data-pop="k" style={{ position: 'absolute', left: mobile ? 10 : 46, top: 'calc(100% + 8px)', width: 320, maxWidth: 'calc(100% - 20px)', background: '#FFFFFF', border: '1px solid rgba(28,26,23,.10)', borderRadius: 12, boxShadow: '0 16px 40px -16px rgba(28,26,23,.28), 0 2px 6px rgba(28,26,23,.05)', padding: 6, zIndex: 25 }}>
                    <div style={{ padding: '8px 10px 8px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Use your knowledge</div>
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 2, lineHeight: 1.45 }}>{anyConnected ? 'Honne searches the sources you pick before it suggests or writes.' : 'Connect a source so Honne can work from what you already know.'}</div>
                    </div>
                    {kOpts.map(o => (
                      <button key={o.id} onClick={() => { setKnowledge(o.id); setPop(null); focusTa() }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 38, padding: '0 10px 0 8px', border: 0, borderRadius: 8, background: knowledge === o.id ? '#F7F5F1' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid rgba(28,26,23,.09)', background: '#FAF9F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#3D3933', flex: 'none' }}>{o.mono}</span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{o.name}</span>
                        <span style={{ fontSize: 12, color: C.faint2 }}>{o.count}</span>
                        <span style={{ opacity: knowledge === o.id ? 1 : 0 }}><CheckIcon size={14} color={C.orange} /></span>
                      </button>
                    ))}
                    {hasUnconnected && (
                      <>
                        <div style={{ margin: '6px 4px 0', padding: '10px 6px 4px', borderTop: '1px solid rgba(28,26,23,.07)', fontSize: 11.5, fontWeight: 500, color: C.faint2 }}>{anyConnected ? 'Add a source' : 'Connect a source'}</div>
                        {kConnect.map(c => (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px 6px 8px', borderRadius: 8 }}>
                            <span style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid rgba(28,26,23,.09)', background: '#FAF9F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#3D3933', flex: 'none' }}>{c.mono}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                              <div style={{ fontSize: 11.5, color: C.faint2 }}>{c.desc}</div>
                            </div>
                            <button onClick={() => connectSource(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', border: '1px solid rgba(28,26,23,.12)', borderRadius: 7, background: '#FFFFFF', fontSize: 12, fontWeight: 500, color: C.ink, cursor: 'pointer', flex: 'none' }}>
                              {connecting[c.id] && <Spinner />}
                              {connecting[c.id] ? 'Connecting' : 'Connect'}
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                    <div style={{ margin: '6px 4px 0', paddingTop: 6, borderTop: '1px solid rgba(28,26,23,.07)' }}>
                      <button onClick={() => goNav('sources')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 32, padding: '0 6px', border: 0, borderRadius: 7, background: 'transparent', fontSize: 12.5, color: C.body, cursor: 'pointer' }}>
                        Manage sources
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
                      </button>
                    </div>
                  </div>
                )}

                {pop === 'agent' && (
                  <div data-pop="a" style={{ position: 'absolute', left: mobile ? 10 : 230, top: 'calc(100% + 8px)', width: 300, maxWidth: 'calc(100% - 20px)', background: '#FFFFFF', border: '1px solid rgba(28,26,23,.10)', borderRadius: 12, boxShadow: '0 16px 40px -16px rgba(28,26,23,.28), 0 2px 6px rgba(28,26,23,.05)', padding: 6, zIndex: 25 }}>
                    {AGENTS.map(g => (
                      <button key={g.id} onClick={() => { setAgent(g.id); setPop(null); focusTa() }} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', padding: '8px 10px', border: 0, borderRadius: 8, background: agent === g.id ? '#F7F5F1' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</div>
                          <div style={{ fontSize: 12, color: C.faint, marginTop: 1 }}>{g.desc}</div>
                        </div>
                        <span style={{ marginTop: 3, opacity: agent === g.id ? 1 : 0 }}><CheckIcon size={14} color={C.orange} /></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {showKnowledgePrompt && (
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px 14px', marginTop: 12, padding: '12px 12px 12px 14px', border: '1px solid rgba(28,26,23,.08)', borderRadius: 12, background: C.panelBg }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: '#F3E6DF', color: '#9A4A2E', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                    <NavIcon d="E:9,12,5,5,3" size={15} color="#9A4A2E" />
                  </span>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>Give Honne context</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 1 }}>Connect your knowledge sources so Honne can work from what you already know.</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={() => setPop('knowledge')} style={{ height: 32, padding: '0 12px', border: '1px solid rgba(28,26,23,.12)', borderRadius: 8, background: '#FFFFFF', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Connect source</button>
                    <button onClick={() => setPromptDismissed(true)} title="Dismiss" className="hn-home-iconbtn" style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 7, background: 'transparent', color: C.faint2, cursor: 'pointer' }}>
                      <XIcon />
                    </button>
                  </div>
                </div>
              )}

              {/* Quick actions */}
              <section style={{ marginTop: 26 }}>
                <div style={{ fontSize: 12.5, color: C.faint, marginBottom: 10 }}>Try asking Honne</div>
                <div className="hn-home-qa-row" style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { id: 'ideas', icon: <IdeaIcon />, label: 'Find content ideas' },
                    { id: 'series', icon: <SeriesIcon />, label: 'Turn my knowledge into a content series' },
                    { id: 'research', icon: <ResearchIcon />, label: 'Research a topic' },
                    { id: 'repurpose', icon: <RepurposeIcon />, label: 'Repurpose existing content' },
                  ].map(q => (
                    <button key={q.id} onClick={() => pickAction(q.id)} className="hn-home-qa" style={{ display: 'flex', alignItems: 'center', gap: 8, height: mobile ? 44 : 34, padding: '0 12px 0 11px', border: `1px solid ${selectedAction === q.id ? 'rgba(28,26,23,.30)' : 'rgba(28,26,23,.10)'}`, borderRadius: 9, background: selectedAction === q.id ? '#FFFFFF' : 'rgba(255,255,255,.45)', fontSize: 13, color: '#3D3933', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .12s, border-color .12s' }}>
                      {q.icon}
                      {q.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Create for a platform */}
              <section style={{ marginTop: 36 }}>
                <h2 style={{ margin: '0 0 12px 0', whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 600 }}>Create for a platform</h2>
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: 12 }}>
                  {PLATS.map((p, i) => {
                    const hv = platHover === i
                    const g = platGlow[i] || { x: 50, y: 30 }
                    return (
                      <motion.div
                        key={p.id} style={{ height: '100%' }}
                        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                        whileHover={{ y: -4, scale: 1.015 }} whileTap={{ scale: 0.975 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 24, delay: i * 0.06 }}
                      >
                        <button
                          onClick={() => startPlatform(p)}
                          onMouseEnter={() => setPlatHover(i)} onMouseLeave={() => setPlatHover(null)}
                          onMouseMove={e => {
                            const r = e.currentTarget.getBoundingClientRect()
                            const x = Math.round((e.clientX - r.left) / r.width * 100), y = Math.round((e.clientY - r.top) / r.height * 100)
                            setPlatGlow(gl => ({ ...gl, [i]: { x, y } }))
                          }}
                          style={{
                            position: 'relative', width: '100%', height: '100%', minHeight: 168, display: 'flex', flexDirection: 'column', gap: 14, padding: 18,
                            borderRadius: 16, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.ink,
                            background: 'rgba(255,255,255,.52)', backdropFilter: 'blur(18px) saturate(160%)', WebkitBackdropFilter: 'blur(18px) saturate(160%)',
                            border: `1px solid ${hv ? p.bdHover : 'rgba(255,255,255,.75)'}`,
                            boxShadow: hv ? `0 22px 48px -24px ${p.tint}, 0 0 0 1px rgba(255,255,255,.6)` : '0 1px 2px rgba(28,26,23,.04), 0 10px 28px -20px rgba(28,26,23,.25)',
                            transition: 'box-shadow .35s, border-color .3s',
                          }}
                        >
                          <div style={{ position: 'absolute', width: 180, height: 180, right: -60, top: -70, borderRadius: '50%', background: p.tint, filter: 'blur(40px)', opacity: hv ? 0.55 : 0.22, transition: 'opacity .4s', pointerEvents: 'none' }} />
                          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(220px circle at ${g.x}% ${g.y}%, ${p.glow}, transparent 70%)`, opacity: hv ? 1 : 0, transition: 'opacity .3s', pointerEvents: 'none' }} />
                          <div style={{ position: 'absolute', inset: 0, borderRadius: 16, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9)', pointerEvents: 'none' }} />
                          <div style={{ position: 'relative', width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.iconBg, boxShadow: `0 6px 16px -8px ${p.tint}` }}>
                            <PlatformLogo id={p.id} />
                          </div>
                          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <div style={{ fontFamily: FONT.serif, fontSize: 22, lineHeight: 1.1, letterSpacing: '-0.01em' }}>{p.title}</div>
                            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: C.muted, textWrap: 'pretty' }}>{p.desc}</div>
                          </div>
                          <div style={{ flex: 1 }} />
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: hv ? p.ink : C.faint, transition: 'color .2s' }}>
                            Start <ArrowRight x={hv ? 3 : 0} />
                          </div>
                        </button>
                      </motion.div>
                    )
                  })}
                </div>
              </section>

              {/* Recent work — not wired to posts yet */}
              <section style={{ marginTop: 44 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <h2 style={{ margin: 0, whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.005em' }}>Recent work</h2>
                  <span style={{ height: 20, display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 999, background: 'rgba(240,102,42,.1)', fontSize: 11, fontWeight: 500, color: C.orangeDeep }}>Coming soon</span>
                </div>
                <div style={{ padding: '22px 20px', border: '1px dashed rgba(28,26,23,.14)', borderRadius: 12, fontSize: 13, color: C.faint }}>Your drafts and published posts will show up here.</div>
              </section>
            </div>
          </div>
        ) : (
          /* Undesigned destination placeholder (Sources) */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ height: 52, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 0 10px', borderBottom: `1px solid ${C.borderSoft}` }}>
              <button onClick={() => { setStub(null); setActiveNav('home') }} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px 0 8px', border: 0, borderRadius: 8, background: 'transparent', fontSize: 13, color: C.body, cursor: 'pointer' }}>
                <BackArrow />
                Home
              </button>
              <span style={{ color: '#B5B0A7', fontSize: 13 }}>/</span>
              <span style={{ fontSize: 13, color: C.faint, whiteSpace: 'nowrap' }}>{stub.name}</span>
            </div>
            <div style={{ flex: 1, padding: 20, minHeight: 0 }}>
              <div style={{ height: '100%', border: '1px solid rgba(28,26,23,.08)', borderRadius: 12, background: 'repeating-linear-gradient(135deg, #F3F1ED 0 10px, #F8F7F4 10px 20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
                <div style={{ maxWidth: 420 }}>
                  <div style={{ fontFamily: FONT.mono, fontSize: 12, color: C.body, letterSpacing: '.02em' }}>SOURCES</div>
                  <div style={{ fontSize: 13, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>Connecting and managing knowledge sources isn&rsquo;t built yet. It&rsquo;ll live here.</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
