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
 * Set the Schedule page's weekly-posts target (1-7). Get-or-creates the
 * profile row server-side, so this works even for a user who hasn't
 * onboarded yet — unlike PATCH '' (update_profile), which 404s without an
 * existing profile.
 */
export const updateWeeklyTarget = (weeklyPostTarget) =>
  client.patch('/weekly-target', { weekly_post_target: weeklyPostTarget }).then(r => r.data)

/**
 * Fetch the logged-in user's account identity (email + username) from the
 * `users` table — distinct from getProfile()'s onboarding data, and never
 * 404s (a `users` row always exists once authenticated). Backs the Settings
 * page's Profile card.
 */
export const getAccountSettings = () =>
  client.get('/settings').then(r => r.data)
