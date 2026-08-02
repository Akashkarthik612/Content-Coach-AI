import { supabase } from '../lib/supabaseClient';

// Supabase-auth-mode only — email/password identity lives in Supabase, not
// our own DB (see backend/auth/service.py's UserSyncService), so these call
// supabase-js directly, same pattern as login()/register()/googleSignIn() in
// api/auth.js. No backend round-trip for the mutation itself; the backend's
// only role is self-healing its `users` shadow row from the JWT on the
// user's next authenticated request (UserSyncService.get_or_create).
//
// Not built for local-auth dev mode: `supabase` is a placeholder client
// there (see lib/supabaseClient.js), so these would simply fail — acceptable
// since local mode isn't a target for this feature.

/**
 * Change the account email. NOT instant — Supabase emails a confirmation
 * link to the new address and nothing changes until the user clicks it,
 * landing back on /settings (see ResetPasswordPage.jsx's sibling flow for
 * the equivalent password mechanism).
 *
 * @param {string} newEmail
 * @returns {Promise<void>}
 */
export async function updateEmail(newEmail) {
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${window.location.origin}/settings` },
  );
  if (error) throw error;
}

/**
 * Send a password-reset link to the account's registered email (never a
 * user-typed one — always the current session's own address). Clicking it
 * lands the user on /reset-password with a temporary recovery session;
 * the new password is only ever set there (see updatePassword below), so
 * it's never entered until the email step is complete.
 *
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function sendPasswordResetEmail(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

/**
 * Finalize a password change. Only ever called from ResetPasswordPage.jsx,
 * using the temporary recovery session (established by clicking the
 * emailed link) as proof of identity — no current-password re-check
 * needed, unlike the earlier reauth-based design this replaces.
 *
 * @param {string} newPassword
 * @returns {Promise<void>}
 */
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
