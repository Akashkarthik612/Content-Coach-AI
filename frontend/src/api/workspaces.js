import axios from 'axios'
import { attachAuthHeader } from './attachAuthHeader'
import { API_BASE } from './apiBase'

const api = axios.create({ baseURL: `${API_BASE}/api/workspaces` })
attachAuthHeader(api)
const data = promise => promise.then(response => response.data)
const path = id => `/${encodeURIComponent(id)}`

export const listWorkspaces = () => data(api.get(''))
export const createWorkspace = name => data(api.post('', { name }))
export const getWorkspace = id => data(api.get(path(id)))
export const addWorkspaceMember = (id, input) => data(api.post(`${path(id)}/members`, input))
export const getWorkspaceKnowledge = id => data(api.get(`${path(id)}/knowledge`))
export const shareWorkspaceSource = (id, input) => data(api.post(`${path(id)}/knowledge/sources`, input))
export const unshareWorkspaceSource = (id, sourceId) => api.delete(`${path(id)}/knowledge/sources/${sourceId}`)
export const syncWorkspaceSource = (id, sourceId) => data(api.post(`${path(id)}/knowledge/sources/${sourceId}/sync`))
export const listWorkspaceAgents = id => data(api.get(`${path(id)}/agents`))
export const createWorkspaceAgent = (id, input) => data(api.post(`${path(id)}/agents`, input))
export const updateWorkspaceAgent = (id, agentId, input) => data(api.put(`${path(id)}/agents/${agentId}`, input))
export const archiveWorkspaceAgent = (id, agentId) => api.delete(`${path(id)}/agents/${agentId}`)
export const previewWorkspaceAgent = (id, configuration, message) => data(api.post(`${path(id)}/agents/preview`, { configuration, message }))
export const listConversations = id => data(api.get(`${path(id)}/conversations`))
export const createConversation = (id, title) => data(api.post(`${path(id)}/conversations`, { title }))
export const getConversation = (id, chatId) => data(api.get(`${path(id)}/conversations/${chatId}`))
export const sendWorkspaceMessage = (id, chatId, message) => data(api.post(`${path(id)}/conversations/${chatId}/messages`, { message }))
export const retryWorkspaceMessage = (id, chatId) => data(api.post(`${path(id)}/conversations/${chatId}/retry`))
export const listWorkflows = id => data(api.get(`${path(id)}/workflows`))
export const startWorkflow = (id, input) => data(api.post(`${path(id)}/workflows`, input))
export const getWorkflow = (id, runId) => data(api.get(`${path(id)}/workflows/${runId}`))
export const reviewWorkflow = (id, runId, input) => data(api.post(`${path(id)}/workflows/${runId}/review`, input))
export const retryWorkflow = (id, runId) => data(api.post(`${path(id)}/workflows/${runId}/retry`))

const REASONS = {
  workspace_not_found: 'You do not have access to this workspace.',
  workspace_admin_required: 'A workspace admin manages members, sharing and agents.',
  registered_employee_not_found: 'No registered employee has that email. Ask them to sign in to Honne first.',
  employee_already_member: 'This employee already belongs to the workspace.',
  agent_handle_taken: 'This handle is already in use. Choose another.',
  workspace_configuration_conflict: 'Another update changed this record. Refresh and try again.',
  agent_version_conflict: 'This agent was edited by someone else. Close the builder and open the latest version.',
  agent_source_not_shared: 'One of the selected sources is no longer shared with this workspace.',
  agent_document_not_shared: 'One of the selected documents is no longer shared with this workspace.',
  agent_unavailable: 'An agent in this run has been archived or is unavailable.',
  start_with_agent_mention: 'Start your first message with an @agent handle.',
  conversation_busy: 'Another employee is waiting for an answer in this conversation. Try again when it finishes.',
  knowledge_tools_disabled: 'Enable KNOWLEDGE_TOOLS_ENABLED on the backend to run workspace agents.',
  workspace_workflow_unavailable: 'Workspace workflows are unavailable. Check backend knowledge and checkpoint setup.',
  workflow_review_conflict: 'This result has already been reviewed or changed. Refresh to see its current status.',
  workflow_revision_limit: 'This run has reached its three-revision limit. Start a new run for further changes.',
  stale_job: 'Execution stopped before completing. Retry to continue from saved context.',
  agent_timeout: 'The agent reached its time limit. You can retry this execution.',
  invalid_model_output: 'The model returned an invalid answer. Retry the execution.',
  agent_execution_failed: 'The agent could not complete. Check the backend configuration and retry.',
}

export function workspaceError(error) {
  const detail = error?.response?.data?.detail
  const reason = detail?.reason
  if (REASONS[reason]) return REASONS[reason]
  if (/^select_one_(product|marketing|support)_agent$/.test(reason ?? '')) return 'Choose one Product, Marketing and Support specialist before running the workflow.'
  if (/^configure_.*_knowledge$/.test(reason ?? '')) return 'Give every specialist at least one shared knowledge source or document and an enabled tool.'
  if (Array.isArray(detail)) return detail.map(item => `${item.loc?.slice(1).join('.')}: ${item.msg}`).join(' · ')
  if (error?.response?.status === 401) return 'Your session has expired. Sign in again.'
  return reason ? `Request failed (${reason}).` : 'Could not reach the server. Try again.'
}

export const statusLabel = value => (value ?? '').replaceAll('_', ' ')
