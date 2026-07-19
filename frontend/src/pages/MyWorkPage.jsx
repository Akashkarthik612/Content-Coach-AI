import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Plus, ChevronRight, ChevronDown,
  Folder, PanelLeftClose, PanelLeftOpen, ArrowLeft, ArrowUpRight, Upload,
  Clock, Hash, Search, PenLine, Check, Share2,
  Heading1, Heading2, Heading3, Bold, Italic, Quote, Link2, X, Settings,
  BarChart2,
} from 'lucide-react'
import {
  renamePost, deletePost, pinPost,
  renameFolder, deleteFolder,
  saveVersion, getVersions, getVersion,
  renameVersion, deleteVersion, updatePostAnalytics, getRecentPosts,
  updatePostStatus,
} from '../api/vault'
import { sendToReview, publishPost } from '../api/publishing'
import { getLinkedInStatus, getLinkedInAuthUrl } from '../api/linkedin'
import { ContextMenu } from '../components/shared/ContextMenu'
import { useResizableRail } from '../hooks/useResizableRail'
import { useVault, FOLDER_TINTS } from '../hooks/useVault'
import { useReviewQueue } from '../context/ReviewQueueContext'
import { AppSidebar } from '../components/shared/AppSidebar'

// ── Dashboard-matching design tokens (mirrors DashboardPage.jsx §A) ────────────
const INK    = '#111827'
const MUTED  = '#6B7280'
const FAINT  = '#9CA3AF'
const BLUE   = '#3B82F6'
const INDIGO = '#6366F1'
const VIOLET = '#8B5CF6'
const GREEN_D  = '#16A34A'
const AMBER    = '#F59E0B'
const AMBER_D  = '#B45309'
const WHITE  = '#FFFFFF'
const TINT   = '#F7FAFF'
const BDR    = 'rgba(17,24,39,0.08)'

const FONT  = "'Hanken Grotesk','DM Sans',system-ui,sans-serif"
const SERIF = "'Newsreader',Georgia,serif"
const MONO  = "'JetBrains Mono','Fira Code',monospace"

const PLATFORMS = {
  linkedin: { label: 'LinkedIn', bg: '#0A66C2' },
  x:        { label: 'X',        bg: '#111827' },
  reddit:   { label: 'Reddit',   bg: '#FF4500' },
}

// §A2 — platform-aware metric field definitions (extensible: add an entry, no layout changes needed)
const PLATFORM_METRICS = {
  linkedin:   ['Impressions', 'Likes', 'Comments'],
  x:          ['Likes', 'Comments'],
  reddit:     ['Upvotes', 'Comments'],
  blog:       ['Views', 'Likes', 'Comments'],
  newsletter: ['Opens', 'Clicks'],
}
const DEFAULT_METRICS_FIELDS = ['Likes', 'Comments']

const PLATFORM_DISPLAY = {
  ...PLATFORMS,
  blog:       { label: 'Blog',       bg: '#059669' },
  newsletter: { label: 'Newsletter', bg: '#7C3AED' },
}

const STATUS_STYLE = {
  draft:     { label: 'Draft',     bg: '#EEF2F7', color: '#6B7280', dot: '#9CA3AF' },
  in_review: { label: 'In review', bg: '#FEF3C7', color: AMBER_D, dot: AMBER },
  scheduled: { label: 'Scheduled', bg: '#DBEAFE', color: BLUE,    dot: BLUE },
  published: { label: 'Published', bg: '#DCFCE7', color: GREEN_D, dot: GREEN_D },
}

const LINKEDIN_MAX_CHARS = 3000
const LINKEDIN_CUT_CHARS = 210

// ── Markdown insertion helper (textarea selection → wrapped/prefixed syntax) ───
function applyMarkdown(textarea, content, setContent, kind) {
  const start = textarea.selectionStart
  const end   = textarea.selectionEnd
  const sel   = content.slice(start, end)

  let result, cursorStart, cursorEnd
  if (kind === 'h1' || kind === 'h2' || kind === 'h3') {
    const prefix = kind === 'h1' ? '# ' : kind === 'h2' ? '## ' : '### '
    const lineStart = content.lastIndexOf('\n', start - 1) + 1
    result = content.slice(0, lineStart) + prefix + content.slice(lineStart)
    cursorStart = cursorEnd = start + prefix.length
  } else if (kind === 'bold') {
    result = content.slice(0, start) + `**${sel || 'bold text'}**` + content.slice(end)
    cursorStart = start + 2
    cursorEnd   = cursorStart + (sel || 'bold text').length
  } else if (kind === 'italic') {
    result = content.slice(0, start) + `*${sel || 'italic text'}*` + content.slice(end)
    cursorStart = start + 1
    cursorEnd   = cursorStart + (sel || 'italic text').length
  } else if (kind === 'quote') {
    const lineStart = content.lastIndexOf('\n', start - 1) + 1
    result = content.slice(0, lineStart) + '> ' + content.slice(lineStart)
    cursorStart = cursorEnd = start + 2
  } else if (kind === 'link') {
    const label = sel || 'link text'
    result = content.slice(0, start) + `[${label}](url)` + content.slice(end)
    cursorStart = start + label.length + 3
    cursorEnd   = cursorStart + 3
  } else {
    return
  }

  setContent(result)
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(cursorStart, cursorEnd)
  })
}

// ── Formatting toolbar (sticky, above the writing surface) ───────────────────
function FormattingToolbar({ textareaRef, content, onContent, disabled }) {
  const items = [
    { kind: 'h1',     Icon: Heading1, title: 'Heading 1' },
    { kind: 'h2',     Icon: Heading2, title: 'Heading 2' },
    { kind: 'h3',     Icon: Heading3, title: 'Heading 3' },
    { kind: 'bold',   Icon: Bold,     title: 'Bold' },
    { kind: 'italic', Icon: Italic,   title: 'Italic' },
    { kind: 'quote',  Icon: Quote,    title: 'Quote' },
    { kind: 'link',   Icon: Link2,    title: 'Link' },
  ]
  return (
    <div style={{ display: 'flex', gap: 2, padding: '8px 24px', borderBottom: `1px solid ${BDR}`, flexShrink: 0 }}>
      {items.map(({ kind, Icon, title }) => (
        <button key={kind} title={title} disabled={disabled} className="cc-press"
          onClick={() => textareaRef.current && applyMarkdown(textareaRef.current, content, onContent, kind)}
          style={{ background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 7, borderRadius: 7, color: disabled ? FAINT : MUTED, display: 'flex', opacity: disabled ? 0.5 : 1 }}
          onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = TINT }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
          <Icon size={15} />
        </button>
      ))}
    </div>
  )
}

function relativeVersionLabel(createdAt, isLatest) {
  if (isLatest) return 'Working draft'
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const hrs  = diffMs / 36e5
  if (hrs < 24) return `${Math.max(1, Math.round(hrs))}h ago`
  if (hrs < 48) return 'Yesterday'
  if (hrs < 24 * 7) return 'This week'
  return 'Last week'
}

// ── Left rail: History (§A.1 + image mockup — vertical version cards) ───────────
function HistoryRail({ width, isDragging, onStartDrag, versions, activeIdx, onSelect, nextVersionNumber, onSave, onSaveFinal, saving, canSave, diffMode, onToggleDiff, menuFor, onOpenMenu, onCloseMenu, onRenameVersion, onDeleteVersion, collapsed, onToggleCollapse }) {
  if (collapsed) {
    return (
      <div style={{ width, flexShrink: 0, borderRight: `1px solid ${BDR}`, background: TINT, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16 }}>
        <button onClick={onToggleCollapse} className="cc-press" title="Show history"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, borderRadius: 8, display: 'flex', color: MUTED }}>
          <PanelLeftOpen size={16} />
        </button>
      </div>
    )
  }

  return (
    <div style={{ width, flexShrink: 0, position: 'relative', borderRight: `1px solid ${BDR}`, background: TINT, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        onMouseDown={onStartDrag}
        style={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 2, background: isDragging ? 'rgba(59,130,246,0.25)' : 'transparent' }}>
        <div style={{ position: 'absolute', right: 1.5, top: '50%', transform: 'translateY(-50%)', width: 3, height: 36, borderRadius: 2, background: isDragging ? BLUE : BDR }} />
      </div>

      <div style={{ padding: '16px 16px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: INK, fontFamily: FONT }}>
            <Clock size={14} color={MUTED} /> History
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={onToggleDiff} className="cc-press"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: 7, cursor: 'pointer', fontFamily: FONT,
                border: `1px solid ${diffMode ? BLUE : BDR}`, background: diffMode ? '#EAF0FF' : WHITE, color: diffMode ? BLUE : MUTED }}>
              <Hash size={12} /> Diff
            </button>
            <button onClick={onToggleCollapse} className="cc-press" title="Minimize history"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 7, display: 'flex', color: MUTED }}>
              <PanelLeftClose size={14} />
            </button>
          </span>
        </div>
        <button onClick={onSave} disabled={!canSave || saving} className="cc-press"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: canSave ? BLUE : '#E5E7EB', color: canSave ? WHITE : FAINT,
            border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 600,
            cursor: canSave ? 'pointer' : 'default', fontFamily: FONT,
          }}>
          <Plus size={14} /> {saving ? 'Saving…' : `Save as v${nextVersionNumber}`}
        </button>

        <button onClick={onSaveFinal} disabled={!canSave || saving} className="cc-press"
          title="Saves this version and makes it searchable by your AI agents"
          style={{
            marginTop: 6, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: canSave ? '#059669' : '#E5E7EB', color: canSave ? WHITE : FAINT,
            border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 600,
            cursor: canSave ? 'pointer' : 'default', fontFamily: FONT,
          }}>
          <Check size={14} /> {saving ? 'Saving…' : 'Save as Final'}
        </button>
        <p style={{ margin: '6px 0 0', fontSize: 10.5, color: FAINT, fontFamily: FONT, textAlign: 'center', lineHeight: 1.4 }}>
          Final versions are indexed for AI search
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {versions.slice().reverse().map((v) => {
          const idx = versions.indexOf(v)
          const isActive = activeIdx === idx
          const isLatest = idx === versions.length - 1
          const preview = (v.version_label || '').slice(0, 10) || (isLatest ? 'Untitled' : '')
          return (
            <div key={v.id} style={{ position: 'relative' }}>
              <button onClick={() => onSelect(idx)}
                onContextMenu={e => { e.preventDefault(); onOpenMenu({ x: e.clientX, y: e.clientY, version: v, idx }) }}
                className="cc-press"
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: FONT,
                  border: isActive ? `1.5px solid ${BLUE}` : `1px solid ${BDR}`,
                  background: isActive ? '#EAF0FF' : WHITE,
                  borderRadius: 12, padding: '10px 12px',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: isActive ? BLUE : INK, fontFamily: MONO }}>v{v.version_number}</span>
                  <span style={{ fontSize: 10.5, color: FAINT, fontFamily: MONO, whiteSpace: 'nowrap' }}>{relativeVersionLabel(v.created_at, isLatest)}</span>
                </div>
                {preview && (
                  <span style={{ fontSize: 11.5, color: MUTED, fontStyle: 'italic' }}>
                    "{preview}{preview.length >= 10 ? '…' : ''}"
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {menuFor && (
        <ContextMenu
          x={menuFor.x} y={menuFor.y} variant="dashboard"
          items={[
            { label: 'Rename label', onClick: () => onRenameVersion(menuFor.version) },
            { label: 'Delete version', danger: true, onClick: () => onDeleteVersion(menuFor.version, menuFor.idx) },
            { label: 'Pin to top',     onClick: () => {/* TODO: no backend field for pin-to-top yet */} },
            { label: 'Review later',   onClick: () => {/* TODO: no backend field for review-later yet */} },
            { label: 'Mark milestone', onClick: () => {/* TODO: no backend field for milestones yet */} },
          ]}
          onClose={onCloseMenu}
        />
      )}
    </div>
  )
}

// ── Top bar (logo · status dropdown · platform dropdown · saved · share · publish) ──
function TopBar({
  panelsCollapsed, onTogglePanels, onClose,
  status, onSendToReview, targetPlatform, onSetTargetPlatform,
  saved, onShare, shareCopied, onOpenPublishSheet,
}) {
  const [statusMenu, setStatusMenu]     = useState(null)
  const [platformMenu, setPlatformMenu] = useState(null)
  const st = STATUS_STYLE[status] || STATUS_STYLE.draft
  const pl = PLATFORMS[targetPlatform] || PLATFORMS.linkedin

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, height: 56,
      padding: '0 16px', borderBottom: `1px solid ${BDR}`,
      background: WHITE, flexShrink: 0, fontFamily: FONT,
    }}>
      {panelsCollapsed && (
        <button onClick={onTogglePanels} className="cc-press" title="Show panels"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', color: MUTED }}>
          <PanelLeftOpen size={18} />
        </button>
      )}
      <button onClick={onClose} className="cc-press" title="Back to posts"
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: 8, color: MUTED, fontSize: 13, fontFamily: FONT }}>
        <ArrowLeft size={14} />
      </button>

      <div style={{ width: 26, height: 26, background: BLUE, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: WHITE, fontWeight: 700, fontSize: 13, fontFamily: SERIF }}>C</span>
      </div>
      <span style={{ fontWeight: 700, fontSize: 14.5, color: INK, whiteSpace: 'nowrap' }}>
        ContentCoach <span style={{ color: BLUE }}>AI</span>
      </span>

      <div style={{ position: 'relative' }}>
        <button onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setStatusMenu({ x: r.left, y: r.bottom + 4 }) }} className="cc-press"
          style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${BDR}`, background: WHITE, borderRadius: 999, padding: '5px 10px', cursor: 'pointer', fontFamily: FONT }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{st.label}</span>
          <ChevronDown size={13} color={MUTED} />
        </button>
        {statusMenu && (
          <ContextMenu x={statusMenu.x} y={statusMenu.y} variant="dashboard" onClose={() => setStatusMenu(null)}
            items={[{ label: 'Mark as in review', onClick: onSendToReview }]} />
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <button onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setPlatformMenu({ x: r.left, y: r.bottom + 4 }) }} className="cc-press"
          style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${BDR}`, background: WHITE, borderRadius: 999, padding: '5px 10px', cursor: 'pointer', fontFamily: FONT }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, background: pl.bg, color: WHITE, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {pl.label[0]}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{pl.label}</span>
          <ChevronDown size={13} color={MUTED} />
        </button>
        {platformMenu && (
          <ContextMenu x={platformMenu.x} y={platformMenu.y} variant="dashboard" onClose={() => setPlatformMenu(null)}
            items={Object.entries(PLATFORMS).map(([key, p]) => ({ label: p.label, onClick: () => onSetTargetPlatform(key) }))} />
        )}
      </div>

      <div style={{ flex: 1 }} />

      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: saved ? GREEN_D : FAINT, fontFamily: MONO, whiteSpace: 'nowrap' }}>
        {saved && <Check size={13} />} {saved ? 'Saved' : 'Unsaved'}
      </span>

      <button onClick={onShare} className="cc-press"
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: WHITE, border: `1px solid ${BDR}`, borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: INK, cursor: 'pointer', fontFamily: FONT }}>
        <Share2 size={14} /> {shareCopied ? 'Copied!' : 'Share'}
      </button>

      <button onClick={onOpenPublishSheet} className="cc-press"
        style={{ background: BLUE, color: WHITE, border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12.5, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>
        Publish
      </button>

      {!panelsCollapsed && (
        <button onClick={onTogglePanels} className="cc-press" title="Focus mode"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', color: MUTED }}>
          <PanelLeftClose size={18} />
        </button>
      )}
    </div>
  )
}

// ── Right rail card: Research (Vault / Trending / Audience) ──────────────────────
function ResearchCard({ currentPostId, onInsert }) {
  const [tab, setTab]       = useState('vault')
  const [vaultPosts, setVaultPosts] = useState([])
  const [loading, setLoading]       = useState(true)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    getRecentPosts(6).then(list => setVaultPosts(list.filter(p => p.id !== currentPostId))).catch(() => setVaultPosts([])).finally(() => setLoading(false))
  }, [currentPostId])

  const tabs = [
    { key: 'vault',     label: 'Vault' },
    { key: 'trending',  label: 'Trending' },
    { key: 'audience',  label: 'Audience' },
  ]

  function handleInsert() {
    const post = vaultPosts.find(p => p.id === selectedId)
    if (post) onInsert(`Inspired by "${post.title}":\n\n`)
  }

  return (
    <div style={{ background: WHITE, border: `1px solid ${BDR}`, borderRadius: 16, padding: 14, fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <Search size={14} color={BLUE} />
        <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>Research</span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: BLUE, marginLeft: 'auto' }} />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 10, background: TINT, borderRadius: 9, padding: 3 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className="cc-press"
            style={{ flex: 1, border: 'none', borderRadius: 7, padding: '5px 0', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
              background: tab === t.key ? WHITE : 'transparent', color: tab === t.key ? BLUE : MUTED,
              boxShadow: tab === t.key ? '0 1px 4px rgba(17,24,39,0.1)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'vault' ? (
        <p style={{ fontSize: 12, color: FAINT, margin: '8px 0', textAlign: 'center' }}>
          {/* TODO: connect trending/audience research endpoints */}
          Coming soon
        </p>
      ) : loading ? (
        <p style={{ fontSize: 12, color: FAINT, margin: '8px 0' }}>Loading…</p>
      ) : vaultPosts.length === 0 ? (
        <p style={{ fontSize: 12, color: FAINT, margin: '8px 0' }}>No other posts yet</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
          {vaultPosts.map(p => {
            const active = selectedId === p.id
            return (
              <button key={p.id} onClick={() => setSelectedId(active ? null : p.id)} className="cc-press"
                style={{ display: 'flex', alignItems: 'center', gap: 9, border: active ? `1.5px solid ${BLUE}` : `1px solid ${BDR}`, background: active ? '#EAF0FF' : WHITE, borderRadius: 11, padding: '9px 10px', cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: '#EEF0FF', color: INDIGO, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {p.title?.[0]?.toUpperCase() || '?'}
                </span>
                <span style={{ flex: 1, overflow: 'hidden' }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: FAINT, fontFamily: MONO }}>Your post · v{p.current_version}</span>
                </span>
                <Plus size={14} color={active ? BLUE : FAINT} />
              </button>
            )
          })}
        </div>
      )}

      <button onClick={handleInsert} disabled={!selectedId} className="cc-press"
        style={{ width: '100%', background: selectedId ? BLUE : '#E5E7EB', color: selectedId ? WHITE : FAINT, border: 'none', borderRadius: 9, padding: '8px 0', fontSize: 12.5, fontWeight: 600, cursor: selectedId ? 'pointer' : 'default', fontFamily: FONT }}>
        Insert into draft
      </button>
    </div>
  )
}

// ── Right rail card: Writing actions ──────────────────────────────────────────
function WritingActionsCard({ onOpenStyleModal, content }) {
  const [checking, setChecking] = useState(false)
  const [verdict, setVerdict]   = useState(null)

  function handleSoundsLikeMe() {
    setChecking(true)
    setVerdict(null)
    // TODO: connect style-check endpoint
    setTimeout(() => {
      setVerdict(content.trim().length > 40 ? 'close' : 'off')
      setChecking(false)
    }, 600)
  }

  return (
    <div style={{ background: WHITE, border: `1px solid ${BDR}`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <PenLine size={14} color={VIOLET} />
        <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>Writing</span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: VIOLET, marginLeft: 'auto' }} />
      </div>
      <p style={{ fontSize: 11.5, color: MUTED, margin: 0, lineHeight: 1.5 }}>Make every draft sound unmistakably like you — and convert.</p>

      <button onClick={onOpenStyleModal} className="cc-press"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: TINT, border: `1px solid ${BDR}`, borderRadius: 10, cursor: 'pointer', padding: '9px 11px', textAlign: 'left' }}>
        <span>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: INK }}>Rewrite in your voice</span>
          <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 1 }}>Tune your style & how agents work</span>
        </span>
        <span style={{ color: FAINT, fontSize: 13 }}>↗</span>
      </button>
      <button onClick={handleSoundsLikeMe} disabled={checking} className="cc-press"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: TINT, border: `1px solid ${BDR}`, borderRadius: 10, cursor: 'pointer', padding: '9px 11px', textAlign: 'left' }}>
        <span>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: INK }}>Sounds like me?</span>
          <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 1 }}>Check the draft against your voice</span>
        </span>
        <ChevronRight size={14} color={FAINT} />
      </button>
      {checking && <p style={{ fontSize: 11.5, color: FAINT, margin: 0 }}>Checking…</p>}
      {verdict && (
        <p style={{ fontSize: 11.5, margin: 0, color: verdict === 'close' ? GREEN_D : AMBER_D }}>
          {verdict === 'close' ? 'Reads close to your usual voice.' : 'Add more — too short to compare against your voice yet.'}
        </p>
      )}
    </div>
  )
}

// ── Right rail card: Performance metrics ──────────────────────────────────────
function MetricsCard({ postId, status, impressions, reactions, lastUpdated, onUpdated }) {
  const [impDraft, setImpDraft] = useState(impressions ?? 0)
  const [reaDraft, setReaDraft] = useState(reactions ?? 0)
  const [saving, setSaving]     = useState(false)
  const isPublished = status === 'published' || status === 'scheduled'

  async function handleUpdate() {
    setSaving(true)
    try {
      const res = await updatePostAnalytics(postId, Number(impDraft) || 0, Number(reaDraft) || 0)
      onUpdated(res)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: WHITE, border: `1px solid ${BDR}`, borderRadius: 16, padding: 14, fontFamily: FONT }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: INK, margin: '0 0 10px' }}>Performance</p>
      {!isPublished ? (
        <p style={{ fontSize: 12, color: FAINT, margin: 0 }}>Publish to start tracking</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 11, color: MUTED, marginBottom: 4 }}>Impressions</span>
              <input type="number" min={0} value={impDraft} onChange={e => setImpDraft(e.target.value)}
                style={{ width: '100%', border: `1px solid ${BDR}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: MONO, outline: 'none', boxSizing: 'border-box' }} />
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 11, color: MUTED, marginBottom: 4 }}>Likes/Reactions</span>
              <input type="number" min={0} value={reaDraft} onChange={e => setReaDraft(e.target.value)}
                style={{ width: '100%', border: `1px solid ${BDR}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: MONO, outline: 'none', boxSizing: 'border-box' }} />
            </label>
          </div>
          <button onClick={handleUpdate} disabled={saving} className="cc-press"
            style={{ width: '100%', background: TINT, border: `1px solid ${BDR}`, borderRadius: 8, padding: '8px 0', fontSize: 12.5, fontWeight: 600, color: BLUE, cursor: 'pointer', fontFamily: FONT }}>
            {saving ? 'Updating…' : 'Update'}
          </button>
          {lastUpdated && (
            <p style={{ fontSize: 10.5, color: FAINT, margin: '8px 0 0', fontFamily: MONO }}>
              Last updated {new Date(lastUpdated).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── Schedule / Publish sheet (Pro-gated) ──────────────────────────────────────
function SchedulePublishSheet({ open, onClose, plan, platforms, onTogglePlatform, scheduledAt, onScheduledAtChange, onConfirm, confirming, linkedInStatus, onConnectLinkedIn }) {
  const [mode, setMode] = useState('now') // 'now' | 'scheduled'
  const [showConfirm, setShowConfirm] = useState(false)

  // Reset confirmation state whenever the sheet closes or the user changes options
  useEffect(() => { if (!open) setShowConfirm(false) }, [open])
  useEffect(() => { setShowConfirm(false) }, [mode, platforms])

  // LinkedIn must be connected when selected for "Publish now"
  const linkedInSelected = platforms.includes('linkedin')
  const linkedInConnected = linkedInStatus?.connected === true
  const publishBlocked = linkedInSelected && !linkedInConnected && mode === 'now'
  // Live LinkedIn publish = the action that needs a confirmation gate
  const isLiveLinkedIn = linkedInSelected && linkedInConnected && mode === 'now'

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.35)', zIndex: 200,
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.2s',
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, zIndex: 201,
        background: WHITE, boxShadow: '-12px 0 40px -16px rgba(17,24,39,0.3)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(.16,1,.3,1)',
        display: 'flex', flexDirection: 'column', fontFamily: FONT,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: `1px solid ${BDR}` }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: INK, fontFamily: SERIF }}>Publish</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: MUTED, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Platforms</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(PLATFORMS).map(([key, p]) => {
                const active = platforms.includes(key)
                return (
                  <button key={key} onClick={() => onTogglePlatform(key)} className="cc-press"
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                      border: active ? `1.5px solid ${p.bg}` : `1px solid ${BDR}`,
                      background: active ? `${p.bg}14` : WHITE,
                      color: active ? p.bg : MUTED, fontFamily: FONT,
                    }}>
                    {p.label}
                  </button>
                )
              })}
            </div>

            {/* LinkedIn connection indicator — only shown when LinkedIn is selected */}
            {linkedInSelected && (
              <div style={{
                marginTop: 10, display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 8,
                background: linkedInConnected ? '#F0FDF4' : '#FFF7ED',
                border: `1px solid ${linkedInConnected ? '#86EFAC' : '#FED7AA'}`,
              }}>
                {linkedInConnected ? (
                  <>
                    <span style={{ color: '#16A34A', fontWeight: 700, fontSize: 13 }}>✓</span>
                    <span style={{ fontSize: 12, color: '#15803D', flex: 1 }}>
                      Connected as {linkedInStatus.display_name}
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 12, color: '#C2410C', flex: 1 }}>LinkedIn not connected</span>
                    <button
                      onClick={onConnectLinkedIn}
                      style={{
                        fontSize: 11.5, fontWeight: 600, color: '#0A66C2',
                        background: 'none', border: '1px solid #0A66C2',
                        borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT,
                      }}>
                      Connect
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: MUTED, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>When</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: mode === 'scheduled' ? 10 : 0 }}>
              {['now', 'scheduled'].map(m => (
                <button key={m} onClick={() => setMode(m)} className="cc-press"
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                    border: mode === m ? `1.5px solid ${BLUE}` : `1px solid ${BDR}`,
                    background: mode === m ? '#EAF0FF' : WHITE,
                    color: mode === m ? BLUE : MUTED, fontFamily: FONT,
                  }}>
                  {m === 'now' ? 'Publish now' : 'Schedule'}
                </button>
              ))}
            </div>
            {mode === 'scheduled' && (
              <input type="datetime-local" value={scheduledAt || ''} onChange={e => onScheduledAtChange(e.target.value)}
                style={{ width: '100%', border: `1px solid ${BDR}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: MONO, color: INK, outline: 'none', boxSizing: 'border-box' }} />
            )}
          </div>
        </div>

        {showConfirm ? (
          <div style={{ padding: '14px 16px', borderTop: `1px solid ${BDR}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '10px 14px',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#92400E', fontFamily: FONT }}>
                  This will publish immediately to LinkedIn
                </p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#B45309', fontFamily: FONT, lineHeight: 1.5 }}>
                  {linkedInStatus?.display_name
                    ? `Posting as ${linkedInStatus.display_name}. This cannot be undone from here.`
                    : 'This cannot be undone from here.'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowConfirm(false)}
                className="cc-press"
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, fontFamily: FONT,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: WHITE, border: `1px solid ${BDR}`, color: MUTED,
                }}>
                Cancel
              </button>
              <button
                onClick={() => { setShowConfirm(false); onConfirm(mode) }}
                disabled={confirming}
                className="cc-press"
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, fontFamily: FONT,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: '#0A66C2', color: WHITE, border: 'none',
                  opacity: confirming ? 0.6 : 1,
                }}>
                {confirming ? 'Publishing…' : 'Yes, publish now'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 16, borderTop: `1px solid ${BDR}` }}>
            <button
              onClick={() => isLiveLinkedIn ? setShowConfirm(true) : onConfirm(mode)}
              disabled={confirming || platforms.length === 0 || publishBlocked}
              className="cc-press"
              style={{
                width: '100%', background: BLUE, color: WHITE, border: 'none', borderRadius: 10,
                padding: '11px 0', fontSize: 13.5, fontWeight: 600, cursor: publishBlocked ? 'not-allowed' : 'pointer', fontFamily: FONT,
                opacity: (platforms.length === 0 || publishBlocked) ? 0.5 : 1,
              }}>
              {confirming ? 'Publishing…' : publishBlocked ? 'Connect LinkedIn first' : mode === 'now' ? 'Publish now' : 'Schedule post'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Style & Agent Behavior modal ──────────────────────────────────────────────
const DEFAULT_VOICE = "Confident but conversational — short sentences, real examples over theory, and a direct call to action at the end. No corporate jargon."

function StyleAgentModal({ open, onClose }) {
  const reduceMotion = useReducedMotion()
  const [voice, setVoice] = useState(DEFAULT_VOICE)
  const [tones, setTones] = useState({ casualFormal: 50, conciseDetailed: 50, friendlyBold: 50 })
  const [behaviors, setBehaviors] = useState({ autoSuggestHooks: true, citeSources: true, autoDraftVariations: false })
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  function handleSave() {
    setSaving(true)
    // TODO: PATCH /me/style {voice, tone, behavior}
    setTimeout(() => {
      setSaving(false)
      setSaved(true)
      setTimeout(() => { setSaved(false); onClose() }, 700)
    }, 500)
  }

  const sliders = [
    { key: 'casualFormal',    left: 'Casual',   right: 'Formal' },
    { key: 'conciseDetailed', left: 'Concise',  right: 'Detailed' },
    { key: 'friendlyBold',    left: 'Friendly', right: 'Bold' },
  ]
  const toggles = [
    { key: 'autoSuggestHooks',    label: 'Auto-suggest hooks',     hint: 'Surface stronger openers as you write' },
    { key: 'citeSources',         label: 'Always cite sources',    hint: 'Attach links when research is inserted' },
    { key: 'autoDraftVariations', label: 'Auto-draft variations',  hint: 'Generate native formats on publish' },
  ]

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.4)', zIndex: 300 }}
          />
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              width: 560, maxHeight: '82vh', background: WHITE, borderRadius: 20, zIndex: 301,
              display: 'flex', flexDirection: 'column', boxShadow: '0 30px 70px -20px rgba(17,24,39,0.35)',
              fontFamily: FONT,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', borderBottom: `1px solid ${BDR}` }}>
              <Settings size={18} color={INDIGO} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 17, fontWeight: 600, color: INK, margin: 0, fontFamily: SERIF }}>Style & agent behavior</p>
                <p style={{ fontSize: 12, color: MUTED, margin: '2px 0 0' }}>Teach the agents how you sound — and how they should work.</p>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}><X size={18} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, margin: '0 0 8px' }}>Your voice</p>
                <textarea value={voice} onChange={e => setVoice(e.target.value)} rows={4}
                  style={{ width: '100%', border: `1px solid ${BDR}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.6, fontFamily: FONT, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, margin: '0 0 12px' }}>Tone</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {sliders.map(s => (
                    <div key={s.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: MUTED, marginBottom: 4 }}>
                        <span>{s.left}</span><span>{s.right}</span>
                      </div>
                      <input type="range" min={0} max={100} value={tones[s.key]}
                        onChange={e => setTones(prev => ({ ...prev, [s.key]: Number(e.target.value) }))}
                        style={{ width: '100%', accentColor: INDIGO }} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, margin: '0 0 10px' }}>Agent behavior</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {toggles.map(t => {
                    const on = behaviors[t.key]
                    return (
                      <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ fontSize: 13, color: INK, margin: 0 }}>{t.label}</p>
                          <p style={{ fontSize: 11.5, color: FAINT, margin: '2px 0 0' }}>{t.hint}</p>
                        </div>
                        <button onClick={() => setBehaviors(prev => ({ ...prev, [t.key]: !prev[t.key] }))} className="cc-press"
                          style={{
                            width: 38, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
                            background: on ? BLUE : '#E5E7EB', position: 'relative', transition: 'background 0.15s',
                          }}>
                          <span style={{
                            position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%',
                            background: WHITE, transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, padding: 16, borderTop: `1px solid ${BDR}` }}>
              <button onClick={onClose} className="cc-press"
                style={{ flex: 1, background: WHITE, border: `1px solid ${BDR}`, borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 600, color: MUTED, cursor: 'pointer', fontFamily: FONT }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="cc-press"
                style={{ flex: 2, background: BLUE, border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 600, color: WHITE, cursor: 'pointer', fontFamily: FONT }}>
                {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save style & train agents'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── §C — MetricsModal (landscape, blurred backdrop, lifted above any transformed parent) ──
function MetricsModal({ open, post, platform, existingMetrics, onSave, onClose }) {
  const reduceMotion  = useReducedMotion()
  const pl            = PLATFORM_DISPLAY[platform] || PLATFORM_DISPLAY.linkedin
  const fields        = PLATFORM_METRICS[platform] || DEFAULT_METRICS_FIELDS
  const [draft, setDraft] = useState({})
  const modalRef      = useRef(null)
  const firstInputRef = useRef(null)

  // Reset fields and focus first input on open
  useEffect(() => {
    if (!open) return
    const init = {}
    fields.forEach(f => { init[f] = existingMetrics?.[f] ?? '' })
    setDraft(init)
    setTimeout(() => firstInputRef.current?.focus(), 40)
  }, [open, post?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus trap + Esc to close
  useEffect(() => {
    if (!open) return
    const el = modalRef.current
    if (!el) return
    function handleKey(e) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Tab') {
        const focusable = el.querySelectorAll('button:not([disabled]), input')
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last?.focus() } }
        else            { if (document.activeElement === last)  { e.preventDefault(); first?.focus() } }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  function handleSave() {
    const values = {}
    fields.forEach(f => { values[f] = Number(String(draft[f] ?? '').replace(/,/g, '')) || 0 })
    onSave(post.id, values)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && post && (
        // Scrim — covers full viewport, click closes, backdrop-filter blur
        <motion.div
          key="metrics-scrim"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(17,24,39,.35)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          {/* Modal card — landscape (700px wide) with spring entry */}
          <motion.div
            key="metrics-card"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mm-title"
            onClick={e => e.stopPropagation()}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion  ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94 }}
            transition={reduceMotion
              ? { duration: 0.18 }
              : { type: 'spring', damping: 26, stiffness: 320, mass: 0.8 }
            }
            style={{
              maxWidth: 700, width: '100%', background: WHITE, borderRadius: 20,
              padding: '24px 28px', boxShadow: '0 40px 90px -30px rgba(17,24,39,.6)',
              fontFamily: FONT,
            }}
          >
            {/* ── Header (full-width row) ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: `${pl.bg}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: pl.bg, fontWeight: 700, fontSize: 15, fontFamily: FONT }}>{pl.label[0]}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', color: '#9CA3AF', margin: '0 0 3px', textTransform: 'uppercase' }}>{pl.label} · METRICS</p>
                  <p id="mm-title" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 20, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</p>
                </div>
              </div>
              <motion.button
                onClick={onClose}
                aria-label="Close"
                whileHover={{ scale: 1.1, background: '#EEF2F7' }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(17,24,39,.1)', background: '#F8FAFC', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: MUTED, marginLeft: 14 }}>
                <X size={15} />
              </motion.button>
            </div>

            {/* ── Body (2-column landscape) ── */}
            <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>

              {/* Left — streak nudge */}
              <div style={{ width: 200, flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 12, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>🔥</span>
                <span style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.55, fontWeight: 500 }}>
                  If you don't track, you don't care...
                  {/* TODO: increment/keep streak on first successful log of the day; surface real count in the nudge */}
                </span>
              </div>

              {/* Right — fields + actions */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Metric fields — responsive grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(116px,1fr))', gap: 12 }}>
                  {fields.map((field, i) => (
                    <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span style={{ fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase', color: '#9CA3AF', letterSpacing: '.06em' }}>{field}</span>
                      <input
                        ref={i === 0 ? firstInputRef : undefined}
                        inputMode="numeric"
                        placeholder="0"
                        value={draft[field] ?? ''}
                        onChange={e => setDraft(prev => ({ ...prev, [field]: e.target.value }))}
                        aria-label={field}
                        style={{
                          height: 46, border: '1px solid rgba(17,24,39,.14)', borderRadius: 11,
                          fontSize: 16, fontWeight: 600, fontFamily: MONO,
                          padding: '0 12px', boxSizing: 'border-box', outline: 'none', color: INK, background: WHITE,
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(37,99,235,.1)' }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'rgba(17,24,39,.14)'; e.currentTarget.style.boxShadow = 'none' }}
                      />
                    </label>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <motion.button
                    onClick={onClose}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(17,24,39,.12)', background: WHITE, fontSize: 13, fontWeight: 600, color: MUTED, cursor: 'pointer', fontFamily: FONT }}>
                    Cancel
                  </motion.button>
                  <motion.button
                    onClick={handleSave}
                    whileHover={{ scale: 1.03, boxShadow: '0 16px 32px -12px rgba(37,99,235,.7)' }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: BLUE, color: WHITE, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, boxShadow: '0 12px 26px -12px rgba(37,99,235,.6)' }}>
                    Save metrics
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Doc Editor (Column 3 canvas when a post is active) ─────────────────────────
function DocEditor({ post, panelsCollapsed, onTogglePanels, onClose, onTitleChange, onPinPost, onDeletePost, onStatusChange, plan = 'pro' }) {
  const [title,    setTitle]    = useState(post.title)
  const [content,  setContent]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [dirty,    setDirty]    = useState(false)
  const [versions, setVersions] = useState([])
  const [activeIdx, setActiveIdx] = useState(-1)
  const [loading,  setLoading]  = useState(true)
  const [diffMode, setDiffMode] = useState(false)
  const [historyCollapsed, setHistoryCollapsed] = useState(false)
  const [menuFor,  setMenuFor]  = useState(null)
  const [surfaceMenu, setSurfaceMenu] = useState(null)
  const [shareCopied, setShareCopied] = useState(false)

  const [status,         setStatus]         = useState(post.status || 'draft')
  const [targetPlatform, setTargetPlatform] = useState('linkedin')
  const [scheduleOpen,   setScheduleOpen]   = useState(false)
  const [schedulePlatforms, setSchedulePlatforms] = useState(['linkedin'])
  const [scheduledAt,    setScheduledAt]    = useState('')
  const [confirming,     setConfirming]     = useState(false)
  const [styleModalOpen, setStyleModalOpen] = useState(false)
  const [metrics,        setMetrics]        = useState({ impressions: 0, reactions: 0, lastUpdated: null })
  const [linkedInStatus, setLinkedInStatus] = useState(null)

  const titleInputRef = useRef(null)
  const textareaRef   = useRef(null)
  const { addToQueue } = useReviewQueue()
  const leftRail  = useResizableRail('cc_leftW', 240, 420, 300)
  const rightRail = useResizableRail('cc_rightW', 240, 460, 300)

  // Fetch LinkedIn connection status once on editor mount
  useEffect(() => {
    getLinkedInStatus().then(setLinkedInStatus).catch(() => {})
  }, [])

  async function loadVersions(forceIdx) {
    setLoading(true)
    try {
      const list = await getVersions(post.id)
      setVersions(list)
      if (list.length > 0) {
        const targetIdx = forceIdx !== undefined ? Math.min(forceIdx, list.length - 1) : list.length - 1
        setActiveIdx(targetIdx)
        const v = await getVersion(list[targetIdx].id)
        setContent(v.content)
      } else {
        setActiveIdx(-1)
        setContent('')
      }
      setDirty(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(post.title)
    loadVersions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id])

  async function handleVersionSelect(idx) {
    setActiveIdx(idx)
    const v = await getVersion(versions[idx].id)
    setContent(v.content)
    setDirty(false)
  }

  async function handleSaveVersion() {
    if (!content.trim() || saving) return
    setSaving(true)
    try {
      await saveVersion(post.id, content, null, false)
      await loadVersions()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveFinalVersion() {
    if (!content.trim() || saving) return
    setSaving(true)
    try {
      // is_final=true → backend triggers vectorisation for AI search
      await saveVersion(post.id, content, 'Final', true)
      await loadVersions()
    } finally {
      setSaving(false)
    }
  }

  async function handleRestoreVersion() {
    if (saving) return
    setSaving(true)
    try {
      const restoredFrom = versions[activeIdx]?.version_number
      await saveVersion(post.id, content, `Restored from v${restoredFrom}`)
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

  async function handleRenameVersion(version) {
    const next = window.prompt('Version label', version.version_label || '')
    if (next === null) return
    await renameVersion(version.id, next.trim())
    await loadVersions(activeIdx)
  }

  async function handleDeleteVersion(version, idx) {
    const label = version.version_label ? `"${version.version_label}"` : `v${version.version_number}`
    if (!window.confirm(`Delete version ${label}?`)) return
    await deleteVersion(version.id)
    await loadVersions(Math.max(0, idx - 1))
  }

  async function handleSendToReview() {
    setStatus('in_review')
    addToQueue({ id: post.id, title, platform: targetPlatform, status: 'needs_review' })
    await sendToReview(post)
  }

  function handleOpenPublishSheet() {
    setSchedulePlatforms([targetPlatform])
    setScheduleOpen(true)
    // Refresh LinkedIn status each time the sheet opens so it reflects current state
    getLinkedInStatus().then(setLinkedInStatus).catch(() => {})
  }

  async function handleConnectLinkedIn() {
    try {
      const { auth_url } = await getLinkedInAuthUrl()
      window.location.href = auth_url  // full redirect — OAuth requires it
    } catch (err) {
      console.error('Failed to get LinkedIn auth URL', err)
    }
  }

  async function handleConfirmPublish(mode) {
    setConfirming(true)
    try {
      if (mode === 'now' && schedulePlatforms.includes('linkedin')) {
        // Real LinkedIn publish — backend handles status update + publish log + style memory
        const result = await publishPost({ postId: post.id, platforms: schedulePlatforms, scheduledAt: null })
        if (result.needs_auth) {
          // Token missing / expired / revoked — redirect to OAuth
          window.location.href = result.auth_url
          return
        }
        setStatus('published')
        onStatusChange?.(post.id, 'published', null, 'linkedin')
      } else {
        // Scheduled or non-LinkedIn: update status via vault then use stub
        const newStatus = mode === 'scheduled' ? 'scheduled' : 'published'
        const scheduledAtValue = mode === 'scheduled' ? scheduledAt : null
        await updatePostStatus(post.id, newStatus, scheduledAtValue)
        await publishPost({ postId: post.id, platforms: schedulePlatforms, scheduledAt: scheduledAtValue })
        setStatus(newStatus)
        onStatusChange?.(post.id, newStatus, scheduledAtValue, targetPlatform)
      }
      setScheduleOpen(false)
    } catch (err) {
      console.error('Publish failed', err)
      // Keep sheet open so user can retry
    } finally {
      setConfirming(false)
    }
  }

  function toggleSchedulePlatform(key) {
    setSchedulePlatforms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(content)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 1500)
    } catch { /* clipboard unavailable — silent */ }
  }

  function handleSurfaceContextMenu(e) {
    e.preventDefault()
    setSurfaceMenu({ x: e.clientX, y: e.clientY })
  }

  const isLatest   = versions.length === 0 || activeIdx === versions.length - 1
  const isReadOnly = versions.length > 0 && !isLatest
  const wordCount  = content.trim() ? content.trim().split(/\s+/).length : 0
  const readMins   = Math.max(1, Math.round(wordCount / 200))
  const isEmptyDraft = !loading && versions.length === 0

  function handleClose() {
    onClose(post.id, isEmptyDraft)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', background: WHITE }}>
      <TopBar
        panelsCollapsed={panelsCollapsed}
        onTogglePanels={onTogglePanels}
        onClose={handleClose}
        status={status}
        onSendToReview={handleSendToReview}
        targetPlatform={targetPlatform}
        onSetTargetPlatform={setTargetPlatform}
        saved={!dirty}
        onShare={handleShare}
        shareCopied={shareCopied}
        onOpenPublishSheet={handleOpenPublishSheet}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <HistoryRail
          width={historyCollapsed ? 48 : leftRail.width}
          collapsed={historyCollapsed}
          onToggleCollapse={() => setHistoryCollapsed(c => !c)}
          isDragging={leftRail.isDragging}
          onStartDrag={leftRail.startDrag}
          versions={versions}
          activeIdx={activeIdx}
          onSelect={handleVersionSelect}
          nextVersionNumber={versions.length + 1}
          onSave={handleSaveVersion}
          onSaveFinal={handleSaveFinalVersion}
          saving={saving}
          canSave={!!content.trim() && !isReadOnly}
          diffMode={diffMode}
          onToggleDiff={() => setDiffMode(d => !d)}
          menuFor={menuFor}
          onOpenMenu={setMenuFor}
          onCloseMenu={() => setMenuFor(null)}
          onRenameVersion={v => { setMenuFor(null); handleRenameVersion(v) }}
          onDeleteVersion={(v, idx) => { setMenuFor(null); handleDeleteVersion(v, idx) }}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <FormattingToolbar textareaRef={textareaRef} content={content} onContent={c => { setContent(c); setDirty(true) }} disabled={isReadOnly} />

          <div onContextMenu={handleSurfaceContextMenu} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '0 0 16px' }}>
            {loading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: FAINT, fontSize: 14 }}>Loading…</div>
            ) : (
              <>
                <div style={{ padding: '32px 10% 4px' }}>
                  <input
                    ref={titleInputRef}
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onBlur={handleTitleBlur}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    placeholder="Untitled post"
                    style={{
                      width: '100%', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em',
                      border: 'none', outline: 'none', background: 'transparent', color: INK,
                      fontFamily: SERIF, borderBottom: '2px solid transparent', paddingBottom: 6, transition: 'border-color 0.15s',
                    }}
                    onFocus={e => { e.target.style.borderBottomColor = BDR }}
                    onBlurCapture={e => { e.target.style.borderBottomColor = 'transparent' }}
                  />
                  <p style={{ fontSize: 12, color: FAINT, margin: '6px 0 0', fontFamily: MONO }}>
                    {(STATUS_STYLE[status] || STATUS_STYLE.draft).label} · {PLATFORMS[targetPlatform]?.label}
                  </p>
                </div>

                {isReadOnly && (
                  <div style={{ margin: '12px 10% 0', padding: '10px 14px', background: '#EEF2FF', borderRadius: 10, fontSize: 12.5, color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: FONT }}>
                    <span>Viewing v{versions[activeIdx]?.version_number} — read only. Restore or branch from here.</span>
                    <button onClick={handleRestoreVersion} className="cc-press"
                      style={{ background: 'none', border: 'none', color: BLUE, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: FONT }}>
                      Restore this version
                    </button>
                  </div>
                )}

                <div style={{ padding: '12px 10% 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {!content && !isReadOnly && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                      {['Blank', 'LinkedIn hook', 'Thread outline'].map(label => (
                        <button key={label} className="cc-press" onClick={() => { setContent(label === 'Blank' ? '' : `${label}: `); setDirty(true) }}
                          style={{ border: `1px solid ${BDR}`, background: TINT, color: MUTED, borderRadius: 999, padding: '6px 12px', fontSize: 12, fontFamily: FONT, cursor: 'pointer' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={e => { setContent(e.target.value); setDirty(true) }}
                    readOnly={isReadOnly}
                    placeholder="Start writing your post here… Ask AI Assistance to draft in your voice →"
                    style={{
                      width: '100%', minHeight: 280, flex: 1,
                      border: 'none', outline: 'none', resize: 'none',
                      fontSize: 16.5, lineHeight: 1.85,
                      color: isReadOnly ? MUTED : INK, fontFamily: FONT,
                      background: 'transparent', display: 'block',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: FAINT, fontFamily: MONO, padding: '8px 0 4px' }}>
                    <span>{wordCount} words · {readMins} min read · {dirty ? 'Unsaved changes' : 'Saved just now'}</span>
                    <span>{content.length} / {LINKEDIN_MAX_CHARS}{content.length > LINKEDIN_CUT_CHARS ? ` · cut at ${LINKEDIN_CUT_CHARS}` : ''}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ width: rightRail.width, flexShrink: 0, position: 'relative', borderLeft: `1px solid ${BDR}`, background: TINT, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          <div
            onMouseDown={rightRail.startDrag}
            style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 2, background: rightRail.isDragging ? 'rgba(59,130,246,0.25)' : 'transparent' }}>
            <div style={{ position: 'absolute', left: 1.5, top: '50%', transform: 'translateY(-50%)', width: 3, height: 36, borderRadius: 2, background: rightRail.isDragging ? BLUE : BDR }} />
          </div>
          <div className="cc-stagger cc-stagger-1"><ResearchCard currentPostId={post.id} onInsert={text => { setContent(c => c + text); setDirty(true) }} /></div>
          <div className="cc-stagger cc-stagger-2"><WritingActionsCard onOpenStyleModal={() => setStyleModalOpen(true)} content={content} /></div>
          <div className="cc-stagger cc-stagger-3">
            <MetricsCard postId={post.id} status={status} impressions={metrics.impressions} reactions={metrics.reactions} lastUpdated={metrics.lastUpdated}
              onUpdated={res => setMetrics({ impressions: res.impressions, reactions: res.reactions, lastUpdated: res.updated_at })} />
          </div>
        </div>
      </div>

      {surfaceMenu && (
        <ContextMenu
          x={surfaceMenu.x} y={surfaceMenu.y} variant="dashboard"
          items={[
            { label: 'Send to review', onClick: handleSendToReview },
            { label: 'Rename',         onClick: () => { titleInputRef.current?.focus(); titleInputRef.current?.select() } },
            { label: post.is_pinned ? 'Unpin' : 'Pin to dashboard', onClick: () => onPinPost(post.id, post.is_pinned) },
            { label: 'Delete', danger: true, onClick: () => onDeletePost(post.id) },
          ]}
          onClose={() => setSurfaceMenu(null)}
        />
      )}

      <SchedulePublishSheet
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        plan={plan}
        platforms={schedulePlatforms}
        onTogglePlatform={toggleSchedulePlatform}
        scheduledAt={scheduledAt}
        onScheduledAtChange={setScheduledAt}
        onConfirm={handleConfirmPublish}
        confirming={confirming}
        linkedInStatus={linkedInStatus}
        onConnectLinkedIn={handleConnectLinkedIn}
      />

      <StyleAgentModal open={styleModalOpen} onClose={() => setStyleModalOpen(false)} />
    </div>
  )
}

// ── §A3 — in-memory metrics store (single write on Save; reads are local) ────
function useMetrics() {
  const [metricsStore, setMetricsStore] = useState({})

  function saveMetrics(postId, values) {
    const record = { ...values, loggedAt: new Date().toISOString() }
    setMetricsStore(prev => ({ ...prev, [postId]: record }))
    // TODO: POST metrics (single write, includes loggedAt timestamp so the Analytics agent can build growth curves over time)
    return record
  }

  function getMetrics(postId) {
    // TODO: hydrate from backend
    return metricsStore[postId]
  }

  return { saveMetrics, getMetrics }
}

// ── §B2 — MetricsBar (published-only card affordance) ────────────────────────
function MetricsBar({ hasMetrics, onClick }) {
  return (
    <motion.button
      onClick={e => { e.preventDefault(); e.stopPropagation(); onClick() }}
      whileHover={{ scale: 1.015, filter: 'brightness(.97)' }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 12px', borderRadius: 11, cursor: 'pointer', gap: 8,
        background: hasMetrics ? '#EAF0FF' : '#FFFBEB',
        border: hasMetrics ? '1px solid rgba(37,99,235,.22)' : '1px solid #FDE68A',
        color: hasMetrics ? '#1D4ED8' : '#92400E',
        width: '100%', fontFamily: FONT, transformOrigin: 'center',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
        <BarChart2 size={13} />
        {hasMetrics ? 'Metrics updated · Edit' : 'Add metrics'}
      </span>
      <ChevronRight size={13} />
    </motion.button>
  )
}

// ── Content Vault — relative-time helper ──────────────────────────────────────
function relativeTimeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const hrs = diffMs / 36e5
  if (hrs < 1) return 'Just now'
  if (hrs < 24) return `${Math.round(hrs)}h ago`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return `${Math.round(days / 7)} week${days >= 14 ? 's' : ''} ago`
}

// ── Content Vault — header (title + Import Content + New Folder) ─────────────
function VaultHeader({ onImport, onNewFolder }) {
  return (
    <div style={{ padding: '24px 28px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
      <div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 32, letterSpacing: '-0.02em', color: INK, margin: '0 0 5px' }}>Content Vault</h1>
        <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>Pick a folder, then open any post in the editor.</p>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onImport} className="cc-press"
          style={{ display: 'flex', alignItems: 'center', gap: 7, height: 40, padding: '0 16px', border: `1px solid ${BDR}`, background: WHITE, borderRadius: 11, fontSize: 13.5, fontWeight: 600, color: INK, cursor: 'pointer', fontFamily: FONT }}
          onMouseEnter={e => e.currentTarget.style.background = TINT}
          onMouseLeave={e => e.currentTarget.style.background = WHITE}>
          <Upload size={15} color={MUTED} /> Import Content
        </button>
        <button onClick={onNewFolder} className="cc-press"
          style={{ display: 'flex', alignItems: 'center', gap: 7, height: 40, padding: '0 18px', border: 'none', borderRadius: 11, fontSize: 13.5, fontWeight: 600, color: WHITE, background: BLUE, boxShadow: '0 10px 24px -10px rgba(37,99,235,.6)', cursor: 'pointer', fontFamily: FONT }}>
          <Plus size={15} /> New Folder
        </button>
      </div>
    </div>
  )
}

// ── Content Vault — search bar ────────────────────────────────────────────────
function VaultSearch({ value, onChange }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ padding: '0 28px 18px', flexShrink: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, height: 48, padding: '0 16px',
        background: focused ? WHITE : '#F8FAFC', border: `1px solid ${focused ? BLUE : BDR}`, borderRadius: 14,
        boxShadow: focused ? '0 0 0 4px rgba(37,99,235,.1)' : 'none', transition: 'border-color .15s, box-shadow .15s',
      }}>
        <Search size={16} color={FAINT} />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search posts across every folder…"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14.5, fontFamily: FONT, color: INK }}
        />
        {value && (
          <button onClick={() => onChange('')} className="cc-press"
            style={{ width: 24, height: 24, borderRadius: 7, border: 'none', background: '#E9EDF3', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = '#dde2ea'}
            onMouseLeave={e => e.currentTarget.style.background = '#E9EDF3'}>
            <X size={13} color={MUTED} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Content Vault — left folder rail ──────────────────────────────────────────
function FolderRail({ folders, postsByFolder, selectedId, onSelect, onDeleteFolder, onRenameFolder }) {
  const [menuFor, setMenuFor] = useState(null)   // { x, y, folderId }
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal] = useState('')

  function handleFolderMenuBtn(e, folderId) {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setMenuFor({ x: r.left, y: r.bottom + 4, folderId })
  }

  function submitRename() {
    const trimmed = renameVal.trim()
    if (trimmed && renamingId) onRenameFolder(renamingId, trimmed)
    setRenamingId(null)
  }

  return (
    <div style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${BDR}`, background: '#FCFDFF', padding: '16px 14px', overflowY: 'auto' }}>
      <p style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.12em', color: FAINT, padding: '4px 8px 12px', margin: 0, textTransform: 'uppercase' }}>Folders</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {folders.map((folder, i) => {
          const tint = FOLDER_TINTS[i % FOLDER_TINTS.length]
          const active = selectedId === folder.id
          const count = postsByFolder[folder.id]?.length ?? 0
          const isRenaming = renamingId === folder.id
          return (
            <div key={folder.id} style={{ position: 'relative' }}>
              <div
                onClick={() => { if (!isRenaming) onSelect(folder.id) }}
                className="cc-press"
                style={{
                  display: 'flex', gap: 12, width: '100%', padding: '11px 12px', textAlign: 'left',
                  border: `1px solid ${active ? 'rgba(37,99,235,.35)' : BDR}`,
                  background: active ? '#EAF0FF' : WHITE,
                  borderRadius: 13, cursor: 'pointer', transition: 'background .15s ease, border-color .15s ease',
                  boxSizing: 'border-box', alignItems: 'center',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = 'rgba(37,99,235,.3)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = active ? 'rgba(37,99,235,.35)' : BDR }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, background: tint.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Folder size={17} color={tint.color} />
                </span>
                <span style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); submitRename() }
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={submitRename}
                      style={{ width: '100%', fontSize: 13.5, fontWeight: 600, fontFamily: FONT, color: INK, border: `1.5px solid ${BLUE}`, borderRadius: 6, padding: '3px 7px', outline: 'none', background: WHITE, boxSizing: 'border-box' }}
                    />
                  ) : (
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                  )}
                  <span style={{ display: 'block', fontSize: 12, color: MUTED }}>{count} post{count === 1 ? '' : 's'}</span>
                </span>
                <button
                  onClick={e => handleFolderMenuBtn(e, folder.id)}
                  title="More options"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 6, color: FAINT, flexShrink: 0, fontSize: 15, fontWeight: 700, letterSpacing: '.05em', lineHeight: 1 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.color = INDIGO }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = FAINT }}>
                  ···
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {menuFor && (
        <ContextMenu
          x={menuFor.x} y={menuFor.y}
          variant="dashboard"
          onClose={() => setMenuFor(null)}
          items={[
            { label: 'Rename', onClick: () => { setRenameVal(folders.find(f => f.id === menuFor.folderId)?.name || ''); setRenamingId(menuFor.folderId) } },
            { label: 'Delete folder', onClick: () => onDeleteFolder(menuFor.folderId), danger: true },
          ]}
        />
      )}
    </div>
  )
}

// ── Content Vault — empty state ───────────────────────────────────────────────
function VaultEmptyState({ searching }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 14 }}>
      <span style={{ width: 60, height: 60, borderRadius: 16, background: WHITE, border: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Folder size={24} color="#CBD5E1" />
      </span>
      <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>{searching ? 'No posts match your search.' : 'This folder is empty.'}</p>
    </div>
  )
}

// ── Content Vault — post card ─────────────────────────────────────────────────
function PostCard({ post, index, folders, onOpen, onDelete, onRename, onPin, onMove, existingMetrics, onOpenMetrics }) {
  const [menuPos, setMenuPos]     = useState(null)
  const [renaming, setRenaming]   = useState(false)
  const [renameVal, setRenameVal] = useState(post.title)
  const renameRef = useRef(null)
  const st = STATUS_STYLE[post.status] || STATUS_STYLE.draft
  const isPublished = post.status === 'published'

  function handleMenuBtn(e) {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setMenuPos({ x: r.left, y: r.bottom + 4 })
  }

  function handleRenameSubmit() {
    const trimmed = renameVal.trim()
    if (trimmed && trimmed !== post.title) onRename(post.id, trimmed)
    setRenaming(false)
  }

  return (
    <div
      className={`cc-stagger cc-stagger-${Math.min(index + 1, 5)}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 14, background: WHITE,
        border: `1px solid ${BDR}`, borderRadius: 16, padding: '16px 16px 14px',
        boxShadow: '0 8px 22px -18px rgba(17,24,39,.4)', cursor: 'pointer',
        transition: 'transform .16s cubic-bezier(.16,1,.3,1), box-shadow .16s cubic-bezier(.16,1,.3,1), border-color .16s cubic-bezier(.16,1,.3,1)',
      }}
      onClick={() => { if (!renaming) onOpen(post) }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 16px 32px -16px rgba(17,24,39,.3)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,.35)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 22px -18px rgba(17,24,39,.4)'; e.currentTarget.style.borderColor = BDR }}>

      {/* Top row: status pill (§B1) + version + 3-dot menu */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ height: 24, padding: '0 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
          {st.label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: MONO, fontSize: 11, color: FAINT }}>
            <Clock size={12} /> v{post.current_version}
          </span>
          <button
            onClick={handleMenuBtn}
            title="More options"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: 6, color: FAINT, display: 'flex', alignItems: 'center', lineHeight: 1, fontSize: 16, fontWeight: 700, letterSpacing: '.05em' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.color = INDIGO }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = FAINT }}>
            ···
          </button>
        </div>
      </div>

      {/* Title — or inline rename input */}
      {renaming ? (
        <input
          ref={renameRef}
          autoFocus
          value={renameVal}
          onChange={e => setRenameVal(e.target.value)}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRenameSubmit() } if (e.key === 'Escape') { setRenaming(false); setRenameVal(post.title) } }}
          onBlur={handleRenameSubmit}
          style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 17, color: INK, border: `1.5px solid ${BLUE}`, borderRadius: 8, padding: '6px 10px', outline: 'none', width: '100%', boxSizing: 'border-box', background: '#F8FAFF' }}
        />
      ) : (
        <h3 style={{
          fontFamily: SERIF, fontWeight: 600, fontSize: 19, lineHeight: 1.25, color: INK, margin: 0,
          minHeight: 48, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{post.title}</h3>
      )}

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `1px solid rgba(17,24,39,.06)`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: FAINT }}>
          {post.is_pinned && <span style={{ marginRight: 6, color: INDIGO, fontWeight: 600 }}>📌</span>}
          Updated {relativeTimeAgo(post.updated_at)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, color: BLUE }}>Open <ArrowUpRight size={13} /></span>
      </div>

      {/* §B2 — MetricsBar (published posts only; stopPropagation prevents card open) */}
      {isPublished && (
        <MetricsBar hasMetrics={!!existingMetrics} onClick={() => onOpenMetrics(post)} />
      )}

      {menuPos && (
        <ContextMenu
          x={menuPos.x} y={menuPos.y}
          variant="dashboard"
          onClose={() => setMenuPos(null)}
          items={[
            { label: 'Rename', onClick: () => { setRenameVal(post.title); setRenaming(true) } },
            { label: post.is_pinned ? 'Unpin' : 'Pin to top', onClick: () => onPin(post.id, post.is_pinned) },
            ...(folders || [])
              .filter(f => f.id !== post.folder_id)
              .map(f => ({
                label: `Move to "${f.name}"`,
                onClick: () => onMove(post.id, post.folder_id, f.id),
              })),
            { label: 'Delete', onClick: () => onDelete(post.id), danger: true },
          ]}
        />
      )}
    </div>
  )
}

// ── Content Vault — main posts panel ──────────────────────────────────────────
function VaultMain({ folders, postsByFolder, selectedId, searchQuery, onOpen, onCreatePost, creatingPost, onDelete, onRename, onPin, onMove, getMetrics, onSaveMetrics }) {
  const [metricsPost, setMetricsPost] = useState(null)

  const searching = searchQuery.trim().length > 0
  const selectedFolder = folders.find(f => f.id === selectedId)

  let posts, kicker, title, count
  if (searching) {
    const q = searchQuery.trim().toLowerCase()
    posts = folders.flatMap(f => (postsByFolder[f.id] || []).filter(p => p.title.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)))
    kicker = 'Across all folders'
    title = 'Search results'
    count = posts.length
  } else {
    posts = postsByFolder[selectedId] || []
    kicker = 'FOLDER'
    title = selectedFolder?.name || ''
    count = posts.length
  }
  posts = posts.slice().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))

  return (
    <div style={{ flex: 1, minWidth: 0, background: '#F8FAFC', overflowY: 'auto', padding: '22px 26px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <p style={{ fontFamily: MONO, fontSize: 10.5, color: FAINT, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '.08em' }}>{kicker}</p>
          <h2 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 24, color: INK, margin: 0 }}>{title}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: FAINT }}>{count} post{count === 1 ? '' : 's'}</span>
          {!searching && selectedId && (
            <button onClick={() => onCreatePost(selectedId)} disabled={creatingPost} className="cc-press"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: BLUE, color: WHITE, border: 'none', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
              <Plus size={13} /> {creatingPost ? 'Creating…' : 'New Post'}
            </button>
          )}
        </div>
      </div>

      {posts.length === 0 ? (
        <VaultEmptyState searching={searching} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(268px,1fr))', gap: 14 }}>
          {posts.map((post, i) => (
            <PostCard
              key={post.id} post={post} index={i} folders={folders}
              onOpen={onOpen} onDelete={onDelete} onRename={onRename} onPin={onPin} onMove={onMove}
              existingMetrics={getMetrics(post.id)}
              onOpenMetrics={setMetricsPost}
            />
          ))}
        </div>
      )}

      {/* §C — single MetricsModal lifted above PostCard to avoid CSS transform stacking-context bug */}
      <MetricsModal
        open={!!metricsPost}
        post={metricsPost}
        platform={metricsPost?.platform || 'linkedin'}
        existingMetrics={metricsPost ? getMetrics(metricsPost.id) : undefined}
        onSave={onSaveMetrics}
        onClose={() => setMetricsPost(null)}
      />
    </div>
  )
}

// ── Content Vault — New Folder / Import Content stub modals ──────────────────
function NewFolderModal({ open, onClose, onCreate, creating }) {
  const [name, setName] = useState('')
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); if (name.trim()) onCreate(name.trim()) }}
        style={{ width: 360, background: WHITE, borderRadius: 16, padding: 22, fontFamily: FONT, boxShadow: '0 30px 70px -20px rgba(17,24,39,.35)' }}>
        <p style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: INK, margin: '0 0 14px' }}>New folder</p>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Folder name"
          style={{ width: '100%', border: `1px solid ${BDR}`, borderRadius: 10, padding: '9px 12px', fontSize: 13.5, fontFamily: FONT, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} className="cc-press" style={{ flex: 1, background: WHITE, border: `1px solid ${BDR}`, borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 600, color: MUTED, cursor: 'pointer', fontFamily: FONT }}>Cancel</button>
          <button type="submit" disabled={!name.trim() || creating} className="cc-press" style={{ flex: 1, background: BLUE, border: 'none', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 600, color: WHITE, cursor: 'pointer', fontFamily: FONT }}>{creating ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </div>
  )
}

function ImportContentModal({ open, onClose }) {
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 380, background: WHITE, borderRadius: 16, padding: 22, fontFamily: FONT, boxShadow: '0 30px 70px -20px rgba(17,24,39,.35)' }}>
        <p style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: INK, margin: '0 0 8px' }}>Import content</p>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 18px', lineHeight: 1.5 }}>
          Paste text, upload a file, or import from a URL. {/* TODO: import pipeline (paste, upload, URL) */}
        </p>
        <button onClick={onClose} className="cc-press" style={{ width: '100%', background: TINT, border: `1px solid ${BDR}`, borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 600, color: BLUE, cursor: 'pointer', fontFamily: FONT }}>Coming soon</button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyWorkPage() {
  const navigate  = useNavigate()
  const location  = useLocation()

  // ── Sidebar (shared AppSidebar — expanded 248px / collapsed 64px) ──────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth < 768)

  // ── Vault data (real backend) ──────────────────────────────────────────────
  const { folders, postsByFolder, loading: vaultLoading, addFolder, addPost, removePost, updatePost, movePost, removeFolder, updateFolder } = useVault()

  // ── §A3 — in-memory metrics store ─────────────────────────────────────────
  const { saveMetrics, getMetrics } = useMetrics()
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [creatingPost, setCreatingPost] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [linkedInToast, setLinkedInToast] = useState(null)  // 'connected' | 'error' | null

  // Handle return from LinkedIn OAuth — LinkedIn redirects back with ?linkedin_connected=true
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('linkedin_connected') === 'true') {
      setLinkedInToast('connected')
      setTimeout(() => setLinkedInToast(null), 4000)
      window.history.replaceState({}, '', location.pathname)
    } else if (params.get('linkedin_error') === 'true') {
      setLinkedInToast('error')
      setTimeout(() => setLinkedInToast(null), 4000)
      window.history.replaceState({}, '', location.pathname)
    }
  }, [location.search])

  // Default-select the first folder once loaded (matches spec's "default selected folder")
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selectedFolderId && folders.length > 0) setSelectedFolderId(folders[0].id)
  }, [folders, selectedFolderId])

  // ── Active post → drives Canvas mode ──────────────────────────────────────
  const [activePost, setActivePost] = useState(null)  // null = Vault view, obj = editor

  const panelsCollapsed = sidebarCollapsed

  function handleSelectFolder(folderId) {
    setSelectedFolderId(folderId)
    setSearchQuery('')
  }

  async function handleCreateFolder(name) {
    setCreatingFolder(true)
    try {
      const folder = await addFolder(name)
      setSelectedFolderId(folder.id)
      setNewFolderOpen(false)
    } catch (err) { console.error('Create folder failed:', err) }
    finally { setCreatingFolder(false) }
  }

  async function handleDeleteFolder(folderId) {
    const count = (postsByFolder[folderId] || []).length
    const msg = count > 0
      ? `Delete this folder and its ${count} post${count === 1 ? '' : 's'}? This cannot be undone.`
      : 'Delete this folder? This cannot be undone.'
    if (!window.confirm(msg)) return
    try {
      await deleteFolder(folderId)
      removeFolder(folderId)
      if (selectedFolderId === folderId) {
        const remaining = folders.filter(f => f.id !== folderId)
        setSelectedFolderId(remaining[0]?.id ?? null)
      }
    } catch (err) { console.error('Delete folder failed:', err) }
  }

  async function handleRenameFolder(folderId, newName) {
    try {
      const updated = await renameFolder(folderId, newName)
      updateFolder(folderId, { name: updated.name })
    } catch (err) { console.error('Rename folder failed:', err) }
  }

  async function handleCreatePost(folderId) {
    if (creatingPost) return
    setCreatingPost(true)
    try {
      const post = await addPost(folderId)
      setActivePost(post)
      setSidebarCollapsed(true)
    } catch (err) { console.error('Create post failed:', err) }
    finally { setCreatingPost(false) }
  }

  // "Start Writing" nav item lands on /my-work?new=1 — auto-create a post in the
  // first folder (or a fresh one if none exist yet) and jump straight into the editor.
  useEffect(() => {
    const wantsNew = new URLSearchParams(location.search).get('new') === '1'
    if (!wantsNew || vaultLoading) return
    ;(async () => {
      let folderId = folders[0]?.id
      if (!folderId) {
        const folder = await addFolder('Quick Drafts')
        folderId = folder.id
      }
      await handleCreatePost(folderId)
      navigate('/my-work', { replace: true })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, vaultLoading])

  function handleOpenPost(post) {
    setActivePost(post)
  }

  async function handleEditorClose(postId, isEmpty) {
    if (isEmpty) {
      try {
        await deletePost(postId)
        removePost(postId)
      } catch (err) { console.error('Discard empty draft failed:', err) }
    }
    setActivePost(null)
  }

  function handleEditorTogglePanels() {
    setSidebarCollapsed(c => !c)
  }

  function handleEditorTitleChange(_id, title) {
    setActivePost(prev => ({ ...prev, title }))
  }

  async function handleDeletePost(postId) {
    if (!window.confirm('Delete this post and all its versions? This cannot be undone.')) return
    try {
      await deletePost(postId)
      removePost(postId)
      setActivePost(prev => (prev?.id === postId ? null : prev))
    } catch (err) { console.error('Delete post failed:', err) }
  }

  async function handleRenamePost(postId, newTitle) {
    try {
      const updated = await renamePost(postId, newTitle)
      updatePost(postId, { title: updated.title, updated_at: updated.updated_at })
      if (activePost?.id === postId) setActivePost(prev => ({ ...prev, title: updated.title }))
    } catch (err) { console.error('Rename post failed:', err) }
  }

  async function handlePinPost(postId, currentlyPinned) {
    try {
      const updated = await pinPost(postId, !currentlyPinned)
      updatePost(postId, { is_pinned: updated.is_pinned })
    } catch (err) { console.error('Pin post failed:', err) }
  }

  async function handleMovePost(postId, fromFolderId, toFolderId) {
    try {
      await movePost(postId, fromFolderId, toFolderId)
    } catch (err) { console.error('Move post failed:', err) }
  }

  function handlePostStatusChange(postId, newStatus, scheduledAt, platform) {
    // Update the shared vault state so PostCard reflects the change immediately
    updatePost(postId, { status: newStatus, scheduled_at: scheduledAt ?? null, platform: platform ?? 'linkedin' })
    // Also update activePost so re-opening the editor seeds the correct status + platform
    setActivePost(prev => prev?.id === postId ? { ...prev, status: newStatus, platform: platform ?? 'linkedin' } : prev)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── LinkedIn OAuth return toast ───────────────────────────────────────── */}
      {linkedInToast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '10px 20px', borderRadius: 10, fontSize: 13.5, fontWeight: 600,
          fontFamily: FONT, boxShadow: '0 8px 24px rgba(17,24,39,0.18)',
          background: linkedInToast === 'connected' ? '#16A34A' : '#DC2626',
          color: WHITE,
        }}>
          {linkedInToast === 'connected' ? '✓ LinkedIn connected successfully!' : 'LinkedIn connection failed — please try again'}
        </div>
      )}

      {/* ── COLUMN 1: Shared app sidebar (same component as Dashboard) ──────── */}
      <AppSidebar
        navigate={navigate}
        activeKey={location.pathname === '/vault' ? 'vault' : 'content'}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
      />

      {/* ── COLUMN 2: Canvas — Content Vault or DocEditor ────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: WHITE, minWidth: 0 }}>
        {activePost ? (
          <DocEditor
            post={activePost}
            panelsCollapsed={panelsCollapsed}
            onTogglePanels={handleEditorTogglePanels}
            onClose={handleEditorClose}
            onTitleChange={handleEditorTitleChange}
            onPinPost={handlePinPost}
            onDeletePost={handleDeletePost}
            onStatusChange={handlePostStatusChange}
            plan="pro"
          />
        ) : vaultLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: FAINT, fontSize: 14, fontFamily: FONT }}>Loading…</div>
        ) : (
          <>
            <VaultHeader onImport={() => setImportOpen(true)} onNewFolder={() => setNewFolderOpen(true)} />
            <VaultSearch value={searchQuery} onChange={setSearchQuery} />
            <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', borderTop: `1px solid ${BDR}` }}>
              <FolderRail folders={folders} postsByFolder={postsByFolder} selectedId={selectedFolderId} onSelect={handleSelectFolder} onDeleteFolder={handleDeleteFolder} onRenameFolder={handleRenameFolder} />
              <VaultMain
                folders={folders}
                postsByFolder={postsByFolder}
                selectedId={selectedFolderId}
                searchQuery={searchQuery}
                onOpen={handleOpenPost}
                onCreatePost={handleCreatePost}
                creatingPost={creatingPost}
                onDelete={handleDeletePost}
                onRename={handleRenamePost}
                onPin={handlePinPost}
                onMove={handleMovePost}
                getMetrics={getMetrics}
                onSaveMetrics={saveMetrics}
              />
            </div>
          </>
        )}
      </div>

      <NewFolderModal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} onCreate={handleCreateFolder} creating={creatingFolder} />
      <ImportContentModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
