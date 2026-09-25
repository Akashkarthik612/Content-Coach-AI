import axios from 'axios';

import { supabase } from '../lib/supabaseClient';
import { localLogin, localRegister } from './localAuth';
import { API_BASE } from './apiBase';

// Dev-only switch — see AUTH_PROVIDER on the backend (backend/auth_local/).
// Defaults to Supabase; never set VITE_AUTH_MODE=local outside local dev.
const IS_LOCAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'local';

// Mounted unconditionally on the backend regardless of AUTH_PROVIDER — see
// backend/auth/router.py.
const _authApi = axios.create({ baseURL: `${API_BASE}/api/auth` });

// Pre-signup uniqueness check — lets us reject a taken username/email before
// ever calling supabase.auth.signUp(), instead of discovering the collision
// later when the backend shadow-provisions the user row.
async function _checkAvailability(username, email) {
  const { data } = await _authApi.get('/availability', { params: { username, email } });
  if (!data.username_available) {
    const e = new Error('Username already exists');
    e.code = 'conflict';
    throw e;
  }
  if (!data.email_available) {
    const e = new Error('Email already exists');
    e.code = 'conflict';
    throw e;
  }
}

// ── Error classifier ──────────────────────────────────────────────────────────
// Single place that maps Supabase errors to user messages + machine codes.
// Codes: 'invalid_credentials' | 'conflict' | 'unknown'

function _classify(err) {
  const message = err?.message || 'Something went wrong';
  const e = new Error(message);
  if (/invalid login credentials/i.test(message)) e.code = 'invalid_credentials';
  else if (/already registered/i.test(message)) e.code = 'conflict';
  else e.code = 'unknown';
  return e;
}

export const login = async (email, password) => {
  if (IS_LOCAL_AUTH) return localLogin(email, password); // local auth logs in by username

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw _classify(error);
  return {
    user_id: data.user.id,
    username: data.user.user_metadata?.username || data.user.email,
    email: data.user.email,
  };
};

export const register = async (username, email, password) => {
  if (IS_LOCAL_AUTH) return localRegister(username, email, password);

  await _checkAvailability(username, email);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username }, emailRedirectTo: `${window.location.origin}/onboarding` },
  });
  if (error) throw _classify(error);

  // Email confirmation required on first signup: data.session is null until the user
  // clicks the emailed link, even though data.user already exists.
  if (!data.session) {
    return { needsEmailConfirmation: true, email };
  }
  return { user_id: data.user.id, username, email: data.user.email, needsEmailConfirmation: false };
};

export const googleSignIn = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/chat` },
  });
  if (error) throw _classify(error);
  // Browser redirects away on success — nothing more to do here.
};

// Clears the localStorage keys authSession.js mirrors the Supabase session into.
function _clearSession() {
  localStorage.removeItem('user_id');
  localStorage.removeItem('username');
}

class Logout {
  static async execute() {
    const { error } = await supabase.auth.signOut();
    if (error) throw _classify(error);
    // Belt-and-suspenders — authSession.js's onAuthStateChange listener also
    // clears these on the SIGNED_OUT event signOut() triggers.
    _clearSession();
  }
}

export const logout = () => Logout.execute();
