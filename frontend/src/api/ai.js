import axios from 'axios';
import { attachAuthHeader } from './attachAuthHeader';

const api = axios.create({ baseURL: '/api/ai' });
attachAuthHeader(api);

export const queryAI = (prompt, sessionId = null) =>
  api.post('/query', { prompt, session_id: sessionId }).then(r => r.data);

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
  const uid = localStorage.getItem('user_id') || '';

  (async () => {
    try {
      const response = await fetch('/api/ai/stream', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id':    uid,
        },
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
