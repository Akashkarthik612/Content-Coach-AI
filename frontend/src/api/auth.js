import { supabase } from '../lib/supabaseClient';

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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw _classify(error);
  return {
    user_id: data.user.id,
    username: data.user.user_metadata?.username || data.user.email,
    email: data.user.email,
  };
};

export const register = async (username, email, password) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
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
    options: { redirectTo: `${window.location.origin}/dashboard` },
  });
  if (error) throw _classify(error);
  // Browser redirects away on success — nothing more to do here.
};
