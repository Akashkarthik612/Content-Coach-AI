import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Home, FolderOpen, PenSquare, Archive, Menu, Send, ChevronRight } from 'lucide-react'
import { getFolders, getPostsInFolder } from '../api/vault'

// ─── Mini Calendar ────────────────────────────────────────────────────────────
function MiniCalendar() {
  const now      = new Date()
  const year     = now.getFullYear()
  const month    = now.getMonth()
  const today    = now.getDate()
  const monthName = now.toLocaleString('default', { month: 'long' })
  const firstDay  = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = ['S','M','T','W','T','F','S']
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(i)

  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--cc-text)', textAlign: 'center', marginBottom: 8 }}>
        {monthName} {year}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {days.map((d, i) => (
          <div key={i} style={{ fontSize: 11, color: 'var(--cc-text-faint)', textAlign: 'center', padding: '2px 0' }}>{d}</div>
        ))}
        {cells.map((day, i) => (
          <div key={i} style={{
            fontSize: 12, textAlign: 'center', padding: '3px 0', borderRadius: 6,
            background: day === today ? 'var(--cc-blue)' : 'none',
            color: day === today ? 'white' : day ? 'var(--cc-text)' : 'transparent',
            fontWeight: day === today ? 600 : 400,
          }}>
            {day || ''}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const username  = localStorage.getItem('username') || 'there'

  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768)
  const [aiInput,     setAiInput]     = useState('')
  const [recentPosts, setRecentPosts] = useState([])
  const [folders,     setFolders]     = useState([])
  const [loading,     setLoading]     = useState(true)

  const gridCols = window.innerWidth < 640 ? '1fr' : 'repeat(auto-fit, minmax(280px,1fr))'

  useEffect(() => {
    const load = async () => {
      try {
        const folderList = await getFolders()
        setFolders(folderList)
        // fetch posts from all folders in parallel
        const postArrays = await Promise.all(
          folderList.map(f => getPostsInFolder(f.id).catch(() => []))
        )
        const all = postArrays.flat().sort(
          (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
        )
        setRecentPosts(all)
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Sidebar ────────────────────────────────────────────────────────────────
  const NAV = [
    { section: 'PLAN',   items: [
      { label: 'Home',    icon: <Home size={15} />,       path: '/dashboard' },
      { label: 'My Work', icon: <FolderOpen size={15} />, path: '/my-work'   },
    ]},
    { section: 'CREATE', items: [
      { label: 'New Post', icon: <PenSquare size={15} />, path: '/my-work'  },
      { label: 'Folders',  icon: <FolderOpen size={15} />, path: '/my-work' },
    ]},
    { section: 'STORE',  items: [
      { label: 'Context Vault', icon: <Archive size={15} />, path: '/my-work' },
    ]},
  ]

  const Sidebar = (
    <aside style={{
      width: sidebarOpen ? 220 : 0,
      minWidth: sidebarOpen ? 220 : 0,
      overflow: 'hidden',
      transition: 'width 0.25s ease, min-width 0.25s ease',
      background: 'white',
      borderRight: '1px solid var(--cc-border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      flexShrink: 0,
    }}>
      <div style={{ width: 220, display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 0' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, background: 'var(--cc-blue)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1" fill="white"/>
              <rect x="9" y="1" width="6" height="6" rx="1" fill="white" opacity="0.7"/>
              <rect x="1" y="9" width="6" height="6" rx="1" fill="white" opacity="0.7"/>
              <rect x="9" y="9" width="6" height="6" rx="1" fill="white" opacity="0.4"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--cc-blue)' }}>Content Coach</span>
        </div>

        {/* Search */}
        <div style={{ padding: '0 12px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--cc-bg-soft)', border: '1px solid var(--cc-border)', borderRadius: 8, padding: '7px 12px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--cc-text-faint)" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <span style={{ fontSize: 13, color: 'var(--cc-text-faint)' }}>Search</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--cc-text-faint)', background: 'var(--cc-border)', borderRadius: 4, padding: '1px 5px' }}>⌘K</span>
          </div>
        </div>

        {/* Nav sections */}
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--cc-text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 16px', marginBottom: 4, marginTop: 8 }}>
              {section}
            </p>
            {items.map(item => {
              const active = location.pathname === item.path
              return (
                <button key={item.label} onClick={() => navigate(item.path)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 16px', width: '100%',
                    background: active ? 'var(--cc-bg-subtle)' : 'none',
                    border: 'none', borderRadius: 0,
                    color: active ? 'var(--cc-blue)' : 'var(--cc-text-muted)',
                    fontSize: 14, fontWeight: active ? 600 : 400,
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--cc-bg-soft)' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none' }}>
                  {item.icon}
                  {item.label}
                </button>
              )
            })}
          </div>
        ))}

        {/* User footer */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--cc-border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--cc-blue)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            {username.charAt(0).toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--cc-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{username}</p>
            <p style={{ fontSize: 11, color: 'var(--cc-text-faint)', margin: 0 }}>Individual</p>
          </div>
        </div>
      </div>
    </aside>
  )

  // ── Recent posts helpers ───────────────────────────────────────────────────
  const drafts      = recentPosts.filter(p => p.status === 'draft')
  const pinnedPosts = recentPosts.filter(p => p.is_pinned)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {Sidebar}

      <main style={{ flex: 1, overflow: 'auto', background: 'var(--cc-bg-soft)', position: 'relative', paddingBottom: 80 }}>

        {/* Top bar — hamburger */}
        <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setSidebarOpen(o => !o)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cc-text-muted)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
            <Menu size={20} />
          </button>
        </div>

        {/* Greeting */}
        <div style={{ textAlign: 'center', padding: '8px 24px 32px' }}>
          <h1 style={{ fontSize: 'clamp(22px,3vw,32px)', fontWeight: 700, color: 'var(--cc-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: 0 }}>
            <div style={{ width: 32, height: 32, background: 'var(--cc-blue)', borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="6" height="6" rx="1" fill="white"/>
                <rect x="9" y="1" width="6" height="6" rx="1" fill="white" opacity="0.7"/>
                <rect x="1" y="9" width="6" height="6" rx="1" fill="white" opacity="0.7"/>
                <rect x="9" y="9" width="6" height="6" rx="1" fill="white" opacity="0.4"/>
              </svg>
            </div>
            What are you planning today, {username}?
          </h1>
        </div>

        {/* TOP ROW — schedule + pinned chats */}
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 16, padding: '0 24px', marginBottom: 16 }}>

          {/* Content schedule */}
          <div style={{ background: 'white', border: '1px solid var(--cc-border)', borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cc-text-muted)" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cc-text)' }}>Content schedule</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--cc-blue)', cursor: 'pointer' }}>View all ›</span>
            </div>
            <MiniCalendar />
            <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--cc-text-faint)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 8px', display: 'block' }}>
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <p style={{ fontSize: 13, margin: 0 }}>No scheduled posts</p>
            </div>
          </div>

          {/* Pinned posts */}
          <div style={{ background: 'white', border: '1px solid var(--cc-border)', borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cc-text-muted)" strokeWidth="2">
                  <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/>
                </svg>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cc-text)' }}>Pinned posts</span>
              </div>
              <span onClick={() => navigate('/my-work')} style={{ fontSize: 12, color: 'var(--cc-blue)', cursor: 'pointer' }}>View all ›</span>
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading…</div>
            ) : pinnedPosts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--cc-text-faint)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 8px', display: 'block' }}>
                  <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/>
                </svg>
                <p style={{ fontSize: 13, margin: 0 }}>No pinned posts</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pinnedPosts.slice(0, 4).map(post => (
                  <div key={post.id} onClick={() => navigate('/my-work')}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--cc-bg-soft)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <div style={{ width: 32, height: 32, background: 'var(--cc-blue-light)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cc-blue)" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--cc-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--cc-text-faint)', margin: 0 }}>
                        {post.status} · v{post.current_version} · {new Date(post.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <ChevronRight size={14} color="var(--cc-text-faint)" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM ROW — my posts + recent drafts */}
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 16, padding: '0 24px', marginBottom: 16 }}>

          {/* My posts */}
          <div style={{ background: 'white', border: '1px solid var(--cc-border)', borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cc-text)' }}>My posts</span>
              <span onClick={() => navigate('/my-work')} style={{ fontSize: 12, color: 'var(--cc-blue)', cursor: 'pointer' }}>View all ›</span>
            </div>

            <button onClick={() => navigate('/my-work')}
              style={{ width: '100%', background: 'var(--cc-blue)', color: 'white', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16, transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--cc-blue-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--cc-blue)'}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Create New Post
            </button>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading...</div>
            ) : recentPosts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>No posts yet. Start writing!</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentPosts.slice(0, 4).map(post => (
                  <div key={post.id} onClick={() => navigate('/app')}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--cc-bg-soft)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <div style={{ width: 32, height: 32, background: 'var(--cc-blue-light)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cc-blue)" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--cc-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--cc-text-faint)', margin: 0 }}>
                        {post.status} · v{post.current_version} · {new Date(post.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <ChevronRight size={14} color="var(--cc-text-faint)" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent drafts */}
          <div style={{ background: 'white', border: '1px solid var(--cc-border)', borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cc-text-muted)" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cc-text)' }}>Recent drafts</span>
              </div>
              <span onClick={() => navigate('/my-work')} style={{ fontSize: 12, color: 'var(--cc-blue)', cursor: 'pointer' }}>View all ›</span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading...</div>
            ) : drafts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--cc-text-faint)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 8px', display: 'block' }}>
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <p style={{ fontSize: 13, margin: 0 }}>No drafts yet</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {drafts.slice(0, 4).map(post => (
                  <div key={post.id} onClick={() => navigate('/app')}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--cc-bg-soft)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--cc-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--cc-text-faint)', margin: 0 }}>{new Date(post.updated_at).toLocaleDateString()}</p>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 500, background: 'var(--cc-bg-subtle)', color: 'var(--cc-blue)', padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>draft</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fixed AI bar */}
        <div style={{
          position: 'fixed', bottom: 0,
          left: sidebarOpen ? 220 : 0,
          right: 0,
          padding: '12px 24px 16px',
          background: 'linear-gradient(to top, var(--cc-bg-soft) 70%, transparent)',
          transition: 'left 0.25s ease',
          zIndex: 10,
        }}>
          <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10, background: 'white', border: '1px solid var(--cc-border)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 2px 12px rgba(37,99,235,0.08)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cc-text-faint)" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            <input
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              placeholder="Ask your AI assistant anything about your posts..."
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: 'var(--cc-text)', background: 'transparent', fontFamily: "'DM Sans', system-ui, sans-serif" }}
              onKeyDown={e => {
                if (e.key === 'Enter' && aiInput.trim()) {
                  setAiInput('')
                }
              }}
            />
            <button
              style={{ background: aiInput.trim() ? 'var(--cc-blue)' : 'var(--cc-border)', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: aiInput.trim() ? 'pointer' : 'default', transition: 'background 0.15s', flexShrink: 0 }}>
              <Send size={13} color="white" />
            </button>
          </div>
        </div>

      </main>
    </div>
  )
}
