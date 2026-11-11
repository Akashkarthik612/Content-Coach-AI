import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bot, Building2, GitBranch, MessageSquare, Plus, Users } from 'lucide-react'
import {
  addWorkspaceMember, archiveWorkspaceAgent, createWorkspace, getWorkspace, getWorkspaceKnowledge,
  listConversations, listWorkspaceAgents, listWorkflows, listWorkspaces, workspaceError,
} from '../api/workspaces'
import AgentBuilder from './demo/AgentBuilder'
import KnowledgePanel from './demo/KnowledgePanel'
import SharedConversation from './demo/SharedConversation'
import WorkflowPanel from './demo/WorkflowPanel'
import { Dialog, ErrorMessage } from './demo/shared'
import './demo/demo.css'

function WorkspaceForm({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { const workspace = await createWorkspace(name.trim()); onCreated(workspace); onClose() }
    catch (err) { setError(workspaceError(err)) }
    finally { setBusy(false) }
  }
  return <Dialog title="Create company workspace" onClose={onClose}><form className="demo-form" onSubmit={submit}><p>Bring your company’s knowledge, agents and people into a shared workspace.</p><label>Company name<input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. NovaTech" /></label><ErrorMessage>{error}</ErrorMessage><footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="demo-primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create workspace'}</button></footer></form></Dialog>
}

function MemberForm({ workspaceId, onClose, onSaved }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { await addWorkspaceMember(workspaceId, { email: email.trim(), role }); await onSaved(); onClose() }
    catch (err) { setError(workspaceError(err)) }
    finally { setBusy(false) }
  }
  return <Dialog title="Add a registered employee" onClose={onClose}><form className="demo-form" onSubmit={submit}><p>The employee must already have signed in to Honne. They’ll see this company in their workspace selector.</p><label>Employee email<input autoFocus type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><label>Role<select value={role} onChange={e => setRole(e.target.value)}><option value="member">Member</option><option value="admin">Admin</option></select></label><ErrorMessage>{error}</ErrorMessage><footer><button type="button" onClick={onClose}>Cancel</button><button className="demo-primary" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add employee'}</button></footer></form></Dialog>
}

function WorkspaceContent({ workspaceId, conversationId, runId, tab, setParam }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [builder, setBuilder] = useState(null)
  const [addingMember, setAddingMember] = useState(false)
  const [archiving, setArchiving] = useState('')
  const refresh = useCallback(async () => {
    try {
      const [workspace, knowledge, agents, conversations, workflows] = await Promise.all([
        getWorkspace(workspaceId), getWorkspaceKnowledge(workspaceId), listWorkspaceAgents(workspaceId),
        listConversations(workspaceId), listWorkflows(workspaceId),
      ])
      setData({ workspace, knowledge, agents, conversations, workflows }); setError('')
    } catch (err) { setError(workspaceError(err)) }
  }, [workspaceId])
  useEffect(() => {
    // This component is keyed by workspace identity, so data never carries across companies.
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [refresh])

  async function archive(agentId) {
    setArchiving(agentId); setError('')
    try { await archiveWorkspaceAgent(workspaceId, agentId); await refresh() }
    catch (err) { setError(workspaceError(err)) }
    finally { setArchiving('') }
  }
  if (!data) return <main className="demo-loading"><ErrorMessage>{error}</ErrorMessage>{!error && <p role="status">Loading company workspace…</p>}</main>
  const { workspace, knowledge, agents, conversations, workflows } = data
  const admin = workspace.role === 'admin'
  return <>
    <ErrorMessage>{error}</ErrorMessage>
    <div className="demo-layout">
      <aside className="demo-sidebar">
        <section className="demo-company"><span className="demo-company-mark"><Building2 size={23} /></span><div><h1>{workspace.name}</h1><span>{admin ? 'Workspace admin' : 'Workspace member'}</span></div></section>
        <section className="demo-side-section"><div className="demo-section-title"><h2><Users size={15} />People <span>{workspace.members.length}</span></h2>{admin && <button className="demo-text-button" type="button" onClick={() => setAddingMember(true)}>Add</button>}</div>
          <ul className="demo-members">{workspace.members.map(member => <li key={member.user_id}><span className="demo-avatar">{(member.username || member.email || '?')[0].toUpperCase()}</span><div><strong>{member.username || member.email}</strong><small>{member.role}{member.user_id === workspace.user_id ? ' · you' : ''}</small></div></li>)}</ul>
        </section>
        <KnowledgePanel workspaceId={workspaceId} knowledge={knowledge} admin={admin} onRefresh={refresh} />
        <section className="demo-side-section"><div className="demo-section-title"><h2><Bot size={16} />Company agents <span>{agents.length}</span></h2>{admin && <button type="button" className="demo-text-button" onClick={() => setBuilder({})}>Create</button>}</div>
          {agents.map(agent => <div className="demo-agent-row" key={agent.id}><div><strong>@{agent.handle}</strong><span>v{agent.version}</span></div><p>{agent.description}</p>{admin && <div className="demo-agent-actions"><button type="button" onClick={() => setBuilder({ agent })}>Edit / Try</button><button className="demo-text-button" type="button" disabled={archiving === agent.id} onClick={() => archive(agent.id)}>{archiving === agent.id ? 'Archiving…' : 'Archive'}</button></div>}</div>)}
          {!agents.length && <p className="demo-small demo-muted">Give your company specialists their instructions and selected knowledge.</p>}
          {admin && <div className="demo-templates"><span className="demo-small demo-muted">Start with a configurable template</span>{['product', 'marketing', 'support'].map(role => <button key={role} type="button" onClick={() => setBuilder({ template: role })}><Plus size={12} />{role === 'support' ? 'Customer support' : role[0].toUpperCase() + role.slice(1)}</button>)}</div>}
        </section>
      </aside>
      <main className="demo-main"><nav className="demo-tabs" aria-label="Workspace views"><button type="button" aria-current={tab === 'chat' ? 'page' : undefined} onClick={() => setParam('view', 'chat')}><MessageSquare size={16} />Shared conversation</button><button type="button" aria-current={tab === 'workflow' ? 'page' : undefined} onClick={() => setParam('view', 'workflow')}><GitBranch size={16} />Company workflow</button></nav>
        {tab === 'chat' ? <SharedConversation workspaceId={workspaceId} members={workspace.members} agents={agents} conversations={conversations} conversationId={conversationId} onSelect={id => setParam('conversation', id)} onRefresh={refresh} />
          : <WorkflowPanel workspaceId={workspaceId} agents={agents} members={workspace.members} workflows={workflows} runId={runId} onSelect={id => setParam('run', id)} onRefresh={refresh} />}
      </main>
    </div>
    {builder && <AgentBuilder workspaceId={workspaceId} {...builder} knowledge={knowledge} onClose={() => setBuilder(null)} onSaved={refresh} />}
    {addingMember && <MemberForm workspaceId={workspaceId} onClose={() => setAddingMember(false)} onSaved={refresh} />}
  </>
}

export default function DemoWorkspacePage() {
  const [params, setParams] = useSearchParams()
  const [workspaces, setWorkspaces] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const workspaceId = params.get('workspace') || ''
  const refreshList = useCallback(async () => {
    try { setWorkspaces(await listWorkspaces()); setError('') }
    catch (err) { setError(workspaceError(err)) }
    finally { setLoaded(true) }
  }, [])
  useEffect(() => {
    refreshList()
    window.addEventListener('focus', refreshList)
    return () => window.removeEventListener('focus', refreshList)
  }, [refreshList])
  useEffect(() => {
    if (loaded && !workspaceId && workspaces.length) setParams({ workspace: workspaces[0].id, view: 'workflow' }, { replace: true })
  }, [loaded, workspaceId, workspaces, setParams])
  function selectWorkspace(id) { setParams({ workspace: id, view: 'workflow' }) }
  function setParam(key, value) { setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next }) }
  function created(workspace) { setWorkspaces(previous => [...previous, workspace]); selectWorkspace(workspace.id) }
  return <div className="demo-root"><header className="demo-topbar"><Link className="demo-brand" to="/home"><span>honne</span><span className="demo-brand-divider">/</span><span>Company workspace</span></Link><div><Link className="demo-back" to="/home"><ArrowLeft size={14} />Back to studio</Link><label className="demo-sr-only" htmlFor="workspace-picker">Selected company</label><select id="workspace-picker" value={workspaceId} onChange={e => selectWorkspace(e.target.value)}><option value="" disabled>Select company</option>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.role}</option>)}</select><button type="button" onClick={() => setCreating(true)}><Plus size={14} />New company</button></div></header>
    <ErrorMessage>{error}</ErrorMessage>
    {!loaded && <div className="demo-loading" role="status">Loading workspaces…</div>}
    {loaded && !workspaceId && !workspaces.length && <main className="demo-welcome"><Building2 size={36} /><span className="demo-eyebrow">Honne for your team</span><h1>Company knowledge.<br />Shared intelligence.</h1><p>Create a company workspace, connect knowledge and bring your employees and agents into the same conversation.</p><button type="button" className="demo-primary" onClick={() => setCreating(true)}><Plus size={16} />Create your first workspace</button></main>}
    {workspaceId && <WorkspaceContent key={workspaceId} workspaceId={workspaceId} tab={params.get('view') === 'chat' ? 'chat' : 'workflow'} conversationId={params.get('conversation')} runId={params.get('run')} setParam={setParam} />}
    {creating && <WorkspaceForm onClose={() => setCreating(false)} onCreated={created} />}
  </div>
}
