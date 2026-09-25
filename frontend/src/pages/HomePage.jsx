import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register, googleSignIn } from '../api/auth';
import { AUTH_COPY } from './authContent';

/* ── Design tokens (Honne AI — shared with the landing page redesign) ────── */
const C = {
  bg: '#FAF7F2',
  ink: '#15181A',
  body: '#5E6366',
  faint: '#8A8F92',
  border: '#EDE7DE',
  borderAlt: '#E3DDD4',
  orange: '#F0662A',
  orangeLight: '#F6A15B',
  orangeDark: '#C2553A',
  orangeTint: '#FFF1E9',
  teal: '#2C6E7F',
  dark: '#0C1F26',
  errText: '#C4371E',
  errBg: '#FFF1E9',
}
const FONT = {
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'Geist', ui-sans-serif, system-ui, sans-serif",
  mono: "'Geist Mono', monospace",
}

const st = {
  page: { minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)', background: C.bg, color: C.ink, fontFamily: FONT.sans, padding: 12, gap: 12 },

  brandPanel: { position: 'relative', overflow: 'hidden', borderRadius: 28, background: C.dark, color: '#FFFFFF', isolation: 'isolate', display: 'flex', flexDirection: 'column', padding: '32px 40px 40px', minHeight: 'calc(100vh - 24px)' },
  formPanel: { display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 24px)', padding: '20px 40px 24px' },

  backLink: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.body },
  mobileLogo: { display: 'none', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600 },

  eyebrow: { fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.1em', color: C.orange, marginBottom: 14 },
  h1: { margin: '0 0 8px', fontFamily: FONT.serif, fontWeight: 400, fontSize: 44, lineHeight: 1, letterSpacing: '-0.02em' },
  sub: { margin: '0 0 32px', fontSize: 15, lineHeight: 1.5, color: C.body },

  tabs: { display: 'inline-flex', gap: 3, background: 'rgba(21,24,26,.055)', padding: 3, borderRadius: 999, marginBottom: 28 },

  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 8 },
  labelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13, fontWeight: 500, color: '#3D4144' },
  forgot: { fontFamily: FONT.mono, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: C.orange, cursor: 'pointer', background: 'none', border: 'none', padding: 0 },
  input: { height: 52, padding: '0 16px', borderRadius: 14, border: `1px solid ${C.borderAlt}`, background: '#FFFFFF', fontSize: 15, fontFamily: FONT.sans, color: C.ink, outline: 'none', transition: 'border-color .2s ease, box-shadow .2s ease' },

  divider: { display: 'flex', alignItems: 'center', gap: 14, margin: '24px 0' },
  dividerLine: { flex: 1, height: 1, background: C.borderAlt },
  dividerText: { fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.1em', color: '#A5A9AB' },

  switchLine: { marginTop: 26, textAlign: 'center', fontSize: 13.5, color: C.body },
  switchLink: { color: C.orange, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', fontFamily: FONT.sans, fontSize: 13.5, padding: 0 },
  legal: { marginTop: 22, textAlign: 'center', fontSize: 12, color: C.faint },
  legalLink: { color: C.body, textDecoration: 'underline', textUnderlineOffset: '2px' },
}

const tabBase = { fontFamily: FONT.sans, fontWeight: 600, fontSize: 13, padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', transition: 'background-color .22s ease, color .22s ease' }
const tabOn = { ...tabBase, background: '#FFFFFF', color: C.orange, boxShadow: '0 1px 2px rgba(21,24,26,.08)' }
const tabOff = { ...tabBase, background: 'transparent', color: C.faint }

const submitBase = { height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: 0, borderRadius: 14, background: C.ink, color: '#FFFFFF', fontSize: 15, fontWeight: 500, cursor: 'pointer', transition: 'background-color .2s ease, transform .2s ease' }
const submitHover = { background: '#2A2F32', transform: 'translateY(-1px)' }

const googleBase = { height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11, width: '100%', border: `1px solid ${C.borderAlt}`, borderRadius: 14, background: '#FFFFFF', fontSize: 15, fontWeight: 500, cursor: 'pointer', transition: 'border-color .2s ease, box-shadow .2s ease' }
const googleHover = { borderColor: C.ink, boxShadow: '0 6px 20px -10px rgba(12,31,38,.35)' }

const focusable = {
  onFocus: e => { e.currentTarget.style.borderColor = C.ink; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(240,102,42,.14)' },
  onBlur: e => { e.currentTarget.style.borderColor = C.borderAlt; e.currentTarget.style.boxShadow = 'none' },
}

/* ── Icons ─────────────────────────────────────────────────────────────── */
function LogoMark({ size = 28, fontSize = 22 }) {
  return (
    <span style={{ position: 'relative', width: size, height: size, borderRadius: size * 0.28, background: 'linear-gradient(140deg, #F6A15B 0%, #F0662A 55%, #C2553A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.28), 0 0 18px rgba(240,102,42,.65)' }}>
      <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize, lineHeight: 1, color: '#FFFFFF', textShadow: '0 0 10px rgba(255,236,220,.95)', marginTop: 2 }}>H</span>
      <span className="hn-auth-shine" />
    </span>
  )
}
function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}
function GoogleSVG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}
function Spinner({ color = C.ink }) {
  return <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${color === '#FFFFFF' ? 'rgba(255,255,255,.3)' : C.borderAlt}`, borderTopColor: color, animation: 'hn-auth-spin .8s linear infinite' }} />
}
function FeedbackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={C.orange} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function HomePage({ initialMode = 'login' }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode === 'register' ? 'signup' : 'login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleMsg, setGoogleMsg] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');
  const [submitHov, setSubmitHov] = useState(false);
  const [googleHov, setGoogleHov] = useState(false);

  const isSignup = mode === 'signup';
  const copy = isSignup ? AUTH_COPY.signup : AUTH_COPY.login;

  function field(key) { return e => setForm(f => ({ ...f, [key]: e.target.value })); }

  function switchMode(next) {
    setError(''); setGoogleMsg(''); setConfirmMsg('');
    setForm({ name: '', email: '', password: '' });
    setMode(next);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/welcome', { state: { next: '/home' } });
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
        navigate('/welcome', { state: { next: '/onboarding' } });
      }
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }

  async function handleGoogle() {
    setGoogleMsg(''); setGoogleBusy(true);
    try {
      await googleSignIn();
      // Browser redirects away on success; only reached here on failure.
    } catch (err) {
      setGoogleMsg(err.message);
    } finally { setGoogleBusy(false); }
  }

  function handleForgot(e) {
    e.preventDefault();
    navigate('/forgot-password');
  }

  return (
    <div style={st.page} className="honne-auth">
      <style>{`
        @keyframes hn-auth-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes hn-auth-spin { to { transform: rotate(360deg); } }
        @keyframes hn-auth-shine { 0%,55% { left: -60%; } 100% { left: 130%; } }
        @keyframes hn-auth-drift { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(6%,-5%) scale(1.1); } }
        .honne-auth input::placeholder { color: rgba(21,24,26,.34); }
        .honne-auth ::selection { background: ${C.orange}; color: #fff; }
        .hn-auth-shine { position: absolute; top: -20%; left: -60%; width: 40%; height: 140%; background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.75), rgba(255,255,255,0)); transform: rotate(20deg); animation: hn-auth-shine 3.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .honne-auth [style*="animation"] { animation: none !important; } }
        @media (max-width: 899px) {
          .honne-auth { grid-template-columns: 1fr !important; }
          .hn-auth-brand { display: none !important; }
          .hn-auth-mobile-logo { display: flex !important; }
          .hn-auth-form { padding: 12px 8px 16px !important; }
        }
      `}</style>

      {/* LEFT: brand panel */}
      <aside className="hn-auth-brand" style={st.brandPanel}>
        <div style={{ position: 'absolute', left: '-15%', bottom: '-25%', width: '80%', height: '70%', borderRadius: '50%', background: `radial-gradient(closest-side, ${C.orange} 0%, rgba(240,102,42,.5) 45%, rgba(240,102,42,0) 100%)`, filter: 'blur(30px)', zIndex: -1, animation: 'hn-auth-drift 9s ease-in-out infinite alternate' }} />
        <div style={{ position: 'absolute', right: '-20%', top: '-20%', width: '75%', height: '65%', borderRadius: '50%', background: `radial-gradient(closest-side, ${C.teal} 0%, rgba(44,110,127,.5) 50%, rgba(44,110,127,0) 100%)`, filter: 'blur(30px)', zIndex: -1, animation: 'hn-auth-drift 11s ease-in-out infinite alternate-reverse' }} />
        <div style={{ position: 'absolute', right: '-10%', bottom: '10%', width: '50%', height: '45%', borderRadius: '50%', background: `radial-gradient(closest-side, ${C.orangeLight} 0%, rgba(246,161,91,0) 100%)`, filter: 'blur(40px)', opacity: 0.7, zIndex: -1 }} />

        <a href="/" onClick={e => { e.preventDefault(); navigate('/'); }} style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 10, color: '#FFFFFF' }}>
          <LogoMark />
          <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>Honne <span style={{ color: C.orangeLight }}>AI</span></span>
        </a>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative', zIndex: 2, fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 26, lineHeight: 1.2, color: C.orangeLight, marginBottom: 18 }}>{AUTH_COPY.builtBy}</div>
        <h1 style={{ position: 'relative', zIndex: 2, margin: 0, fontFamily: FONT.serif, fontWeight: 400, fontSize: 'clamp(48px, 4.6vw, 76px)', lineHeight: 0.98, letterSpacing: '-0.03em', maxWidth: 560 }}>
          Your knowledge, <span style={{ fontStyle: 'italic', color: C.orangeLight }}>to publishable posts.</span>
        </h1>
        <p style={{ position: 'relative', zIndex: 2, margin: '20px 0 0', maxWidth: 420, fontSize: 16, lineHeight: 1.55, fontWeight: 300, color: 'rgba(255,255,255,.82)' }}>{AUTH_COPY.brandSub}</p>
      </aside>

      {/* RIGHT: form */}
      <main className="hn-auth-form" style={st.formPanel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <a href="/" onClick={e => { e.preventDefault(); navigate('/'); }} style={st.backLink}>
            <BackIcon />
            Back to home
          </a>
          <span className="hn-auth-mobile-logo" style={st.mobileLogo}>Honne <span style={{ color: C.orange }}>AI</span></span>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
          <div style={{ width: '100%', maxWidth: 400, animation: 'hn-auth-fade .4s ease both' }} key={mode}>

            <div style={st.tabs}>
              <button style={isSignup ? tabOn : tabOff} onClick={() => switchMode('signup')}>{AUTH_COPY.tabs.signup}</button>
              <button style={isSignup ? tabOff : tabOn} onClick={() => switchMode('login')}>{AUTH_COPY.tabs.login}</button>
            </div>

            <div style={st.eyebrow}>{isSignup ? 'SIGN UP' : 'SIGN IN'}</div>
            <h2 style={st.h1}>{copy.heading}</h2>
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
                {loading && <Spinner color="#FFFFFF" />}
                {loading ? copy.submitting : copy.submit}
              </button>

              {error && (
                <p style={{ fontSize: 13, color: C.errText, background: C.errBg, borderRadius: 10, padding: '9px 12px', margin: '4px 0 0', textAlign: 'center' }}>
                  {error}
                </p>
              )}
              {!error && confirmMsg && (
                <p style={{ fontSize: 13, color: C.ink, background: C.orangeTint, borderRadius: 10, padding: '9px 12px', margin: '4px 0 0', textAlign: 'center' }}>
                  {confirmMsg}
                </p>
              )}
            </form>

            <div style={st.divider}>
              <span style={st.dividerLine} />
              <span style={st.dividerText}>OR</span>
              <span style={st.dividerLine} />
            </div>

            <button
              type="button"
              disabled={googleBusy}
              style={{ ...googleBase, ...(googleHov && !googleBusy ? googleHover : {}), opacity: googleBusy ? 0.7 : 1, cursor: googleBusy ? 'not-allowed' : 'pointer' }}
              onMouseEnter={() => setGoogleHov(true)}
              onMouseLeave={() => setGoogleHov(false)}
              onClick={handleGoogle}
            >
              {googleBusy ? <Spinner /> : <GoogleSVG />}
              Continue with {AUTH_COPY.google.label}
            </button>
            {googleMsg && (
              <p style={{ textAlign: 'center', fontSize: 13, color: C.body, marginTop: 10 }}>{googleMsg}</p>
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
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '18px 20px', borderRadius: 18, background: '#FFFFFF', border: `1px solid ${C.border}` }}>
          <span style={{ width: 32, height: 32, borderRadius: 10, background: C.orangeTint, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <FeedbackIcon />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>Early access build</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: C.body }}>If you&rsquo;ve clicked this link, please share feedback on any bugs you find and anything we could improve.</div>
          </div>
          <a href="mailto:feedback@honne.ai?subject=Honne%20feedback" style={{ flex: 'none', height: 34, display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: 10, border: `1px solid ${C.borderAlt}`, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>Give feedback</a>
        </div>
      </main>
    </div>
  );
}
