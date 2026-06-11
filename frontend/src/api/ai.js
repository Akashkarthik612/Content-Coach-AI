import axios from 'axios';

const api = axios.create({ baseURL: '/api/ai' });

api.interceptors.request.use(config => {
  const uid = localStorage.getItem('user_id');
  if (uid) config.headers['X-User-Id'] = uid;
  return config;
});

export const queryAI = (prompt) =>
  api.post('/query', { prompt }).then(r => r.data);

export const resumeAI = (thread_id, action, content = '') =>
  api.post('/resume', { thread_id, action, content }).then(r => r.data);

/**
 * SSE streaming query. Calls /stream and fires callbacks as events arrive.
 *
 * @param {string}   prompt
 * @param {function} onToken  - called with each text chunk: (chunk: string) => void
 * @param {function} onDone   - called once at end: ({ status, thread_id? }) => void
 * @param {function} onError  - called on network/parse error: (message: string) => void
 * @returns {function} abort  - call to cancel the stream mid-flight
 */
export function streamQuery(prompt, onToken, onDone, onError) {
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
        body:   JSON.stringify({ prompt }),
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
