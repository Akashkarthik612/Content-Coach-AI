import { useEffect, useState } from 'react'
import { Check, GitBranch, Play, RotateCcw, X } from 'lucide-react'
import { getWorkflow, retryWorkflow, reviewWorkflow, startWorkflow, statusLabel, workspaceError } from '../../api/workspaces'
import { ErrorMessage, Sources, TextContent, timeLabel } from './shared'

const ROLES = ['product', 'marketing', 'support']
const TITLES = { product: 'Product summary', marketing: 'Marketing draft', support: 'Customer FAQs' }
const EVENTS = {
  coordinator_started: 'Coordinator started', agent_started: 'Agent started', tool_started: 'Tool started',
  tool_used: 'Tool completed', tool_failed: 'Tool failed', model_usage: 'Model usage recorded',
  agent_completed: 'Agent completed', agent_failed: 'Agent failed', handoff_validated: 'Product handoff checked',
  deliverable_saved: 'Deliverable saved', coordinator_completed: 'Coordinator completed',
  awaiting_human_review: 'Awaiting human review', coordinator_failed: 'Coordinator failed',
  workflow_approved: 'Approved by reviewer', workflow_rejected: 'Rejected by reviewer',
}

export default function WorkflowPanel({ workspaceId, agents, members, workflows, runId, onSelect, onRefresh }) {
  const [request, setRequest] = useState('')
  const [selected, setSelected] = useState({})
  const [run, setRun] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const [reload, setReload] = useState(0)
  const team = Object.fromEntries(ROLES.map(role => {
    const available = agents.filter(agent => agent.workflow_role === role)
    return [role, available.some(agent => agent.id === selected[role]) ? selected[role] : available.length === 1 ? available[0].id : '']
  }))
  const ready = ROLES.every(role => !!team[role])
  const executing = run && ['queued', 'running'].includes(run.status)

  useEffect(() => {
    let live = true
    let timer
    setRun(null); setPollError('')
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
      setFeedback(''); setReload(value => value + 1); await onRefresh()
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
  const currentDeliverables = ROLES.filter(role => run?.state?.[role] && run.state[role].revision === run.revision)
  return <section className="demo-workflow">
    <div className="demo-content-heading"><div><span className="demo-eyebrow">Automatic orchestration</span><h2>One brief. Three specialists.</h2><p>Product research flows into a marketing draft and support FAQs, ready for your review.</p></div><GitBranch size={26} /></div>
    <form onSubmit={launch} className="demo-brief">
      <label htmlFor="business-request">What does your team need?<textarea id="business-request" value={request} onChange={e => setRequest(e.target.value)} rows={3} maxLength={8000} required placeholder="Prepare a launch announcement and customer FAQs using our approved product documentation." /></label>
      <div className="demo-specialist-selectors">{ROLES.map((role, index) => <label key={role}><span>{index + 1}. {role === 'support' ? 'Customer support' : role[0].toUpperCase() + role.slice(1)}</span><select required value={team[role]} onChange={e => setSelected(value => ({ ...value, [role]: e.target.value }))}>
        <option value="">Select specialist</option>{agents.filter(agent => agent.workflow_role === role).map(agent => <option key={agent.id} value={agent.id}>@{agent.handle} · v{agent.version}</option>)}</select></label>)}</div>
      <footer><span className="demo-small demo-muted">Drafts and human review only</span><button className="demo-primary" type="submit" disabled={!!busy || !ready || !request.trim()}><Play size={14} />{busy === 'start' ? 'Starting…' : 'Run company workflow'}</button></footer>
      {!ready && <p className="demo-small demo-muted">Create a Product, Marketing and Customer Support agent, select their knowledge permissions, then choose them above.</p>}
    </form>
    <ErrorMessage>{error || pollError}</ErrorMessage>
    <div className="demo-run-picker"><label>Saved workflow<select value={runId ?? ''} onChange={e => { onSelect(e.target.value); setFeedback('') }}><option value="">Choose a run</option>{workflows.map(item => <option value={item.id} key={item.id}>{item.request.slice(0, 65)} · {statusLabel(item.status)}</option>)}{runId && !workflows.some(item => item.id === runId) && <option value={runId}>Current run</option>}</select></label></div>
    {!runId && <div className="demo-empty"><GitBranch size={32} /><h3>A clear path from facts to deliverables.</h3><p>Submit a business request to see actual agent execution, source references and review controls.</p></div>}
    {runId && !run && !pollError && <p role="status">Loading workflow…</p>}
    {run && <>
      <div className="demo-run-heading"><div><h3>{run.request}</h3><p className="demo-muted demo-small">Started by {employee(run.initiated_by)} · Revision {run.revision} · {(run.duration_ms / 1000).toFixed(1)}s agent execution</p></div><span className={`demo-status demo-status-${run.status}`}>{statusLabel(run.status)}</span></div>
      <div className="demo-flow-track">{ROLES.map((role, index) => {
        const relevant = run.steps.filter(step => step.revision === run.revision && step.details.role === role)
        const lastAgentEvent = relevant.filter(step => ['agent_started', 'agent_completed', 'agent_failed'].includes(step.event)).at(-1)?.event
        const completed = lastAgentEvent === 'agent_completed'
        const failed = lastAgentEvent === 'agent_failed'
        const started = lastAgentEvent === 'agent_started'
        return <div className={failed ? 'is-failed' : completed ? 'is-complete' : started ? 'is-running' : ''} key={role}><span>{index + 1}</span><div><strong>@{run.agents[role].handle}</strong><small>v{run.agents[role].version} · {failed ? 'Failed' : completed ? 'Completed' : started ? 'Started' : 'Pending'}</small></div></div>
      })}</div>
      <details className="demo-activity" open={!!executing || run.status === 'failed'}><summary>Execution activity · {run.steps.filter(step => step.event !== 'model_usage').length} events</summary>
        <ol>{run.steps.filter(step => step.event !== 'model_usage').map(step => <li key={step.id} className={step.event.includes('failed') ? 'is-failed' : ''}><time>{timeLabel(step.created_at)}</time><div><strong>{EVENTS[step.event] ?? statusLabel(step.event)}</strong>{step.details.handle && <span> · @{step.details.handle}</span>}{step.tool_name && <span> · {step.tool_name.replaceAll('_', ' ')}</span>}{step.details.result_count !== undefined && <small>{step.details.result_count} results</small>}{step.details.fact_count !== undefined && <small>{step.details.fact_count} source-backed facts</small>}{step.details.error_code && <small>{statusLabel(step.details.error_code)}</small>}</div></li>)}</ol>
      </details>
      {run.error_code && <div className="demo-run-error"><ErrorMessage>{workspaceError({ response: { data: { detail: { reason: run.error_code } } } })}</ErrorMessage><button type="button" disabled={!!busy} onClick={retry}><RotateCcw size={14} />Retry from saved state</button></div>}
      {run.state?.revision === run.revision && run.state?.issues?.length > 0 && <div className="demo-issues"><h4>Needs a human decision</h4><ul>{run.state.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
      <div className="demo-deliverables">{currentDeliverables.map(role => {
        const value = run.state[role]
        return <article key={role} className={`demo-deliverable demo-deliverable-${role}`}><header><h3>{TITLES[role]}</h3><span>@{value.handle} · v{value.agent_version}</span><button type="button" onClick={() => { navigator.clipboard?.writeText(value.content).catch(() => setError('Clipboard access is unavailable. Select and copy the text.')) }}>Copy</button></header>
          <TextContent content={value.content} />{value.note && <p className="demo-muted demo-small">{value.note}</p>}<Sources sources={value.sources} />
          {role === 'product' && <details className="demo-facts"><summary>Structured product handoff · {value.facts?.length ?? 0} facts</summary><ul>{value.facts?.map((fact, index) => <li key={index}><strong>{fact.category}: </strong>{fact.statement}<small>{fact.document_ids.length} document reference(s)</small></li>)}</ul></details>}
          {value.handoff && <details className="demo-facts"><summary>Received product handoff · {value.handoff.facts.length} facts</summary><ul>{value.handoff.facts.map((fact, index) => <li key={index}>{fact.statement}</li>)}</ul></details>}
          {!!value.usage?.total_tokens && <p className="demo-muted demo-small">{value.usage.total_tokens.toLocaleString()} tokens reported</p>}
        </article>
      })}</div>
      {run.status === 'awaiting_review' && <section className="demo-review"><span className="demo-eyebrow">Human review</span><h3>Your team has the final word.</h3><p>Review the drafts, sources and open questions. Approval saves your decision.</p>
        <label>Feedback<textarea rows={3} maxLength={4000} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Describe any changes you need, or leave an optional review note." /></label>
        <div className="demo-review-actions"><button className="demo-primary" type="button" disabled={!!busy} onClick={() => review('approve')}><Check size={16} />Approve</button><button type="button" disabled={!!busy || !feedback.trim() || run.revision >= 3} onClick={() => review('request_changes')}><RotateCcw size={14} />Request changes</button><button className="demo-danger" type="button" disabled={!!busy} onClick={() => review('reject')}><X size={15} />Reject</button></div>
        {run.revision >= 3 && <p className="demo-small demo-muted">Three revisions completed. Start a new run for further changes.</p>}
      </section>}
      {!!run.reviews.length && <details className="demo-review-history" open><summary>Review history</summary>{run.reviews.map(review => <div key={review.id}><strong>{employee(review.reviewed_by)}</strong> · {statusLabel(review.action)} · revision {review.revision}<p>{review.feedback || 'No feedback provided.'}</p></div>)}</details>}
      {!executing && <div className="demo-rerun"><p>Updated company documents? Synchronize the source, then rerun this brief with the latest selected agent configurations.</p><button type="button" disabled={!!busy || !ready} onClick={() => launch(null, true)}><RotateCcw size={14} />Rerun with latest knowledge</button></div>}
    </>}
  </section>
}
