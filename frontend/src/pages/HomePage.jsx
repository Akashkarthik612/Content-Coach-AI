import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../api/auth';

export default function HomePage({ initialMode = 'login' }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode); // 'login' | 'register' | 'forgot'

  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  function switchMode(next) {
    setError('');
    setForm({ username: '', email: '', password: '' });
    setMode(next);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(form.username, form.password);
      localStorage.setItem('user_id', data.user_id);
      localStorage.setItem('username', data.username);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    if (!form.username || !form.email || !form.password) {
      setError('All fields are required');
      return;
    }
    setLoading(true);
    try {
      const data = await register(form.username, form.email, form.password);
      localStorage.setItem('user_id', data.user_id);
      localStorage.setItem('username', data.username);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%',
    border: '1px solid var(--cc-border)',
    borderRadius: 9,
    padding: '10px 14px',
    fontSize: 14,
    color: 'var(--cc-text)',
    background: 'white',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    transition: 'border-color 0.15s',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--cc-text)',
    marginBottom: 6,
  };

  const focusHandlers = {
    onFocus: e => { e.target.style.borderColor = 'var(--cc-blue)'; },
    onBlur:  e => { e.target.style.borderColor = 'var(--cc-border)'; },
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--cc-bg-soft)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid var(--cc-border)',
        padding: '40px 36px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 4px 24px rgba(37,99,235,0.07)',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          <div style={{ width: 30, height: 30, background: 'var(--cc-blue)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1" fill="white"/>
              <rect x="9" y="1" width="6" height="6" rx="1" fill="white" opacity="0.7"/>
              <rect x="1" y="9" width="6" height="6" rx="1" fill="white" opacity="0.7"/>
              <rect x="9" y="9" width="6" height="6" rx="1" fill="white" opacity="0.4"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--cc-blue)' }}>Content Coach</span>
        </div>

        {/* Title + subtitle */}
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--cc-text)', textAlign: 'center', marginBottom: 6 }}>
          {mode === 'login'    && 'Welcome back'}
          {mode === 'register' && 'Create your account'}
          {mode === 'forgot'   && 'Reset your password'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--cc-text-muted)', textAlign: 'center', marginBottom: 28 }}>
          {mode === 'login'    && 'Log in to your Content Coach vault'}
          {mode === 'register' && 'Start building your writing vault'}
          {mode === 'forgot'   && "We'll send you a reset link"}
        </p>

        {/* ── Login form ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Username</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="Your username"
                value={form.username}
                onChange={set('username')}
                autoFocus
                {...focusHandlers}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Password</label>
              <input
                style={inputStyle}
                type="password"
                placeholder="Your password"
                value={form.password}
                onChange={set('password')}
                {...focusHandlers}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: 'var(--cc-blue)',
                color: 'white',
                border: 'none',
                borderRadius: 9,
                padding: '11px',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 8,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                transition: 'background 0.15s',
                opacity: loading ? 0.7 : 1,
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--cc-blue-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--cc-blue)'; }}
            >
              {loading ? 'Signing in…' : 'Log in'}
            </button>

            {error && (
              <p style={{ fontSize: 13, color: 'var(--cc-red-text)', textAlign: 'center', marginTop: 12, background: 'var(--cc-red-light)', padding: '8px 12px', borderRadius: 8 }}>
                {error}
              </p>
            )}

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button type="button" onClick={() => switchMode('forgot')}
                style={{ background: 'none', border: 'none', color: 'var(--cc-text-muted)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
                Forgot password?
              </button>
            </div>
          </form>
        )}

        {/* ── Register form ── */}
        {mode === 'register' && (
          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Username</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. akash_writes"
                value={form.username}
                onChange={set('username')}
                autoFocus
                {...focusHandlers}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Email</label>
              <input
                style={inputStyle}
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={set('email')}
                {...focusHandlers}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Password</label>
              <input
                style={inputStyle}
                type="password"
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={set('password')}
                {...focusHandlers}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: 'var(--cc-blue)',
                color: 'white',
                border: 'none',
                borderRadius: 9,
                padding: '11px',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 8,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                transition: 'background 0.15s',
                opacity: loading ? 0.7 : 1,
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--cc-blue-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--cc-blue)'; }}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>

            {error && (
              <p style={{ fontSize: 13, color: 'var(--cc-red-text)', textAlign: 'center', marginTop: 12, background: 'var(--cc-red-light)', padding: '8px 12px', borderRadius: 8 }}>
                {error}
              </p>
            )}
          </form>
        )}

        {/* ── Forgot password ── */}
        {mode === 'forgot' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Email</label>
              <input
                style={inputStyle}
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={set('email')}
                autoFocus
                {...focusHandlers}
              />
            </div>

            <button
              type="button"
              style={{
                width: '100%',
                background: 'var(--cc-blue)',
                color: 'white',
                border: 'none',
                borderRadius: 9,
                padding: '11px',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 8,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--cc-blue-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--cc-blue)'; }}
            >
              Send reset link
            </button>

            {error && (
              <p style={{ fontSize: 13, color: 'var(--cc-red-text)', textAlign: 'center', marginTop: 12, background: 'var(--cc-red-light)', padding: '8px 12px', borderRadius: 8 }}>
                {error}
              </p>
            )}
          </div>
        )}

        {/* ── Footer links ── */}
        <div style={{ borderTop: '1px solid var(--cc-border)', margin: '20px 0' }} />

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--cc-text-muted)', margin: 0 }}>
          {mode === 'login' || mode === 'forgot' ? (
            <>Don&apos;t have an account?{' '}
              <button type="button" onClick={() => switchMode('register')}
                style={{ background: 'none', border: 'none', color: 'var(--cc-blue)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                Sign up free
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button type="button" onClick={() => switchMode('login')}
                style={{ background: 'none', border: 'none', color: 'var(--cc-blue)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                Log in
              </button>
            </>
          )}
        </p>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a href="/" style={{ fontSize: 12, color: 'var(--cc-text-faint)', textDecoration: 'none' }}>
            ← Back to home
          </a>
        </div>

      </div>
    </div>
  );
}
