import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { animate, AnimatePresence, motion } from 'framer-motion'
import {
  browseDrive, deleteDocument, deleteSource, getDriveConnectUrl, knowledgeErrorReason,
  listDocuments, listSources, setSelection, syncSource,
} from '../api/knowledge'

/* Knowledge page (design: "Honne Knowledge"), wired to /api/knowledge:
   sources and documents come from the backend, Google Drive is connected
   through Google's consent screen (finished by GDriveCallbackPage), folders are
   picked in a Drive browser, and "Sync now" runs the same sync the 5-minute
   poller runs. While a sync is running the page refreshes every few seconds. */

const C = {
  bg: '#F8F7F4',
  panel: '#F2F0EC',
  ink: '#1C1A17',
  body: '#57534C',
  faint: '#77726A',
  faint3: '#9A958C',
  border: 'rgba(28,26,23,.08)',
  borderSoft: 'rgba(28,26,23,.06)',
  orange: '#F0662A',
  teal: '#2C6E7F',
  green: '#2F7D5B',
  red: '#B4432A',
}
const FONT = {
  serif: "'Instrument Serif', Georgia, serif",
  mono: "'Geist Mono', ui-monospace, monospace",
}

// Each chunk is ~8 KB: 768-dim vector (3.1 KB) + ≤512 tokens text (2 KB) + HNSW entry (3.1 KB).
const CHUNK_KB = 8
const QUOTA_KB = 100 * 1024

const FAST_POLL_MS = 2500 // while a sync runs, or just after one was requested
const SLOW_POLL_MS = 30000 // otherwise: picks up the 5-minute poller's runs
const FAST_WINDOW_MS = 60000 // a requested sync may take a moment to take its lease
const MAX_SELECTED = 200 // backend limit (router.py MAX_SELECTED)

const PROVIDERS = {
  gdrive: { name: 'Google Drive', color: C.orange, icon: 'https://cdn.simpleicons.org/googledrive', empty: 'Docs from your Drive folders' },
  upload: { name: 'Uploads', color: C.teal, icon: `https://cdn.simpleicons.org/files/${C.teal.slice(1)}`, empty: 'PDF, Word, Markdown, text', soon: true },
}

const PIPELINE = [
  ['Connector', 'Drive changes since last cursor'],
  ['Fetch text', 'Export each changed file'],
  ['Hash diff', 'SHA-256, skip unchanged'],
  ['Chunk', 'Up to 512 tokens'],
  ['Embed', 'gemini-embedding-2 · 768d'],
  ['Store', 'pgvector, scoped to you'],
]

const DOC_STATUS = {
  synced: ['Synced', '#E8F2EC', C.green],
  failed: ['Failed', '#FBEAE4', C.red],
}

const MIME_LABEL = {
  'application/vnd.google-apps.document': 'Google Doc',
  'application/vnd.google-apps.spreadsheet': 'Google Sheet',
  'application/vnd.google-apps.folder': 'Folder',
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'text/markdown': 'Markdown',
  'text/plain': 'Text',
}

// Backend reason codes (router.py `_fail`) -> what the user can do about it.
const REASONS = {
  invalid_state: 'The connection link expired or belongs to another session. Try connecting again.',
  consent_denied: 'Google Drive was not connected: the consent screen was cancelled.',
  scope_not_granted: 'Honne needs read access to your Drive. Connect again and leave the Drive box ticked.',
  no_refresh_token: "Google didn't grant offline access. Remove Honne under myaccount.google.com → Security → Third-party access, then connect again.",
  exchange_failed: 'Google rejected the sign-in code. Try connecting again.',
  oauth_error: 'Google returned an error. Try connecting again.',
  missing_code: 'Google returned no sign-in code. Try connecting again.',
  google_unavailable: "Couldn't reach Google. Try again in a minute.",
  drive_not_configured: "Google Drive isn't configured on the server yet.",
  auth_revoked: 'Google access was revoked. Reconnect Google Drive.',
  source_not_found: 'That source no longer exists.',
  document_not_found: 'That document was already removed.',
  invalid_request: 'The server rejected that request. Try fewer items, or reload the page.',
}
const reasonText = r => REASONS[r] ?? `Something went wrong (${r}).`

const fmt = n => n.toLocaleString('en-US')
const sizeOf = kb => (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB')
const selectionOf = s => [...(s?.config?.folder_ids ?? []), ...(s?.config?.file_ids ?? [])]

function timeAgo(iso) {
  if (!iso) return '—'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + ' min ago'
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'
  const d = Math.floor(s / 86400)
  if (d < 7) return d === 1 ? '1 day ago' : d + ' days ago'
  const w = Math.floor(d / 7)
  return w === 1 ? '1 week ago' : w + ' weeks ago'
}

function Card({ children, style, i = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: i * 0.07, ease: [0.2, 0.7, 0.2, 1] }}
      style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, ...style }}
    >
      {children}
    </motion.section>
  )
}

const ghostBtn = { height: 38, whiteSpace: 'nowrap', flex: 'none', padding: '0 14px', borderRadius: 10, border: '1px solid rgba(28,26,23,.12)', background: '#FFFFFF', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', color: C.ink }
const primaryBtn = { height: 38, whiteSpace: 'nowrap', flex: 'none', padding: '0 16px', borderRadius: 10, border: 0, background: C.ink, color: '#FFFFFF', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }
const rowBtn = { height: 30, padding: '0 11px', flex: 'none', borderRadius: 8, border: '1px solid rgba(28,26,23,.12)', background: '#FFFFFF', color: C.body, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }
const linkBtn = { border: 0, background: 'transparent', padding: 0, fontSize: 12, color: C.body, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }

/** Sources + documents from the backend; polls fast while a sync runs. */
function useKnowledge() {
  const [state, setState] = useState({ sources: [], documents: [], loaded: false, error: null })
  const [fastUntil, setFastUntil] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const [sources, documents] = await Promise.all([listSources(), listDocuments()])
      setState({ sources, documents, loaded: true, error: null })
      return sources
    } catch (err) {
      setState(s => ({ ...s, loaded: true, error: knowledgeErrorReason(err) }))
      return null
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const syncing = state.sources.some(s => s.syncing)
  useEffect(() => {
    if (!state.loaded) return undefined
    const fast = syncing || Date.now() < fastUntil
    const timer = setTimeout(refresh, fast ? FAST_POLL_MS : SLOW_POLL_MS)
    return () => clearTimeout(timer)
  }, [state, syncing, fastUntil, refresh])

  const watchSync = useCallback(() => setFastUntil(Date.now() + FAST_WINDOW_MS), [])
  return { ...state, syncing, refresh, watchSync }
}

export default function KnowledgeView() {
  const { sources, documents, loaded, error, syncing, refresh, watchSync } = useKnowledge()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  // Back from Google's consent screen: GDriveCallbackPage put the outcome in the URL.
  const [notice, setNotice] = useState(() => (
    params.get('drive') === 'error' ? { tone: 'error', text: reasonText(params.get('reason') ?? 'unknown') } : null
  )) // { tone: 'ok'|'error', text }
  const justConnected = useRef(params.get('drive') === 'connected' ? (params.get('source') ?? '') : null)
  const [modal, setModal] = useState(null) // { step: 'pick'|'auth'|'files', source? }
  const usedRef = useRef(null)
  const shown = useRef(0)

  const drives = sources.filter(s => s.provider === 'gdrive')
  const reconnect = drives.some(s => s.needs_reconnect)
  const syncable = drives.filter(s => selectionOf(s).length && !s.needs_reconnect)

  // Clean the URL. A new Drive gets the folder picker; a reconnected one with
  // folders already picked is syncing again (the backend restarted it).
  useEffect(() => {
    if (params.get('drive')) setParams({}, { replace: true })
    if (justConnected.current === null) return
    const sourceId = justConnected.current
    justConnected.current = null
    refresh().then(list => {
      const drivesNow = (list ?? []).filter(s => s.provider === 'gdrive')
      const source = drivesNow.find(s => s.id === sourceId) ?? drivesNow.find(s => !selectionOf(s).length)
      if (source && selectionOf(source).length) {
        watchSync()
        setNotice({ tone: 'ok', text: `Google Drive reconnected as ${source.display_name}. Syncing your selected folders now.` })
      } else {
        setNotice({ tone: 'ok', text: 'Google Drive connected. Pick the folders Honne should learn from.' })
        if (source) setModal({ step: 'files', source })
      }
    })
  }, [params, setParams, refresh, watchSync])

  async function syncNow(list = syncable) {
    if (!list.length) return
    try {
      await Promise.all(list.map(s => syncSource(s.id)))
      watchSync()
      setNotice({ tone: 'ok', text: 'Sync started. New and changed files appear below as they finish.' })
      refresh()
    } catch (err) {
      setNotice({ tone: 'error', text: reasonText(knowledgeErrorReason(err)) })
    }
  }

  // Confirmed in the modal's "Disconnect source" step.
  async function disconnect(source) {
    setModal(null)
    try {
      await deleteSource(source.id)
      setNotice({ tone: 'ok', text: `${source.display_name} disconnected.` })
    } catch (err) {
      setNotice({ tone: 'error', text: reasonText(knowledgeErrorReason(err)) })
    }
    refresh()
  }

  // Confirmed in the row's "⋯" menu.
  async function removeDocument(doc) {
    try {
      await deleteDocument(doc.id)
      setNotice({ tone: 'ok', text: `${doc.title} deleted. It won't be synced again; the file in Drive is unchanged.` })
    } catch (err) {
      setNotice({ tone: 'error', text: reasonText(knowledgeErrorReason(err)) })
    }
    refresh()
  }

  async function saveSelection(source, selection) {
    await setSelection(source.id, selection)
    setModal(null)
    await syncNow([source])
  }

  const providerOf = Object.fromEntries(sources.map(s => [s.id, s.provider]))
  const docs = documents.map(d => ({ ...d, provider: providerOf[d.source_id] }))
  const chunksFor = p => docs.filter(d => d.provider === p).reduce((a, d) => a + d.chunk_count, 0)
  const driveKB = chunksFor('gdrive') * CHUNK_KB
  const uploadKB = chunksFor('upload') * CHUNK_KB
  const usedKB = driveKB + uploadKB
  const usedMB = usedKB / 1024
  const totalChunks = usedKB / CHUNK_KB

  // Count the "MB used" figure up to its new value.
  useEffect(() => {
    const controls = animate(shown.current, usedMB, {
      duration: 1.1, ease: [0.2, 0.7, 0.2, 1],
      onUpdate: v => { shown.current = v; if (usedRef.current) usedRef.current.textContent = v.toFixed(1) },
    })
    return () => controls.stop()
  }, [usedMB])

  const lastRun = sources.map(s => s.last_run_at ?? s.last_success_at).filter(Boolean).sort().at(-1)
  const ql = q.trim().toLowerCase()
  const rows = docs.filter(d => (tab === 'all' || d.provider === tab) && (!ql || d.title.toLowerCase().includes(ql)))

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '40px clamp(16px, 4vw, 40px) 80px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        .hn-kn-ghost:hover:not(:disabled) { border-color: rgba(28,26,23,.3) !important; }
        .hn-kn-primary:hover:not(:disabled) { background: ${C.orange} !important; }
        .hn-kn button:disabled { cursor: not-allowed; opacity: .5; }
        .hn-kn-row-btn:hover { border-color: ${C.ink} !important; }
        @keyframes hn-kn-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
      `}</style>

      {/* Header */}
      <motion.div
        className="hn-kn"
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
        style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
      >
        <div>
          <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.08em', color: C.faint }}>KNOWLEDGE SOURCE</div>
          <h1 style={{ margin: '6px 0 0', fontFamily: FONT.serif, fontWeight: 400, fontSize: 44, lineHeight: 1, letterSpacing: '-0.02em' }}>Your company brain</h1>
          <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5, color: C.body, maxWidth: 520, textWrap: 'pretty' }}>
            Every document you connect is split into chunks, embedded and stored once. All your agents search the same store.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button data-testid="kn-connect" onClick={() => setModal({ step: 'pick' })} className="hn-kn-ghost" style={ghostBtn}>
            Connect source
          </button>
          <button
            data-testid="kn-sync" onClick={() => syncNow()} disabled={!syncable.length || syncing}
            title={!drives.length ? 'Connect a source first' : !syncable.length ? 'Pick folders first' : undefined}
            className="hn-kn-primary" style={primaryBtn}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </motion.div>

      {(notice || error) && (
        <div
          data-testid="kn-notice" role={notice?.tone === 'error' || error ? 'alert' : 'status'}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.45, background: notice?.tone === 'ok' && !error ? '#E8F2EC' : '#FBEAE4', color: notice?.tone === 'ok' && !error ? C.green : C.red }}
        >
          <span style={{ flex: 1 }}>{error ? `Couldn't load your knowledge sources (${error}). Retrying…` : notice.text}</span>
          {notice && <button onClick={() => setNotice(null)} aria-label="Dismiss" style={{ ...linkBtn, color: 'inherit' }}>Dismiss</button>}
        </div>
      )}

      {reconnect && (
        <div data-testid="kn-expired" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '14px 16px', borderRadius: 14, background: '#FBEAE4', border: '1px solid rgba(180,67,42,.25)' }}>
          <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 9, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={PROVIDERS.gdrive.icon} alt="" style={{ width: 16, height: 16 }} />
          </span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#7A2A18' }}>Google Drive access expired</div>
            <div style={{ fontSize: 12.5, color: '#8E3B26', marginTop: 2 }}>Syncing is paused. Your stored documents and chunks are kept.</div>
          </div>
          <button onClick={() => setModal({ step: 'auth', reconnect: true })} className="hn-kn-primary" style={{ ...primaryBtn, height: 34, padding: '0 14px', borderRadius: 9, fontSize: 13 }}>Reconnect</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
        {/* Storage */}
        <Card i={1} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Storage</span>
            <span style={{ fontSize: 12, color: C.faint }}>Free workspace · 100 MB</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span ref={usedRef} style={{ fontFamily: FONT.serif, fontSize: 56, lineHeight: 0.9, letterSpacing: '-0.02em' }}>0.0</span>
            <span style={{ fontSize: 15, color: C.body }}>MB used</span>
            <span style={{ marginLeft: 'auto', fontFamily: FONT.mono, fontSize: 12, color: C.body }}>{(usedKB / QUOTA_KB * 100).toFixed(1)}% of 100 MB</span>
          </div>
          <div style={{ height: 12, borderRadius: 999, background: C.panel, display: 'flex', overflow: 'hidden', gap: 2 }}>
            <div style={{ height: '100%', width: `${driveKB / QUOTA_KB * 100}%`, background: C.orange, borderRadius: 999, transition: 'width 1.1s cubic-bezier(.2,.7,.2,1)' }} />
            <div style={{ height: '100%', width: `${uploadKB / QUOTA_KB * 100}%`, background: C.teal, borderRadius: 999, transition: 'width 1.1s cubic-bezier(.2,.7,.2,1)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
            {[['Documents', fmt(docs.length), 'kn-docs-total'], ['Chunks', fmt(totalChunks), 'kn-chunks-total'], ['Room left', '≈' + fmt(Math.round((QUOTA_KB - usedKB) / CHUNK_KB)) + ' chunks']].map(([k, v, id]) => (
              <div key={k}>
                <div style={{ fontSize: 12, color: C.faint }}>{k}</div>
                <div data-testid={id} style={{ fontSize: 20, fontWeight: 500, marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 14, borderTop: '1px solid rgba(28,26,23,.07)', fontSize: 12, lineHeight: 1.5, color: C.faint, textWrap: 'pretty' }}>
            Estimated: each chunk takes about 8 KB, its 768‑dim vector (3.1 KB), up to 512 tokens of text (2 KB) and its search‑index entry (3.1 KB).
          </div>
        </Card>

        {/* Sources */}
        <Card i={2} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Sources</span>
          {Object.entries(PROVIDERS).map(([id, p]) => {
            const conns = sources.filter(s => s.provider === id)
            if (!conns.length) {
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${C.borderSoft}`, opacity: p.soon ? 0.6 : 1 }}>
                  <SourceIcon p={p} on={false} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{p.empty}</div>
                  </div>
                  {p.soon
                    ? <span style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '.06em', color: C.faint }}>SOON</span>
                    : <span style={{ fontSize: 12, color: C.faint }}>{loaded ? 'Not connected' : 'Loading…'}</span>}
                </div>
              )
            }
            return conns.map(s => {
              const mine = docs.filter(d => d.source_id === s.id)
              const failed = mine.filter(d => d.sync_status === 'failed').length
              const kb = mine.reduce((a, d) => a + d.chunk_count, 0) * CHUNK_KB
              const picked = selectionOf(s).length
              const [status, stColor] = s.needs_reconnect ? ['Reconnect needed', C.red]
                : s.syncing ? ['Syncing…', C.orange]
                : s.status === 'error' ? ['Error', C.red]
                : !picked ? ['Pick folders', C.orange]
                : failed ? [failed + ' failed', C.red]
                : s.status === 'paused' ? ['Paused', C.faint]
                : ['Active', C.green]
              return (
                <div key={s.id} data-testid="kn-source" title={s.last_error ?? undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${C.borderSoft}` }}>
                  <SourceIcon p={p} on />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flex: 'none', animation: s.syncing ? 'hn-kn-pulse 1.2s infinite' : 'none' }} />
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.faint, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[s.display_name, `${mine.length} ${mine.length === 1 ? 'file' : 'files'}`, picked ? `${picked} selected` : null].filter(Boolean).join(' · ')}
                    </div>
                    {!s.needs_reconnect && (
                      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                        <button data-testid="kn-pick" onClick={() => setModal({ step: 'files', source: s })} style={linkBtn}>Choose folders</button>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{sizeOf(kb)}</div>
                    <div data-testid="kn-source-status" style={{ fontSize: 12, color: stColor, marginTop: 2, whiteSpace: 'nowrap' }}>{status}</div>
                  </div>
                  {!s.syncing && (s.needs_reconnect
                    ? <button onClick={() => setModal({ step: 'auth', reconnect: true })} className="hn-kn-row-btn" style={{ ...rowBtn, border: `1px solid ${C.ink}`, background: C.ink, color: '#FFFFFF' }}>Reconnect</button>
                    : <button data-testid="kn-disconnect" onClick={() => setModal({ step: 'disconnect', source: s })} className="hn-kn-row-btn" style={rowBtn}>Disconnect</button>)}
                </div>
              )
            })
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0 0', opacity: 0.6 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, border: '1px dashed rgba(28,26,23,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <img src="https://cdn.simpleicons.org/notion/1C1A17" alt="" style={{ width: 16, height: 16 }} />
            </span>
            <div style={{ flex: 1, fontSize: 13 }}>Notion</div>
            <span style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '.06em', color: C.faint }}>SOON</span>
          </div>
        </Card>
      </div>

      {/* Ingestion pipeline */}
      <Card i={3} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Ingestion pipeline</span>
          <span style={{ fontSize: 12, color: C.faint }}>
            {reconnect && !syncing ? 'Paused · Google Drive needs reconnecting' : <>
              {syncing ? 'Running now · ' : lastRun ? `Last run ${timeAgo(lastRun)} · ` : 'No runs yet · '}
              checks Drive every 5 min · cursor saved only after every file succeeds
            </>}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 10 }}>
          {PIPELINE.map(([label, sub], k) => (
            <div key={label} style={{ position: 'relative', borderRadius: 12, padding: '14px 12px', background: C.bg, border: `1px solid ${C.borderSoft}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.faint3 }}>0{k + 1}</span>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: syncing ? C.orange : lastRun ? C.green : '#D6D1C8', marginLeft: 'auto', animation: syncing ? 'hn-kn-pulse 1.2s infinite' : 'none' }} />
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 10 }}>{label}</div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3, lineHeight: 1.35 }}>{sub}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Documents */}
      <Card i={4} style={{ padding: '22px 22px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 10, background: C.panel }}>
            {[['all', 'All'], ['gdrive', 'Google Drive'], ['upload', 'Uploads']].map(([id, label]) => {
              const on = tab === id
              return (
                <button key={id} onClick={() => setTab(id)} style={{ height: 30, padding: '0 12px', border: 0, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: on ? '#FFFFFF' : 'transparent', color: on ? C.ink : C.faint, boxShadow: on ? '0 1px 2px rgba(28,26,23,.1)' : 'none' }}>
                  {label}
                </button>
              )
            })}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search documents" style={{ height: 36, width: 220, maxWidth: '100%', padding: '0 12px', borderRadius: 10, border: '1px solid rgba(28,26,23,.12)', background: C.bg, fontSize: 13, outline: 'none' }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 680 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.4fr) 110px 80px 80px 130px 90px 32px', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.faint }}>
              <span>Document</span><span>Source</span><span style={{ textAlign: 'right' }}>Chunks</span><span style={{ textAlign: 'right' }}>Size</span><span>Status</span><span style={{ textAlign: 'right' }}>Updated</span><span />
            </div>
            {rows.map(d => {
              const p = PROVIDERS[d.provider] ?? { name: '—', color: '#D6D1C8' }
              const [stLabel, stBg, stFg] = DOC_STATUS[d.sync_status] ?? DOC_STATUS.synced
              return (
                <div key={d.id} data-testid="kn-doc" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.4fr) 110px 80px 80px 130px 90px 32px', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${C.borderSoft}`, fontSize: 13 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.source_url
                        ? <a href={d.source_url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{d.title}</a>
                        : d.title}
                    </div>
                    <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{MIME_LABEL[d.mime_type] ?? d.mime_type}</div>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.body }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color }} />{p.name}
                  </span>
                  <span data-testid="kn-doc-chunks" style={{ textAlign: 'right', fontFamily: FONT.mono, fontSize: 12 }}>{d.chunk_count ? fmt(d.chunk_count) : '—'}</span>
                  <span style={{ textAlign: 'right', fontFamily: FONT.mono, fontSize: 12, color: C.body }}>{d.chunk_count ? sizeOf(d.chunk_count * CHUNK_KB) : '—'}</span>
                  <span title={d.last_error ?? undefined} style={{ justifySelf: 'start', height: 22, display: 'inline-flex', alignItems: 'center', padding: '0 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 500, background: stBg, color: stFg }}>{stLabel}</span>
                  <span style={{ textAlign: 'right', fontSize: 12, color: C.faint }}>{timeAgo(d.updated_at)}</span>
                  <DocMenu doc={d} onDelete={removeDocument} />
                </div>
              )
            })}
            {rows.length === 0 && (
              <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13, color: C.faint }}>
                {!loaded ? 'Loading…'
                  : docs.length ? 'No documents match.'
                  : syncing ? 'Syncing… files show up here as they finish.'
                  : drives.length ? 'No documents yet. Choose folders, then sync.'
                  : 'No documents yet. Connect a source and its files will show up here.'}
              </div>
            )}
          </div>
        </div>
      </Card>

      <AnimatePresence>
        {modal && (
          <ConnectModal
            key="connect" modal={modal} setModal={setModal} drives={drives} reconnect={reconnect} syncing={syncing}
            onSave={(source, sel) => saveSelection(source, sel)} onDisconnect={disconnect}
            docsOf={id => docs.filter(d => d.source_id === id)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function SourceIcon({ p, on }) {
  return (
    <span style={{ width: 36, height: 36, borderRadius: 10, background: C.bg, border: '1px solid rgba(28,26,23,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <img src={p.icon} alt="" style={{ width: 18, height: 18, opacity: on ? 1 : 0.55 }} />
    </span>
  )
}

const CONNECTORS = [
  { id: 'gdrive', name: 'Google Drive', desc: 'Google Docs, PDFs, Markdown and text', icon: 'https://cdn.simpleicons.org/googledrive', live: true },
  { id: 'notion', name: 'Notion', desc: 'Pages and databases', icon: 'https://cdn.simpleicons.org/notion/1C1A17' },
  { id: 'github', name: 'GitHub', desc: 'READMEs, docs and wikis', icon: 'https://cdn.simpleicons.org/github/1C1A17' },
  { id: 'confluence', name: 'Confluence', desc: 'Spaces and pages', icon: 'https://cdn.simpleicons.org/confluence' },
  { id: 'jira', name: 'Jira', desc: 'Epics and issues', icon: 'https://cdn.simpleicons.org/jira' },
  { id: 'dropbox', name: 'Dropbox', desc: 'Files and folders', icon: 'https://cdn.simpleicons.org/dropbox' },
]

const TYPE_TAG = {
  'application/vnd.google-apps.document': 'DOC',
  'application/vnd.google-apps.spreadsheet': 'SHEET',
  'application/vnd.google-apps.folder': 'FOLDER',
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'text/markdown': 'MD',
  'text/plain': 'TXT',
}

const iconBtn = { width: 30, height: 30, border: 0, borderRadius: 8, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.body, flex: 'none' }
const ease = [0.2, 0.7, 0.2, 1]

const Check = ({ color = C.green, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flex: 'none', marginTop: 1 }}>
    <path d="m3.5 8.5 3 3 6-7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
/** "⋯" on a document row: Delete, then a confirm. Opens sideways inside the
   row, so the table's horizontal scroll never clips it. */
function DocMenu({ doc, onDelete }) {
  const [step, setStep] = useState(null) // null | 'menu' | 'confirm' | 'busy'
  const ref = useRef(null)

  useEffect(() => {
    if (!step || step === 'busy') return
    const close = e => { if (!ref.current?.contains(e.target)) setStep(null) }
    const esc = e => { if (e.key === 'Escape') setStep(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [step])

  async function confirm() {
    setStep('busy')
    await onDelete(doc)
    setStep(null)
  }

  const pill = { height: 28, padding: '0 10px', borderRadius: 8, border: 0, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }
  return (
    <div ref={ref} style={{ position: 'relative', justifySelf: 'end' }}>
      <button
        data-testid="kn-doc-menu" aria-label={`Actions for ${doc.title}`} aria-expanded={!!step}
        onClick={() => setStep(step ? null : 'menu')}
        style={{ width: 28, height: 28, border: 0, borderRadius: 8, cursor: 'pointer', fontSize: 16, lineHeight: 1, color: C.faint, background: step ? C.panel : 'transparent' }}
      >⋯</button>
      {step && (
        <div style={{ position: 'absolute', right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 6, padding: 4, borderRadius: 10, background: '#FFFFFF', border: `1px solid ${C.border}`, boxShadow: '0 4px 14px rgba(28,26,23,.12)', zIndex: 5 }}>
          {step === 'menu'
            ? <button data-testid="kn-doc-delete" onClick={() => setStep('confirm')} style={{ ...pill, background: 'transparent', color: C.red }}>Delete</button>
            : <>
                <span style={{ fontSize: 12.5, color: C.body, padding: '0 4px', whiteSpace: 'nowrap' }}>Delete from Honne?</span>
                <button data-testid="kn-doc-delete-confirm" disabled={step === 'busy'} onClick={confirm} style={{ ...pill, background: C.red, color: '#FFFFFF', opacity: step === 'busy' ? 0.6 : 1 }}>{step === 'busy' ? 'Deleting…' : 'Delete'}</button>
                <button disabled={step === 'busy'} onClick={() => setStep(null)} style={{ ...pill, background: C.panel, color: C.ink }}>Cancel</button>
              </>}
        </div>
      )}
    </div>
  )
}

const Spinner = () => (
  <span style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${C.panel}`, borderTopColor: C.orange, animation: 'hn-kn-spin .8s linear infinite', display: 'block' }} />
)

/** "Connect source": pick a connector -> Google consent explainer -> choose what to sync. */
function ConnectModal({ modal, setModal, drives, reconnect, syncing, onSave, onDisconnect, docsOf }) {
  const { step, source } = modal
  const usable = drives.find(s => !s.needs_reconnect)
  const close = useCallback(() => setModal(null), [setModal])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const title = { pick: 'Connect a source', auth: 'Google Drive', files: 'Choose documents', disconnect: 'Disconnect source' }[step]
  const canBack = step === 'auth' || step === 'files'

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      onMouseDown={e => { if (e.target === e.currentTarget) close() }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(28,26,23,.34)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <style>{`
        @keyframes hn-kn-spin { to { transform: rotate(360deg) } }
        .hn-kn-icon:hover { background: ${C.panel} !important; }
        .hn-kn-card-live:hover { border-color: ${C.orange} !important; box-shadow: 0 6px 18px rgba(240,102,42,.12); }
        .hn-kn-google:hover:not(:disabled) { border-color: ${C.ink} !important; box-shadow: 0 4px 14px rgba(28,26,23,.08); }
        .hn-kn-row:hover { background: ${C.bg} !important; }
        .hn-kn-danger:hover { background: #93361F !important; }
      `}</style>
      <motion.div
        role="dialog" aria-label={title}
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.3, ease }}
        style={{ width: '100%', maxWidth: 600, maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', background: '#FFFFFF', borderRadius: 20, boxShadow: '0 30px 80px rgba(28,26,23,.25)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 16px 0 22px' }}>
          {canBack && (
            <button onClick={() => setModal({ step: 'pick' })} aria-label="Back" className="hn-kn-icon" style={{ ...iconBtn, marginLeft: -8 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{title}</span>
          <button onClick={close} aria-label="Close" className="hn-kn-icon" style={iconBtn}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>

        <motion.div
          key={step + (source?.id ?? '')}
          initial={{ opacity: 0, x: step === 'pick' ? 0 : 14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.26, ease }}
          style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
        >
          {step === 'pick' && (
            <PickStep
              driveBadge={reconnect ? 'Reconnect' : drives.length ? 'Connected' : 'Available'}
              onDrive={() => setModal(usable && !reconnect ? { step: 'files', source: usable } : { step: 'auth' })}
            />
          )}
          {step === 'auth' && <AuthStep reconnect={modal.reconnect || reconnect} />}
          {step === 'disconnect' && source && (
            <DisconnectStep source={source} docs={docsOf(source.id)} onCancel={close} onConfirm={() => onDisconnect(source)} />
          )}
          {step === 'files' && source && (
            <FilesStep
              source={source} syncing={syncing} onClose={close} onSave={sel => onSave(source, sel)}
              onOtherAccount={() => setModal({ step: 'auth' })}
            />
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function PickStep({ driveBadge, onDrive }) {
  return (
    <div style={{ padding: '6px 22px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.body }}>Pick where your team's knowledge lives. You choose which files come in.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
        {CONNECTORS.map(c => {
          const Tag = c.live ? 'button' : 'div'
          const badge = c.live ? driveBadge : 'Coming soon'
          const warn = badge === 'Reconnect'
          return (
            <Tag
              key={c.id} data-testid={`kn-connector-${c.id}`} onClick={c.live ? onDrive : undefined}
              aria-disabled={c.live ? undefined : true} className={c.live ? 'hn-kn-card-live' : undefined}
              style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, borderRadius: 14, textAlign: 'left', background: '#FFFFFF', border: `1px solid ${c.live ? 'rgba(240,102,42,.4)' : C.border}`, opacity: c.live ? 1 : 0.55, cursor: c.live ? 'pointer' : 'default', transition: 'border-color .2s, box-shadow .2s' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: C.bg, border: '1px solid rgba(28,26,23,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={c.icon} alt="" style={{ width: 18, height: 18 }} />
                </span>
                <span style={{ height: 20, display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', background: warn ? '#FBEAE4' : c.live ? '#E8F2EC' : C.panel, color: warn ? C.red : c.live ? C.green : C.faint }}>{badge}</span>
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{c.desc}</div>
              </div>
            </Tag>
          )
        })}
      </div>
    </div>
  )
}

/** Explains the consent, then hands off to Google's own page (GDriveCallbackPage finishes it). */
function AuthStep({ reconnect }) {
  const [state, setState] = useState({ waiting: false, error: null })

  async function go() {
    setState({ waiting: true, error: null })
    try {
      const { auth_url } = await getDriveConnectUrl()
      window.location.assign(auth_url)
    } catch (err) {
      setState({ waiting: false, error: reasonText(knowledgeErrorReason(err)) })
    }
  }

  if (state.waiting) {
    return (
      <div style={{ padding: '56px 28px 64px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <Spinner />
        <div style={{ fontSize: 14, fontWeight: 500 }}>Waiting for Google</div>
        <div style={{ fontSize: 12.5, color: C.faint }}>Taking you to Google's sign-in page</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '18px 28px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ position: 'relative', width: 48, height: 48, borderRadius: 13, background: C.ink, display: 'block' }}>
          <span style={{ position: 'absolute', right: 10, bottom: 10, width: 13, height: 13, borderRadius: '50%', background: C.orange, display: 'block' }} />
        </span>
        <span style={{ width: 44, borderTop: '2px dashed rgba(28,26,23,.2)' }} />
        <span style={{ width: 48, height: 48, borderRadius: 13, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="https://cdn.simpleicons.org/googledrive" alt="" style={{ width: 24, height: 24 }} />
        </span>
      </div>
      <div>
        <div style={{ fontFamily: FONT.serif, fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.01em' }}>{reconnect ? 'Reconnect Google Drive' : 'Connect Google Drive'}</div>
        <p style={{ margin: '8px auto 0', maxWidth: 380, fontSize: 13.5, lineHeight: 1.5, color: C.body, textWrap: 'pretty' }}>
          {reconnect
            ? 'Google access expired. Sign in again to resume syncing. Your documents stay as they are.'
            : "Google will ask to let Honne IQ see and download your Drive files. Honne IQ only reads the folders and files you pick, and never edits or deletes anything."}
        </p>
      </div>
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', padding: '14px 16px', borderRadius: 14, background: C.bg }}>
        {['Read-only: nothing in your Drive is changed', 'Only the folders and files you pick are read', 'Google Docs, PDFs, Markdown and text files', 'Changes sync automatically every 5 minutes'].map(t => (
          <div key={t} style={{ display: 'flex', gap: 10, fontSize: 13, color: '#3D3933' }}><Check />{t}</div>
        ))}
      </div>
      {state.error && <div role="alert" style={{ maxWidth: 380, fontSize: 13, color: C.red }}>{state.error}</div>}
      <button
        data-testid="kn-google" onClick={go} className="hn-kn-google"
        style={{ height: 44, width: '100%', maxWidth: 380, borderRadius: 12, border: '1px solid rgba(28,26,23,.14)', background: '#FFFFFF', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'border-color .2s, box-shadow .2s' }}
      >
        <img src="https://cdn.simpleicons.org/google" alt="" style={{ width: 17, height: 17 }} />Continue with Google
      </button>
      <span style={{ fontSize: 12, color: C.faint }}>You'll sign in on Google's own page.</span>
    </div>
  )
}

/** Confirms removing a source: its documents and chunks go, the Drive itself is untouched. */
function DisconnectStep({ source, docs, onCancel, onConfirm }) {
  const n = docs.length
  const kb = docs.reduce((a, d) => a + d.chunk_count, 0) * CHUNK_KB
  return (
    <div style={{ padding: '8px 22px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 11, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={PROVIDERS.gdrive.icon} alt="" style={{ width: 20, height: 20 }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Google Drive</div>
          <div style={{ fontSize: 12.5, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{source.display_name}</div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: '#3D3933', textWrap: 'pretty' }}>
        Syncing stops and its {n} {n === 1 ? 'document' : 'documents'} ({sizeOf(kb)}) are removed from Honne IQ. Nothing in your Drive is changed. You can connect again any time.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel} className="hn-kn-ghost" style={ghostBtn}>Cancel</button>
        <button data-testid="kn-disconnect-confirm" onClick={onConfirm} className="hn-kn-danger" style={{ ...primaryBtn, background: C.red }}>Disconnect</button>
      </div>
    </div>
  )
}

/** Browse the user's Drive and tick the folders and files to sync. */
function FilesStep({ source, syncing, onClose, onSave, onOtherAccount }) {
  const [path, setPath] = useState([{ id: 'root', name: 'My Drive' }])
  const [fq, setFq] = useState('')
  const [listing, setListing] = useState({ of: null, items: null, error: null }) // keyed by folder id
  const [saving, setSaving] = useState(false)
  // id -> is_folder, seeded from what the source already syncs.
  const [picked, setPicked] = useState(() => new Map([
    ...(source.config?.folder_ids ?? []).map(id => [id, true]),
    ...(source.config?.file_ids ?? []).map(id => [id, false]),
  ]))
  const [saveError, setSaveError] = useState(null)
  const here = path.at(-1).id
  const items = listing.of === here ? listing.items : null
  const error = saveError ?? (listing.of === here ? listing.error : null)

  useEffect(() => {
    let live = true
    browseDrive(source.id, here)
      .then(r => { if (live) setListing({ of: here, items: r.items, error: null }) })
      .catch(err => { if (live) setListing({ of: here, items: null, error: reasonText(knowledgeErrorReason(err)) }) })
    return () => { live = false }
  }, [source.id, here])

  const toggle = item => setPicked(m => {
    const next = new Map(m)
    if (next.has(item.id)) next.delete(item.id)
    else next.set(item.id, item.is_folder)
    return next
  })

  async function save() {
    setSaving(true)
    const all = [...picked.entries()]
    try {
      await onSave({ folder_ids: all.filter(([, f]) => f).map(([id]) => id), file_ids: all.filter(([, f]) => !f).map(([id]) => id) })
    } catch (err) {
      setSaving(false)
      setSaveError(reasonText(knowledgeErrorReason(err)))
    }
  }

  const fql = fq.trim().toLowerCase()
  const visible = (items ?? []).filter(i => !fql || i.name.toLowerCase().includes(fql))
  const allOn = visible.length > 0 && visible.every(i => picked.has(i.id))
  const toggleAll = () => setPicked(m => {
    const next = new Map(m)
    visible.forEach(i => (allOn ? next.delete(i.id) : next.set(i.id, i.is_folder)))
    return next
  })
  const open = item => { setFq(''); setPath([...path, { id: item.id, name: item.name }]) }

  const n = picked.size
  const hadSelection = selectionOf(source).length > 0
  const tooMany = n > MAX_SELECTED
  const canSave = !saving && !syncing && n > 0 && !tooMany
  const foot = syncing ? 'A sync is running. Wait for it to finish.'
    : tooMany ? `${n} selected: the limit is ${MAX_SELECTED}. Tick the parent folder instead; it includes everything inside.`
    : !n ? 'Pick the folders and documents your agents should learn from.'
    : `${n} selected · ticked folders include everything inside them, now and later.`

  return (
    <div data-testid="kn-picker" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div style={{ padding: '8px 22px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.body }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, flex: 'none' }} />
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Connected as {source.display_name}</span>
          <button onClick={onOtherAccount} style={linkBtn}>Use another account</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={fq} onChange={e => setFq(e.target.value)} placeholder={`Filter ${path.at(-1).name}`}
            style={{ flex: 1, minWidth: 0, height: 38, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(28,26,23,.12)', background: C.bg, fontSize: 13, outline: 'none' }}
          />
          <button onClick={toggleAll} disabled={!visible.length} className="hn-kn-ghost" style={{ ...ghostBtn, fontSize: 13, padding: '0 12px', opacity: visible.length ? 1 : 0.5 }}>
            {allOn ? 'Clear' : 'Select all'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {path.map((p, k) => {
            const here = k === path.length - 1
            return (
              <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.faint3, fontSize: 12 }}>
                {k > 0 && '›'}
                <button
                  onClick={() => { setFq(''); setPath(path.slice(0, k + 1)) }} disabled={here}
                  style={{ height: 28, padding: '0 11px', borderRadius: 999, fontSize: 12.5, cursor: here ? 'default' : 'pointer', border: `1px solid ${here ? C.ink : 'rgba(28,26,23,.12)'}`, background: here ? C.ink : '#FFFFFF', color: here ? '#FFFFFF' : C.body }}
                >
                  {p.name}
                </button>
              </span>
            )
          })}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, maxHeight: 340, overflowY: 'auto', borderTop: `1px solid ${C.border}`, padding: '4px 12px' }}>
        {error && <div role="alert" style={{ padding: 12, fontSize: 13, color: C.red }}>{error}</div>}
        {!items && !error && <div style={{ padding: '28px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>}
        {items && !visible.length && (
          <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13, color: C.faint }}>
            {items.length ? 'No files match.' : 'Nothing Honne can read in this folder.'}
          </div>
        )}
        {visible.map(item => {
          const on = picked.has(item.id)
          return (
            <div
              key={item.id} data-testid="kn-picker-item" onClick={() => toggle(item)} className="hn-kn-row"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 10, cursor: 'pointer', background: on ? '#FFF6EF' : 'transparent', transition: 'background .15s' }}
            >
              <button
                role="checkbox" aria-checked={on} aria-label={`Sync ${item.name}`}
                style={{ width: 18, height: 18, flex: 'none', padding: 0, borderRadius: 5, cursor: 'pointer', border: `1.5px solid ${on ? C.ink : 'rgba(28,26,23,.22)'}`, background: on ? C.ink : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}
              >
                {on && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="m2.5 6.3 2.3 2.3 4.7-5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
              <span style={{ width: 46, flex: 'none', height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: C.panel, fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: '.04em', color: C.body }}>
                {TYPE_TAG[item.mime_type] ?? 'FILE'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                <div style={{ fontSize: 12, color: C.faint, marginTop: 1 }}>
                  {item.is_folder ? 'Folder · everything inside, now and later' : MIME_LABEL[item.mime_type] ?? item.mime_type}
                </div>
              </div>
              {item.is_folder && (
                <button onClick={e => { e.stopPropagation(); open(item) }} aria-label={`Open ${item.name}`} style={{ ...linkBtn, flex: 'none', fontSize: 12.5 }}>Open ›</button>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 22px', borderTop: `1px solid ${C.border}`, background: '#FBFAF8' }}>
        <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, lineHeight: 1.4, color: C.body }}>{foot}</span>
        <button onClick={onClose} className="hn-kn-ghost" style={ghostBtn}>Cancel</button>
        <button data-testid="kn-picker-save" onClick={save} disabled={!canSave} className="hn-kn-primary" style={{ ...primaryBtn, opacity: canSave ? 1 : 0.35, cursor: canSave ? 'pointer' : 'not-allowed' }}>
          {saving ? 'Saving…' : hadSelection ? 'Save and sync' : n ? `Add ${n} to Honne IQ` : 'Add to Honne IQ'}
        </button>
      </div>
    </div>
  )
}
