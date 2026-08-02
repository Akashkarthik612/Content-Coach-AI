import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle } from 'lucide-react';
import { getSessions, deleteSession } from '../api/ai';
import { getAccountSettings } from '../api/profile';
import { updateEmail, sendPasswordResetEmail } from '../api/account';
import HonneSidebar from '../components/shared/HonneSidebar';

/* ────────────────────────────────────────────────────────────────────────
   Ported from the "Honne Settings" design (Claude Design project
   ff122375-c3bc-4438-aece-706b0bd557b0, `Honne Settings.dc.html`). Sidebar
   chrome reuses the shared HonneSidebar (same precedent as SchedulePage)
   instead of the source file's own standalone sidebar copy — reached via
   HonneSidebar's footer "Settings" button, now wired to navigate here.

   Email + username display, and email + password change, are real —
   Supabase-auth-mode only (backend/auth/service.py's UserSyncService is the
   sync point; email/password changes go straight to supabase-js, same as
   login()/register() in api/auth.js, no backend route in between). Password
   change is a "Send reset link" action, not an inline current/new/confirm
   form — the actual new-password entry happens on the emailed link's
   landing page (ResetPasswordPage.jsx, /reset-password), so control of the
   registered email is proven before any password change takes effect (same
   trust model as the email-change flow below, not a reauth-via-current-
   password check). The source design never had an editable email field —
   only username/password had "Change" affordances — so the email edit form
   here is a deliberate addition beyond the literal port. Username change
   and subscription cancellation remain presentational/localStorage-only,
   out of scope for this pass; local-auth dev mode isn't a target either —
   these calls would simply fail there since `supabase` is a placeholder
   client in that mode.
   ──────────────────────────────────────────────────────────────────────── */
const PAGE_BG  = '#FFFFFF';
const INK      = '#1B1C14';
const ACCENT   = '#14663B';
const MUTED    = '#7A7C6C';
const MUTED_2  = '#9FA291';
const MUTED_3  = '#9A9C8C';
const HAIRLINE = 'rgba(27,28,20,.09)';
const DANGER   = '#B4442E';
const FONT = "'Geist', system-ui, sans-serif";
const MONO = "'JetBrains Mono', monospace";

const STYLES = `
@keyframes setRise { from { opacity:0; transform:translateY(10px);} to {opacity:1; transform:translateY(0);} }
@keyframes setRowIn { from {opacity:0; transform:translateY(8px);} to {opacity:1; transform:translateY(0);} }
@keyframes setFade { from {opacity:0;} to {opacity:1;} }
@keyframes setToastIn { from {opacity:0; transform:translateY(10px);} to {opacity:1; transform:translateY(0);} }
@media (prefers-reduced-motion: reduce) { *{ animation-duration:.001ms !important; } }
.set-changebtn { transition: border-color .2s ease, color .2s ease; }
.set-changebtn:hover { border-color: rgba(20,102,59,.5); color: #14663B; }
.set-cancelbtn { transition: border-color .2s ease; }
.set-cancelbtn:hover { border-color: rgba(27,28,20,.24); }
.set-savebtn { transition: transform .2s cubic-bezier(.22,1,.36,1); }
.set-savebtn:active { transform: scale(.97); }
.set-logoutrow { transition: border-color .2s ease, transform .2s cubic-bezier(.22,1,.36,1); }
.set-logoutrow:hover { border-color: rgba(27,28,20,.2); transform: translateY(-1px); }
.set-cancelrow { transition: border-color .2s ease, transform .2s cubic-bezier(.22,1,.36,1); }
.set-cancelrow:hover { border-color: rgba(180,68,46,.35); transform: translateY(-1px); }
`;

const inputStyle = { width: '100%', height: 44, padding: '0 14px', border: '1.5px solid rgba(27,28,20,.14)', borderRadius: 11, background: '#fff', fontSize: 15, color: INK, letterSpacing: '-.005em' };

let _seq = 1;
const nextId = () => _seq++;

function relativeTimeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const userInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  const [sideOpen, setSideOpen] = useState(true);
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState('');

  // Sidebar's Recent list — same persisted (7-day TTL) chat history every
  // other Honne-shell page reads, see ChatPage.jsx/SchedulePage.jsx.
  useEffect(() => {
    getSessions()
      .then(({ sessions = [] }) => {
        setChats(sessions.map(s => ({ id: nextId(), sessionId: s.session_id, title: s.title, time: relativeTimeAgo(s.last_active_at) })));
      })
      .catch(() => { /* sidebar history unavailable — show an empty list */ });
  }, []);

  const handleDeleteChat = async (i) => {
    const chat = chats[i];
    if (!chat) return;
    setChats(prev => prev.filter((_, idx) => idx !== i));
    try {
      await deleteSession(chat.sessionId);
    } catch {
      setChats(prev => [...prev.slice(0, i), chat, ...prev.slice(i)]);
    }
  };

  const goToChat = (sessionId) => {
    if (sessionId) localStorage.setItem('lastSessionId', sessionId);
    else localStorage.removeItem('lastSessionId');
    navigate('/chat');
  };

  // ---- Account state (real: GET /api/profile/settings; see top-of-file note) ---
  const [username, setUsername] = useState(localStorage.getItem('username') || 'you');
  const [email, setEmail] = useState(null); // null while loading, or on fetch failure
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountError, setAccountError] = useState(null);

  useEffect(() => {
    getAccountSettings()
      .then(({ email: realEmail, username: realUsername }) => {
        setEmail(realEmail);
        if (realUsername) {
          setUsername(realUsername);
          localStorage.setItem('username', realUsername);
        }
        setAccountError(null);
      })
      .catch(() => setAccountError('Unable to load account settings. Server may be unavailable.'))
      .finally(() => setAccountLoading(false));
  }, []);

  const [editingUser, setEditingUser] = useState(false);
  const [userDraft, setUserDraft] = useState('');

  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);

  const [editingPass, setEditingPass] = useState(false);
  const [passError, setPassError] = useState('');
  const [passSaving, setPassSaving] = useState(false);
  const [resetLinkSent, setResetLinkSent] = useState(false);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const showToast = (msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2600);
    setToast(msg);
  };

  const startUser = () => {
    setUserDraft(username);
    setEditingUser(true);
    requestAnimationFrame(() => { userInputRef.current?.focus(); userInputRef.current?.select(); });
  };
  const cancelUser = () => setEditingUser(false);
  const userValid = userDraft.trim().replace(/^@/, '').length > 0;
  const saveUser = () => {
    const v = userDraft.trim().replace(/^@/, '');
    if (!v) return;
    setUsername(v);
    localStorage.setItem('username', v);
    setEditingUser(false);
    showToast('Username updated');
  };

  const startEmail = () => {
    setEmailDraft(email || '');
    setEmailError('');
    setEditingEmail(true);
    requestAnimationFrame(() => { emailInputRef.current?.focus(); emailInputRef.current?.select(); });
  };
  const cancelEmail = () => { setEditingEmail(false); setEmailError(''); };
  const emailValid = /\S+@\S+\.\S+/.test(emailDraft.trim());
  const saveEmail = async () => {
    const v = emailDraft.trim();
    if (!v || v === email) return;
    if (!/\S+@\S+\.\S+/.test(v)) { setEmailError('Enter a valid email address.'); return; }
    setEmailSaving(true);
    setEmailError('');
    try {
      await updateEmail(v);
      setEditingEmail(false);
      showToast('Confirmation link sent — check your new inbox to finish the change');
    } catch (err) {
      setEmailError(err.message || 'Could not update email. Please try again.');
    } finally {
      setEmailSaving(false);
    }
  };

  const startPass = () => { setPassError(''); setResetLinkSent(false); setEditingPass(true); };
  const cancelPass = () => { setEditingPass(false); setPassError(''); };
  const sendResetLink = async () => {
    if (!email) { setPassError('No email on file to send a reset link to.'); return; }
    setPassSaving(true);
    setPassError('');
    try {
      await sendPasswordResetEmail(email);
      setResetLinkSent(true);
    } catch (err) {
      setPassError(err.message || 'Could not send reset link. Please try again.');
    } finally {
      setPassSaving(false);
    }
  };

  const handleLogout = () => { localStorage.clear(); navigate('/login'); };

  const askCancel = () => setConfirmCancel(true);
  const dismissCancel = () => setConfirmCancel(false);
  const doCancel = () => { setConfirmCancel(false); showToast('Subscription cancellation scheduled'); };

  const userName = localStorage.getItem('username') || 'there';

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: PAGE_BG, color: INK, fontFamily: FONT, display: 'flex' }}>
      <style>{STYLES}</style>

      <HonneSidebar
        open={sideOpen} onToggle={() => setSideOpen(o => !o)}
        chats={chats} activeIndex={-1}
        onSelect={(i) => goToChat(chats[i]?.sessionId)}
        onDelete={handleDeleteChat}
        onNewChat={() => goToChat(null)}
        search={search} onSearch={setSearch} userName={userName} navigate={navigate}
        activeNav="settings"
      />

      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', position: 'relative' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '44px 40px 80px' }}>

          <header style={{ marginBottom: 32, animation: 'setRise .5s cubic-bezier(.22,1,.36,1) both' }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: MUTED_2, fontWeight: 500 }}>Account</span>
            <h1 style={{ fontFamily: FONT, fontSize: 32, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-.02em', color: INK, margin: '8px 0 6px' }}>Settings</h1>
            <p style={{ fontSize: 15, color: MUTED, margin: 0, letterSpacing: '-.005em' }}>Manage your account, sign-in details, and subscription.</p>
          </header>

          {/* ---------- PROFILE ---------- */}
          <section style={{ marginBottom: 34, animation: 'setRowIn .5s cubic-bezier(.22,1,.36,1) both .05s' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: MUTED_2, fontWeight: 500, marginBottom: 14 }}>Profile</div>
            <div style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 16, overflow: 'hidden' }}>

              {accountError ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px', color: DANGER }}>
                  <AlertTriangle size={17} strokeWidth={2} />
                  <span style={{ fontSize: 13.5, letterSpacing: '-.005em' }}>{accountError}</span>
                </div>
              ) : (
                <div style={{ padding: '18px 20px' }}>
                  {editingEmail ? (
                    <div style={{ animation: 'setFade .25s ease both' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: INK, letterSpacing: '-.005em', marginBottom: 10 }}>Change email</div>
                      <input
                        ref={emailInputRef} value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)}
                        placeholder="you@example.com" type="email" style={inputStyle}
                      />
                      {emailError && <div style={{ fontSize: 12.5, color: DANGER, marginTop: 9, letterSpacing: '-.005em' }}>{emailError}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
                        <button
                          className="set-savebtn" onClick={saveEmail} disabled={!emailValid || emailSaving}
                          style={{ display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 18px', border: 'none', borderRadius: 10, background: ACCENT, color: '#F4F2EA', fontSize: 13, fontWeight: 600, cursor: (emailValid && !emailSaving) ? 'pointer' : 'not-allowed', opacity: (emailValid && !emailSaving) ? 1 : 0.5 }}
                        >{emailSaving ? 'Sending…' : 'Save'}</button>
                        <button className="set-cancelbtn" onClick={cancelEmail} disabled={emailSaving} style={{ height: 38, padding: '0 14px', border: '1px solid rgba(27,28,20,.12)', background: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, color: MUTED, cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: INK, letterSpacing: '-.005em', marginBottom: 3 }}>Email</div>
                        <div style={{ fontSize: 14, color: MUTED, letterSpacing: '-.005em' }}>{accountLoading ? 'Loading…' : (email || '—')}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: '0 0 auto' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 11px', borderRadius: 999, background: 'rgba(20,102,59,.09)', color: ACCENT, fontFamily: MONO, fontSize: 10.5, letterSpacing: '.05em' }}>Verified</span>
                        <button className="set-changebtn" onClick={startEmail} disabled={accountLoading} style={{ height: 36, padding: '0 15px', border: '1px solid rgba(27,28,20,.12)', background: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#3A3C30', cursor: 'pointer' }}>Change</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ height: 1, background: HAIRLINE, margin: '0 20px' }} />

              <div style={{ padding: '18px 20px' }}>
                {editingUser ? (
                  <div style={{ animation: 'setFade .25s ease both' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: INK, letterSpacing: '-.005em', marginBottom: 10 }}>Change username</div>
                    <input
                      ref={userInputRef} value={userDraft} onChange={(e) => setUserDraft(e.target.value)}
                      placeholder="Your username" style={inputStyle}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
                      <button
                        className="set-savebtn" onClick={saveUser} disabled={!userValid}
                        style={{ display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 18px', border: 'none', borderRadius: 10, background: ACCENT, color: '#F4F2EA', fontSize: 13, fontWeight: 600, cursor: userValid ? 'pointer' : 'not-allowed', opacity: userValid ? 1 : 0.5 }}
                      >Save</button>
                      <button className="set-cancelbtn" onClick={cancelUser} style={{ height: 38, padding: '0 14px', border: '1px solid rgba(27,28,20,.12)', background: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, color: MUTED, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: INK, letterSpacing: '-.005em', marginBottom: 3 }}>Username</div>
                      <div style={{ fontSize: 14, color: MUTED, letterSpacing: '-.005em' }}>@{username}</div>
                    </div>
                    <button className="set-changebtn" onClick={startUser} style={{ flex: '0 0 auto', height: 36, padding: '0 15px', border: '1px solid rgba(27,28,20,.12)', background: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#3A3C30', cursor: 'pointer' }}>Change</button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ---------- SECURITY ---------- */}
          <section style={{ marginBottom: 34, animation: 'setRowIn .5s cubic-bezier(.22,1,.36,1) both .1s' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: MUTED_2, fontWeight: 500, marginBottom: 14 }}>Security</div>
            <div style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 16, padding: '18px 20px' }}>
              {editingPass ? (
                <div style={{ animation: 'setFade .25s ease both' }}>
                  {resetLinkSent ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 600, color: INK, letterSpacing: '-.005em', marginBottom: 6 }}>Check your inbox</div>
                      <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.5, margin: '0 0 14px', letterSpacing: '-.005em' }}>
                        We sent a password reset link to <strong>{email}</strong>. Click it to set a new password — nothing changes until you do.
                      </p>
                      <button className="set-cancelbtn" onClick={cancelPass} style={{ height: 38, padding: '0 14px', border: '1px solid rgba(27,28,20,.12)', background: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#3A3C30', cursor: 'pointer' }}>Done</button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 600, color: INK, letterSpacing: '-.005em', marginBottom: 6 }}>Change password</div>
                      <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.5, margin: '0 0 14px', letterSpacing: '-.005em' }}>
                        For security, we'll email a reset link to <strong>{email || 'your registered email'}</strong> — your password only changes after you confirm it there.
                      </p>
                      {passError && <div style={{ fontSize: 12.5, color: DANGER, marginBottom: 12, letterSpacing: '-.005em' }}>{passError}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <button
                          className="set-savebtn" onClick={sendResetLink} disabled={passSaving || !email}
                          style={{ display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 18px', border: 'none', borderRadius: 10, background: ACCENT, color: '#F4F2EA', fontSize: 13, fontWeight: 600, cursor: (passSaving || !email) ? 'not-allowed' : 'pointer', opacity: (passSaving || !email) ? 0.6 : 1 }}
                        >{passSaving ? 'Sending…' : 'Send reset link'}</button>
                        <button className="set-cancelbtn" onClick={cancelPass} disabled={passSaving} style={{ height: 38, padding: '0 14px', border: '1px solid rgba(27,28,20,.12)', background: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, color: MUTED, cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: INK, letterSpacing: '-.005em', marginBottom: 3 }}>Password</div>
                    <div style={{ fontSize: 14, color: MUTED, letterSpacing: '.12em' }}>••••••••••</div>
                  </div>
                  <button className="set-changebtn" onClick={startPass} style={{ flex: '0 0 auto', height: 36, padding: '0 15px', border: '1px solid rgba(27,28,20,.12)', background: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#3A3C30', cursor: 'pointer' }}>Change</button>
                </div>
              )}
            </div>
          </section>

          {/* ---------- SESSION & PLAN ---------- */}
          <section style={{ animation: 'setRowIn .5s cubic-bezier(.22,1,.36,1) both .15s' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: MUTED_2, fontWeight: 500, marginBottom: 14 }}>Session &amp; plan</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              <button className="set-logoutrow" onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%', textAlign: 'left', background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 14, padding: '16px 20px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
                  <span style={{ width: 36, height: 36, flex: '0 0 36px', borderRadius: 10, background: 'rgba(27,28,20,.05)', color: '#5A5C4C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
                  </span>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: INK, letterSpacing: '-.005em' }}>Log out</div>
                    <div style={{ fontSize: 13, color: MUTED_3, marginTop: 1 }}>Sign out of Honne on this device</div>
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B0B2A2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </button>

              {confirmCancel ? (
                <div style={{ background: '#fff', border: '1px solid rgba(180,68,46,.3)', borderRadius: 14, padding: 20, animation: 'setFade .25s ease both' }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: INK, letterSpacing: '-.005em', marginBottom: 5 }}>Cancel your subscription?</div>
                  <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.5, margin: '0 0 16px', letterSpacing: '-.005em' }}>You&rsquo;ll keep Honne Pro until the end of your billing period, then move to the free plan. Your drafts stay yours.</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <button className="set-savebtn" onClick={doCancel} style={{ height: 38, padding: '0 18px', border: 'none', borderRadius: 10, background: DANGER, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Yes, cancel subscription</button>
                    <button className="set-cancelbtn" onClick={dismissCancel} style={{ height: 38, padding: '0 14px', border: '1px solid rgba(27,28,20,.12)', background: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#3A3C30', cursor: 'pointer' }}>Keep my plan</button>
                  </div>
                </div>
              ) : (
                <button className="set-cancelrow" onClick={askCancel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%', textAlign: 'left', background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 14, padding: '16px 20px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
                    <span style={{ width: 36, height: 36, flex: '0 0 36px', borderRadius: 10, background: 'rgba(180,68,46,.09)', color: DANGER, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg>
                    </span>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: DANGER, letterSpacing: '-.005em' }}>Cancel subscription</div>
                      <div style={{ fontSize: 13, color: MUTED_3, marginTop: 1 }}>Honne Pro · renews Aug 24</div>
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B0B2A2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              )}
            </div>
          </section>

        </div>

        {toast && (
          <div style={{ position: 'fixed', left: '50%', bottom: 30, transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'center', gap: 10, background: INK, color: '#F4F2EA', padding: '12px 18px', borderRadius: 12, boxShadow: '0 18px 40px -18px rgba(27,28,20,.6)', animation: 'setToastIn .3s cubic-bezier(.22,1,.36,1) both' }}>
            <Check size={16} color="#7FD9A2" strokeWidth={2.4} />
            <span style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: '-.005em' }}>{toast}</span>
          </div>
        )}
      </main>
    </div>
  );
}
