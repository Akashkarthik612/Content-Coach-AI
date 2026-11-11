import { useEffect, useRef } from 'react'
import { X, ExternalLink } from 'lucide-react'

export function Dialog({ title, children, onClose, wide = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const element = ref.current
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog ref={ref} className={`demo-dialog ${wide ? 'demo-dialog-wide' : ''}`} onCancel={onClose}>
    <header><h2>{title}</h2><button type="button" className="demo-icon" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></header>
    {children}
  </dialog>
}

export function ErrorMessage({ children }) {
  return children ? <p className="demo-error" role="alert">{children}</p> : null
}

export function Sources({ sources = [] }) {
  if (!sources.length) return <p className="demo-muted demo-small">No retrieved sources recorded.</p>
  const unique = [...new Map(sources.map(source => [source.document_id, source])).values()]
  return <details className="demo-sources"><summary>{unique.length} retrieved {unique.length === 1 ? 'source' : 'sources'}</summary>
    <ul>{unique.map(source => {
      const safe = /^https?:\/\//i.test(source.url ?? '')
      return <li key={source.document_id}>{safe
        ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ExternalLink size={12} /></a>
        : <span>{source.title}</span>}<small>Document {source.document_id}</small></li>
    })}</ul>
  </details>
}

export function TextContent({ content }) {
  // React escapes all content; model replies never become raw HTML.
  return <div className="demo-output">{content}</div>
}

export function timeLabel(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
}
