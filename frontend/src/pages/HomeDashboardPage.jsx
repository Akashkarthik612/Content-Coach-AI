import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import KnowledgeView from './KnowledgeView'
import HomeChat from './home/HomeChat'
import { useHomeChats } from './home/useHomeChats'
import { listDocuments, listSources } from '../api/knowledge'

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

/* ─── Knowledge sources. Google Drive is live (/api/knowledge); the rest
     are listed as coming soon. Connected state and counts come from the backend. ── */
const SRC = [
  { id: 'drive', provider: 'gdrive', name: 'Google Drive', desc: 'Docs, PDFs, Markdown, text', mono: 'G' },
  { id: 'notion', name: 'Notion', desc: 'Pages and databases', mono: 'N', soon: true },
  { id: 'github', name: 'GitHub', desc: 'READMEs and docs', mono: 'Gh', soon: true },
  { id: 'word', name: 'Microsoft Word', desc: '.docx files', mono: 'W', soon: true },
  { id: 'files', provider: 'upload', name: 'Uploaded files', desc: 'PDF, Markdown, text', mono: 'F', soon: true },
]
const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8|M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'create', label: 'Create', icon: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7|M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z' },
  { id: 'posts', label: 'Posts', icon: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z|M14 2v4a2 2 0 0 0 2 2h4|M16 13H8|M16 17H8' },
  { id: 'knowledge', label: 'Knowledge', icon: 'E:9,12,5,5,3' },
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
function CollapseIcon({ size = 16 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></svg>
}
function SettingsIcon({ size = 16 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>
}
function MenuIcon({ size = 18 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></svg>
}
function BackArrow({ size = 15 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
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
export default function HomeDashboardPage({ initialNav = 'home' }) {
  const navigate = useNavigate()
  const cat = useViewportCategory()
  const mobile = cat === 'mobile'
  const tablet = cat === 'tablet'

  const fullName = localStorage.getItem('display_name') ?? localStorage.getItem('username') ?? 'there'
  const displayName = fullName.split(' ')[0]
  const initial = displayName[0]?.toUpperCase() ?? 'U'
  const initials = fullName.split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase() || initial

  const [collapsed, setCollapsed] = useState(tablet)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [activeNav, setActiveNav] = useState(initialNav)
  const [stub, setStub] = useState(null) // { name } — in-page placeholder for undesigned sections
  const [kb, setKb] = useState({ sources: [], documents: [] }) // real knowledge sources
  const [focusSignal, setFocusSignal] = useState(0) // bumped to put the caret in the chat composer

  const chats = useHomeChats()
  const { active: activeChat, newChat, open: openChat } = chats

  // Auto-collapse on entering the tablet breakpoint (adjusted during render,
  // not an effect, so the user's manual toggle isn't clobbered on every pass).
  const [prevTablet, setPrevTablet] = useState(tablet)
  if (tablet !== prevTablet) {
    setPrevTablet(tablet)
    setCollapsed(tablet)
  }

  const goHome = useCallback(() => {
    setStub(null); setActiveNav('home')
    if (initialNav !== 'home') navigate('/home')
  }, [initialNav, navigate])

  // Escape closes the mobile nav; ⌘K starts a new chat, ⌘\ toggles the sidebar.
  useEffect(() => {
    const onKey = e => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); goHome(); newChat(); setFocusSignal(n => n + 1) }
      if (mod && e.key === '\\') { e.preventDefault(); if (mobile) setMobileNavOpen(o => !o); else setCollapsed(c => !c) }
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobile, goHome, newChat])

  useEffect(() => {
    let live = true
    Promise.all([listSources(), listDocuments()])
      .then(([sources, documents]) => { if (live) setKb({ sources, documents }) })
      .catch(() => {}) // the chat still works; the knowledge page shows the error
    return () => { live = false }
  }, [])
  const connectedIds = SRC.filter(x => x.provider && kb.sources.some(s => s.provider === x.provider)).map(x => x.id)
  const anyConnected = connectedIds.length > 0
  const kbStatus = {
    anyConnected,
    statusLine: anyConnected ? `${connectedIds.length} ${connectedIds.length === 1 ? 'source' : 'sources'} connected · style memory on` : 'No knowledge connected yet',
    kLabel: anyConnected ? 'All sources' : 'None connected',
  }

  function goNav(id) {
    setMobileNavOpen(false)
    if (id === 'home') { goHome(); newChat(); return }
    if (id === 'create') { goHome(); newChat(); setFocusSignal(n => n + 1); return }
    if (id === 'knowledge') { setStub(null); setActiveNav('knowledge'); navigate('/knowledge'); return }
    if (id === 'agents') { navigate('/demo'); return }
    // Posts, Agents and Analytics have no real page yet — show the
    // in-app placeholder the design uses for destinations outside its scope.
    setActiveNav(id)
    setStub({ name: NAV_ITEMS.find(n => n.id === id)?.label ?? 'Honne' })
  }
  function pickChat(id) {
    setMobileNavOpen(false)
    goHome()
    openChat(id)
  }
  function onLogoClick() {
    if (mobile) { setMobileNavOpen(false); return }
    if (collapsed) { setCollapsed(false); return }
    goHome(); newChat()
  }

  const sbWidth = mobile ? 272 : collapsed ? 60 : 248
  const showSidebarLabels = !collapsed
  const onHome = !stub && activeNav === 'home'

  return (
    <div style={{ height: '100vh', width: '100%', display: 'flex', overflow: 'hidden', position: 'relative', background: C.bg, fontFamily: FONT.sans, color: C.ink }} className="hn-home">
      <style>{`
        .hn-home { -webkit-font-smoothing: antialiased; }
        .hn-home * { box-sizing: border-box; }
        .hn-home a { color: ${C.ink}; text-decoration: underline; text-underline-offset: 2px; }
        .hn-home a:hover { color: ${C.orange}; }
        .hn-home button { font: inherit; color: inherit; }
        .hn-home textarea::placeholder, .hn-home input::placeholder { color: #9A958C; }
        @keyframes hn-home-dots { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .hn-home [style*="animation"] { animation: none !important; } }
        .hn-home-navbtn:hover { background: rgba(28,26,23,.045); }
        .hn-home-chat:hover { background: #FFFFFF !important; }
        .hn-home-iconbtn:hover { background: rgba(28,26,23,.06); color: ${C.ink}; }
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
            // Home is lit on the home layout; an open chat lights its row in Recent chats instead.
            const active = n.id === 'home' ? onHome && !activeChat : activeNav === n.id && !!(stub || n.id === 'knowledge')
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

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 24, opacity: showSidebarLabels ? 1 : 0, pointerEvents: showSidebarLabels ? 'auto' : 'none', transition: 'opacity .15s' }}>
          {chats.chats.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ padding: '0 10px 6px', fontSize: 11.5, fontWeight: 500, color: C.faint2 }}>Recent chats</div>
              {chats.chats.map(x => {
                const on = onHome && x.id === chats.activeId
                const pending = x.msgs.some(m => m.status === 'working')
                return (
                  <button key={x.id} data-testid="hc-recent-chat" onClick={() => pickChat(x.id)} title={x.title} className="hn-home-chat"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, flex: 'none', padding: '0 10px', border: 0, borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontSize: 13, color: C.ink, background: on ? '#FFFFFF' : 'transparent', boxShadow: on ? '0 0 0 1px rgba(28,26,23,.07), 0 1px 2px rgba(28,26,23,.05)' : 'none' }}>
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title}</span>
                    {pending && <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.orange, animation: 'hn-home-dots 1s ease-in-out infinite', flex: 'none' }} />}
                  </button>
                )
              })}
              <div style={{ padding: '8px 10px 0', fontSize: 11.5, color: C.faint2, lineHeight: 1.45 }}>LinkedIn chats are kept for 7 days; Reddit and X chats last until you leave the page.</div>
            </div>
          )}
          {chats.historyError && <div role="alert" style={{ padding: '8px 10px', fontSize: 12, color: '#9C3F17' }}>{chats.historyError}</div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px 2px 4px', marginTop: 8, borderTop: `1px solid ${C.borderSoft}` }}>
          <div title={displayName} style={{ width: 30, height: 30, borderRadius: '50%', background: C.avatarBg, color: C.avatarFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flex: 'none', marginLeft: 1 }}>{initial}</div>
          <div style={{ flex: 1, minWidth: 0, opacity: showSidebarLabels ? 1 : 0, transition: 'opacity .15s', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{displayName}</div>
            <div style={{ fontSize: 12, color: C.faint }}>Personal workspace</div>
          </div>
          <button title="Settings" onClick={() => { setActiveNav(null); setStub({ name: 'Settings' }) }} className="hn-home-iconbtn" style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 7, background: 'transparent', color: C.faint, cursor: 'pointer', flex: 'none', opacity: showSidebarLabels ? 1 : 0 }}>
            <SettingsIcon />
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {mobile && (
          <div style={{ height: 52, flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 0 8px', borderBottom: `1px solid ${C.borderSoft}`, background: C.bg, position: 'relative', zIndex: 8 }}>
            <button onClick={() => setMobileNavOpen(true)} title="Menu" className="hn-home-iconbtn" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 8, background: 'transparent', color: '#3D3933', cursor: 'pointer' }}>
              <MenuIcon />
            </button>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stub ? stub.name : activeNav === 'knowledge' ? 'Knowledge' : activeChat ? activeChat.title : 'Honne'}
            </span>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: C.avatarBg, color: C.avatarFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flex: 'none' }}>{initial}</div>
          </div>
        )}

        {onHome && (
          <HomeChat
            store={chats} mobile={mobile} displayName={displayName} initials={initials}
            kb={kbStatus} onOpenKnowledge={() => goNav('knowledge')} focusSignal={focusSignal}
          />
        )}
        {!stub && activeNav === 'knowledge' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <KnowledgeView />
          </div>
        )}
        {stub && (
          /* Undesigned destination placeholder */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ height: 52, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 0 10px', borderBottom: `1px solid ${C.borderSoft}` }}>
              <button onClick={goHome} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px 0 8px', border: 0, borderRadius: 8, background: 'transparent', fontSize: 13, color: C.body, cursor: 'pointer' }}>
                <BackArrow />
                Home
              </button>
              <span style={{ color: '#B5B0A7', fontSize: 13 }}>/</span>
              <span style={{ fontSize: 13, color: C.faint, whiteSpace: 'nowrap' }}>{stub.name}</span>
            </div>
            <div style={{ flex: 1, padding: 20, minHeight: 0 }}>
              <div style={{ height: '100%', border: '1px solid rgba(28,26,23,.08)', borderRadius: 12, background: 'repeating-linear-gradient(135deg, #F3F1ED 0 10px, #F8F7F4 10px 20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
                <div style={{ maxWidth: 420 }}>
                  <div style={{ fontFamily: FONT.mono, fontSize: 12, color: C.body, letterSpacing: '.02em' }}>{stub.name.toUpperCase()}</div>
                  <div style={{ fontSize: 13, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>This section isn&rsquo;t built yet. It&rsquo;ll live here.</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
