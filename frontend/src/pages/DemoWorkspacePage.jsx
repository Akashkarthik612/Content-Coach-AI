import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bot, Building2, ChevronDown, FileText, GitBranch, MessageSquare, Plus, Users } from 'lucide-react'
import { addWorkspaceMember, archiveWorkspaceAgent, createWorkspace, getWorkspace, getWorkspaceKnowledge, listConversations, listWorkspaceAgents, listWorkflows, listWorkspaces, workspaceError } from '../api/workspaces'
import AgentBuilder from './demo/AgentBuilder'
import KnowledgePanel from './demo/KnowledgePanel'
import SharedConversation from './demo/SharedConversation'
import WorkflowPanel from './demo/WorkflowPanel'
import { Dialog, ErrorMessage, TextContent, WorkspaceTopbar } from './demo/shared'
import '@fontsource-variable/inter'
import './demo/demo.css'
import { agentDraftKey, readAgentDraft } from './demo/agentDraft'

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
  return <Dialog title="Create workspace" onClose={onClose}><form className="demo-form" onSubmit={submit}><p>Bring your knowledge, agents and people into a shared workspace.</p><label>Workspace name<input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Your workspace" /></label><ErrorMessage>{error}</ErrorMessage><footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="demo-primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create workspace'}</button></footer></form></Dialog>
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
  return <Dialog title="Add a registered employee" onClose={onClose}><form className="demo-form" onSubmit={submit}><p>The employee must already have signed in to Honne. They will see this workspace in their workspace selector.</p><label>Employee email<input autoFocus type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><label>Role<select value={role} onChange={e => setRole(e.target.value)}><option value="member">Member</option><option value="admin">Admin</option></select></label><ErrorMessage>{error}</ErrorMessage><footer><button type="button" onClick={onClose}>Cancel</button><button className="demo-primary" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add employee'}</button></footer></form></Dialog>
}

function WorkspaceContent({ workspaceId, workspaces, selectWorkspace, onCreate, conversationId, runId, tab, navigate }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [builder, setBuilder] = useState(() => { const draft = readAgentDraft(workspaceId); return draft ? { agent: draft.agent, template: draft.template } : null })
  const [addingMember, setAddingMember] = useState(false)
  const [archiving, setArchiving] = useState('')
  const [section, setSection] = useState('')
  const refresh = useCallback(async () => {
    try {
      const [workspace, knowledge, agents, conversations, workflows] = await Promise.all([getWorkspace(workspaceId), getWorkspaceKnowledge(workspaceId), listWorkspaceAgents(workspaceId), listConversations(workspaceId), listWorkflows(workspaceId)])
      setData({ workspace, knowledge, agents, conversations, workflows }); setError('')
    } catch (err) { setError(workspaceError(err)) }
  }, [workspaceId])
  useEffect(() => {
    let live = true
    // Workspace identity keys this component; stop scheduled refreshes on cleanup.
    async function load() { if (live) await refresh() }
    load()
    const timer = setInterval(load, 5000)
    return () => { live = false; clearInterval(timer) }
  }, [refresh])
  async function archive(agentId) {
    setArchiving(agentId); setError('')
    try { await archiveWorkspaceAgent(workspaceId, agentId); await refresh() }
    catch (err) { setError(workspaceError(err)) }
    finally { setArchiving('') }
  }
  if (!data) return <main className="demo-loading"><ErrorMessage>{error}</ErrorMessage>{!error && <p role="status">Loading workspace…</p>}</main>
  const { workspace, knowledge, agents, conversations, workflows } = data
  const admin = workspace.role === 'admin'
  return <div className="demo-layout">
    <aside className="demo-sidebar" aria-label="Workspace navigation">
      <Link className="demo-brand" to="/home" aria-label="Honne home">honne<span>AI</span></Link>
      <div className="demo-workspace-picker"><span className="demo-company-mark">{workspace.name[0].toUpperCase()}</span><label className="demo-sr-only" htmlFor="workspace-picker">Selected workspace</label><select id="workspace-picker" value={workspaceId} onChange={e => selectWorkspace(e.target.value)}>{workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></div>
      <button className="demo-new-button" type="button" onClick={() => navigate('workflow', '')}><Plus size={16} />New workflow</button>
      <nav className="demo-side-nav" aria-label="Workspace views"><button type="button" aria-current={tab === 'workflow' ? 'page' : undefined} onClick={() => navigate('workflow', runId)}><GitBranch size={17} />Workflows</button><button type="button" aria-current={tab === 'chat' ? 'page' : undefined} onClick={() => navigate('chat', conversationId)}><MessageSquare size={17} />Conversations</button><button type="button" onClick={() => setSection('documents')}><FileText size={17} />Documents<span>{knowledge.documents.length}</span></button><button type="button" onClick={() => setSection('agents')}><Bot size={17} />Agents<span>{agents.length}</span></button></nav>
      <div className="demo-sidebar-recents"><section className="demo-side-section"><div className="demo-section-title"><h2>Recent runs</h2></div><ul className="demo-recent-list">{workflows.slice(0, 10).map(item => <li key={item.id}><button type="button" aria-current={tab === 'workflow' && runId === item.id ? 'page' : undefined} onClick={() => navigate('workflow', item.id)} title={item.request}><GitBranch size={14} /><span>{item.title || item.request}</span></button></li>)}</ul>{!workflows.length && <p className="demo-small demo-muted">Your saved runs will appear here.</p>}</section>
      <section className="demo-side-section"><div className="demo-section-title"><h2>Recent conversations</h2><button className="demo-icon" type="button" aria-label="New conversation" onClick={() => navigate('chat', '')}><Plus size={14} /></button></div><ul className="demo-recent-list">{conversations.slice(0, 8).map(item => <li key={item.id}><button type="button" aria-current={tab === 'chat' && conversationId === item.id ? 'page' : undefined} onClick={() => navigate('chat', item.id)} title={item.title}><MessageSquare size={14} /><span>{item.title}</span></button></li>)}</ul>{!conversations.length && <p className="demo-small demo-muted">Start a conversation with your agents.</p>}</section></div>
      <div className="demo-sidebar-footer"><button type="button" onClick={() => setSection('people')}><Users size={16} />People & workspace<span>{workspace.members.length}</span></button><button type="button" onClick={onCreate}><Plus size={16} />Add workspace</button><Link to="/home"><ArrowLeft size={15} />Back to studio</Link><div className="demo-account"><span className="demo-avatar">{(workspace.members.find(member => member.user_id === workspace.user_id)?.username || 'H')[0]}</span><span>{admin ? 'Workspace admin' : 'Workspace member'}<small>{workspace.name}</small></span></div></div>
    </aside>
    <main className="demo-main"><ErrorMessage>{error}</ErrorMessage>{tab === 'chat' ? <><WorkspaceTopbar workspaceName={workspace.name} title={conversations.find(item => item.id === conversationId)?.title || 'New conversation'} /><SharedConversation key={conversationId || 'new-chat'} workspaceId={workspaceId} members={workspace.members} agents={agents} conversations={conversations} conversationId={conversationId} onSelect={id => navigate('chat', id)} onRefresh={refresh} /></> : <WorkflowPanel key={runId || 'new-run'} workspaceId={workspaceId} workspaceName={workspace.name} agents={agents} members={workspace.members} runId={runId} onSelect={id => navigate('workflow', id)} onRefresh={refresh} />}</main>
    {section === 'documents' && <Dialog title="Documents" onClose={() => setSection('')} wide><div className="demo-panel-body"><KnowledgePanel workspaceId={workspaceId} knowledge={knowledge} admin={admin} onRefresh={refresh} /></div></Dialog>}
    {section === 'agents' && <Dialog title="Workspace agents" onClose={() => setSection('')} wide><div className="demo-panel-body"><div className="demo-section-title"><p className="demo-muted">Specialists configured by your workspace.</p>{admin && <button className="demo-primary" type="button" onClick={() => setBuilder({})}><Plus size={14} />Create agent</button>}</div>{agents.map(agent => <section className="demo-agent-row" key={agent.id}><div><strong>{agent.name} <span>@{agent.handle}</span></strong><span>v{agent.version}</span></div><TextContent content={agent.description} /><p className="demo-small demo-muted">{agent.responsibility}</p>{admin && <div className="demo-agent-actions"><button type="button" onClick={() => setBuilder({ agent })}>Edit / Try</button><button className="demo-text-button" type="button" disabled={archiving === agent.id} onClick={() => archive(agent.id)}>{archiving === agent.id ? 'Archiving…' : 'Archive'}</button></div>}</section>)}{!agents.length && <p>Create specialists with their own instructions and knowledge permissions.</p>}</div></Dialog>}
    {section === 'people' && <Dialog title="People & workspace" onClose={() => setSection('')}><div className="demo-panel-body"><div className="demo-section-title"><h3>{workspace.name}</h3>{admin && <button type="button" onClick={() => setAddingMember(true)}><Plus size={14} />Add employee</button>}</div><ul className="demo-members">{workspace.members.map(member => <li key={member.user_id}><span className="demo-avatar">{(member.username || member.email || '?')[0].toUpperCase()}</span><div><strong>{member.username || member.email}</strong><small>{member.role}{member.user_id === workspace.user_id ? ' · you' : ''}</small></div></li>)}</ul></div></Dialog>}
    {builder && <AgentBuilder workspaceId={workspaceId} {...builder} knowledge={knowledge} onClose={() => { sessionStorage.removeItem(agentDraftKey(workspaceId)); setBuilder(null) }} onSaved={refresh} />}
    {addingMember && <MemberForm workspaceId={workspaceId} onClose={() => setAddingMember(false)} onSaved={refresh} />}
  </div>
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
    const timer = setTimeout(refreshList, 0)
    window.addEventListener('focus', refreshList)
    return () => { clearTimeout(timer); window.removeEventListener('focus', refreshList) }
  }, [refreshList])
  useEffect(() => {
    if (loaded && !workspaceId && workspaces.length) setParams({ workspace: workspaces[0].id, view: 'workflow' }, { replace: true })
  }, [loaded, workspaceId, workspaces, setParams])
  function selectWorkspace(id) { setParams({ workspace: id, view: 'workflow' }) }
  function navigate(view, id) { setParams({ workspace: workspaceId, view, ...(id ? { [view === 'chat' ? 'conversation' : 'run']: id } : {}) }) }
  function created(workspace) { setWorkspaces(previous => [...previous, workspace]); selectWorkspace(workspace.id) }
  return <div className="demo-root"><ErrorMessage>{error}</ErrorMessage>{!loaded && <div className="demo-loading" role="status">Loading workspaces…</div>}
    {loaded && !workspaceId && !workspaces.length && <main className="demo-welcome"><Building2 size={32} /><h1>Your team's workspace</h1><p>Bring knowledge, people and agents together. Start with a shared workspace.</p><button type="button" className="demo-primary" onClick={() => setCreating(true)}><Plus size={16} />Create your first workspace</button></main>}
    {workspaceId && <WorkspaceContent key={workspaceId} workspaceId={workspaceId} workspaces={workspaces} selectWorkspace={selectWorkspace} onCreate={() => setCreating(true)} tab={params.get('view') === 'chat' ? 'chat' : 'workflow'} conversationId={params.get('conversation')} runId={params.get('run')} navigate={navigate} />}
    {creating && <WorkspaceForm onClose={() => setCreating(false)} onCreated={created} />}
  </div>
}
