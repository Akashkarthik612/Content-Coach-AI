import axios from 'axios';

const api = axios.create({ baseURL: '/api/auth' });

// ── Error classifier ──────────────────────────────────────────────────────────
// Single place that maps HTTP errors to user messages + machine codes.
// Codes: 'network' | 'invalid_credentials' | 'conflict' | 'server' | 'unknown'
// To migrate to Supabase: replace the three exported function bodies only.

function _classify(err) {
  if (!err.response) {
    console.error('[auth] Network error — backend unreachable:', err.message);
    const e = new Error('Cannot reach the server. Is the backend running?');
    e.code = 'network';
    return e;
  }
  const { status, data } = err.response;
  const detail = data?.detail ?? '';

  if (status === 401) {
    console.warn('[auth] Login rejected: invalid credentials');
    const e = new Error('Invalid username or password');
    e.code = 'invalid_credentials';
    return e;
  }
  if (status === 409) {
    console.warn('[auth] Registration conflict:', detail);
    const e = new Error(detail || 'Username or email already taken');
    e.code = 'conflict';
    return e;
  }
  if (status >= 500) {
    console.error('[auth] Server / DB error:', status, detail);
    const e = new Error('Server error. The database may be unavailable.');
    e.code = 'server';
    return e;
  }
  console.error('[auth] Unexpected error:', status, detail);
  const e = new Error(detail || 'Something went wrong');
  e.code = 'unknown';
  return e;
}

export const login = async (username, password) => {
  try {
    const res = await api.post('/login', { username, password });
    return res.data; // { user_id, username, email }
  } catch (err) {
    throw _classify(err);
  }
};

export const register = async (username, email, password) => {
  try {
    const res = await api.post('/register', { username, email, password });
    return res.data;
  } catch (err) {
    throw _classify(err);
  }
};

// Google OAuth — UI ready, backend not yet wired.
// Future: replace with supabase.auth.signInWithOAuth({ provider: 'google' })
export const googleSignIn = async () => {
  console.info('[auth] Google sign-in not yet configured');
  return null;
};
