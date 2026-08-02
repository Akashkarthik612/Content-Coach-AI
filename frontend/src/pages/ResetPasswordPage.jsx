import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { updatePassword } from '../api/account';

/* ────────────────────────────────────────────────────────────────────────
   Landing page for Supabase's password-recovery email link
   (sendPasswordResetEmail() in api/account.js sets redirectTo here). Not
   wrapped in the app's generic RequireAuth — that just bounces to `/` on
   no session, but this page needs its own recovery-specific messaging for
   an invalid/expired link. supabase-js's default PKCE flow
   (detectSessionInUrl: true) auto-exchanges the link's `code` param for a
   temporary recovery session before this component's effects run; we also
   listen for the 'PASSWORD_RECOVERY' auth event as the canonical signal
   per Supabase's own docs, with getSession() as a fallback in case the
   event fired before this page mounted its listener.

   Same Honne/Geist visual language as SettingsPage.jsx (not the landing
   page's --cc-* tokens), since this is reached from the account/Settings
   flow, not marketing — deliberately no HonneSidebar, the user isn't
   necessarily "in the app" yet at this point.
   ──────────────────────────────────────────────────────────────────────── */
const PAGE_BG  = '#F4F2EA';
const INK      = '#1B1C14';
const ACCENT   = '#14663B';
const MUTED    = '#7A7C6C';
const HAIRLINE = 'rgba(27,28,20,.09)';
const DANGER   = '#B4442E';
const FONT = "'Geist', system-ui, sans-serif";

const inputStyle = { width: '100%', height: 44, padding: '0 14px', border: '1.5px solid rgba(27,28,20,.14)', borderRadius: 11, background: '#fff', fontSize: 15, color: INK, letterSpacing: '-.005em' };
const cardStyle = { width: '100%', maxWidth: 400, background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 18, padding: '32px 28px', boxShadow: '0 1px 3px rgba(27,28,20,.05)' };
const primaryBtn = { width: '100%', height: 44, border: 'none', borderRadius: 11, background: ACCENT, color: '#F4F2EA', fontSize: 14, fontWeight: 600, cursor: 'pointer' };

export default function ResetPasswordPage() {
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
        setChecking(false);
      }
    });
    // Fallback: the PASSWORD_RECOVERY event may have already fired before
    // this listener was attached — a valid session at all is good enough.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirm) { setError("New passwords don't match."); return; }
    setSaving(true);
    setError('');
    try {
      await updatePassword(newPassword);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not update password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: PAGE_BG, color: INK, fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.01em', marginBottom: 6, color: ACCENT }}>Honne</div>

        {checking && (
          <p style={{ fontSize: 14, color: MUTED, letterSpacing: '-.005em' }}>Verifying your link…</p>
        )}

        {!checking && !ready && !done && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <AlertTriangle size={18} color={DANGER} />
              <span style={{ fontSize: 16, fontWeight: 600 }}>Link invalid or expired</span>
            </div>
            <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, marginBottom: 18 }}>
              This password reset link is no longer valid. Request a new one from Settings, or log in normally.
            </p>
            <button style={primaryBtn} onClick={() => navigate('/login')}>Back to log in</button>
          </>
        )}

        {!checking && ready && !done && (
          <form onSubmit={handleSubmit}>
            <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, margin: '2px 0 18px' }}>Set a new password for your account.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder="New password" style={inputStyle} autoFocus />
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" placeholder="Confirm new password" style={inputStyle} />
            </div>
            {error && <div style={{ fontSize: 12.5, color: DANGER, marginTop: 9, letterSpacing: '-.005em' }}>{error}</div>}
            <button type="submit" disabled={saving} style={{ ...primaryBtn, marginTop: 16, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        {done && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <CheckCircle2 size={18} color={ACCENT} />
              <span style={{ fontSize: 16, fontWeight: 600 }}>Password updated</span>
            </div>
            <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, marginBottom: 18 }}>Your password has been changed successfully.</p>
            <button style={primaryBtn} onClick={() => navigate('/settings')}>Continue to Settings</button>
          </>
        )}
      </div>
    </div>
  );
}
