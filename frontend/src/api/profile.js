import axios from 'axios'
import { attachAuthHeader } from './attachAuthHeader'
import { API_BASE } from './apiBase'

const client = axios.create({ baseURL: `${API_BASE}/api/profile` })
attachAuthHeader(client)

/**
 * Upsert the user's profile from onboarding answers. Get-or-create + partial
 * merge server-side — safe to call even if a profile already exists.
 * answers: {profession?, industry?, role?, target_audience?, writing_style?, goals?, topics?}
 */
export const submitOnboarding = (answers) =>
  client.post('/onboarding', answers).then(r => r.data)
