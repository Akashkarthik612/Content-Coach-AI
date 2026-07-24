import axios from 'axios'

const client = axios.create({ baseURL: '/api/profile' })

// Same X-User-Id interceptor pattern as vault.js/linkedin.js — scopes every request to the logged-in user
client.interceptors.request.use(config => {
  const userId = localStorage.getItem('user_id')
  if (userId) config.headers['X-User-Id'] = userId
  return config
})

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
