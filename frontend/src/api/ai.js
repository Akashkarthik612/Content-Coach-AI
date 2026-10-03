import axios from 'axios';
import { attachAuthHeader } from './attachAuthHeader';
import { API_BASE } from './apiBase';

const api = axios.create({ baseURL: `${API_BASE}/api/ai` });
attachAuthHeader(api);

export const queryAI = (prompt, sessionId = null) =>
  api.post('/query', { prompt, session_id: sessionId }).then(r => r.data);

/**
 * Draft a full post from ONE picked research topic card (not the whole brief).
 * Skips supervisor's classification entirely on the backend — the target
 * pipeline is already known since the user clicked a specific topic.
 *
 * @param {object} topic     - one item from a message's `topics` array
 * @param {string} platform  - defaults to 'linkedin' (only platform wired up today)
 * @param {string} [sessionId] - groups this thread with earlier ones from the same chat
 * @returns {Promise<{answer, draft, thread_id, session_id, status}>}
 */
export const draftFromTopic = (topic, platform = 'linkedin', sessionId = null) =>
  api.post('/draft-from-topic', { topic, platform, session_id: sessionId }).then(r => r.data);

/**
 * List the current user's live (not-yet-expired, 7-day TTL) chat sessions,
 * most recently active first. Powers the sidebar's persisted chat history.
 *
 * @returns {Promise<{sessions: Array<{session_id, title, last_active_at}>}>}
 */
export const getSessions = () =>
  api.get('/sessions').then(r => r.data);

/**
 * Permanently deletes a chat — the chat_sessions Store record, every
 * thread_registry row grouped under it, and each thread's checkpoint data.
 * Unlike the old sidebar delete (local React state only), this actually
 * removes it server-side so it won't reappear on the next getSessions() call.
 *
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
export const deleteSession = (sessionId) =>
  api.delete(`/sessions/${sessionId}`).then(() => {});
