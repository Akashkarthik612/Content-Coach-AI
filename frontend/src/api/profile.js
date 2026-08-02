import axios from 'axios'
import { attachAuthHeader } from './attachAuthHeader'

const client = axios.create({ baseURL: '/api/profile' })
attachAuthHeader(client)

/**
 * Upsert the user's profile from onboarding answers. Get-or-create + partial
 * merge server-side — safe to call even if a profile already exists.
 * answers: {profession?, industry?, role?, target_audience?, writing_style?, goals?, topics?}
 */
export const submitOnboarding = (answers) =>
  client.post('/onboarding', answers).then(r => r.data)

/**
 * Fetch the logged-in user's profile (name/profession/etc.), scoped by the
 * X-User-Id header above — never another user's data. Returns null instead
 * of throwing when the user hasn't onboarded yet (backend 404s in that case).
 */
export const getProfile = () =>
  client.get('').then(r => r.data).catch(err => {
    if (err.response?.status === 404) return null
    throw err
  })

/**
 * Fetch the logged-in user's account identity (email + username) from the
 * `users` table — distinct from getProfile()'s onboarding data, and never
 * 404s (a `users` row always exists once authenticated). Backs the Settings
 * page's Profile card.
 */
export const getAccountSettings = () =>
  client.get('/settings').then(r => r.data)
