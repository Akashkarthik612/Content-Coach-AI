import { supabase } from './supabaseClient';

// Dev-only switch — see AUTH_PROVIDER on the backend (backend/auth_local/).
const IS_LOCAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'local';

// The name shown in greetings and avatars. Email signups store `username` in
// user_metadata; Google sign-ins carry `full_name`/`name` instead. Never fall
// back to the whole email address, only the part before the @.
export const displayNameOf = user => {
  const meta = user?.user_metadata ?? {};
  return meta.username || meta.full_name || meta.name || (user?.email ?? '').split('@')[0];
};

// Mirrors the Supabase session into the same localStorage keys every existing page
// already reads (AppSidebar, ChatPage, OnboardingPage) — so none of
// those need to change to become Supabase-aware.
//
// Must stay off entirely in local-auth mode: onAuthStateChange fires immediately on
// subscription with the current (real) Supabase session, which is always null for a
// locally-authenticated user (they never created a Supabase session) — that null hit
// the else branch below and deleted the user_id/username keys localAuth.js had just
// written, logging the user out on every reload.
if (!IS_LOCAL_AUTH) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      localStorage.setItem('user_id', session.user.id);
      localStorage.setItem('username', displayNameOf(session.user));
    } else {
      localStorage.removeItem('user_id');
      localStorage.removeItem('username');
    }
  });
}
