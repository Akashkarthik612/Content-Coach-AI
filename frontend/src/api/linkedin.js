import axios from 'axios'
import { attachAuthHeader } from './attachAuthHeader'
import { API_BASE } from './apiBase'

const client = axios.create({ baseURL: `${API_BASE}/api/linkedin` })
attachAuthHeader(client)

/** {connected, display_name, profile_image_url, expires_at} */
export const getLinkedInStatus = () =>
  client.get('/connection-status').then(r => r.data)

/** {auth_url} — frontend should redirect window.location.href to this */
export const getLinkedInAuthUrl = () =>
  client.get('/auth/url').then(r => r.data)

/**
 * Publish the latest saved version of a post to LinkedIn.
 * Returns {published, needs_auth, auth_url?, reason?, linkedin_post_id?, duplicate?}
 * If needs_auth is true, redirect window.location.href to auth_url.
 */
export const publishToLinkedIn = (postId) =>
  client.post(`/publish/${postId}`).then(r => r.data)

/** Remove LinkedIn connection. Returns 204 (no body). */
export const disconnectLinkedIn = () =>
  client.delete('/disconnect')
