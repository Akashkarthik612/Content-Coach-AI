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
