import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Home, FolderOpen, PenSquare, Archive, Menu, Plus, ChevronRight,
  Folder, MoreHorizontal, Pin, PanelLeftClose, PanelLeftOpen, ArrowLeft,
} from 'lucide-react'
import {
  getFolders, createFolder, getPostsInFolder,
  renameFolder, deleteFolder, renamePost, deletePost, pinPost,
  createPost, saveVersion, getVersions, getVersion,
} from '../api/vault'

// ── Shared style helpers ───────────────────────────────────────────────────────
const S = {
  sidebarItem: (active) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 16px', width: '100%',
    background: active ? 'var(--cc-bg-subtle)' : 'none',
    border: 'none', borderRadius: 0,
    color: active ? 'var(--cc-blue)' : 'var(--cc-text-muted)',
    fontSize: 14, fontWeight: active ? 600 : 400,
    cursor: 'pointer', textAlign: 'left',
    transition: 'background 0.15s, color 0.15s',
  }),
  iconBtn: (extra = {}) => ({
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '4px 5px', borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--cc-text-muted)', transition: 'background 0.12s, color 0.12s',
    ...extra,
  }),
}

// ── Context menu ───────────────────────────────────────────────────────────────
function CtxMenu({ items }) {
  return (
    <div style={{
      position: 'absolute', right: 4, top: '100%', zIndex: 100,
      background: 'white', border: '1px solid var(--cc-border)', borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.10)', padding: '4px 0', minWidth: 148,
    }}>
      {items.map(item => (
        <button key={item.label} onClick={item.action}
          style={{
            display: 'block', width: '100%', padding: '8px 14px',
            background: 'none', border: 'none', cursor: 'pointer',
            textAlign: 'left', fontSize: 13,
            color: item.danger ? 'var(--cc-red-text)' : 'var(--cc-text)',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
          onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'var(--cc-red-light)' : 'var(--cc-bg-soft)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          {item.label}
        </button>
      ))}
    </div>
  )
}

// ── Doc Editor (Column 3 canvas when a post is active) ─────────────────────────
function DocEditor({ post, panelsCollapsed, onTogglePanels, onClose, onTitleChange }) {
  const [title,          setTitle]          = useState(post.title)
  const [content,        setContent]        = useState('')
  const [versionLabel,   setVersionLabel]   = useState('')
  const [saving,         setSaving]         = useState(false)
  const [versions,       setVersions]       = useState([])
  const [activeIdx,      setActiveIdx]      = useState(-1)
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    setTitle(post.title)
    loadVersions()
  }, [post.id])

  async function loadVersions(forceIdx) {
    setLoading(true)
    try {
      const list = await getVersions(post.id)
      setVersions(list)
      if (list.length > 0) {
        const targetIdx = forceIdx !== undefined
          ? Math.min(forceIdx, list.length - 1)
          : list.length - 1
        setActiveIdx(targetIdx)
        const v = await getVersion(list[targetIdx].id)
        setContent(v.content)
      } else {
        setActiveIdx(-1)
        setContent('')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleVersionSelect(idx) {
    setActiveIdx(idx)
    const v = await getVersion(versions[idx].id)
    setContent(v.content)
  }

  async function handleSaveVersion() {
    if (!content.trim() || saving) return
    setSaving(true)
    try {
      await saveVersion(post.id, content, versionLabel.trim() || null)
      setVersionLabel('')
      await loadVersions()
    } finally {
      setSaving(false)
    }
  }

  async function handleTitleBlur() {
    const trimmed = title.trim() || 'Untitled Post'
    if (trimmed !== post.title) {
      await renamePost(post.id, trimmed)
      onTitleChange(post.id, trimmed)
      setTitle(trimmed)
    }
  }

  const isLatest   = versions.length === 0 || activeIdx === versions.length - 1
  const isReadOnly = versions.length > 0 && !isLatest

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white', overflow: 'hidden', height: '100%' }}>

      {/* ── Editor top bar ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', borderBottom: '1px solid var(--cc-border)',
        background: 'white', flexShrink: 0,
      }}>
        {/* Expand panels — only when both are collapsed */}
        {panelsCollapsed && (
          <button
            onClick={onTogglePanels}
            style={S.iconBtn()}
            title="Show panels"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--cc-bg-subtle)'; e.currentTarget.style.color = 'var(--cc-blue)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--cc-text-muted)' }}>
            <PanelLeftOpen size={18} />
          </button>
        )}

        {/* Back to list */}
        <button
          onClick={onClose}
          style={{ ...S.iconBtn(), gap: 5, fontSize: 13, color: 'var(--cc-text-muted)', padding: '5px 8px' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--cc-bg-subtle)'; e.currentTarget.style.color = 'var(--cc-text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--cc-text-muted)' }}>
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ flex: 1 }} />

        {/* Status chip */}
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
          background: post.status === 'draft' ? 'var(--cc-bg-subtle)' : 'var(--cc-green-light)',
          color: post.status === 'draft' ? 'var(--cc-blue)' : 'var(--cc-green-text)',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          {post.status}
        </span>

        {/* Collapse panels */}
        {!panelsCollapsed && (
          <button
            onClick={onTogglePanels}
            style={S.iconBtn()}
            title="Focus mode"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--cc-bg-subtle)'; e.currentTarget.style.color = 'var(--cc-blue)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--cc-text-muted)' }}>
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {/* ── Version pill bar ────────────────────────────────────────────────── */}
      {versions.length > 0 && (
        <div style={{
          display: 'flex', gap: 4, padding: '8px 24px',
          borderBottom: '1px solid var(--cc-border)',
          background: 'var(--cc-bg-soft)', flexShrink: 0, overflowX: 'auto',
          alignItems: 'center',
        }}>
          {versions.map((v, i) => {
            const isActive = activeIdx === i
            const isLast   = i === versions.length - 1
            return (
              <button key={v.id}
                onClick={() => handleVersionSelect(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', border: 'none', borderRadius: 20,
                  background: isActive ? 'var(--cc-blue)' : 'var(--cc-bg-subtle)',
                  color: isActive ? 'white' : 'var(--cc-text-muted)',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  fontFamily: "'IBM Plex Mono', monospace",
                  whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s',
                }}>
                v{v.version_number}
                {v.version_label && (
                  <span style={{ fontSize: 11, opacity: 0.8, fontFamily: "'DM Sans', system-ui" }}>
                    {v.version_label.length > 14 ? v.version_label.slice(0, 14) + '…' : v.version_label}
                  </span>
                )}
                {isLast && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? 'rgba(255,255,255,0.7)' : 'var(--cc-blue)', display: 'inline-block' }} />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Document area ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '0 0 24px' }}>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cc-text-faint)', fontSize: 14 }}>
            Loading…
          </div>
        ) : (
          <>
            {/* Centered title input */}
            <div style={{ padding: '36px 10% 20px', display: 'flex', justifyContent: 'center' }}>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                placeholder="e.g., My First LinkedIn Post"
                style={{
                  width: '100%', maxWidth: 640,
                  fontSize: 22, fontWeight: 700, textAlign: 'center',
                  border: 'none', outline: 'none', background: 'transparent',
                  color: 'var(--cc-text)',
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  borderBottom: '2px solid transparent',
                  paddingBottom: 6, transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.target.style.borderBottomColor = 'var(--cc-border)' }}
                onBlurCapture={e => { e.target.style.borderBottomColor = 'transparent' }}
              />
            </div>

            {/* Read-only banner */}
            {isReadOnly && (
              <div style={{ margin: '0 10%', marginBottom: 12, padding: '8px 14px', background: 'var(--cc-bg-subtle)', borderRadius: 8, fontSize: 12, color: 'var(--cc-text-muted)', textAlign: 'center' }}>
                Viewing v{versions[activeIdx]?.version_number} — read-only. Switch to the latest version to edit.
              </div>
            )}

            {/* Wide textarea */}
            <div style={{ padding: '0 10%', flex: 1 }}>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                readOnly={isReadOnly}
                placeholder="Start writing your post here…"
                style={{
                  width: '100%', minHeight: 320,
                  border: 'none', outline: 'none', resize: 'none',
                  fontSize: 15, lineHeight: 1.85,
                  color: isReadOnly ? 'var(--cc-text-muted)' : 'var(--cc-text)',
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  background: 'transparent',
                  display: 'block',
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Bottom save toolbar ─────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, borderTop: '1px solid var(--cc-border)',
        padding: '12px 24px', display: 'flex', gap: 10, alignItems: 'center',
        background: 'white',
      }}>
        <input
          value={versionLabel}
          onChange={e => setVersionLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSaveVersion() }}
          placeholder="Description for this version (optional)"
          style={{
            flex: 1, border: '1px solid var(--cc-border)', borderRadius: 8,
            padding: '9px 14px', fontSize: 13, outline: 'none',
            color: 'var(--cc-text)', fontFamily: "'DM Sans', system-ui, sans-serif",
            transition: 'border-color 0.15s',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--cc-blue)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--cc-border)' }}
        />
        <button
          onClick={handleSaveVersion}
          disabled={!content.trim() || saving || isReadOnly}
          style={{
            background: content.trim() && !isReadOnly ? 'var(--cc-blue)' : 'var(--cc-border)',
            color: content.trim() && !isReadOnly ? 'white' : 'var(--cc-text-faint)',
            border: 'none', borderRadius: 8, padding: '9px 18px',
            fontSize: 13, fontWeight: 600, cursor: content.trim() && !isReadOnly ? 'pointer' : 'default',
            whiteSpace: 'nowrap', transition: 'background 0.15s',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
          onMouseEnter={e => { if (!saving && content.trim() && !isReadOnly) e.currentTarget.style.background = 'var(--cc-blue-hover)' }}
          onMouseLeave={e => { if (!saving && content.trim() && !isReadOnly) e.currentTarget.style.background = 'var(--cc-blue)' }}>
          {saving ? 'Saving…' : `Save as v${versions.length + 1}`}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyWorkPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const username  = localStorage.getItem('username') || 'there'

  // ── Column visibility ──────────────────────────────────────────────────────
  const [sidebarOpen,     setSidebarOpen]     = useState(window.innerWidth >= 768)
  const [folderPanelOpen, setFolderPanelOpen] = useState(true)

  // ── Folder / post data ─────────────────────────────────────────────────────
  const [folders,         setFolders]         = useState([])
  const [selectedFolder,  setSelectedFolder]  = useState(null)
  const [posts,           setPosts]           = useState([])
  const [loadingFolders,  setLoadingFolders]  = useState(true)
  const [loadingPosts,    setLoadingPosts]    = useState(false)
  const [creatingFolder,  setCreatingFolder]  = useState(false)
  const [newFolderName,   setNewFolderName]   = useState('')
  const [savingFolder,    setSavingFolder]    = useState(false)
  const [creatingPost,    setCreatingPost]    = useState(false)

  // ── Active post → drives Column 3 mode ────────────────────────────────────
  const [activePost, setActivePost] = useState(null)  // null = post list, obj = editor

  // ── Context-menu & inline-rename state ────────────────────────────────────
  const [activeMenu,     setActiveMenu]     = useState(null)
  const [renamingFolder, setRenamingFolder] = useState(null)
  const [renamingPost,   setRenamingPost]   = useState(null)

  const folderInputRef = useRef(null)
  const panelsCollapsed = !sidebarOpen && !folderPanelOpen

  useEffect(() => { loadFolders() }, [])
  useEffect(() => { if (creatingFolder) folderInputRef.current?.focus() }, [creatingFolder])

  async function loadFolders() {
    setLoadingFolders(true)
    try { setFolders(await getFolders()) }
    catch (err) { console.error('Failed to load folders:', err) }
    finally { setLoadingFolders(false) }
  }

  async function handleSelectFolder(folder) {
    setSelectedFolder(folder)
    setPosts([])
    setLoadingPosts(true)
    setActiveMenu(null)
    setActivePost(null)
    try {
      const list = await getPostsInFolder(folder.id)
      setPosts(list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)))
    } catch (err) { console.error('Failed to load posts:', err) }
    finally { setLoadingPosts(false) }
  }

  async function handleCreateFolder(e) {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    setSavingFolder(true)
    try {
      const folder = await createFolder(name, '')
      setFolders(prev => [folder, ...prev])
      setNewFolderName('')
      setCreatingFolder(false)
      handleSelectFolder(folder)
    } catch (err) { console.error('Failed to create folder:', err) }
    finally { setSavingFolder(false) }
  }

  async function handleCreatePost() {
    if (!selectedFolder || creatingPost) return
    setCreatingPost(true)
    try {
      const post = await createPost(selectedFolder.id, 'Untitled Post')
      setPosts(prev => [post, ...prev])
      setActivePost(post)
      setSidebarOpen(false)
      setFolderPanelOpen(false)
    } catch (err) { console.error('Create post failed:', err) }
    finally { setCreatingPost(false) }
  }

  function handleOpenPost(post) {
    setActivePost(post)
  }

  function handleEditorClose() {
    setActivePost(null)
    setFolderPanelOpen(true)
  }

  function handleEditorTogglePanels() {
    if (panelsCollapsed) {
      setSidebarOpen(true)
      setFolderPanelOpen(true)
    } else {
      setSidebarOpen(false)
      setFolderPanelOpen(false)
    }
  }

  function handleEditorTitleChange(id, title) {
    setActivePost(prev => ({ ...prev, title }))
    setPosts(prev => prev.map(p => p.id === id ? { ...p, title } : p))
  }

  // ── Folder context-menu actions ────────────────────────────────────────────
  async function handleRenameFolder(e) {
    e.preventDefault()
    const { id, name } = renamingFolder
    if (!name.trim()) return
    try {
      const updated = await renameFolder(id, name.trim())
      setFolders(prev => prev.map(f => f.id === id ? { ...f, name: updated.name } : f))
      if (selectedFolder?.id === id) setSelectedFolder(prev => ({ ...prev, name: updated.name }))
      setRenamingFolder(null)
    } catch (err) { console.error('Rename folder failed:', err) }
  }

  async function handleDeleteFolder(folderId) {
    if (!window.confirm('Delete this folder and all its posts?')) return
    try {
      await deleteFolder(folderId)
      setFolders(prev => prev.filter(f => f.id !== folderId))
      if (selectedFolder?.id === folderId) { setSelectedFolder(null); setPosts([]) }
      setActiveMenu(null)
    } catch (err) { console.error('Delete folder failed:', err) }
  }

  // ── Post context-menu actions ──────────────────────────────────────────────
  async function handleRenamePost(e) {
    e.preventDefault()
    const { id, title } = renamingPost
    if (!title.trim()) return
    try {
      const updated = await renamePost(id, title.trim())
      setPosts(prev => prev.map(p => p.id === id ? { ...p, title: updated.title } : p))
      setRenamingPost(null)
    } catch (err) { console.error('Rename post failed:', err) }
  }

  async function handleDeletePost(postId) {
    if (!window.confirm('Delete this post and all its versions?')) return
    try {
      await deletePost(postId)
      setPosts(prev => prev.filter(p => p.id !== postId))
      if (activePost?.id === postId) setActivePost(null)
      setActiveMenu(null)
    } catch (err) { console.error('Delete post failed:', err) }
  }

  async function handlePinPost(postId, currentlyPinned) {
    try {
      const updated = await pinPost(postId, !currentlyPinned)
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_pinned: updated.is_pinned } : p))
      setActiveMenu(null)
    } catch (err) { console.error('Pin post failed:', err) }
  }

  // ── Sidebar nav ────────────────────────────────────────────────────────────
  const NAV = [
    { section: 'PLAN', items: [
      { label: 'Home',    icon: <Home size={15} />,       path: '/dashboard' },
      { label: 'My Work', icon: <FolderOpen size={15} />, path: '/my-work'   },
    ]},
    { section: 'CREATE', items: [
      { label: 'New Post', icon: <PenSquare size={15} />, path: '/my-work'   },
      { label: 'Folders',  icon: <Folder size={15} />,    path: '/my-work'   },
    ]},
    { section: 'STORE', items: [
      { label: 'Context Vault', icon: <Archive size={15} />, path: '/my-work' },
    ]},
  ]

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── COLUMN 1: Sidebar nav ──────────────────────────────────────────── */}
      <aside style={{
        width: sidebarOpen ? 220 : 0, minWidth: sidebarOpen ? 220 : 0,
        overflow: 'hidden', transition: 'width 0.25s ease-in-out, min-width 0.25s ease-in-out',
        background: 'white', borderRight: '1px solid var(--cc-border)',
        display: 'flex', flexDirection: 'column',
        height: '100vh', position: 'sticky', top: 0, flexShrink: 0,
      }}>
        <div style={{ width: 220, display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 0' }}>
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

          {NAV.map(({ section, items }) => (
            <div key={section}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--cc-text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 16px', marginBottom: 4, marginTop: 8 }}>
                {section}
              </p>
              {items.map(item => {
                const active = location.pathname === item.path
                return (
                  <button key={item.label} onClick={() => navigate(item.path)}
                    style={S.sidebarItem(active)}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--cc-bg-soft)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none' }}>
                    {item.icon} {item.label}
                  </button>
                )
              })}
            </div>
          ))}

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

      {/* ── COLUMN 2: Folder panel ─────────────────────────────────────────── */}
      <div style={{
        width: folderPanelOpen ? 280 : 0, minWidth: folderPanelOpen ? 280 : 0,
        overflow: 'hidden', transition: 'width 0.25s ease-in-out, min-width 0.25s ease-in-out',
        borderRight: '1px solid var(--cc-border)',
        display: 'flex', flexDirection: 'column',
        background: 'white', flexShrink: 0,
      }}>
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* Folder panel header */}
          <div style={{ padding: '13px 14px 10px', borderBottom: '1px solid var(--cc-border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: creatingFolder ? 10 : 0 }}>
              {/* Sidebar toggle */}
              <button onClick={() => setSidebarOpen(o => !o)}
                style={S.iconBtn()}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--cc-bg-subtle)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
                <Menu size={16} />
              </button>

              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
                Folders
              </span>

              <button onClick={() => setCreatingFolder(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', color: 'var(--cc-blue)', border: '1px solid var(--cc-blue-light)', borderRadius: 7, padding: '4px 9px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                <Plus size={12} /> New
              </button>

              {/* Collapse both panels */}
              <button
                onClick={() => { setSidebarOpen(false); setFolderPanelOpen(false) }}
                style={S.iconBtn()}
                title="Focus mode"
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--cc-bg-subtle)'; e.currentTarget.style.color = 'var(--cc-blue)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--cc-text-muted)' }}>
                <PanelLeftClose size={16} />
              </button>
            </div>

            {creatingFolder && (
              <form onSubmit={handleCreateFolder} style={{ display: 'flex', gap: 6 }}>
                <input
                  ref={folderInputRef}
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  style={{ flex: 1, border: '1px solid var(--cc-border)', borderRadius: 7, padding: '6px 10px', fontSize: 13, color: 'var(--cc-text)', outline: 'none', fontFamily: "'DM Sans', system-ui, sans-serif" }}
                  onFocus={e => { e.target.style.borderColor = 'var(--cc-blue)' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--cc-border)' }}
                  onKeyDown={e => { if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') } }}
                />
                <button type="submit" disabled={savingFolder || !newFolderName.trim()}
                  style={{ background: 'var(--cc-blue)', color: 'white', border: 'none', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: newFolderName.trim() ? 1 : 0.5 }}>
                  {savingFolder ? '…' : 'Add'}
                </button>
              </form>
            )}
          </div>

          {/* Folder list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            {loadingFolders ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading…</div>
            ) : folders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--cc-text-faint)' }}>
                <Folder size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
                <p style={{ fontSize: 13, margin: 0 }}>No folders yet</p>
                <p style={{ fontSize: 12, margin: '4px 0 0' }}>Click "New" to create one</p>
              </div>
            ) : (
              folders.map(folder => {
                const active = selectedFolder?.id === folder.id

                if (renamingFolder?.id === folder.id) {
                  return (
                    <form key={folder.id} onSubmit={handleRenameFolder} style={{ display: 'flex', gap: 6, padding: '6px 10px' }}>
                      <input
                        autoFocus
                        value={renamingFolder.name}
                        onChange={e => setRenamingFolder(prev => ({ ...prev, name: e.target.value }))}
                        style={{ flex: 1, border: '1px solid var(--cc-blue)', borderRadius: 6, padding: '5px 8px', fontSize: 13, outline: 'none', fontFamily: "'DM Sans', system-ui, sans-serif" }}
                        onKeyDown={e => { if (e.key === 'Escape') setRenamingFolder(null) }}
                      />
                      <button type="submit" style={{ background: 'var(--cc-blue)', color: 'white', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>Save</button>
                    </form>
                  )
                }

                return (
                  <div key={folder.id} style={{ position: 'relative' }}>
                    <div
                      onClick={() => handleSelectFolder(folder)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        padding: '9px 14px',
                        background: active ? 'var(--cc-bg-subtle)' : 'none',
                        borderLeft: active ? '3px solid var(--cc-blue)' : '3px solid transparent',
                        color: active ? 'var(--cc-blue)' : 'var(--cc-text)',
                        fontSize: 13, fontWeight: active ? 600 : 400,
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--cc-bg-soft)' }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none' }}>
                      <Folder size={14} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{folder.name}</span>
                      {active && <ChevronRight size={13} style={{ flexShrink: 0 }} />}
                      <button
                        onClick={e => { e.stopPropagation(); setActiveMenu(m => m?.id === folder.id ? null : { type: 'folder', id: folder.id }) }}
                        style={{ ...S.iconBtn(), padding: '2px 3px' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--cc-border)'; e.stopPropagation() }}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <MoreHorizontal size={13} />
                      </button>
                    </div>

                    {activeMenu?.type === 'folder' && activeMenu?.id === folder.id && (
                      <CtxMenu items={[
                        { label: 'Rename', action: () => { setRenamingFolder({ id: folder.id, name: folder.name }); setActiveMenu(null) } },
                        { label: 'Delete', danger: true, action: () => handleDeleteFolder(folder.id) },
                      ]} />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Context-menu backdrop ──────────────────────────────────────────── */}
      {activeMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setActiveMenu(null)} />
      )}

      {/* ── COLUMN 3: Canvas ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--cc-bg-soft)', minWidth: 0 }}>

        {activePost ? (
          <DocEditor
            post={activePost}
            panelsCollapsed={panelsCollapsed}
            onTogglePanels={handleEditorTogglePanels}
            onClose={handleEditorClose}
            onTitleChange={handleEditorTitleChange}
          />
        ) : (
          <>
            {/* Post list top bar */}
            <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--cc-border)', background: 'white', flexShrink: 0 }}>
              {/* Restore panels button when folder panel is hidden */}
              {!folderPanelOpen && (
                <button
                  onClick={() => { setSidebarOpen(true); setFolderPanelOpen(true) }}
                  style={S.iconBtn()}
                  title="Show panels"
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--cc-bg-subtle)'; e.currentTarget.style.color = 'var(--cc-blue)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--cc-text-muted)' }}>
                  <PanelLeftOpen size={18} />
                </button>
              )}
              <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cc-text)', margin: 0, flex: 1 }}>
                {selectedFolder ? selectedFolder.name : 'My Work'}
              </h1>
              {selectedFolder && (
                <button
                  onClick={handleCreatePost}
                  disabled={creatingPost}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cc-blue)', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: creatingPost ? 'default' : 'pointer', transition: 'background 0.15s', opacity: creatingPost ? 0.7 : 1 }}
                  onMouseEnter={e => { if (!creatingPost) e.currentTarget.style.background = 'var(--cc-blue-hover)' }}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--cc-blue)'}>
                  <Plus size={14} /> {creatingPost ? 'Creating…' : 'Create Post'}
                </button>
              )}
            </div>

            {/* Post list body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {!selectedFolder ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--cc-text-faint)' }}>
                  <FolderOpen size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                  <p style={{ fontSize: 14, margin: 0 }}>Select a folder to see its posts</p>
                </div>
              ) : loadingPosts ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading posts…</div>
              ) : posts.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--cc-text-faint)', padding: 24 }}>
                  <PenSquare size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
                  <p style={{ fontSize: 14, margin: 0, fontWeight: 500 }}>No posts in this folder</p>
                  <p style={{ fontSize: 13, margin: '4px 0 16px' }}>Create your first post to get started</p>
                  <button onClick={handleCreatePost} disabled={creatingPost}
                    style={{ background: 'var(--cc-blue)', color: 'white', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    {creatingPost ? 'Creating…' : 'Create Post'}
                  </button>
                </div>
              ) : (
                <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {posts.map(post => {
                    if (renamingPost?.id === post.id) {
                      return (
                        <form key={post.id} onSubmit={handleRenamePost} style={{ display: 'flex', gap: 6, padding: '8px 0' }}>
                          <input
                            autoFocus
                            value={renamingPost.title}
                            onChange={e => setRenamingPost(prev => ({ ...prev, title: e.target.value }))}
                            style={{ flex: 1, border: '1px solid var(--cc-blue)', borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: "'DM Sans', system-ui, sans-serif" }}
                            onKeyDown={e => { if (e.key === 'Escape') setRenamingPost(null) }}
                          />
                          <button type="submit" style={{ background: 'var(--cc-blue)', color: 'white', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>Save</button>
                          <button type="button" onClick={() => setRenamingPost(null)} style={{ background: 'none', border: '1px solid var(--cc-border)', borderRadius: 6, padding: '7px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--cc-text-muted)' }}>Cancel</button>
                        </form>
                      )
                    }

                    return (
                      <div key={post.id} style={{ position: 'relative' }}>
                        <div
                          onClick={() => handleOpenPost(post)}
                          style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 14px', background: 'white', border: '1px solid var(--cc-border)', borderRadius: 10, cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#BFDBFE'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,99,235,0.08)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cc-border)'; e.currentTarget.style.boxShadow = 'none' }}>

                          <div style={{ width: 34, height: 34, background: 'var(--cc-blue-light)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cc-blue)" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            </svg>
                          </div>

                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--cc-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {post.title}
                              </p>
                              {post.is_pinned && <Pin size={11} color="var(--cc-blue)" style={{ flexShrink: 0 }} />}
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--cc-text-faint)', margin: '2px 0 0', fontFamily: "'IBM Plex Mono', monospace" }}>
                              v{post.current_version} · {post.status} · {new Date(post.updated_at).toLocaleDateString()}
                            </p>
                          </div>

                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, flexShrink: 0,
                            background: post.status === 'draft' ? 'var(--cc-bg-subtle)' : 'var(--cc-green-light)',
                            color: post.status === 'draft' ? 'var(--cc-blue)' : 'var(--cc-green-text)',
                          }}>
                            {post.status}
                          </span>

                          <button
                            onClick={e => { e.stopPropagation(); setActiveMenu(m => m?.id === post.id ? null : { type: 'post', id: post.id }) }}
                            style={{ ...S.iconBtn(), padding: '4px', zIndex: 1 }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--cc-bg-subtle)'; e.stopPropagation() }}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <MoreHorizontal size={15} />
                          </button>
                        </div>

                        {activeMenu?.type === 'post' && activeMenu?.id === post.id && (
                          <CtxMenu items={[
                            { label: 'Rename',                    action: () => { setRenamingPost({ id: post.id, title: post.title }); setActiveMenu(null) } },
                            { label: post.is_pinned ? 'Unpin' : 'Pin to dashboard', action: () => handlePinPost(post.id, post.is_pinned) },
                            { label: 'Delete', danger: true,      action: () => handleDeletePost(post.id) },
                          ]} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
