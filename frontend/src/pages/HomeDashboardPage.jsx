import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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

/* ─── Mock content (knowledge sources, agents and recent work aren't wired to
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
  linkedin: { tag: 'LinkedIn post', agent: 'writer', prompt: 'Write a LinkedIn post about ' },
  series: { tag: 'Content series', agent: 'series', prompt: 'Turn my notes on building Honne into a 5-post series for this week' },
  research: { tag: 'Research', agent: 'researcher', prompt: 'Research what people are saying about ' },
  repurpose: { tag: 'Repurpose', agent: 'writer', prompt: 'Repurpose "Lessons from building Honne" as a thread for X' },
}
const RECENTS_INITIAL = [
  { id: 'r1', title: "AI agents aren't the hard part", status: 'draft', date: 'Today', platform: 'linkedin' },
  { id: 'r2', title: 'Lessons from building Honne', status: 'published', date: 'Yesterday', platform: 'linkedin' },
  { id: 'r3', title: 'Content ideas from my research', status: 'draft', date: 'Sep 22', platform: null },
  { id: 'r4', title: 'A week of building in public', status: 'scheduled', date: 'Sep 26', platform: 'x' },
  { id: 'r5', title: 'Why my notes became my best content', status: 'draft', date: 'Sep 19', platform: 'reddit' },
]
const STATUS = { draft: { label: 'Draft', dot: '#A8A298' }, published: { label: 'Published', dot: C.green }, scheduled: { label: 'Scheduled', dot: C.amber } }
const PLATFORM = { linkedin: { mono: 'in', name: 'LinkedIn' }, x: { mono: 'X', name: 'X' }, reddit: { mono: 'r/', name: 'Reddit' } }
const ANGLE_SETS = [
  [
    { mono: 'N', src: 'Notion · Build log', title: "AI agents aren't the hard part. Knowing what they can see is." },
    { mono: 'Gh', src: 'GitHub · README', title: 'Why I split one agent into five, and what broke first' },
    { mono: 'G', src: 'Drive · Roadmap', title: 'Three weeks on retrieval before a single prompt' },
  ],
  [
    { mono: 'F', src: 'Upload · Talk notes', title: 'The question every beginner asks me about posting' },
    { mono: 'N', src: 'Notion · Ideas', title: 'What building in public cost me, and what it paid back' },
    { mono: 'Gh', src: 'GitHub · Commits', title: 'A week of commits, told as one story' },
  ],
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
function PenIcon({ size = 15 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#8A857C" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></svg>
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
function RefreshIcon({ size = 13, deg = 0 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${deg}deg)`, transition: 'transform .6s cubic-bezier(.2,.7,.2,1)' }}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
}
function ArrowRight({ size = 13, x = 0 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `translateX(${x}px)`, transition: 'transform .3s' }}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
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

  const [connected, setConnected] = useState({ drive: 1, notion: 1, github: 1 })
  const [connecting, setConnecting] = useState({})
  const [promptDismissed, setPromptDismissed] = useState(false)

  const [angleSet, setAngleSet] = useState(0)
  const [angleIn, setAngleIn] = useState(true)
  const [angleHover, setAngleHover] = useState(null)
  const [spin, setSpin] = useState(0)

  const [recents, setRecents] = useState(RECENTS_INITIAL)
  const [hoverRow, setHoverRow] = useState(null)
  const [moreOpenId, setMoreOpenId] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [renameText, setRenameText] = useState('')

  const taRef = useRef(null)
  const rootRef = useRef(null)

  // Auto-collapse on entering the tablet breakpoint (adjusted during render,
  // not an effect, so the user's manual toggle isn't clobbered on every pass).
  const [prevTablet, setPrevTablet] = useState(tablet)
  if (tablet !== prevTablet) {
    setPrevTablet(tablet)
    setCollapsed(tablet)
  }

  // Close popovers on outside click / Escape.
  useEffect(() => {
    const onDoc = e => {
      if ((pop || moreOpenId) && !(e.target.closest && e.target.closest('[data-pop]'))) { setPop(null); setMoreOpenId(null) }
    }
    const onKey = e => {
      if (e.key === 'Escape') { setPop(null); setMobileNavOpen(false); setMoreOpenId(null); setRenaming(null) }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [pop, moreOpenId])

  const autosize = useCallback(() => {
    const t = taRef.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = Math.min(t.scrollHeight, 340) + 'px'
  }, [])
  const focusTa = useCallback(() => {
    setTimeout(() => { const t = taRef.current; if (!t) return; t.focus(); const n = t.value.length; t.setSelectionRange(n, n); autosize() }, 0)
  }, [autosize])

  const connectedIds = SRC.filter(x => connected[x.id]).map(x => x.id)
  const anyConnected = connectedIds.length > 0
  const hasUnconnected = SRC.length > connectedIds.length
  const focused = taFocus || pop === 'knowledge' || pop === 'agent'
  const hasText = text.trim().length > 0
  const showKnowledgePrompt = !anyConnected && !promptDismissed
  const showAngles = anyConnected

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
  function applyAngle(g) {
    setText('Draft a LinkedIn post from this angle: ' + g.title)
    setAgent('writer'); setSelectedAction('linkedin'); setPop(null)
    focusTa()
  }
  function refreshAngles() {
    setAngleIn(false); setSpin(s => s + 360)
    setTimeout(() => { setAngleSet(s => (s + 1) % ANGLE_SETS.length); setAngleIn(true) }, 260)
  }
  function submit() {
    const t = text.trim()
    if (!t) return
    navigate('/chat')
  }
  function openRecent(r) {
    if (renaming === r.id) return
    navigate('/chat')
  }
  function commitRename() {
    if (!renaming) return
    const v = renameText.trim()
    if (v) setRecents(rs => rs.map(r => r.id === renaming ? { ...r, title: v } : r))
    setRenaming(null)
  }
  function duplicateRecent(r) {
    setRecents(rs => {
      const i = rs.findIndex(y => y.id === r.id)
      const copy = { ...r, id: r.id + '-' + Date.now(), title: r.title + ' (copy)', status: 'draft', date: 'Just now' }
      const list = rs.slice(); list.splice(i + 1, 0, copy); return list
    })
    setMoreOpenId(null)
  }
  function archiveRecent(r) {
    setRecents(rs => rs.filter(y => y.id !== r.id))
    setMoreOpenId(null)
  }

  function goNav(id) {
    setPop(null); setMobileNavOpen(false)
    if (id === 'home') { setStub(null); setActiveNav('home'); return }
    if (id === 'create') { navigate('/chat'); return }
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
  const angles = ANGLE_SETS[angleSet]

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
        .hn-home-recent:hover .hn-home-recent-actions { opacity: 1 !important; pointer-events: auto !important; }
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
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 18 }}>
                  <button onClick={() => setPop(p => p === 'knowledge' ? null : 'knowledge')} data-pop="hdr" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px 0 12px', border: 0, borderRadius: 9, background: C.ink, color: '#FAF9F7', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>
                    <NavIcon d="E:9,12,5,5,3" size={15} color="#FAF9F7" />
                    {anyConnected ? 'Add another source' : 'Connect knowledge'}
                  </button>
                  {anyConnected && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.greenDeep }}>
                      <CheckIcon size={14} />
                      {connectedIds.map(id => SRC.find(x => x.id === id).name).join(', ')} connected
                    </span>
                  )}
                </div>
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
                <div className="hn-home-qa-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { id: 'ideas', icon: <IdeaIcon />, label: 'Find content ideas' },
                    { id: 'linkedin', icon: <PenIcon />, label: 'Create a LinkedIn post' },
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

              {/* Angles */}
              {showAngles && (
                <section style={{ marginTop: 44 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h2 style={{ margin: 0, whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 600 }}>Angles from your knowledge</h2>
                    <button onClick={refreshAngles} className="hn-home-iconbtn" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 8px', marginRight: -8, border: 0, borderRadius: 7, background: 'transparent', fontSize: 12.5, color: C.muted, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <RefreshIcon deg={spin} />
                      New angles
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: 10 }}>
                    {angles.map((g, i) => {
                      const hv = angleHover === i
                      return (
                        <button
                          key={g.title} onClick={() => applyAngle(g)} onMouseEnter={() => setAngleHover(i)} onMouseLeave={() => setAngleHover(null)}
                          style={{
                            position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 148, padding: 16, borderRadius: 14,
                            border: `1px solid ${hv ? 'rgba(240,102,42,.35)' : 'rgba(28,26,23,.08)'}`, background: '#FFFFFF', textAlign: 'left', cursor: 'pointer',
                            transform: !angleIn ? 'translateY(8px)' : hv ? 'translateY(-3px)' : 'none',
                            boxShadow: hv ? '0 18px 40px -22px rgba(196,80,30,.4)' : '0 1px 2px rgba(28,26,23,.03)',
                            opacity: angleIn ? 1 : 0, transitionDelay: angleIn ? `${i * 0.07}s` : '0s',
                            transition: 'transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .35s, border-color .25s, opacity .35s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.faint }}>
                            <span style={{ height: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', borderRadius: 5, background: C.chipBg, fontSize: 10, fontWeight: 600, color: '#3D3933' }}>{g.mono}</span>
                            {g.src}
                          </div>
                          <div style={{ fontFamily: FONT.serif, fontSize: 20, lineHeight: 1.18, letterSpacing: '-0.01em', color: C.ink }}>{g.title}</div>
                          <div style={{ flex: 1 }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: hv ? C.orangeDeep : C.faint, transition: 'color .2s' }}>
                            Draft this <ArrowRight x={hv ? 3 : 0} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Recent work */}
              <section style={{ marginTop: 44 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h2 style={{ margin: 0, whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.005em' }}>Recent work</h2>
                  {recents.length > 0 && (
                    <button onClick={() => goNav('posts')} className="hn-home-iconbtn" style={{ height: 28, padding: '0 8px', marginRight: -8, border: 0, borderRadius: 7, background: 'transparent', fontSize: 12.5, color: C.muted, cursor: 'pointer', whiteSpace: 'nowrap' }}>View all</button>
                  )}
                </div>

                {recents.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {recents.map(r => {
                      const moreOpen = moreOpenId === r.id
                      const hov = hoverRow === r.id || moreOpen || renaming === r.id
                      const pl = r.platform ? PLATFORM[r.platform] : null
                      const st = STATUS[r.status]
                      const isRenaming = renaming === r.id
                      return (
                        <div key={r.id} onMouseEnter={() => setHoverRow(r.id)} onMouseLeave={() => setHoverRow(x => x === r.id ? null : x)} onClick={() => openRecent(r)}
                          className="hn-home-recent"
                          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: 10, margin: '0 -10px', borderRadius: 10, cursor: 'pointer', background: hov ? 'rgba(28,26,23,.04)' : 'transparent', transition: 'background .12s' }}
                        >
                          <div title={pl ? pl.name : 'Ideas session'} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(28,26,23,.08)', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontSize: 11.5, fontWeight: 600, color: '#3D3933', letterSpacing: '-0.01em' }}>
                            {pl ? pl.mono : <IdeaIcon size={15} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {!isRenaming ? (
                              <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                            ) : (
                              <input
                                data-pop="rename" value={renameText} autoFocus
                                onChange={e => setRenameText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null) } }}
                                onBlur={commitRename} onClick={e => e.stopPropagation()}
                                style={{ width: '100%', height: 24, margin: '-2px 0 -2px -6px', padding: '0 6px', border: '1px solid rgba(28,26,23,.22)', borderRadius: 6, outline: 0, background: '#FFFFFF', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, color: C.ink, boxShadow: '0 0 0 3px rgba(240,102,42,.12)' }}
                              />
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 12.5, color: C.faint, whiteSpace: 'nowrap' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flex: 'none' }} />
                              <span>{st.label}</span><span style={{ color: '#B5B0A7' }}>·</span><span>{r.date}</span>
                            </div>
                          </div>
                          <div className="hn-home-recent-actions" style={{ display: 'flex', alignItems: 'center', gap: 2, opacity: hov || mobile ? 1 : 0, pointerEvents: hov || mobile ? 'auto' : 'none', transition: 'opacity .12s' }}>
                            {!mobile && (
                              <button onClick={e => { e.stopPropagation(); openRecent(r) }} style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 10px', border: '1px solid rgba(28,26,23,.10)', borderRadius: 7, background: '#FFFFFF', fontSize: 12, fontWeight: 500, color: C.ink, cursor: 'pointer', marginRight: 4 }}>Open</button>
                            )}
                            {!mobile && (
                              <button onClick={e => { e.stopPropagation(); setRenaming(r.id); setRenameText(r.title); setMoreOpenId(null) }} title="Rename" className="hn-home-iconbtn" style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 7, background: 'transparent', color: C.muted, cursor: 'pointer' }}>
                                <PenIcon size={14} />
                              </button>
                            )}
                            <button data-pop="more" onClick={e => { e.stopPropagation(); setMoreOpenId(x => x === r.id ? null : r.id) }} title="More" className="hn-home-iconbtn" style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 7, background: moreOpen ? 'rgba(28,26,23,.06)' : 'transparent', color: C.muted, cursor: 'pointer' }}>
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                            </button>
                          </div>
                          {moreOpen && (
                            <div data-pop="menu" onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 8, top: 'calc(100% - 2px)', width: 180, background: '#FFFFFF', border: '1px solid rgba(28,26,23,.10)', borderRadius: 10, boxShadow: '0 16px 40px -16px rgba(28,26,23,.28), 0 2px 6px rgba(28,26,23,.05)', padding: 5, zIndex: 20 }}>
                              <button onClick={() => { setRenaming(r.id); setRenameText(r.title); setMoreOpenId(null) }} style={{ display: 'flex', alignItems: 'center', width: '100%', height: 32, padding: '0 10px', border: 0, borderRadius: 6, background: 'transparent', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>Rename</button>
                              <button onClick={() => duplicateRecent(r)} style={{ display: 'flex', alignItems: 'center', width: '100%', height: 32, padding: '0 10px', border: 0, borderRadius: 6, background: 'transparent', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>Duplicate</button>
                              <div style={{ height: 1, background: 'rgba(28,26,23,.07)', margin: '4px 2px' }} />
                              <button onClick={() => archiveRecent(r)} style={{ display: 'flex', alignItems: 'center', width: '100%', height: 32, padding: '0 10px', border: 0, borderRadius: 6, background: 'transparent', fontSize: 13, color: '#A6452A', cursor: 'pointer', textAlign: 'left' }}>Archive</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '22px 20px', border: '1px dashed rgba(28,26,23,.14)', borderRadius: 12 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: '#3D3933' }}>Nothing here yet</div>
                    <div style={{ fontSize: 13, color: C.faint, marginTop: 3 }}>Drafts and published posts you make with Honne will show up here.</div>
                  </div>
                )}
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
