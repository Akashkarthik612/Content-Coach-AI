// Shared app-shell sidebar — used by MyWorkPage and AgentsPage so navigation
// between pages is consistent. Originally extracted from the now-deleted
// DashboardPage.jsx's inline Sidebar (2026-07-29: Dashboard/Templates/Analytics
// nav entries removed along with that page — Chat is the app's home page now).

import { logout } from '../../api/auth';

const INK    = '#111827'
const BODY   = '#4B5563'
const MUTED  = '#6B7280'
const FAINT  = '#9CA3AF'
const BLUE   = '#3B82F6'
const INDIGO = '#6366F1'
const VIOLET = '#8B5CF6'
const TINT   = '#F7FAFF'
const WHITE  = '#FFFFFF'
const BDR    = 'rgba(17,24,39,0.07)'
const FONT   = "'Hanken Grotesk','DM Sans',system-ui,sans-serif"
const SERIF  = "'Newsreader',Georgia,serif"
const MONO   = "'JetBrains Mono','Fira Code',monospace"

export const NAV_ITEMS = [
  { key: 'content',     label: 'Start Writing',  path: '/my-work?new=1',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="17" height="17"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
  { key: 'agents',      label: 'Agents',         path: '/agents',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="17" height="17"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M8 7V5a2 2 0 014 0v2M12 7V5a2 2 0 014 0v2M9 14h.01M15 14h.01"/></svg> },
  { key: 'vault',       label: 'Content Vault',  path: '/vault',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="17" height="17"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg> },
  { key: 'chat',        label: 'Chat',           path: '/chat',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="17" height="17"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
]

export function AppSidebar({ navigate, activeKey = 'content', collapsed, onToggle, onCalendarOpen = () => {} }) {
  const displayName = localStorage.getItem('display_name') ?? localStorage.getItem('username') ?? 'User'
  const initial = displayName[0]?.toUpperCase() ?? 'U'

  const today = new Date()
  const month = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const calDates = [
    { date: today.getDate(),     dots: [BLUE, INDIGO, VIOLET], posts: 3, color: BLUE, bold: true },
    { date: today.getDate() + 1, dots: [INDIGO, '#0EA5E9'],    posts: 2, color: INK,  bold: false },
    { date: today.getDate() + 2, dots: [VIOLET],               posts: 1, color: INK,  bold: false },
  ]

  const W = collapsed ? 64 : 248

  return (
    <aside style={{
      width: W, flexShrink: 0, background: WHITE,
      borderRight: `1px solid ${BDR}`,
      display: 'flex', flexDirection: 'column',
      padding: collapsed ? '22px 10px' : '22px 16px',
      position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', overflowX: 'hidden',
      fontFamily: FONT,
      transition: 'width .22s cubic-bezier(.16,1,.3,1), padding .22s cubic-bezier(.16,1,.3,1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', padding: '0 0 24px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 11, overflow: 'hidden' }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)',
            boxShadow: '0 6px 16px -6px rgba(59,130,246,.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: SERIF, fontSize: 20, color: WHITE, marginTop: -2 }}>C</span>
          </div>
          {!collapsed && (
            <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.01em', color: INK, whiteSpace: 'nowrap' }}>
              ContentCoach<span style={{ color: BLUE }}> AI</span>
            </span>
          )}
        </div>
        <button onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: FAINT, flexShrink: 0 }}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
            {collapsed ? <path d="M5 3l6 5-6 5"/> : <path d="M11 3L5 8l6 5"/>}
          </svg>
        </button>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {NAV_ITEMS.map(n => {
          const active = n.key === activeKey
          return (
            <button key={n.key} onClick={() => navigate(n.path)} className="cc-press" title={collapsed ? n.label : undefined}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 12, padding: collapsed ? '10px' : '10px 12px',
                borderRadius: 11, border: 'none', cursor: 'pointer',
                fontSize: 14, fontFamily: FONT, textAlign: 'left', width: '100%',
                background: active ? '#EAF0FF' : 'transparent',
                color: active ? BLUE : BODY,
                fontWeight: active ? 600 : 400,
                transition: 'background .15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#EAF0FF' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
              <span style={{ color: active ? BLUE : MUTED, display: 'flex', flexShrink: 0 }}>{n.icon}</span>
              {!collapsed && n.label}
            </button>
          )
        })}
      </nav>

      <div style={{ marginTop: 'auto' }}>
        {!collapsed ? (
          <div onClick={onCalendarOpen} style={{ cursor: 'pointer', background: TINT, border: `1px solid ${BDR}`, borderRadius: 16, padding: 15, marginBottom: 4, transition: 'box-shadow .18s' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 14px -6px rgba(59,130,246,.22)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{month}</span>
              <svg viewBox="0 0 20 20" fill="none" stroke={BLUE} strokeWidth="1.6" width="15" height="15">
                <rect x="3" y="4" width="14" height="14" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/>
              </svg>
            </div>
            {calDates.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < 2 ? `1px solid ${BDR}` : 'none' }}>
                <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: d.bold ? 600 : 400, color: d.color, width: 18, flexShrink: 0 }}>{d.date}</span>
                <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                  {d.dots.map((c, j) => <span key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block' }} />)}
                </div>
                <span style={{ fontSize: 11.5, color: FAINT, fontFamily: MONO, whiteSpace: 'nowrap' }}>{d.posts} posts</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${BDR}`, marginTop: 8, paddingTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: BLUE, fontWeight: 600 }}>Open calendar</span>
              <svg viewBox="0 0 16 16" fill="none" stroke={BLUE} strokeWidth="1.8" width="12" height="12"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
            </div>
          </div>
        ) : (
          <button onClick={onCalendarOpen} title="Open calendar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', padding: '8px', width: '100%', color: MUTED, marginBottom: 4 }}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="17" height="17">
              <rect x="3" y="4" width="14" height="14" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/>
            </svg>
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: collapsed ? 0 : 11, padding: '14px 0 4px' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#3B82F6,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title={collapsed ? displayName : undefined}>
            <span style={{ fontFamily: SERIF, fontSize: 15, color: WHITE }}>{initial}</span>
          </div>
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                <div style={{ fontSize: 11.5, color: FAINT }}>Pro plan</div>
              </div>
              <button onClick={async () => { await logout(); navigate('/login') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }} title="Sign out">
                <svg viewBox="0 0 20 20" fill="none" stroke={FAINT} strokeWidth="1.6" width="15" height="15">
                  <circle cx="10" cy="5" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="10" cy="15" r="1.5"/>
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
