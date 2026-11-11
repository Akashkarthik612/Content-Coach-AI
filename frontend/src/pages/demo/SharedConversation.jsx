import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Plus, Send } from 'lucide-react'
import { createConversation, getConversation, retryWorkspaceMessage, sendWorkspaceMessage, workspaceError } from '../../api/workspaces'
import { ErrorMessage, Sources, TextContent, timeLabel } from './shared'

export default function SharedConversation({ workspaceId, members, agents, conversations, conversationId, onSelect, onRefresh }) {
  const [chat, setChat] = useState(null)
  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const [reload, setReload] = useState(0)
  const bottom = useRef(null)
  const newest = chat?.messages.at(-1)
  const running = newest?.status === 'running'
  useEffect(() => {
    let live = true
    let timer
    setChat(null); setPollError('')
    if (!conversationId) return undefined
    async function refresh() {
      try {
        const value = await getConversation(workspaceId, conversationId)
        if (live) { setChat(value); setPollError('') }
      } catch (err) { if (live) setPollError(workspaceError(err)) }
      if (live) timer = setTimeout(refresh, 2500)
    }
    refresh()
    return () => { live = false; clearTimeout(timer) }
  }, [workspaceId, conversationId, reload])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [newest?.id, newest?.status])

  async function newChat(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { const value = await createConversation(workspaceId, title.trim() || 'Company conversation'); onSelect(value.id); setTitle(''); await onRefresh() }
    catch (err) { setError(workspaceError(err)) }
    finally { setBusy(false) }
  }
  async function send(event) {
    event.preventDefault()
    if (busy || running || !draft.trim()) return
    setBusy(true); setError('')
    try { await sendWorkspaceMessage(workspaceId, conversationId, draft.trim()); setDraft(''); setReload(value => value + 1); await onRefresh() }
    catch (err) { setError(workspaceError(err)) }
    finally { setBusy(false) }
  }
  async function retry() {
    setBusy(true); setError('')
    try { await retryWorkspaceMessage(workspaceId, conversationId); setReload(value => value + 1) }
    catch (err) { setError(workspaceError(err)) }
    finally { setBusy(false) }
  }
  const employee = id => { const value = members.find(member => member.user_id === id); return value?.username || value?.email || 'Former employee' }
  return <section className="demo-chat">
    <div className="demo-content-heading"><div><span className="demo-eyebrow">Manual multiplayer</span><h2>One conversation. Your whole team.</h2><p>Address an agent with @handle. Every company member can continue the conversation.</p></div><MessageSquare size={25} /></div>
    <div className="demo-chat-controls"><label>Shared conversation<select value={conversationId ?? ''} onChange={e => onSelect(e.target.value)}><option value="">Choose a conversation</option>{conversations.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      <form onSubmit={newChat}><label className="demo-sr-only" htmlFor="conversation-title">New conversation title</label><input id="conversation-title" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="New conversation title" /><button type="submit" disabled={busy}><Plus size={15} />New</button></form>
    </div>
    <ErrorMessage>{error || pollError}</ErrorMessage>
    <div className="demo-message-list" aria-live="polite" aria-relevant="additions text">
      {!conversationId && <div className="demo-empty"><MessageSquare size={32} /><h3>Start a shared conversation</h3><p>Create a conversation, then ask one of your company agents a question.</p></div>}
      {conversationId && !chat && !pollError && <p role="status">Loading conversation…</p>}
      {chat && !chat.messages.length && <div className="demo-empty"><h3>Your team’s context starts here.</h3><p>Pick an agent below and ask about your shared company documents.</p></div>}
      {chat?.messages.map(message => <article className={`demo-message demo-message-${message.role}`} key={message.id}>
        <header><strong>{message.role === 'user' ? employee(message.employee_id) : `@${message.agent_handle}`}</strong><span>{message.role === 'assistant' && <>v{message.agent_version ?? '—'} · </>}{timeLabel(message.created_at)}</span></header>
        {message.content && <TextContent content={message.content} />}
        {message.status === 'running' && <p className="demo-live-status" role="status">{message.steps.at(-1)?.event === 'tool_used' ? `Used ${message.steps.at(-1).tool_name.replaceAll('_', ' ')}` : 'Agent is answering…'}</p>}
        {message.status === 'failed' && <div><ErrorMessage>{workspaceError({ response: { data: { detail: { reason: message.error_code } } } })}</ErrorMessage>{message.id === newest?.id && <button type="button" onClick={retry} disabled={busy}>Retry this turn</button>}</div>}
        {message.role === 'assistant' && message.status === 'ok' && <Sources sources={message.sources} />}
        {!!message.steps.length && <details className="demo-small demo-muted"><summary>Execution details</summary>{message.steps.map((step, index) => <p key={index}>{step.event.replaceAll('_', ' ')}{step.tool_name ? ` · ${step.tool_name}` : ''}{step.error_code ? ` · ${step.error_code}` : ''}</p>)}</details>}
      </article>)}<div ref={bottom} />
    </div>
    <form className="demo-composer" onSubmit={send}>
      <div className="demo-mentions">{agents.map(agent => <button key={agent.id} type="button" disabled={!conversationId || busy || running} onClick={() => setDraft(value => `@${agent.handle} ${value.replace(/^@[a-z0-9-]+\s*/i, '')}`)}>@{agent.handle}</button>)}</div>
      <label htmlFor="shared-message" className="demo-sr-only">Message a company agent</label><textarea id="shared-message" rows={3} value={draft} maxLength={8000} onChange={e => setDraft(e.target.value)} placeholder="@product Summarize the approved features and pricing…" disabled={!conversationId || running} />
      <footer><span className="demo-muted demo-small">Shared with all workspace members</span><button className="demo-primary" type="submit" disabled={!conversationId || !chat || busy || running || !draft.trim()}><Send size={15} />{busy || running ? 'Waiting for agent…' : 'Send message'}</button></footer>
    </form>
  </section>
}
