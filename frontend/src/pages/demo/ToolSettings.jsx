import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { connectGoogleDocs, disconnectGoogleDocs, getToolCatalog, workspaceError } from '../../api/workspaces'
import { ErrorMessage } from './shared'

function useCatalog(workspaceId) {
  const [catalog, setCatalog] = useState(null)
  const [error, setError] = useState('')
  async function refresh() {
    try { setCatalog(await getToolCatalog(workspaceId)); setError('') }
    catch (err) { setError(workspaceError(err)) }
  }
  useEffect(() => {
    let live = true
    async function load() {
      try { const value = await getToolCatalog(workspaceId); if (live) { setCatalog(value); setError('') } }
      catch (err) { if (live) setError(workspaceError(err)) }
    }
    load(); window.addEventListener('focus', load)
    return () => { live = false; window.removeEventListener('focus', load) }
  }, [workspaceId])
  return { catalog, error, refresh }
}

function Connection({ workspaceId, status, refresh, beforeConnect }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function connect() {
    setBusy(true); setError('')
    try {
      const value = await connectGoogleDocs(workspaceId)
      beforeConnect?.()
      sessionStorage.setItem('honne_docs_workspace', workspaceId)
      sessionStorage.setItem('honne_docs_return', window.location.pathname + window.location.search)
      window.location.assign(value.auth_url)
    } catch (err) { setError(workspaceError(err)); setBusy(false) }
  }
  async function disconnect() {
    setBusy(true); setError('')
    try { await disconnectGoogleDocs(workspaceId); await refresh() }
    catch (err) { setError(workspaceError(err)) }
    finally { setBusy(false) }
  }
  return <div className="demo-google-connection"><div><strong>Google Docs</strong><span>{status?.connected ? `Connected as ${status.email}` : 'Connect your account to create documents.'}</span></div><div>{status?.connected ? <><button type="button" disabled={busy} onClick={connect}>Switch account</button><button type="button" disabled={busy} onClick={disconnect}>Disconnect</button></> : <button type="button" disabled={busy || !status?.configured} onClick={connect}><ExternalLink size={14} />{busy ? 'Connecting…' : status?.configured ? 'Connect Google Docs' : 'Google Docs unavailable'}</button>}</div><ErrorMessage>{error}</ErrorMessage></div>
}

export function GoogleDocsConnection({ workspaceId }) {
  const { catalog, error, refresh } = useCatalog(workspaceId)
  const [params] = useSearchParams()
  return <>{params.get('docs') === 'error' && <ErrorMessage>The Google Docs connection did not finish. Please connect again and allow document creation.</ErrorMessage>}<ErrorMessage>{error}</ErrorMessage>{catalog && <Connection workspaceId={workspaceId} status={catalog.google_docs} refresh={refresh} />}</>
}

export default function ToolSettings({ workspaceId, enabled, onToggle, beforeConnect }) {
  const { catalog, error, refresh } = useCatalog(workspaceId)
  return <fieldset><legend>Tools</legend><p className="demo-small demo-muted">Choose what this agent can do. Connections belong to the person running it.</p><ErrorMessage>{error}</ErrorMessage>{!catalog && !error && <p role="status">Loading available tools…</p>}<div className="demo-tool-options">{catalog?.tools.map(tool => <label className="demo-check demo-tool-option" key={tool.name}><input type="checkbox" checked={enabled.includes(tool.name)} onChange={() => onToggle(tool.name)} /><span><strong>{tool.label}</strong><small>{tool.description}</small>{!tool.configured && <small>Currently unavailable</small>}</span></label>)}</div>{enabled.includes('create_google_doc') && catalog && <Connection workspaceId={workspaceId} status={catalog.google_docs} refresh={refresh} beforeConnect={beforeConnect} />}<p className="demo-small demo-muted">Try agent previews document content without creating a Google document.</p></fieldset>
}
