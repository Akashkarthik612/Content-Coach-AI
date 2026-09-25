import axios from 'axios';
import { API_BASE } from './apiBase';

// Dev-only local auth (VITE_AUTH_MODE=local) — talks to the backend's
// AUTH_PROVIDER=local password endpoints instead of Supabase. No auth header
// needed for register/login themselves; downstream calls read X-User-Id from
// localStorage via attachAuthHeader.js.
const api = axios.create({ baseURL: `${API_BASE}/api/auth` });

function _classify(err) {
  const detail = err?.response?.data?.detail || 'Something went wrong';
  const e = new Error(detail);
  if (err?.response?.status === 401) e.code = 'invalid_credentials';
  else if (err?.response?.status === 409) e.code = 'conflict';
  else e.code = 'unknown';
  return e;
}

function _persist({ user_id, username }) {
  localStorage.setItem('user_id', user_id);
  localStorage.setItem('username', username);
}

export const localLogin = async (username, password) => {
  try {
    const { data } = await api.post('/login', { username, password });
    _persist(data);
    return data;
  } catch (err) {
    throw _classify(err);
  }
};

export const localRegister = async (username, email, password) => {
  try {
    const { data } = await api.post('/register', { username, email, password });
    _persist(data);
    return { ...data, needsEmailConfirmation: false };
  } catch (err) {
    throw _classify(err);
  }
};
