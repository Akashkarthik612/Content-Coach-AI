import axios from 'axios';
import { attachAuthHeader } from './attachAuthHeader';
import { supabase } from '../lib/supabaseClient';

// Dev-only switch — see AUTH_PROVIDER on the backend (backend/auth_local/).
// Defaults to Supabase; never set VITE_AUTH_MODE=local outside local dev.
const IS_LOCAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'local';

const api = axios.create({ baseURL: '/api/ai' });
attachAuthHeader(api);

export const queryAI = (prompt, sessionId = null) =>
  api.post('/query', { prompt, session_id: sessionId }).then(r => r.data);

/**
 * Resumes a paused thread's interrupt (human_approval_node or angle_review_node).
 *
 * @param {string} thread_id
 * @param {string} action    - "approved" | "edited" | "rejected" (human_approval_node) |
 *                             "pick" | "expand" | "modify" | "none_fit" (angle_review_node)
 * @param {string} [content] - free text: edited draft body ("edited"), modify instruction
 *                             ("modify"), fresh guidance ("none_fit"), or a personal
 *                             stat/story/detail to open the hook with ("pick")
 * @param {number|null} [angle_id] - required for "pick" / "expand" / "modify"
 * @returns {Promise<{status?, answer?, draft?, angles?, actions?, summary?,
 *                     expanded_angle_id?, expanded_sections?, error?, post_id?}>}
 */
export const resumeAI = (thread_id, action, content = '', angle_id = null) =>
  api.post('/resume', { thread_id, action, content, angle_id }).then(r => r.data);

export const refineAI = (draft, note) =>
  api.post('/refine', { draft, note }).then(r => r.data);

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
 * Fetch the full stored history for one frontend "chat" — every thread_id
 * grouped under this session_id, oldest first, each shaped by the backend's
 * shape_thread_state(). Powers sidebar-switch/reload rehydration.
 *
 * @param {string} sessionId
 * @returns {Promise<{session_id, threads: Array}>}
 */
export const getSessionThreads = (sessionId) =>
  api.get(`/sessions/${sessionId}/threads`).then(r => r.data);

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

/**
 * SSE streaming query. Calls /stream and fires callbacks as events arrive.
 *
 * @param {string}   prompt
 * @param {string}   sessionId  - groups this thread with earlier ones from the same chat
 * @param {function} onToken    - called with each text chunk: (chunk: string) => void
 * @param {function} onDone     - called once at end: ({ status, thread_id?, session_id? }) => void
 * @param {function} onError    - called on network/parse error: (message: string) => void
 * @param {function} [onActivity] - called per semantic progress event:
 *                                  ({ id, parentId, title, description, status }) => void
 *                                  Never a node/tool/agent name — see backend/ai/activity.py.
 * @returns {function} abort  - call to cancel the stream mid-flight
 */
export function streamQuery(prompt, sessionId, onToken, onDone, onError, onActivity) {
  const controller = new AbortController();

  (async () => {
    try {
      // raw fetch() can't use axios interceptors, so attachAuthHeader's
      // logic (attach Bearer <supabase_token>, or X-User-Id in local dev)
      // is replicated inline here.
      const headers = { 'Content-Type': 'application/json' };
      if (IS_LOCAL_AUTH) {
        const userId = localStorage.getItem('user_id');
        if (userId) headers['X-User-Id'] = userId;
      } else {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
      }

      const response = await fetch('/api/ai/stream', {
        method:  'POST',
        headers,
        body:   JSON.stringify({ prompt, session_id: sessionId }),
        signal: controller.signal,
      });

      if (!response.ok) {
        onError(`Server error ${response.status}`);
        return;
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by \n\n
        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // keep incomplete trailing chunk

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'token') {
              onToken(data.content);
            } else if (data.type === 'activity') {
              onActivity?.(data);
            } else if (data.type === 'done') {
              onDone(data);
            } else if (data.type === 'error') {
              onError(data.message);
            }
          } catch {
            // malformed JSON — ignore
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError(err.message);
    }
  })();

  return () => controller.abort();
}
