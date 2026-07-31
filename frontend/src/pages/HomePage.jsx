import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register, googleSignIn } from '../api/auth';
import { AUTH_COPY } from './authContent';

// ── Design tokens (Honne Auth — green/cream palette, matches ChatPage's Honne branding) ──
const C = {
  paper:       '#F4F2EA',
  ink:         '#1B1C14',
  accent:      '#14663B',
  accentHover: '#0F4C2C',
  card:        '#FFFFFF',
  hair:        'rgba(27,28,20,0.12)',
  glow:        'rgba(205,235,214,.22)',
  cream:       '#EAF3EC',
  mint:        '#CDEBD6',
  muted:       '#7A7C6C',
  faint:       '#9A9C8C',
  faint2:      '#A6A895',
  errText:     '#B91C1C',
  errBg:       '#FEF2F2',
};
const GEIST = "'Geist', system-ui, sans-serif";
const MONO  = "'JetBrains Mono', monospace";
const mono  = { fontFamily: MONO, letterSpacing: '.15em', textTransform: 'uppercase' };

// ── Style tables (module-level — mirrors the Honne Auth design's `st` object) ─
const st = {
  page: { minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', background: C.paper, color: C.ink, fontFamily: GEIST },

  brandPanel: { position: 'relative', background: C.accent, color: C.cream, padding: '56px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' },
  brandGlow: { position: 'absolute', top: '-20%', right: '-25%', width: '70%', height: '70%', borderRadius: 999, background: `radial-gradient(circle, ${C.glow}, rgba(205,235,214,0) 70%)`, pointerEvents: 'none', zIndex: 1 },
  brandTop: { position: 'relative', zIndex: 2 },
  brand: { fontFamily: GEIST, fontWeight: 600, fontSize: 30, letterSpacing: '-0.01em', color: C.paper },
  brandTagline: { ...mono, fontSize: 10.5, color: C.mint, opacity: 0.85, marginTop: 12 },
  brandQuoteWrap: { position: 'relative', zIndex: 2, maxWidth: 440 },
  brandMark: { fontFamily: 'Georgia, serif', color: C.mint, opacity: 0.5, fontSize: 54, lineHeight: 1, marginBottom: 16 },
  brandQuote: { fontFamily: GEIST, fontWeight: 500, fontSize: 26, lineHeight: 1.42, letterSpacing: '-0.01em', color: C.paper },
  brandFoot: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 30 },
  brandFootMark: { fontFamily: 'Georgia, serif', color: C.mint, fontWeight: 700, fontSize: 15 },
  brandFootLabel: { ...mono, fontSize: 9.5, color: C.mint, opacity: 0.7 },
  brandNote: { position: 'relative', zIndex: 2, ...mono, fontSize: 9.5, color: C.mint, opacity: 0.55 },

  formPanel: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, position: 'relative' },
  backLink: { position: 'absolute', top: 28, left: 36, color: C.muted, fontFamily: GEIST, fontSize: 13 },
  formInner: { width: '100%', maxWidth: 400 },

  tabs: { display: 'inline-flex', gap: 3, background: 'rgba(27,28,20,0.055)', padding: 3, borderRadius: 999, marginBottom: 32 },
  h1: { fontFamily: GEIST, fontWeight: 600, fontSize: 32, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 10px' },
  sub: { fontFamily: GEIST, fontSize: 15, lineHeight: 1.55, color: C.muted, margin: '0 0 30px' },

  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 8 },
  labelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...mono, fontSize: 10, color: C.faint },
  forgot: { fontFamily: MONO, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: C.accent, cursor: 'pointer', background: 'none', border: 'none', padding: 0 },
  input: { fontFamily: GEIST, fontSize: 15, color: C.ink, background: C.card, border: `1px solid ${C.hair}`, borderRadius: 11, padding: '13px 15px', width: '100%', boxShadow: '0 1px 2px rgba(27,28,20,.03)', outline: 'none', transition: 'border-color .2s ease, box-shadow .2s ease' },

  divider: { display: 'flex', alignItems: 'center', gap: 14, margin: '26px 0 18px' },
  dividerLine: { flex: 1, height: 1, background: C.hair },
  dividerText: { ...mono, fontSize: 9, color: C.faint2 },

  switchLine: { marginTop: 26, textAlign: 'center', fontFamily: GEIST, fontSize: 13.5, color: C.muted },
  switchLink: { color: C.accent, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', fontFamily: GEIST, fontSize: 13.5, padding: 0 },
  legal: { marginTop: 22, textAlign: 'center', fontFamily: GEIST, fontSize: 11.5, lineHeight: 1.6, color: C.faint2 },
  legalLink: { color: C.muted, textDecoration: 'underline', textUnderlineOffset: '2px' },
};

const tabBase = { fontFamily: GEIST, fontWeight: 600, fontSize: 13, letterSpacing: '-.005em', padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', transition: 'background-color .22s cubic-bezier(.22,1,.36,1), color .22s ease' };
const tabOn  = { ...tabBase, background: C.card, color: C.accent, boxShadow: '0 1px 2px rgba(27,28,20,.06)' };
const tabOff = { ...tabBase, background: 'transparent', color: C.faint };

const submitBase = { fontFamily: GEIST, fontWeight: 600, fontSize: 15, letterSpacing: '-.005em', width: '100%', padding: 15, marginTop: 6, color: C.paper, background: C.accent, border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 12px 30px -14px rgba(20,102,59,.7)', transition: 'transform .2s cubic-bezier(.22,1,.36,1), background-color .2s ease' };
const submitHover = { transform: 'translateY(-1px)', background: C.accentHover };

const googleBase = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11, width: '100%', padding: 13, fontFamily: GEIST, fontSize: 14, fontWeight: 600, color: C.ink, background: C.card, border: `1px solid ${C.hair}`, borderRadius: 12, cursor: 'pointer', boxShadow: '0 1px 2px rgba(27,28,20,.03)', transition: 'border-color .2s ease, transform .2s cubic-bezier(.22,1,.36,1)' };
const googleHover = { borderColor: 'rgba(20,102,59,.4)', transform: 'translateY(-1px)' };

const focusable = {
  onFocus: e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20,102,59,0.12)'; },
  onBlur:  e => { e.currentTarget.style.borderColor = C.hair; e.currentTarget.style.boxShadow = '0 1px 2px rgba(27,28,20,.03)'; },
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
  const [form, setForm]         = useState({ name: '', email: '', password: '' });
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
    setForm({ name: '', email: '', password: '' });
    setMode(next);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email || !form.password) {
      setError('Name, email, and password are required');
      return;
    }
    setLoading(true);
    try {
      const data = await register(form.name, form.email, form.password);
      localStorage.setItem('display_name', form.name);
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
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes authFade { from { opacity: 0; } to { opacity: 1; } }
        .honne-auth input::placeholder { color: rgba(27,28,20,.34); }
        .honne-auth ::selection { background: #CDEBD6; color: #1B1C14; }
        @media (max-width: 767px) { .honne-auth { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* LEFT: brand panel */}
      <aside className="lp-hide-phone" style={st.brandPanel}>
        <div style={st.brandGlow} />
        <div style={st.brandTop}>
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
              <p style={{ fontSize: 13, color: C.errText, background: C.errBg, borderRadius: 10, padding: '9px 12px', margin: '4px 0 0', textAlign: 'center', fontFamily: GEIST }}>
                {error}
              </p>
            )}
            {!error && forgotMsg && (
              <p style={{ fontSize: 12.5, color: C.muted, textAlign: 'center', margin: '4px 0 0' }}>
                {forgotMsg}
              </p>
            )}
            {!error && confirmMsg && (
              <p style={{ fontSize: 13, color: C.ink, background: C.cream, borderRadius: 10, padding: '9px 12px', margin: '4px 0 0', textAlign: 'center', fontFamily: GEIST }}>
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
            <p style={{ textAlign: 'center', fontSize: 13, color: C.muted, marginTop: 10, fontFamily: GEIST }}>
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
