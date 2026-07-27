import { supabase } from './supabaseClient';

// Mirrors the Supabase session into the same localStorage keys every existing page
// already reads (AppSidebar, ChatPage, DashboardPage, OnboardingPage) — so none of
// those need to change to become Supabase-aware.
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    localStorage.setItem('user_id', session.user.id);
    localStorage.setItem('username', session.user.user_metadata?.username || session.user.email);
  } else {
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
  }
});
