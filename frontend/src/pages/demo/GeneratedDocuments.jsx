import { useState } from 'react'
import { ExternalLink, FileText, RotateCcw } from 'lucide-react'
import { retryGeneratedDocument, workspaceError } from '../../api/workspaces'
import { ErrorMessage, Sources } from './shared'

const MESSAGES = {
  google_docs_not_connected: 'Connect your Google Docs account, then retry this prepared report.',
  google_docs_reconnect_required: 'Reconnect your Google Docs account, then retry.',
  google_docs_access_denied: 'Google refused document access. Check the connection and Google Docs access.',
  google_creation_uncertain: 'Google has not confirmed creation. Retry will look for the original document before continuing.',
  google_docs_account_changed: 'Reconnect the Google account originally used for this report.',
  google_document_modified: 'This document was edited outside Honne. Ask the agent to create a new report.',
  document_sources_no_longer_permitted: 'Some report sources are no longer available to this agent.',
}

export default function GeneratedDocuments({ workspaceId, artifacts = [], onRefresh }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const userId = localStorage.getItem('user_id')
  async function retry(id) {
    setBusy(id); setError('')
    try { await retryGeneratedDocument(workspaceId, id); await onRefresh?.() }
    catch (err) { setError(workspaceError(err)) }
    finally { setBusy('') }
  }
  if (!artifacts.length) return null
  return <section className="demo-generated-documents" aria-label="Generated documents"><h3><FileText size={16} />Documents</h3>{artifacts.map(item => {
    const safe = /^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+\/edit$/.test(item.url || '')
    const working = ['working', 'creating', 'formatting'].includes(item.status)
    return <article className="demo-generated-document" key={item.id}><div><strong>{item.title}</strong><span role="status">{item.status === 'ready' ? 'Created in Google Docs' : working ? 'Creating document…' : 'Report saved · creation incomplete'}</span></div>{item.status === 'ready' && safe && <a href={item.url} target="_blank" rel="noopener noreferrer">Open in Google Docs<ExternalLink size={14} /></a>}{item.error_code && <p className="demo-small demo-muted">{MESSAGES[item.error_code] || 'Document creation could not finish. Your prepared report is saved.'}</p>}{item.status !== 'ready' && !working && (!item.created_by || item.created_by === userId) && <button type="button" disabled={busy === item.id} onClick={() => retry(item.id)}><RotateCcw size={14} />{busy === item.id ? 'Retrying…' : 'Retry creation'}</button>}<Sources sources={item.sources || []} /><p className="demo-small demo-muted">Google sharing settings apply to this document.</p></article>
  })}<ErrorMessage>{error}</ErrorMessage></section>
}
