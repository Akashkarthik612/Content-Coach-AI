import { useEffect, useRef } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X, ExternalLink, ChevronRight, GitBranch } from 'lucide-react'
import { statusLabel } from '../../api/workspaces'
import { prepareMarkdown, remarkCleanProse } from './markdown'

export function Dialog({ title, children, onClose, wide = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const element = ref.current
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog ref={ref} className={`demo-dialog ${wide ? 'demo-dialog-wide' : ''}`} onCancel={onClose} aria-label={title}>
    <header><h2>{title}</h2><button type="button" className="demo-icon" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></header>
    {children}
  </dialog>
}

export function ErrorMessage({ children }) {
  return children ? <p className="demo-error" role="alert">{children}</p> : null
}

export function Sources({ sources = [], expanded = false }) {
  if (!sources.length) return <p className="demo-muted demo-small">No retrieved sources recorded.</p>
  const unique = [...new Map(sources.map(source => [source.document_id || source.url || source.title, source])).values()]
  const list = <ul>{unique.map((source, index) => {
      const safe = /^https?:\/\//i.test(source.url ?? '')
      const label = source.display_name || source.title || source.name || `Document ${index + 1}`
      return <li key={source.document_id || source.url || index}>{safe
        ? <a href={source.url} target="_blank" rel="noopener noreferrer" title={source.url}>{label}<ExternalLink size={13} /></a>
        : <span>{label}</span>}{source.document_id && <small>Document {source.document_id}</small>}
        {source.excerpt && <blockquote>{source.excerpt}</blockquote>}
        {safe && <details className="demo-source-address"><summary>Full source address</summary><a href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a></details>}</li>
    })}</ul>
  return expanded ? <div className="demo-sources demo-sources-expanded">{list}</div> : <details className="demo-sources"><summary>{unique.length} retrieved {unique.length === 1 ? 'source' : 'sources'}</summary>{list}</details>
}

const markdownComponents = {
  a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
  img: ({ alt }) => alt ? <span>{alt}</span> : null,
  hr: () => null,
}

export function TextContent({ content }) {
  return <div className="demo-output"><Markdown skipHtml urlTransform={defaultUrlTransform} remarkPlugins={[remarkGfm, remarkCleanProse]} components={markdownComponents}>{prepareMarkdown(content)}</Markdown></div>
}

export function WorkspaceTopbar({ workspaceName, title, status, children }) {
  return <header className="demo-topbar"><div className="demo-breadcrumb"><span>{workspaceName}</span><ChevronRight size={14} /><GitBranch size={15} /><span className="demo-current-title" title={title}>{title}</span></div><div className="demo-topbar-actions">{status && <span className={`demo-status demo-status-${status}`} role="status">{statusLabel(status)}</span>}{children}</div></header>
}
