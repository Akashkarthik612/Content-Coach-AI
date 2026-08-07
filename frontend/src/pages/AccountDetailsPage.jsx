import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { getSessions, deleteSession } from '../api/ai';
import { getProfile, submitOnboarding } from '../api/profile';
import HonneSidebar from '../components/shared/HonneSidebar';

/* ────────────────────────────────────────────────────────────────────────
   Ported from the "Honne Account Details" design (Claude Design project
   ff122375-c3bc-4438-aece-706b0bd557b0, `Honne Account Details.dc.html`).
   The source file was a standalone localStorage-backed mock of the
   onboarding questions; here it's the real edit surface for `user_profile`
   (GET/POST /api/profile, /api/profile/onboarding) — same field set and
   option vocabulary as OnboardingPage.jsx so a value picked during
   onboarding round-trips identically when edited here. `submitOnboarding`
   (POST /onboarding) is a get-or-create + partial merge that never 409s,
   so it doubles as this page's save call whether or not a profile row
   exists yet. Reached from ChatPage's top-right account menu ("Change my
   details"), not from HonneSidebar's own nav — sidebar chrome is included
   for cross-page consistency (same precedent as Settings/Schedule).
   ──────────────────────────────────────────────────────────────────────── */
const BG      = '#F4F2EA';
const INK     = '#1B1C14';
const ACCENT  = '#14663B';
const MUTED   = '#7A7C6C';
const MUTED_2 = '#9FA291';
const MUTED_3 = '#9A9C8C';
const HAIRLINE = 'rgba(27,28,20,.09)';
const FONT = "'Geist', system-ui, sans-serif";
const MONO = "'JetBrains Mono', monospace";

const STYLES = `
@keyframes adRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes adFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes adToastIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { *{ animation-duration:.001ms !important; } }
.ad-backlink { transition: color .18s ease; }
.ad-backlink:hover { color: #14663B; }
`;

// Same keys/options as OnboardingPage.jsx's QUESTIONS — this page edits the
// exact same profile fields, so the vocabulary must stay in sync.
const FIELDS = [
  { key: 'profession', eyebrow: 'About you', title: 'What do you do?', sub: 'Tailors tone, terminology, and examples to your world.', type: 'chips', multi: false,
    options: ['Founder / Owner', 'Marketer', 'Content Creator', 'Executive / Leader', 'Sales', 'Consultant', 'Engineer / Technical', 'Designer', 'Recruiter / HR', 'Student / Job-seeker'] },
  { key: 'industry', eyebrow: 'Your field', title: 'Which industry are you in?', sub: 'Powers industry-specific news, trends, and idea prompts.', type: 'chips', multi: false,
    options: ['SaaS / Tech', 'Finance', 'Healthcare', 'E-commerce / Retail', 'Marketing / Agency', 'Education', 'Real Estate', 'Media / Creative', 'Manufacturing', 'Nonprofit', 'Other'] },
  { key: 'role', eyebrow: 'Context', title: 'Your role, in a sentence', sub: 'Context beyond a job title — what you actually own.', type: 'text',
    placeholder: 'e.g. I lead growth at a B2B SaaS startup, focused on demand gen and founder-led content.' },
  { key: 'audience', eyebrow: 'Who you reach', title: 'Your audience', sub: 'Who should each post speak to?', type: 'text',
    placeholder: 'e.g. Early-stage founders, heads of marketing, and B2B operators on LinkedIn.' },
  { key: 'goals', eyebrow: 'Your goals', title: 'What are you here to achieve?', sub: 'Pick all that apply — prioritizes prompts and features around this.', type: 'chips', multi: true,
    options: ['Build authority', 'Grow my audience', 'Generate leads', 'Drive website traffic', 'Recruit / hire', 'Land a job', 'Support a launch', 'Have fun / experiment'] },
  { key: 'topics', eyebrow: 'What you post about', title: 'Topics that interest you', sub: 'Fuels idea generation and news recommendations.', type: 'chips', multi: true,
    options: ['Leadership', 'Startups', 'Marketing', 'Product', 'AI & Tech', 'Sales', 'Career growth', 'Personal stories', 'Industry news', 'Productivity', 'Culture', 'Finance'] },
  { key: 'style', eyebrow: 'Your voice', title: 'How should your posts sound?', sub: 'Sets the default voice for your drafts.', type: 'chips', multi: false,
    options: ['Professional', 'Conversational', 'Bold & punchy', 'Warm & personal', 'Analytical', 'Witty'] },
];

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

export default function AccountDetailsPage() {
  const navigate = useNavigate();
  const toastTimerRef = useRef(null);

  const [sideOpen, setSideOpen] = useState(true);
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState('');
  const userName = localStorage.getItem('username') || 'there';

  // Sidebar's Recent list — same persisted chat history every other
  // Honne-shell page reads (see SettingsPage.jsx/ChatPage.jsx).
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

  // ---- Profile fields (real: GET /api/profile) ----
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((p) => {
        if (cancelled || !p) return;
        setAnswers({
          profession: p.profession || undefined,
          industry: p.industry || undefined,
          role: p.role || '',
          audience: p.target_audience || '',
          goals: p.goals || [],
          topics: p.topics || [],
          style: p.writing_style || undefined,
        });
      })
      .catch(() => { /* no profile yet, or fetch failed — start from a blank form */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const ans = (key) => answers[key];

  const toggleChip = (key, val, multi) => {
    setAnswers((a) => {
      if (multi) {
        const arr = Array.isArray(a[key]) ? [...a[key]] : [];
        const i = arr.indexOf(val);
        if (i >= 0) arr.splice(i, 1); else arr.push(val);
        return { ...a, [key]: arr };
      }
      return { ...a, [key]: a[key] === val ? undefined : val };
    });
  };
  const setText = (key, val) => setAnswers((a) => ({ ...a, [key]: val }));

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await submitOnboarding({
        profession: answers.profession,
        industry: answers.industry,
        role: answers.role,
        target_audience: answers.audience,
        writing_style: answers.style,
        goals: answers.goals,
        topics: answers.topics,
      });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast(true);
      toastTimerRef.current = setTimeout(() => setToast(false), 2200);
    } catch (err) {
      setSaveError(err.message || 'Could not save your details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const chipBase = { cursor: 'pointer', fontFamily: FONT, fontSize: 13.5, fontWeight: 500, letterSpacing: '-.005em', padding: '9px 15px', borderRadius: 999, whiteSpace: 'nowrap', flex: '0 0 auto', transition: 'all .18s cubic-bezier(.22,1,.36,1)' };

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: BG, color: INK, fontFamily: FONT, display: 'flex' }}>
      <style>{STYLES}</style>

      <HonneSidebar
        open={sideOpen} onToggle={() => setSideOpen(o => !o)}
        chats={chats} activeIndex={-1}
        onSelect={(i) => goToChat(chats[i]?.sessionId)}
        onDelete={handleDeleteChat}
        onNewChat={() => goToChat(null)}
        search={search} onSearch={setSearch} userName={userName} navigate={navigate}
        activeNav="account-details"
      />

      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', position: 'relative' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 40px 90px' }}>

          <button
            className="ad-backlink" onClick={() => navigate('/chat')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: MUTED, letterSpacing: '-.005em', marginBottom: 22, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
          >
            <ArrowLeft size={15} /> Back to chat
          </button>

          <header style={{ marginBottom: 30, animation: 'adRise .5s cubic-bezier(.22,1,.36,1) both' }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: MUTED_2, fontWeight: 500 }}>Account</span>
            <h1 style={{ fontFamily: FONT, fontSize: 32, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-.02em', color: INK, margin: '8px 0 6px' }}>Your details</h1>
            <p style={{ fontSize: 15, color: MUTED, margin: 0, letterSpacing: '-.005em' }}>This is what shapes your tone, topics, and idea prompts. Edit anything, anytime.</p>
          </header>

          {FIELDS.map((f) => (
            <section key={f.key} style={{ marginBottom: 26, animation: 'adRise .5s cubic-bezier(.22,1,.36,1) both' }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: MUTED_2, fontWeight: 500, marginBottom: 12 }}>{f.eyebrow}</div>
              <div style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 16, padding: '20px 22px' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: INK, letterSpacing: '-.005em', marginBottom: 3 }}>{f.title}</div>
                <p style={{ fontSize: 13, color: MUTED_3, margin: '0 0 16px', letterSpacing: '-.005em' }}>{f.sub}</p>

                {f.type === 'chips' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                    {f.options.map((opt) => {
                      const v = ans(f.key);
                      const on = f.multi ? (Array.isArray(v) && v.includes(opt)) : v === opt;
                      const style = on
                        ? { ...chipBase, background: ACCENT, color: BG, border: `1px solid ${ACCENT}`, boxShadow: '0 6px 16px -10px rgba(20,102,59,.8)' }
                        : { ...chipBase, background: '#F7F8F5', color: '#3A3C30', border: '1px solid rgba(27,28,20,.1)' };
                      return (
                        <button key={opt} onClick={() => toggleChip(f.key, opt, f.multi)} style={style}>{opt}</button>
                      );
                    })}
                  </div>
                )}

                {f.type === 'text' && (
                  <textarea
                    value={ans(f.key) || ''}
                    onChange={(e) => setText(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    rows={3}
                    style={{ width: '100%', resize: 'none', background: '#F7F8F5', border: '1px solid rgba(27,28,20,.12)', borderRadius: 12, padding: '13px 15px', fontSize: 14.5, lineHeight: 1.6, color: INK, fontFamily: FONT, boxSizing: 'border-box' }}
                  />
                )}
              </div>
            </section>
          ))}

          {saveError && (
            <div style={{ fontSize: 12.5, color: '#B4442E', marginBottom: 12, letterSpacing: '-.005em' }}>{saveError}</div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <button
              onClick={save} disabled={saving}
              style={{ height: 46, padding: '0 26px', border: 'none', borderRadius: 13, background: ACCENT, color: BG, fontSize: 14.5, fontWeight: 600, letterSpacing: '-.005em', cursor: saving ? 'default' : 'pointer', opacity: saving ? .7 : 1, boxShadow: '0 12px 28px -14px rgba(20,102,59,.7)' }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <span style={{ fontSize: 13, color: MUTED_3 }}>Changes apply to your next draft.</span>
          </div>

        </div>

        {toast && (
          <div style={{ position: 'fixed', left: '50%', bottom: 30, transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'center', gap: 10, background: INK, color: BG, padding: '12px 18px', borderRadius: 12, boxShadow: '0 18px 40px -18px rgba(27,28,20,.6)', animation: 'adToastIn .3s cubic-bezier(.22,1,.36,1) both' }}>
            <Check size={16} color="#7FD9A2" strokeWidth={2.4} />
            <span style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: '-.005em' }}>Saved</span>
          </div>
        )}
      </main>
    </div>
  );
}
