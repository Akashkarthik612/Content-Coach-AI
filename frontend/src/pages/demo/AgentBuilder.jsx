import { useState } from 'react'
import { createWorkspaceAgent, previewWorkspaceAgent, updateWorkspaceAgent, workspaceError } from '../../api/workspaces'
import { Dialog, ErrorMessage, Sources, TextContent } from './shared'

const TOOLS = ['search_knowledge', 'find_documents', 'list_documents', 'read_document']
export const TEMPLATES = {
  product: { name: 'Product Agent', handle: 'product', description: 'Verified product facts, pricing and limitations.', responsibility: 'Research approved product documentation and extract source-backed facts.', system_prompt: 'Read approved product documentation. Extract product facts, features, exact pricing, limitations and unresolved contradictions. Each structured fact must cite document IDs actually returned by your tools. If a detail is missing, flag it instead of guessing. Provide a concise product summary.' },
  marketing: { name: 'Marketing Agent', handle: 'marketing', description: 'Launch announcements grounded in product facts and brand guidance.', responsibility: 'Turn verified facts into a launch announcement using company brand guidelines.', system_prompt: 'Draft a LinkedIn launch announcement from verified product facts and authorized company brand guidelines. Preserve the exact pricing and limitations. Do not invent claims, customer names, launch dates or performance numbers. Flag missing information and contradictions. Draft only.' },
  support: { name: 'Customer Support Agent', handle: 'support', description: 'Customer FAQs and unresolved support questions.', responsibility: 'Prepare source-backed FAQs from product facts and support policies.', system_prompt: 'Prepare concise customer FAQs using verified product facts and authorized company support policies. Include pricing, limitations and support terms only when documented. Clearly separate answered FAQs from unresolved questions. Flag contradictions. Do not promise unsupported capabilities or policies.' },
}
const EMPTY = { name: '', handle: '', description: '', responsibility: '', system_prompt: '', guardrails: 'Use documented facts. Flag uncertainty. Do not publish or send anything.', workflow_role: 'custom', model: 'gemini-3.5-flash', source_ids: [], document_ids: [], enabled_tools: TOOLS }

export default function AgentBuilder({ workspaceId, agent, template, knowledge, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(template ? { ...TEMPLATES[template], workflow_role: template } : {}), ...(agent ?? {}) }))
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const set = (key, value) => { setForm(previous => ({ ...previous, [key]: value })); setPreview(null) }
  const toggle = (key, value) => set(key, form[key].includes(value) ? form[key].filter(item => item !== value) : [...form[key], value])
  const configuration = () => Object.fromEntries(Object.keys(EMPTY).map(key => [key, form[key] ?? EMPTY[key]]))

  async function save(event) {
    event.preventDefault()
    setError(''); setBusy('save')
    try {
      if (agent) await updateWorkspaceAgent(workspaceId, agent.id, { ...configuration(), expected_version: agent.version })
      else await createWorkspaceAgent(workspaceId, configuration())
      await onSaved()
      onClose()
    } catch (err) { setError(workspaceError(err)) }
    finally { setBusy('') }
  }
  async function tryAgent() {
    setBusy('preview'); setError(''); setPreview(null)
    try { setPreview(await previewWorkspaceAgent(workspaceId, configuration(), message.trim())) }
    catch (err) { setError(workspaceError(err)) }
    finally { setBusy('') }
  }
  return <Dialog title={agent ? `Edit @${agent.handle} · version ${agent.version}` : 'Create a company agent'} onClose={onClose} wide>
    <form onSubmit={save} className="demo-builder">
      <p className="demo-muted">Configure an agent once. Use it in shared chat and automatic workflows.</p>
      <div className="demo-form-grid">
        <label>Name<input required maxLength={100} value={form.name} onChange={e => set('name', e.target.value)} /></label>
        <label>@handle<input required maxLength={30} pattern="[a-z0-9][a-z0-9-]{1,29}" value={form.handle} onChange={e => set('handle', e.target.value.toLowerCase().replace(/^@/, ''))} /></label>
      </div>
      <label>Description<input required maxLength={500} value={form.description} onChange={e => set('description', e.target.value)} /></label>
      <label>Responsibility<input required maxLength={1000} value={form.responsibility} onChange={e => set('responsibility', e.target.value)} /></label>
      <label>Workflow specialty<select value={form.workflow_role} onChange={e => set('workflow_role', e.target.value)}>
        <option value="custom">General / custom</option><option value="product">Product</option><option value="marketing">Marketing</option><option value="support">Customer support</option>
      </select></label>
      <label>System instructions<textarea required rows={5} maxLength={8000} value={form.system_prompt} onChange={e => set('system_prompt', e.target.value)} /></label>
      <label>Guardrails<textarea rows={2} maxLength={2000} value={form.guardrails ?? ''} onChange={e => set('guardrails', e.target.value)} /></label>
      <fieldset><legend>Knowledge permissions</legend><p className="demo-muted demo-small">Select whole shared sources or individual documents. New documents in a selected source become available after synchronization.</p>
        {!knowledge.sources.length && <p>No company sources shared yet. Connect Drive and share knowledge first.</p>}
        {knowledge.sources.map(source => <label className="demo-check" key={source.id}><input type="checkbox" checked={form.source_ids.includes(source.id)} onChange={() => toggle('source_ids', source.id)} />All shared documents in {source.display_name}</label>)}
        <details><summary>Select individual documents</summary>{knowledge.documents.map(doc => <label className="demo-check" key={doc.id}><input type="checkbox" checked={form.document_ids.includes(doc.id)} onChange={() => toggle('document_ids', doc.id)} />{doc.title}</label>)}</details>
      </fieldset>
      <fieldset><legend>Read-only tools</legend><div className="demo-tool-options">{TOOLS.map(tool => <label className="demo-check" key={tool}><input type="checkbox" checked={form.enabled_tools.includes(tool)} onChange={() => toggle('enabled_tools', tool)} />{tool.replaceAll('_', ' ')}</label>)}</div></fieldset>
      <section className="demo-preview"><h3>Try before saving</h3><label>Test message<textarea rows={2} maxLength={8000} value={message} onChange={e => setMessage(e.target.value)} placeholder="Ask a question about the selected company documents" /></label>
        <button type="button" onClick={tryAgent} disabled={!!busy || !message.trim()}>{busy === 'preview' ? 'Agent is answering…' : 'Try agent'}</button>
        {preview && <div aria-live="polite"><TextContent content={preview.content} />{preview.note && <p className="demo-muted">{preview.note}</p>}<Sources sources={preview.sources} />
          {preview.steps.length > 0 && <p className="demo-small demo-muted">Tools: {preview.steps.map(step => step.tool_name).join(', ')}</p>}</div>}
      </section>
      <ErrorMessage>{error}</ErrorMessage>
      <footer><button type="button" onClick={onClose}>Cancel</button><button className="demo-primary" disabled={!!busy} type="submit">{busy === 'save' ? 'Saving…' : agent ? 'Save new version' : 'Create agent'}</button></footer>
    </form>
  </Dialog>
}
