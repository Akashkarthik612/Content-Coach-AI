import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, RefreshCw } from 'lucide-react'
import { listDocuments, listSources } from '../../api/knowledge'
import { shareWorkspaceSource, syncWorkspaceSource, unshareWorkspaceSource, workspaceError } from '../../api/workspaces'
import { Dialog, ErrorMessage } from './shared'

function ShareSource({ workspaceId, onClose, onSaved }) {
  const [sources, setSources] = useState([])
  const [documents, setDocuments] = useState([])
  const [sourceId, setSourceId] = useState('')
  const [all, setAll] = useState(false)
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    Promise.all([listSources(), listDocuments()]).then(([sourceRows, docs]) => {
      if (live) { setSources(sourceRows); setDocuments(docs); setSourceId(sourceRows[0]?.id ?? '') }
    }).catch(err => { if (live) setError(workspaceError(err)) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])
  async function share(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await shareWorkspaceSource(workspaceId, { source_id: sourceId, document_ids: all ? null : selected })
      await onSaved(); onClose()
    } catch (err) { setError(workspaceError(err)) }
    finally { setBusy(false) }
  }
  return <Dialog title="Share company knowledge" onClose={onClose}>
    <form onSubmit={share} className="demo-form">
      <p>Choose documents from a connection you own. Shared documents become available to every member of this company.</p>
      {loading ? <p role="status">Loading your connections…</p> : !sources.length ? <p>Connect Google Drive and choose documents on the <Link to="/knowledge">Knowledge page</Link>, then return here.</p> : <>
        <label>Your connection<select value={sourceId} onChange={e => { setSourceId(e.target.value); setSelected([]); setAll(false) }}>{sources.map(source => <option value={source.id} key={source.id}>{source.display_name}</option>)}</select></label>
        <label className="demo-check"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Share all selected documents in this connection, including future syncs</label>
        {!all && <fieldset><legend>Documents to share</legend>{documents.filter(doc => doc.source_id === sourceId).map(doc => <label className="demo-check" key={doc.id}>
          <input type="checkbox" checked={selected.includes(doc.id)} onChange={() => setSelected(previous => previous.includes(doc.id) ? previous.filter(id => id !== doc.id) : [...previous, doc.id])} />{doc.title}</label>)}
          {!documents.some(doc => doc.source_id === sourceId) && <p className="demo-muted">No indexed documents yet. Select and synchronize files on the Knowledge page.</p>}
        </fieldset>}
        <p className="demo-small demo-muted">Sharing replaces this connection’s current sharing selection for this workspace. Your original personal knowledge remains indexed under your account.</p>
      </>}
      <ErrorMessage>{error}</ErrorMessage>
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="demo-primary" disabled={busy || loading || !sourceId || (!all && !selected.length)}>{busy ? 'Sharing…' : 'Share with company'}</button></footer>
    </form>
  </Dialog>
}

export default function KnowledgePanel({ workspaceId, knowledge, admin, onRefresh }) {
  const [sharing, setSharing] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  async function action(sourceId, kind) {
    setBusy(sourceId); setError('')
    try {
      if (kind === 'sync') await syncWorkspaceSource(workspaceId, sourceId)
      else await unshareWorkspaceSource(workspaceId, sourceId)
      await onRefresh()
    } catch (err) { setError(workspaceError(err)) }
    finally { setBusy('') }
  }
  return <section className="demo-side-section">
    <div className="demo-section-title"><h2><Database size={15} />Company knowledge</h2>{admin && <button type="button" className="demo-text-button" onClick={() => setSharing(true)}>Share</button>}</div>
    {!knowledge.sources.length && <p className="demo-muted demo-small">Share selected Drive documents to give your agents company context.</p>}
    {knowledge.sources.map(source => <div className="demo-source-row" key={source.id}>
      <div><strong>{source.display_name}</strong><span className="demo-muted demo-small">{source.syncing ? 'Synchronizing…' : source.status === 'needs_reauth' ? 'Reconnect required' : source.last_success_at ? `Synced ${new Date(source.last_success_at).toLocaleString()}` : 'Awaiting first sync'}</span></div>
      {admin && <div className="demo-source-actions"><button type="button" className="demo-icon" title="Sync shared knowledge" aria-label={`Sync ${source.display_name}`} disabled={busy === source.id || source.syncing} onClick={() => action(source.id, 'sync')}><RefreshCw size={14} /></button>
        <button type="button" className="demo-text-button" disabled={busy === source.id} onClick={() => action(source.id, 'unshare')}>Unshare</button></div>}
    </div>)}
    {knowledge.documents.length > 0 && <details className="demo-document-list"><summary>{knowledge.documents.length} shared documents</summary><ul>{knowledge.documents.map(doc => <li key={doc.id}><span>{doc.title}</span><small>{doc.sync_status} · {doc.chunk_count} chunks</small></li>)}</ul></details>}
    <Link to="/knowledge" className="demo-small">Connect Drive & manage files →</Link>
    <p className="demo-muted demo-small">After sync completes, start a new run to use the updated index.</p>
    <ErrorMessage>{error}</ErrorMessage>
    {sharing && <ShareSource workspaceId={workspaceId} onClose={() => setSharing(false)} onSaved={onRefresh} />}
  </section>
}
