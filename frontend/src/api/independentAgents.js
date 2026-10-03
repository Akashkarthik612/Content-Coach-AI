import axios from 'axios';
import { attachAuthHeader } from './attachAuthHeader';
import { API_BASE } from './apiBase';

const api = axios.create({ baseURL: `${API_BASE}/api/independent-agents` });
attachAuthHeader(api);

/**
 * One stateless Reddit draft. Nothing is saved server-side; to revise a
 * draft, send the current one back as `extra_context`.
 *
 * @param {{topic: string, subreddit?: string, tone?: string, extra_context?: string}} req
 * @returns {Promise<{title: string, content: string, suggested_subreddit: string}>}
 */
export const generateRedditPost = (req) =>
  api.post('/reddit', req).then(r => r.data);

// ── LinkedIn (thread memory) ────────────────────────────────────────────────
// A chat is a server-side thread. Omit thread_id to start a new one; the
// response carries the thread id to send with every follow-up.

/**
 * @param {{message: string, thread_id?: string|null}} req
 * @returns {Promise<{content: string, thread: {thread_id: string, turn_count: number, turn_limit: number, limit_reached: boolean}}>}
 */
export const sendLinkedInMessage = ({ message, thread_id = null }) =>
  api.post('/linkedin', thread_id ? { message, thread_id } : { message }).then(r => r.data);

/** @returns {Promise<Array<{id: string, title: string|null, turn_count: number, last_message_at: string}>>} */
export const listLinkedInThreads = () =>
  api.get('/linkedin/threads').then(r => r.data);

/** @returns {Promise<{id: string, title: string|null, messages: Array<{role: 'user'|'assistant', content: string}>, thread: object}>} */
export const getLinkedInThread = (id) =>
  api.get(`/linkedin/threads/${id}`).then(r => r.data);

export const deleteLinkedInThread = (id) =>
  api.delete(`/linkedin/threads/${id}`);

/** The backend's user-facing message for a failed call, or a fallback. */
export const agentErrorMessage = (err) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (!err?.response) return 'Could not reach Honne. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
};
