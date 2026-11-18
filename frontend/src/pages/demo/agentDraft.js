export const agentDraftKey = workspaceId => `honne_agent_draft:${localStorage.getItem('user_id') || ''}:${workspaceId}`

export function readAgentDraft(workspaceId) {
  try { return JSON.parse(sessionStorage.getItem(agentDraftKey(workspaceId)) || 'null') }
  catch { return null }
}
