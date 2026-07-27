import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register, googleSignIn } from '../api/auth';
import { AUTH_COPY } from './authContent';

// ── Design tokens (Honne palette — distinct from every other page's tokens) ──
const C = {
  paper:   '#F9F8F3',
  ink:     '#1A1A1A',
  accent:  '#B4402A',
  card:    '#FFFFFF',
  cream:   '#F4F0E6',
  hair:    'rgba(26,26,26,0.12)',
  errText: '#B91C1C',
  errBg:   '#FEF2F2',
};
const SERIF = "'EB Garamond', serif";
const SANS  = "'Hanken Grotesk', system-ui, sans-serif";
const MONO  = "'JetBrains Mono', monospace";
const mono  = { fontFamily: MONO, letterSpacing: '.18em', textTransform: 'uppercase' };

// ── Style tables (module-level — mirrors the Honne Auth design's `st` object) ─
const st = {
  page: { minHeight: '100vh', display: 'flex', background: C.paper, color: C.ink, fontFamily: SANS },

  brandPanel: { position: 'relative', flex: 1, minWidth: 380, background: C.ink, color: C.cream, padding: '52px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' },
  brand: { fontFamily: SERIF, fontWeight: 600, fontSize: 32, letterSpacing: '-0.01em' },
  brandTagline: { ...mono, fontSize: 10.5, opacity: 0.5, marginTop: 10 },
  brandQuoteWrap: { maxWidth: 420 },
  brandMark: { fontFamily: SERIF, color: C.accent, fontSize: 46, lineHeight: 1, marginBottom: 18 },
  brandQuote: { fontFamily: SERIF, fontStyle: 'italic', fontSize: 27, lineHeight: 1.4 },
  brandFoot: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 28 },
  brandFootMark: { fontFamily: SERIF, color: C.accent, fontWeight: 700, fontSize: 16 },
  brandFootLabel: { ...mono, fontSize: 9.5, opacity: 0.45 },
  brandNote: { ...mono, fontSize: 9.5, opacity: 0.4 },

  formPanel: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, position: 'relative' },
  backLink: { position: 'absolute', top: 28, left: 36, color: 'rgba(26,26,26,.5)', fontFamily: SANS, fontSize: 13 },
  formInner: { width: '100%', maxWidth: 400 },

  tabs: { display: 'inline-flex', gap: 2, background: 'rgba(26,26,26,0.06)', padding: 3, marginBottom: 34 },
  h1: { fontFamily: SERIF, fontWeight: 500, textTransform: 'uppercase', fontSize: 34, lineHeight: 1, letterSpacing: '-0.02em', margin: '0 0 12px' },
  sub: { fontSize: 14, lineHeight: 1.6, opacity: 0.62, margin: '0 0 30px' },

  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 8 },
  labelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...mono, fontSize: 10, opacity: 0.6 },
  forgot: { fontFamily: MONO, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: C.accent, cursor: 'pointer', background: 'none', border: 'none', padding: 0 },
  input: { fontFamily: SANS, fontSize: 15, color: C.ink, background: C.card, border: `1px solid ${C.hair}`, padding: '14px 16px', width: '100%', outline: 'none', transition: 'border-color .2s ease, box-shadow .2s ease' },

  divider: { display: 'flex', alignItems: 'center', gap: 14, margin: '26px 0 18px' },
  dividerLine: { flex: 1, height: 1, background: C.hair },
  dividerText: { ...mono, fontSize: 9, opacity: 0.45 },

  switchLine: { marginTop: 26, textAlign: 'center', fontSize: 13.5, opacity: 0.72 },
  switchLink: { color: C.accent, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', fontFamily: SANS, fontSize: 13.5, padding: 0 },
  legal: { marginTop: 22, textAlign: 'center', fontSize: 11.5, lineHeight: 1.6, opacity: 0.42 },
  legalLink: { color: C.ink, textDecoration: 'underline', textUnderlineOffset: '2px' },
};

const tabBase = { ...mono, fontSize: 10.5, padding: '9px 18px', border: 'none', cursor: 'pointer', transition: 'background-color .22s ease, color .22s ease' };
const tabOn  = { ...tabBase, background: C.ink, color: C.cream };
const tabOff = { ...tabBase, background: 'transparent', color: C.ink, opacity: 0.55 };

const submitBase = { ...mono, fontSize: 12, width: '100%', padding: 16, marginTop: 6, color: C.cream, background: C.accent, border: `1px solid ${C.accent}`, cursor: 'pointer', transition: 'transform .2s cubic-bezier(.22,1,.36,1), opacity .2s ease' };
const submitHover = { transform: 'translateY(-1px)', opacity: 0.94 };

const googleBase = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11, width: '100%', padding: 14, fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.ink, background: C.card, border: `1px solid ${C.hair}`, cursor: 'pointer', transition: 'background-color .2s ease, border-color .2s ease' };
const googleHover = { background: 'rgba(26,26,26,0.03)', borderColor: 'rgba(26,26,26,0.24)' };

const focusable = {
  onFocus: e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(180,64,42,0.12)'; },
  onBlur:  e => { e.currentTarget.style.borderColor = C.hair; e.currentTarget.style.boxShadow = 'none'; },
};

// ── SVG icons ─────────────────────────────────────────────────────────────────
function GoogleSVG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HomePage({ initialMode = 'login' }) {
  const navigate = useNavigate();
  const [mode, setMode]         = useState(initialMode === 'register' ? 'signup' : 'login');
  const [form, setForm]         = useState({ name: '', username: '', email: '', password: '' });
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [googleMsg, setGoogleMsg] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');
  const [submitHov, setSubmitHov] = useState(false);
  const [googleHov, setGoogleHov] = useState(false);

  const isSignup = mode === 'signup';
  const copy = isSignup ? AUTH_COPY.signup : AUTH_COPY.login;

  function field(key) { return e => setForm(f => ({ ...f, [key]: e.target.value })); }

  function switchMode(next) {
    setError(''); setGoogleMsg(''); setForgotMsg(''); setConfirmMsg('');
    setForm({ name: '', username: '', email: '', password: '' });
    setMode(next);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    if (!form.username || !form.email || !form.password) {
      setError('Username, email, and password are required');
      return;
    }
    setLoading(true);
    try {
      const data = await register(form.username, form.email, form.password);
      if (form.name) localStorage.setItem('display_name', form.name);
      if (data.needsEmailConfirmation) {
        setConfirmMsg(`Check ${data.email} for a confirmation link, then log in.`);
      } else {
        navigate('/onboarding');
      }
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }

  async function handleGoogle() {
    setGoogleMsg('');
    try {
      await googleSignIn();
    } catch (err) {
      setGoogleMsg(err.message);
    }
  }

  function handleForgot(e) {
    e.preventDefault();
    setForgotMsg("Password reset isn't available yet — contact support.");
  }

  return (
    <div style={st.page} className="honne-auth">
      <style>{`
        @keyframes authFade { from { opacity: 0; } to { opacity: 1; } }
        .honne-auth input::placeholder { color: rgba(26,26,26,.34); }
      `}</style>

      {/* LEFT: brand panel */}
      <aside className="lp-hide-phone" style={st.brandPanel}>
        <div>
          <div style={st.brand}>{AUTH_COPY.brand}</div>
          <div style={st.brandTagline}>{AUTH_COPY.brandTagline}</div>
        </div>
        <div style={st.brandQuoteWrap}>
          <div style={st.brandMark}>{'❞'}</div>
          <div style={st.brandQuote}>{AUTH_COPY.brandQuote}</div>
          <div style={st.brandFoot}>
            <span style={st.brandFootMark}>{'❞'}</span>
            <span style={st.brandFootLabel}>{AUTH_COPY.brandFootLabel}</span>
          </div>
        </div>
        <div style={st.brandNote}>{AUTH_COPY.brandNote}</div>
      </aside>

      {/* RIGHT: form */}
      <main style={st.formPanel}>
        <a href="/" style={st.backLink}>← Back to home</a>

        <div style={{ ...st.formInner, animation: 'authFade .4s ease both' }} key={mode}>

          <div style={st.tabs}>
            <button style={isSignup ? tabOn : tabOff} onClick={() => switchMode('signup')}>{AUTH_COPY.tabs.signup}</button>
            <button style={isSignup ? tabOff : tabOn} onClick={() => switchMode('login')}>{AUTH_COPY.tabs.login}</button>
          </div>

          <h1 style={st.h1}>{copy.heading}</h1>
          <p style={st.sub}>{copy.sub}</p>

          <form style={st.form} onSubmit={isSignup ? handleRegister : handleLogin}>
            {isSignup ? (
              <>
                <label style={st.field}>
                  <span style={st.label}>Full name</span>
                  <input style={st.input} type="text" placeholder={copy.namePlaceholder} autoComplete="name" value={form.name} onChange={field('name')} autoFocus {...focusable} />
                </label>
                <label style={st.field}>
                  <span style={st.label}>Username</span>
                  <input style={st.input} type="text" placeholder={copy.usernamePlaceholder} autoComplete="username" value={form.username} onChange={field('username')} {...focusable} />
                </label>
                <label style={st.field}>
                  <span style={st.label}>Email</span>
                  <input style={st.input} type="email" placeholder={copy.emailPlaceholder} autoComplete="email" value={form.email} onChange={field('email')} {...focusable} />
                </label>
                <label style={st.field}>
                  <span style={st.label}>Password</span>
                  <input style={st.input} type="password" placeholder={copy.passwordPlaceholder} autoComplete="new-password" value={form.password} onChange={field('password')} {...focusable} />
                </label>
              </>
            ) : (
              <>
                <label style={st.field}>
                  <span style={st.label}>Email</span>
                  <input style={st.input} type="email" placeholder={copy.emailPlaceholder} autoComplete="email" value={form.email} onChange={field('email')} autoFocus {...focusable} />
                </label>
                <label style={st.field}>
                  <div style={st.labelRow}>
                    <span style={st.label}>Password</span>
                    <button type="button" style={st.forgot} onClick={handleForgot}>{copy.forgotLink}</button>
                  </div>
                  <input style={st.input} type="password" placeholder={copy.passwordPlaceholder} autoComplete="current-password" value={form.password} onChange={field('password')} {...focusable} />
                </label>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ ...submitBase, ...(submitHov && !loading ? submitHover : {}), opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
              onMouseEnter={() => setSubmitHov(true)}
              onMouseLeave={() => setSubmitHov(false)}
            >
              {loading ? copy.submitting : copy.submit}
            </button>

            {error && (
              <p style={{ fontSize: 13, color: C.errText, background: C.errBg, borderRadius: 6, padding: '9px 12px', margin: '4px 0 0', textAlign: 'center', fontFamily: SANS }}>
                {error}
              </p>
            )}
            {!error && forgotMsg && (
              <p style={{ fontSize: 12.5, opacity: 0.6, textAlign: 'center', margin: '4px 0 0' }}>
                {forgotMsg}
              </p>
            )}
            {!error && confirmMsg && (
              <p style={{ fontSize: 13, color: C.ink, background: C.cream, borderRadius: 6, padding: '9px 12px', margin: '4px 0 0', textAlign: 'center', fontFamily: SANS }}>
                {confirmMsg}
              </p>
            )}
          </form>

          <div style={st.divider}>
            <span style={st.dividerLine} />
            <span style={st.dividerText}>or continue with</span>
            <span style={st.dividerLine} />
          </div>

          <button
            type="button"
            style={{ ...googleBase, ...(googleHov ? googleHover : {}) }}
            onMouseEnter={() => setGoogleHov(true)}
            onMouseLeave={() => setGoogleHov(false)}
            onClick={handleGoogle}
          >
            <GoogleSVG />
            <span>{AUTH_COPY.google.label}</span>
          </button>
          {googleMsg && (
            <p style={{ textAlign: 'center', fontSize: 13, opacity: 0.6, marginTop: 10, fontFamily: SANS }}>
              {googleMsg}
            </p>
          )}

          <div style={st.switchLine}>
            {isSignup ? AUTH_COPY.switchMode.signupPrompt : AUTH_COPY.switchMode.loginPrompt}{' '}
            <button type="button" style={st.switchLink} onClick={() => switchMode(isSignup ? 'login' : 'signup')}>
              {isSignup ? AUTH_COPY.switchMode.signupAction : AUTH_COPY.switchMode.loginAction}
            </button>
          </div>

          <div style={st.legal}>
            {AUTH_COPY.legal.prefix} {AUTH_COPY.brand}&rsquo;s <a href="#" style={st.legalLink}>{AUTH_COPY.legal.terms}</a> &amp; <a href="#" style={st.legalLink}>{AUTH_COPY.legal.privacy}</a>.
          </div>

        </div>
      </main>
    </div>
  );
}
