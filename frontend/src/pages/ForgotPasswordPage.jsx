import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { sendPasswordResetEmail } from '../api/account';
import { AUTH_COPY } from './authContent';

// ── Design tokens (mirrors HomePage.jsx's Honne Auth green/cream palette —
// this page is reached directly from the login form's "Forgot?" link) ──
const C = {
  paper:   '#F4F2EA',
  ink:     '#1B1C14',
  accent:  '#14663B',
  accentHover: '#0F4C2C',
  card:    '#FFFFFF',
  hair:    'rgba(27,28,20,0.12)',
  muted:   '#7A7C6C',
  faint:   '#9A9C8C',
  errText: '#B91C1C',
  errBg:   '#FEF2F2',
};
const GEIST = "'Geist', system-ui, sans-serif";
const MONO  = "'JetBrains Mono', monospace";

const st = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.paper, color: C.ink, fontFamily: GEIST, padding: 24, position: 'relative' },
  backLink: { position: 'absolute', top: 28, left: 36, color: C.muted, fontFamily: GEIST, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  card: { width: '100%', maxWidth: 400 },
  h1: { fontFamily: GEIST, fontWeight: 600, fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 10px' },
  sub: { fontFamily: GEIST, fontSize: 15, lineHeight: 1.55, color: C.muted, margin: '0 0 26px' },
  field: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 },
  label: { fontFamily: MONO, letterSpacing: '.15em', textTransform: 'uppercase', fontSize: 10, color: C.faint },
  input: { fontFamily: GEIST, fontSize: 15, color: C.ink, background: C.card, border: `1px solid ${C.hair}`, borderRadius: 11, padding: '13px 15px', width: '100%', boxShadow: '0 1px 2px rgba(27,28,20,.03)', outline: 'none' },
  submit: { fontFamily: GEIST, fontWeight: 600, fontSize: 15, letterSpacing: '-.005em', width: '100%', padding: 15, marginTop: 6, color: C.paper, background: C.accent, border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 12px 30px -14px rgba(20,102,59,.7)' },
};

const focusable = {
  onFocus: e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20,102,59,0.12)'; },
  onBlur:  e => { e.currentTarget.style.borderColor = C.hair; e.currentTarget.style.boxShadow = '0 1px 2px rgba(27,28,20,.03)'; },
};

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const copy = AUTH_COPY.forgotPassword;

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email) {
      setError('Email is required');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={st.page} className="honne-auth">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .honne-auth input::placeholder { color: rgba(27,28,20,.34); }
      `}</style>

      <button type="button" style={st.backLink} onClick={() => navigate('/login')}>{copy.backToLogin}</button>

      <div style={st.card}>
        {!sent ? (
          <>
            <h1 style={st.h1}>{copy.heading}</h1>
            <p style={st.sub}>{copy.sub}</p>

            <form onSubmit={handleSubmit}>
              <label style={st.field}>
                <span style={st.label}>Email</span>
                <input
                  style={st.input}
                  type="email"
                  placeholder={copy.emailPlaceholder}
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                  {...focusable}
                />
              </label>

              <button type="submit" disabled={loading} style={{ ...st.submit, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? copy.submitting : copy.submit}
              </button>

              {error && (
                <p style={{ fontSize: 13, color: C.errText, background: C.errBg, borderRadius: 10, padding: '9px 12px', margin: '12px 0 0', textAlign: 'center', fontFamily: GEIST }}>
                  {error}
                </p>
              )}
            </form>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <CheckCircle2 size={20} color={C.accent} />
              <span style={st.h1}>{copy.sentHeading}</span>
            </div>
            <p style={st.sub}>Check <strong>{email}</strong> for a link to reset your password.</p>
            <button type="button" style={st.submit} onClick={() => navigate('/login')}>{copy.backToLogin}</button>
          </>
        )}
      </div>
    </div>
  );
}
