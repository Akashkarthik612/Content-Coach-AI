import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register, googleSignIn } from '../api/auth';
import { AUTH_COPY } from './authContent';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  dark:    '#0B1220',
  darkSub: '#8FA3BF',
  darkMid: 'rgba(255,255,255,0.07)',
  darkBrd: 'rgba(255,255,255,0.11)',
  white:   '#FFFFFF',
  right:   '#EBEEF6',
  togBg:   '#D5DAE5',
  ink:     '#0F172A',
  muted:   '#64748B',
  faint:   '#94A3B8',
  border:  '#D1D9E6',
  blue:    '#2563EB',
  blueHov: '#1D4ED8',
  errText: '#B91C1C',
  errBg:   '#FEF2F2',
};
const FONT  = "'Hanken Grotesk', 'DM Sans', system-ui, sans-serif";
const SERIF = "'Newsreader', Georgia, serif";

// Shared styles — computed once at module load
const INP = {
  width: '100%',
  border: `1.5px solid ${C.border}`,
  borderRadius: 10,
  padding: '11px 14px',
  fontSize: 14,
  color: C.ink,
  background: C.white,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: FONT,
  transition: 'border-color 0.15s',
};
const LBL = { display: 'block', fontSize: 13, fontWeight: 500, color: C.ink, marginBottom: 6, fontFamily: FONT };
const FOC = {
  onFocus: e => { e.target.style.borderColor = C.blue; },
  onBlur:  e => { e.target.style.borderColor = C.border; },
};

// ── SVG icons ─────────────────────────────────────────────────────────────────
function LogoMark() {
  return (
    <div style={{ width: 32, height: 32, background: C.blue, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1.5" fill="white"/>
        <rect x="9" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.7"/>
        <rect x="1" y="9" width="6" height="6" rx="1.5" fill="white" opacity="0.7"/>
        <rect x="9" y="9" width="6" height="6" rx="1.5" fill="white" opacity="0.35"/>
      </svg>
    </div>
  );
}

function EyeIcon({ open }) {
  return open ? (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function GoogleSVG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

// ── Left panel (hidden on phone via lp-hide-phone CSS class) ──────────────────
function LeftPanel() {
  const lp = AUTH_COPY.leftPanel;
  return (
    <div
      className="lp-hide-phone"
      style={{
        width: '42%',
        minWidth: 360,
        background: C.dark,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 52px 44px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LogoMark />
        <span style={{ color: C.white, fontFamily: FONT, fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>
          {AUTH_COPY.logo}
        </span>
      </div>

      <div>
        <blockquote style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 22, lineHeight: 1.55, color: C.white, margin: 0 }}>
          &ldquo;{lp.testimonial}&rdquo;
        </blockquote>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
          <div style={{
            width: 42, height: 42, borderRadius: '50%',
            background: '#1B3558', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#7EAEE0', fontFamily: FONT, fontSize: 14, fontWeight: 700,
          }}>
            {lp.author.initials}
          </div>
          <div>
            <div style={{ color: C.white, fontFamily: FONT, fontWeight: 600, fontSize: 14 }}>{lp.author.name}</div>
            <div style={{ color: C.darkSub, fontFamily: FONT, fontSize: 13, marginTop: 2 }}>{lp.author.role}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {lp.stats.map(s => (
          <div key={s.label} style={{
            flex: 1,
            background: C.darkMid,
            border: `1px solid ${C.darkBrd}`,
            borderRadius: 10,
            padding: '12px 16px',
          }}>
            <div style={{ color: C.white, fontFamily: FONT, fontWeight: 700, fontSize: 20 }}>{s.value}</div>
            <div style={{ color: C.darkSub, fontFamily: FONT, fontSize: 12, marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared UI primitives ──────────────────────────────────────────────────────
function PrimaryBtn({ label, loading, type = 'submit' }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type={type}
      disabled={loading}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%',
        background: hov && !loading ? C.blueHov : C.blue,
        color: C.white,
        border: 'none',
        borderRadius: 10,
        padding: '13px',
        fontSize: 15,
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        fontFamily: FONT,
        transition: 'background 0.15s',
        opacity: loading ? 0.75 : 1,
      }}
    >
      {label}
    </button>
  );
}

function ErrorBox({ msg }) {
  return (
    <p style={{ fontSize: 13, color: C.errText, background: C.errBg, borderRadius: 8, padding: '9px 12px', margin: '12px 0 0', textAlign: 'center', fontFamily: FONT }}>
      {msg}
    </p>
  );
}

function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <span style={{ fontSize: 13, color: C.faint, fontFamily: FONT }}>or</span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HomePage({ initialMode = 'login' }) {
  const navigate = useNavigate();
  const [mode, setMode]           = useState(initialMode);
  const [form, setForm]           = useState({ name: '', username: '', email: '', password: '' });
  const [showPwd, setShowPwd]     = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [googleMsg, setGoogleMsg] = useState('');

  function field(key) { return e => setForm(f => ({ ...f, [key]: e.target.value })); }

  function switchMode(next) {
    setError(''); setGoogleMsg(''); setShowPwd(false);
    setForm({ name: '', username: '', email: '', password: '' });
    setMode(next);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await login(form.username, form.password);
      localStorage.setItem('user_id', data.user_id);
      localStorage.setItem('username', data.username);
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
      localStorage.setItem('user_id', data.user_id);
      localStorage.setItem('username', data.username);
      if (form.name) localStorage.setItem('display_name', form.name);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }

  async function handleGoogle() {
    const result = await googleSignIn();
    if (!result) setGoogleMsg('Google sign-in coming soon — stay tuned!');
  }

  const copy = mode === 'login'    ? AUTH_COPY.signIn
             : mode === 'register' ? AUTH_COPY.register
             : AUTH_COPY.forgot;

  // Password field with eye-toggle. Kept as JSX expression (not a component)
  // so it doesn't unmount/remount on re-render, which would lose focus.
  const pwdField = (
    <div style={{ position: 'relative' }}>
      <input
        style={{ ...INP, paddingRight: 44 }}
        type={showPwd ? 'text' : 'password'}
        placeholder={copy.passwordPlaceholder}
        value={form.password}
        onChange={field('password')}
        {...FOC}
      />
      <button
        type="button"
        onClick={() => setShowPwd(p => !p)}
        aria-label={showPwd ? 'Hide password' : 'Show password'}
        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.faint, padding: 2, display: 'flex', alignItems: 'center' }}
      >
        <EyeIcon open={showPwd} />
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: FONT }}>
      <LeftPanel />

      {/* ── Right panel ── */}
      <div style={{
        flex: 1,
        background: C.right,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 32px',
        position: 'relative',
      }}>
        <a
          href="/"
          style={{ position: 'absolute', top: 28, left: 36, color: C.muted, fontFamily: FONT, fontSize: 13, textDecoration: 'none' }}
        >
          ← Back to home
        </a>

        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* Segmented mode toggle */}
          {mode !== 'forgot' && (
            <div style={{ display: 'flex', background: C.togBg, borderRadius: 12, padding: 4, gap: 4, marginBottom: 32 }}>
              {[
                { key: 'login',    label: AUTH_COPY.toggle.signIn },
                { key: 'register', label: AUTH_COPY.toggle.createAccount },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => switchMode(t.key)}
                  style={{
                    flex: 1, padding: '9px 12px', border: 'none', cursor: 'pointer',
                    borderRadius: 9, fontSize: 14, fontWeight: 500, fontFamily: FONT,
                    transition: 'all 0.15s',
                    background: mode === t.key ? C.white : 'transparent',
                    color:      mode === t.key ? C.ink   : C.muted,
                    boxShadow:  mode === t.key ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <h1 style={{ fontSize: 28, fontWeight: 700, color: C.ink, margin: '0 0 6px', letterSpacing: '-0.03em', fontFamily: FONT, lineHeight: 1.2 }}>
            {copy.heading}
          </h1>
          <p style={{ fontSize: 15, color: C.muted, margin: '0 0 28px', fontFamily: FONT }}>
            {copy.sub}
          </p>

          {/* ── Sign in form ── */}
          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: 16 }}>
                <label style={LBL}>Username</label>
                <input style={INP} type="text" placeholder={copy.usernamePlaceholder} value={form.username} onChange={field('username')} autoFocus {...FOC} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={LBL}>Password</label>
                {pwdField}
              </div>
              <div style={{ textAlign: 'right', marginBottom: 22 }}>
                <button type="button" onClick={() => switchMode('forgot')} style={{ background: 'none', border: 'none', color: C.blue, fontSize: 13, cursor: 'pointer', fontFamily: FONT, padding: 0 }}>
                  {copy.forgotLink}
                </button>
              </div>
              <PrimaryBtn loading={loading} label={loading ? copy.submitting : copy.submit} />
              {error && <ErrorBox msg={error} />}
            </form>
          )}

          {/* ── Create account form ── */}
          {mode === 'register' && (
            <form onSubmit={handleRegister}>
              {[
                { key: 'name',     label: 'Full name', type: 'text',  ph: copy.namePlaceholder,     af: true  },
                { key: 'email',    label: 'Email',     type: 'email', ph: copy.emailPlaceholder,    af: false },
                { key: 'username', label: 'Username',  type: 'text',  ph: copy.usernamePlaceholder, af: false },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 16 }}>
                  <label style={LBL}>{f.label}</label>
                  <input style={INP} type={f.type} placeholder={f.ph} value={form[f.key]} onChange={field(f.key)} autoFocus={f.af} {...FOC} />
                </div>
              ))}
              <div style={{ marginBottom: 22 }}>
                <label style={LBL}>Password</label>
                {pwdField}
              </div>
              <PrimaryBtn loading={loading} label={loading ? copy.submitting : copy.submit} />
              {error && <ErrorBox msg={error} />}
            </form>
          )}

          {/* ── Forgot password ── */}
          {mode === 'forgot' && (
            <>
              <div style={{ marginBottom: 22 }}>
                <label style={LBL}>Email</label>
                <input style={INP} type="email" placeholder={copy.emailPlaceholder} value={form.email} onChange={field('email')} autoFocus {...FOC} />
              </div>
              <PrimaryBtn type="button" loading={false} label={copy.submit} />
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button type="button" onClick={() => switchMode('login')} style={{ background: 'none', border: 'none', color: C.blue, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                  ← Back to sign in
                </button>
              </div>
              {error && <ErrorBox msg={error} />}
            </>
          )}

          {/* Google sign-in section */}
          {mode !== 'forgot' && (
            <>
              <Divider />
              <button
                type="button"
                onClick={handleGoogle}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
                style={{
                  width: '100%',
                  background: C.white,
                  color: C.ink,
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '12px',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: FONT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  transition: 'border-color 0.15s',
                }}
              >
                <GoogleSVG />
                {AUTH_COPY.google.label}
              </button>
              {googleMsg && (
                <p style={{ textAlign: 'center', fontSize: 13, color: C.muted, marginTop: 10, fontFamily: FONT }}>
                  {googleMsg}
                </p>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
