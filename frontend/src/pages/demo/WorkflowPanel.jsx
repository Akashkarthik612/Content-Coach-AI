import { useEffect, useState } from 'react'
import { ArrowRight, Check, CheckCheck, Copy, FileText, GitBranch, Play, RotateCcw, X } from 'lucide-react'
import { getWorkflow, retryWorkflow, reviewWorkflow, startWorkflow, statusLabel, workspaceError } from '../../api/workspaces'
import { Dialog, ErrorMessage, Sources, TextContent, WorkspaceTopbar } from './shared'
import { timeLabel } from './time'
import GeneratedDocuments from './GeneratedDocuments'

// The existing launch endpoint requires these slots. Presentation below is
// driven by saved assignments, plan dependencies and revisioned output data.
const API_SLOTS = ['product', 'marketing', 'support']
const agentName = agent => agent?.name || (agent?.handle ? `@${agent.handle}` : 'Agent')

export default function WorkflowPanel({ workspaceId, workspaceName, agents, members, runId, onSelect, onRefresh }) {
  const [request, setRequest] = useState('')
  const [selected, setSelected] = useState({})
  const [run, setRun] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const [reload, setReload] = useState(0)
  const [deliverable, setDeliverable] = useState('')
  const [panel, setPanel] = useState('')
  const [copied, setCopied] = useState(false)
  const team = Object.fromEntries(API_SLOTS.map(role => {
    const available = agents.filter(agent => agent.workflow_role === role)
    return [role, available.some(agent => agent.id === selected[role]) ? selected[role] : available.length === 1 ? available[0].id : '']
  }))
  const ready = API_SLOTS.every(role => !!team[role])
  const executing = run && ['queued', 'running'].includes(run.status)

  useEffect(() => {
    let live = true
    let timer
    if (!runId) return undefined
    async function refresh() {
      let value
      try { value = await getWorkflow(workspaceId, runId); if (live) { setRun(value); setPollError('') } }
      catch (err) { if (live) setPollError(workspaceError(err)) }
      if (live) timer = setTimeout(refresh, value && ['queued', 'running'].includes(value.status) ? 1500 : 5000)
    }
    refresh()
    return () => { live = false; clearTimeout(timer) }
  }, [workspaceId, runId, reload])

  async function launch(event, rerun = false) {
    event?.preventDefault(); setBusy('start'); setError('')
    try {
      const value = await startWorkflow(workspaceId, { request: rerun ? run.request : request.trim(), agents: team })
      onSelect(value.id); setReload(value => value + 1); setFeedback(''); await onRefresh()
    } catch (err) { setError(workspaceError(err)) }
    finally { setBusy('') }
  }
  async function review(action) {
    setBusy(action); setError('')
    try {
      await reviewWorkflow(workspaceId, run.id, { action, feedback: feedback.trim(), expected_revision: run.revision })
      // Keep the current draft visible while the existing polling path refreshes.
      setFeedback(''); setPanel(''); setReload(value => value + 1); await onRefresh()
    } catch (err) { setError(workspaceError(err)) }
    finally { setBusy('') }
  }
  async function retry() {
    setBusy('retry'); setError('')
    try { await retryWorkflow(workspaceId, run.id); setReload(value => value + 1); await onRefresh() }
    catch (err) { setError(workspaceError(err)) }
    finally { setBusy('') }
  }
  const employee = id => { const value = members.find(member => member.user_id === id); return value?.username || value?.email || 'Former employee' }
  const plan = run?.state?.plan || []
  const assignments = Object.entries(run?.agents || {}).sort(([left], [right]) => {
    const order = role => { const index = plan.findIndex(task => task.role === role); return index < 0 ? plan.length : index }
    return order(left) - order(right)
  })
  const outputs = assignments.filter(([key]) => run?.state?.[key]?.content && run.state[key].revision === run.revision)
  const activeKey = outputs.some(([key]) => key === deliverable) ? deliverable : outputs[0]?.[0]
  const output = run?.state?.[activeKey]
  const assignment = run?.agents?.[activeKey]
  const title = run?.title || run?.name || run?.request || 'New workflow'
  const steps = run?.steps || []
  const issues = run?.state?.revision === run?.revision ? run?.state?.issues || [] : []
  const outputTitle = (key, agent) => run.state[key].title || `${agentName(agent)} output`
  async function copy() {
    try { await navigator.clipboard.writeText(output.content); setCopied(true) }
    catch { setError('Clipboard access is unavailable. Select and copy the text.') }
  }

  return <section className="demo-workflow">
    <WorkspaceTopbar workspaceName={workspaceName} title={title} status={run?.status}>
      {run && <button type="button" className="demo-icon" aria-label="Start a new workflow" onClick={() => onSelect('')}><Play size={16} /></button>}
    </WorkspaceTopbar>
    <div className="demo-run-scroll">
      <ErrorMessage>{error || pollError}</ErrorMessage>
      {!runId && <div className="demo-new-workflow"><div className="demo-content-heading"><GitBranch size={24} /><h1>What are we working on?</h1><p>Give your agents a brief. Review their work together.</p></div>
        <form onSubmit={launch} className="demo-brief">
          <label htmlFor="business-request">Your request<textarea id="business-request" value={request} onChange={e => setRequest(e.target.value)} rows={5} maxLength={8000} required placeholder="Describe the outcome you need and the context your team should use…" /></label>
          <div className="demo-specialist-selectors">{API_SLOTS.map((role, index) => {
            const actual = agents.find(agent => agent.id === team[role])
            return <label key={role}><span>{actual ? agentName(actual) : `Assignment ${index + 1}`}</span><select required aria-label={`Agent assignment ${index + 1}`} value={team[role]} onChange={e => setSelected(value => ({ ...value, [role]: e.target.value }))}>
              <option value="">Select specialist</option>{agents.filter(agent => agent.workflow_role === role).map(agent => <option key={agent.id} value={agent.id}>{agentName(agent)}</option>)}</select></label>
          })}</div>
          {!ready && <p className="demo-small demo-muted">This workflow needs three configured specialist assignments. Configure your agents and their knowledge permissions in Agents.</p>}
          <footer><span className="demo-small demo-muted">Your team reviews every deliverable.</span><button className="demo-primary" type="submit" disabled={!!busy || !ready || !request.trim()}><Play size={14} />{busy === 'start' ? 'Starting…' : 'Run workflow'}</button></footer>
        </form></div>}
      {runId && !run && !pollError && <p className="demo-loading" role="status">Loading saved run…</p>}
      {run && <div className="demo-run-layout"><div className="demo-run-content">
        <section className="demo-request" aria-labelledby="request-heading"><div className="demo-section-kicker"><span className="demo-avatar">{employee(run.initiated_by)[0].toUpperCase()}</span><span>{employee(run.initiated_by)}<small>Your request</small></span><span className="demo-small demo-muted">Revision {run.revision}</span></div><h1 id="request-heading">{run.title || run.name || 'Workspace run'}</h1><TextContent content={run.request} /></section>
        <section className="demo-handoffs" aria-label="Agent handoff"><div className="demo-section-label"><GitBranch size={15} /><h2>Agent handoff</h2><span>{assignments.length} agents</span></div>
          <div className="demo-flow-track">{assignments.map(([role, agent]) => {
            const last = steps.filter(step => step.revision === run.revision && (step.details?.role === role || step.agent_id === agent.id) && ['agent_started', 'agent_completed', 'agent_failed'].includes(step.event)).at(-1)
            const saved = run.state?.[role]?.revision === run.revision ? run.state[role] : null
            const status = last?.event === 'agent_failed' ? 'Failed' : last?.event === 'agent_completed' ? 'Completed' : last?.event === 'agent_started' ? 'Working' : 'Pending'
            const task = plan.find(item => item.role === role)
            const dependencies = task?.depends_on || []
            return <div className="demo-agent-step" key={role}><div className="demo-agent-step-title"><span className="demo-agent-icon">{status === 'Completed' ? <Check size={15} /> : <GitBranch size={15} />}</span><div><strong>{agentName(agent)}</strong><small>{agent.responsibility || agent.role || statusLabel(role)}</small></div></div>
              <span className="demo-step-status" role="status">{status}</span>
              {saved?.handoff && <button className="demo-handoff-button" type="button" onClick={() => { setDeliverable(role); setPanel('handoff') }}><ArrowRight size={13} />{dependencies.length ? dependencies.map(key => agentName(run.agents[key])).join(', ') : 'Received handoff'}<span>{saved.handoff.facts?.length || 0} facts</span></button>}
            </div>
          })}</div>
        </section>
        <section className="demo-deliverables" aria-label="Deliverables">
          <div className="demo-deliverables-heading"><h2>Deliverables</h2><span>{outputs.length} available</span></div>
          <div className="demo-deliverable-tabs" role="tablist" aria-label="Select deliverable">{outputs.map(([key, agent]) => <button role="tab" id={`tab-${key}`} aria-selected={activeKey === key} aria-controls="selected-deliverable" tabIndex={activeKey === key ? 0 : -1} key={key} onClick={() => { setDeliverable(key); setCopied(false) }} onKeyDown={event => {
            if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const index = outputs.findIndex(([value]) => value === key)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? outputs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + outputs.length) % outputs.length
            setDeliverable(outputs[next][0]); document.getElementById(`tab-${outputs[next][0]}`)?.focus()
          }}><FileText size={15} />{run.state[key].title || agentName(agent)}</button>)}</div>
          {output ? <article id="selected-deliverable" role="tabpanel" aria-labelledby={`tab-${activeKey}`} className="demo-deliverable"><header><div><h2>{outputTitle(activeKey, assignment)}</h2><span>Prepared by @{output.handle || assignment.handle}{output.agent_version ? ` · v${output.agent_version}` : ''}</span></div><button type="button" className="demo-icon" onClick={copy} aria-label={copied ? 'Copied' : 'Copy deliverable'}>{copied ? <CheckCheck size={16} /> : <Copy size={16} />}</button></header>
            <TextContent content={output.content} />
            <GeneratedDocuments workspaceId={workspaceId} artifacts={(run.artifacts || output.artifacts || []).filter(item => !item.workflow_role || (item.workflow_role === activeKey && item.revision === run.revision))} onRefresh={() => setReload(value => value + 1)} />
            {output.note && <div className="demo-output-note"><TextContent content={output.note} /></div>}
            <div className="demo-output-footer"><button type="button" onClick={() => setPanel('sources')}><FileText size={14} />Sources ({output.sources?.length || 0})</button>{(output.facts?.length > 0 || output.handoff) && <button type="button" onClick={() => setPanel('handoff')}><GitBranch size={14} />View handoff</button>}</div>
          </article> : <div className="demo-empty" role="status"><FileText size={25} /><h3>{executing ? 'Your agents are working' : 'No deliverables for this revision'}</h3><p>Saved outputs appear here as the run progresses.</p></div>}
        </section>
        {run.error_code && <div className="demo-run-error"><ErrorMessage>{workspaceError({ response: { data: { detail: { reason: run.error_code } } } })}</ErrorMessage><button type="button" disabled={!!busy} onClick={retry}><RotateCcw size={14} />Retry from saved state</button></div>}
        {!!issues.length && <section className="demo-issues"><h3>Questions for review</h3>{issues.map((issue, index) => <TextContent key={index} content={issue} />)}</section>}
        <details className="demo-activity"><summary>Execution details · {steps.length} events</summary><p className="demo-small demo-muted">{((run.duration_ms || 0) / 1000).toFixed(1)}s agent execution</p><ol>{steps.map(step => <li key={step.id}><time>{timeLabel(step.created_at)}</time><div><strong>{statusLabel(step.event)}</strong>{step.details?.handle && <span> · @{step.details.handle}</span>}{step.tool_name && <span> · {statusLabel(step.tool_name)}</span>}{step.details?.total_tokens && <span> · {step.details.total_tokens.toLocaleString()} tokens</span>}</div></li>)}</ol>{outputs.map(([key, agent]) => run.state[key].usage?.total_tokens ? <p className="demo-small" key={key}>{agentName(agent)}: {run.state[key].usage.total_tokens.toLocaleString()} tokens</p> : null)}</details>
        {!!run.reviews?.length && <details className="demo-review-history"><summary>Review history · {run.reviews.length}</summary>{run.reviews.map(item => <div key={item.id}><strong>{employee(item.reviewed_by)}</strong> · {statusLabel(item.action)} · revision {item.revision}<TextContent content={item.feedback || 'No feedback provided.'} /></div>)}</details>}
        {!executing && <div className="demo-rerun"><span className="demo-muted demo-small">Use the latest shared knowledge and agent configurations.</span><button type="button" disabled={!!busy || !ready} onClick={() => launch(null, true)}><RotateCcw size={14} />Rerun request</button></div>}
      </div>
      <aside className="demo-run-aside" aria-label="Run review and sources"><section className="demo-review-entry"><span className="demo-section-label"><CheckCheck size={18} />Human review</span><h2>{run.status === 'awaiting_review' ? 'Ready for your review' : statusLabel(run.status)}</h2><p>{run.status === 'awaiting_review' ? 'Read the deliverables, check the sources, and share your decision.' : 'Your team keeps the final word on every deliverable.'}</p><button className="demo-primary" type="button" onClick={() => setPanel('review')}>{run.status === 'awaiting_review' ? 'Review run' : 'View review'}<ArrowRight size={15} /></button></section>
        <section className="demo-context-links"><h2>Run context</h2><button type="button" aria-label="Sources" disabled={!output} onClick={() => setPanel('sources')}><FileText size={16} />Sources<span>{output?.sources?.length || 0}</span></button><button type="button" disabled={!output?.handoff && !output?.facts?.length} onClick={() => setPanel('handoff')}><GitBranch size={16} />Agent handoff<ArrowRight size={14} /></button><p>Shared with your workspace.<br />Decisions are saved to this run.</p></section>
      </aside></div>}
    </div>
    {panel === 'sources' && <Dialog title="Sources for selected deliverable" onClose={() => setPanel('')} wide><div className="demo-panel-body"><Sources sources={output?.sources} expanded /></div></Dialog>}
    {panel === 'handoff' && <Dialog title="Recorded agent handoff" onClose={() => setPanel('')} wide><div className="demo-panel-body"><p className="demo-muted">{output?.handoff ? `Context received by ${agentName(assignment)}` : `Context prepared by ${agentName(assignment)}`}</p><ol className="demo-handoff-facts">{(output?.handoff?.facts || output?.facts || []).map((fact, index) => <li key={index}><TextContent content={fact.statement} />{((fact.document_ids?.length || 0) + (fact.source_ids?.length || 0)) > 0 && <small>{(fact.document_ids?.length || 0) + (fact.source_ids?.length || 0)} source references</small>}</li>)}</ol>{output?.handoff?.missing?.map((item, index) => <TextContent key={index} content={item} />)}{output?.handoff?.contradictions?.map((item, index) => <TextContent key={index} content={item} />)}<Sources sources={output?.handoff?.sources || output?.sources} /></div></Dialog>}
    {panel === 'review' && <Dialog title="Review this run" onClose={() => setPanel('')} wide><section className="demo-review demo-panel-body"><p>Review all {outputs.length} deliverables before saving your decision.</p>{!!issues.length && <div className="demo-issues"><h3>Open questions</h3>{issues.map((issue, index) => <TextContent key={index} content={issue} />)}</div>}{run?.status === 'awaiting_review' ? <><label>Feedback<textarea rows={4} maxLength={4000} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Describe the changes you need, or leave an optional review note." /></label><ErrorMessage>{error}</ErrorMessage><div className="demo-review-actions"><button className="demo-primary" type="button" disabled={!!busy} onClick={() => review('approve')}><Check size={16} />Approve</button><button type="button" disabled={!!busy || !feedback.trim() || run.revision >= 3} onClick={() => review('request_changes')}><RotateCcw size={14} />Request changes</button><button className="demo-danger" type="button" disabled={!!busy} onClick={() => review('reject')}><X size={15} />Reject</button></div>{run.revision >= 3 && <p className="demo-muted demo-small">Three revisions completed. Start a new run for further changes.</p>}</> : <p className="demo-muted">{statusLabel(run?.status)}. Review actions are available when the agents finish this revision.</p>}{run?.reviews?.map(item => <div className="demo-review-record" key={item.id}><strong>{employee(item.reviewed_by)}</strong> · {statusLabel(item.action)}<TextContent content={item.feedback || 'No feedback provided.'} /></div>)}</section></Dialog>}
  </section>
}
