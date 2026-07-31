import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Plus, MoreHorizontal, ExternalLink, CalendarClock, Trash2 } from 'lucide-react';
import { getSessions } from '../api/ai';
import HonneSidebar from '../components/shared/HonneSidebar';

/* ────────────────────────────────────────────────────────────────────────
   Design tokens — ported 1:1 from the "Honne Schedule" design (Claude
   Design project ff122375-c3bc-4438-aece-706b0bd557b0, `Honne Schedule.dc.html`).
   The sidebar chrome intentionally uses ChatPage's cream/green palette via
   the shared HonneSidebar (not this file's own white/grey variant) so
   in-app navigation stays visually consistent between Chat and Schedule —
   the source design ships each page with its own standalone sidebar copy,
   but this app already established the cream sidebar as canonical.
   ──────────────────────────────────────────────────────────────────────── */
const PAGE_BG   = '#FFFFFF';
const INK       = '#1B1C14';
const ACCENT    = '#14663B';
const MUTED     = '#7A7C6C';
const MUTED_2   = '#8A8C7C';
const MUTED_3   = '#9FA291';
const MUTED_4   = '#A6A895';
const MUTED_5   = '#9A9C8C';
const MUTED_6   = '#B0B2A2';
const HAIRLINE  = 'rgba(27,28,20,.08)';
const FLAME     = '#F97316';
const DANGER    = '#B23B3B';
const FONT = "'Geist', system-ui, sans-serif";
const MONO = "'JetBrains Mono', monospace";

const STYLES = `
@keyframes schRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes schMonth { from { opacity: 0; transform: translateY(6px) scale(.995); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes schPop { 0% { transform: scale(.4); opacity: .3; } 60% { transform: scale(1.18); } 100% { transform: scale(1); opacity: 1; } }
@keyframes schFlame { 0%,100% { transform: scale(1) rotate(-1.5deg); opacity: 1; } 20% { transform: scale(1.06,1.14) rotate(1.5deg); } 40% { transform: scale(.95,1.06) rotate(-1deg); opacity: .9; } 60% { transform: scale(1.09,1.17) rotate(1deg); } 80% { transform: scale(.97,1.04) rotate(-1.5deg); } }
@keyframes schGlow { 0%,100% { opacity:.45; transform:scale(1); } 50% { opacity:.85; transform:scale(1.22); } }
@media (prefers-reduced-motion: reduce) { *{ animation-duration: .001ms !important; } }
.sch-navbtn { transition: background .18s ease, color .18s ease; }
.sch-navbtn:hover { background: rgba(27,28,20,.06); color: #14663B; }
.sch-todaybtn { transition: border-color .18s ease, color .18s ease; }
.sch-todaybtn:hover { border-color: rgba(20,102,59,.45); color: #14663B; }
.sch-daycell:not(.sch-out):not(.sch-sel):hover { background: rgba(27,28,20,.04) !important; }
.sch-closebtn { transition: background .18s ease, color .18s ease; }
.sch-closebtn:hover { background: rgba(27,28,20,.06); color: #1B1C14; }
.sch-plan { transition: transform .2s cubic-bezier(.22,1,.36,1); }
.sch-plan:hover { transform: translateY(-1px); }
.sch-plan:active { transform: scale(.97); }
.sch-kebab { transition: background .18s ease, color .18s ease; }
.sch-kebab:hover { background: rgba(27,28,20,.06); color: #1B1C14; }
.sch-menuitem { transition: background .16s ease; }
.sch-menuitem:hover { background: rgba(27,28,20,.05); }
.sch-detailcard { transition: border-color .2s ease, transform .2s cubic-bezier(.22,1,.36,1); }
.sch-detailcard:hover { border-color: rgba(20,102,59,.3); transform: translateY(-1px); }
.sch-ctabtn { transition: transform .2s cubic-bezier(.22,1,.36,1); }
.sch-ctabtn:hover { transform: translateY(-1px); }
.sch-ctabtn:active { transform: scale(.98); }
`;

const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MON3 = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const WD3 = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const WEEKDAYS_MON_FIRST = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// Presentational only — there is no backend endpoint yet for listing/creating
// scheduled posts by date (post.scheduled_at exists but nothing reads a
// date-range calendar view from it), so this page mocks its own local
// schedule state the same way the source design did, seeded around the
// real current date instead of the design's hardcoded test date.
const TITLES = [
  "The future of AI isn't about replacing people",
  'What I learned building in public for 90 days',
  '3 mistakes I made scaling my first team',
  'Why I stopped chasing viral',
  'The quiet advantage of writing every day',
  'How consistency compounds your reputation',
  'A contrarian take on remote work',
  'The one metric I wish I tracked sooner',
  "What nobody tells you about personal brand",
  'Small bets beat big launches',
];
const PLATS = ['LinkedIn', 'X Thread', 'Reddit'];
const TIMES = ['09:00', '08:30', '12:00', '07:45', '17:30'];
const STREAK_WEEKS = 12; // presentational default, mirrors the source design's own prop default

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

function keyOf(y, m, d) { return `${y}-${m}-${d}`; }

function channelColor(ch) {
  return { LinkedIn: '#0A66C2', 'X Thread': '#1B1C14', Reddit: '#D93A00' }[ch] || MUTED;
}
function channelPath(ch) {
  const map = {
    LinkedIn: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    'X Thread': 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
    Reddit: 'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z',
  };
  return map[ch] || map.LinkedIn;
}
function statusStyle(status) {
  if (status === 'Published') return { color: '#7A7C6C', bg: 'rgba(27,28,20,.06)' };
  if (status === 'Draft') return { color: '#9A7B14', bg: 'rgba(154,123,20,.12)' };
  return { color: ACCENT, bg: 'rgba(20,102,59,.1)' };
}

function FlameIcon({ size = 20, dim = false }) {
  return (
    <svg width={size} height={size * 1.13} viewBox="0 0 24 24">
      <path fill={dim ? 'rgba(249,115,22,.45)' : FLAME} d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
    </svg>
  );
}

export default function SchedulePage() {
  const navigate = useNavigate();
  const userName = localStorage.getItem('username') || 'there';

  const [sideOpen, setSideOpen] = useState(true);
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState('');

  // Sidebar's Recent list is the same persisted (7-day TTL) chat history
  // ChatPage's sidebar reads — kept independently here since this page has
  // no active chat/message state of its own to select into.
  useEffect(() => {
    getSessions()
      .then(({ sessions = [] }) => {
        setChats(sessions.map(s => ({ id: nextId(), sessionId: s.session_id, title: s.title, time: relativeTimeAgo(s.last_active_at) })));
      })
      .catch(() => { /* sidebar history unavailable — show an empty list */ });
  }, []);

  const goToChat = (sessionId) => {
    if (sessionId) localStorage.setItem('lastSessionId', sessionId);
    else localStorage.removeItem('lastSessionId');
    navigate('/chat');
  };

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const monday = useMemo(() => {
    const dow = (today.getDay() + 6) % 7; // Mon = 0
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow);
  }, [today]);
  const offsetDate = useCallback((n) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + n), [monday]);

  const [posts, setPosts] = useState(() => {
    const seeded = [];
    let pi = 0;
    const push = (dt, status) => {
      seeded.push({
        id: `p${seeded.length}`, y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(),
        key: keyOf(dt.getFullYear(), dt.getMonth(), dt.getDate()),
        time: TIMES[pi % TIMES.length], platform: PLATS[pi % PLATS.length], title: TITLES[pi % TITLES.length], status,
      });
      pi++;
    };
    const dow = (today.getDay() + 6) % 7;
    const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow);
    const off = (n) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + n);
    [0, 2, 4].forEach((o) => push(off(-7 + o), 'Published'));
    [0, 1, 2, 3].forEach((o) => { const dt = off(o); push(dt, dt < today ? 'Published' : 'Scheduled'); });
    [7, 9, 11].forEach((o) => push(off(o), 'Scheduled'));
    return seeded;
  });

  const [cal, setCal] = useState({ year: today.getFullYear(), month: today.getMonth(), seq: 0 });
  const [selKey, setSelKey] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [justDone, setJustDone] = useState(false);

  const prevMonth = () => { setCal(s => { let m = s.month - 1, y = s.year; if (m < 0) { m = 11; y--; } return { year: y, month: m, seq: s.seq + 1 }; }); setSelKey(null); };
  const nextMonth = () => { setCal(s => { let m = s.month + 1, y = s.year; if (m > 11) { m = 0; y++; } return { year: y, month: m, seq: s.seq + 1 }; }); setSelKey(null); };
  const jumpToday = () => setCal(s => ({ year: today.getFullYear(), month: today.getMonth(), seq: s.seq + 1 }));
  const selectDay = (k) => { setSelKey(prev => (prev === k ? null : k)); setMenuId(null); };

  const weekCount = useCallback((list) => {
    let n = 0;
    for (let o = 0; o < 5; o++) {
      const dt = offsetDate(o);
      if (list.some(p => p.key === keyOf(dt.getFullYear(), dt.getMonth(), dt.getDate()))) n++;
    }
    return n;
  }, [offsetDate]);

  const addOn = useCallback((y, m, d) => {
    setPosts(prev => {
      const i = prev.length;
      const post = {
        id: `u${Date.now()}${i}`, y, m, d, key: keyOf(y, m, d),
        time: TIMES[i % TIMES.length], platform: PLATS[i % PLATS.length], title: TITLES[i % TITLES.length], status: 'Scheduled',
      };
      const next = [...prev, post];
      if (weekCount(next) >= 5) { setJustDone(true); setTimeout(() => setJustDone(false), 1400); }
      return next;
    });
    setMenuId(null);
  }, [weekCount]);

  const removePost = useCallback((id) => {
    setPosts(prev => prev.filter(p => p.id !== id));
    setMenuId(null);
  }, []);

  const fillWeek = useCallback(() => {
    for (let o = 0; o < 5; o++) {
      const dt = offsetDate(o);
      const k = keyOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
      if (!posts.some(p => p.key === k)) { addOn(dt.getFullYear(), dt.getMonth(), dt.getDate()); return; }
    }
  }, [offsetDate, posts, addOn]);

  const weeks = useMemo(() => {
    const year = cal.year, month = cal.month;
    const first = new Date(year, month, 1);
    const startDow = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push({ y: month === 0 ? year - 1 : year, m: (month + 11) % 12, d: prevDays - startDow + 1 + i, out: true });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ y: year, m: month, d, out: false });
    while (cells.length % 7 !== 0) {
      const d = cells.length - (startDow + daysInMonth) + 1;
      cells.push({ y: month === 11 ? year + 1 : year, m: (month + 1) % 12, d, out: true });
    }
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cal.year, cal.month]);

  const dayVals = useCallback((c) => {
    const k = keyOf(c.y, c.m, c.d);
    const isToday = !c.out && c.y === today.getFullYear() && c.m === today.getMonth() && c.d === today.getDate();
    const isSel = selKey === k;
    const dayPosts = c.out ? [] : posts.filter(p => p.key === k);
    const hasPosts = dayPosts.length > 0;
    const anySched = dayPosts.some(p => p.status !== 'Published');
    return { ...c, key: k, isToday, isSel, hasPosts, anySched };
  }, [posts, selKey, today]);

  const detail = useMemo(() => {
    if (!selKey) return null;
    const [py, pm, pd] = selKey.split('-').map(Number);
    const selDate = new Date(py, pm, pd);
    const label = `${WD3[selDate.getDay()]} · ${MON3[pm]} ${pd}`;
    const dayPosts = posts.filter(p => p.key === selKey).sort((a, b) => a.time.localeCompare(b.time));
    return { selDate, label, dayPosts };
  }, [selKey, posts]);

  const progressDone = weekCount(posts);
  const progressTarget = 5;
  const allPublished = useMemo(() => {
    if (progressDone === 0) return false;
    for (let o = 0; o < 5; o++) {
      const dt = offsetDate(o);
      const p = posts.find(x => x.key === keyOf(dt.getFullYear(), dt.getMonth(), dt.getDate()));
      if (p && p.status !== 'Published') return false;
    }
    return true;
  }, [posts, offsetDate, progressDone]);

  const momentumMsg = allPublished ? 'You showed up this week. Now keep the momentum going.'
    : progressDone === 0 ? 'Your week is open. Let’s fill it with ideas worth sharing.'
    : progressDone <= 2 ? 'You’re off to a good start. Keep building your rhythm.'
    : progressDone === 3 ? 'Your rhythm is taking shape. Two more to lock the week.'
    : progressDone === 4 ? 'One more post and your week is complete.'
    : 'Your week is covered. Your future self will thank you.';

  const history = useMemo(() => {
    const hn = Math.min(12, STREAK_WEEKS);
    return Array.from({ length: hn }, (_, i) => {
      const last = i === hn - 1;
      const h = 40 + ((i * 37) % 55);
      return { h: `${h}%`, bg: last ? ACCENT : 'rgba(20,102,59,.28)' };
    });
  }, []);

  const cta = useMemo(() => {
    if (allPublished || progressDone >= 5) return { title: 'Your week is covered.', sub: 'Keep the momentum going.', btn: 'Plan next week', action: () => {}, completed: true };
    if (progressDone === 4) return { title: 'One more post to complete your week.', sub: 'You’re almost there — Friday is still open.', btn: 'Create one more', action: fillWeek, completed: false };
    if (progressDone >= 1) { const left = 5 - progressDone; return { title: 'You’re off to a good start.', sub: `${left} more posts will complete your week.`, btn: `Create the next ${left}`, action: fillWeek, completed: false }; }
    return { title: 'Your week is waiting.', sub: 'Let’s fill it with ideas worth sharing.', btn: 'Plan my week', action: fillWeek, completed: false };
  }, [allPublished, progressDone, fillWeek]);

  const thisWeekRows = useMemo(() => {
    const rows = [];
    for (let o = 0; o < 5; o++) {
      const dt = offsetDate(o);
      const k = keyOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
      const p = posts.find(x => x.key === k);
      rows.push({ dt, k, p, isTodayRow: dt.getTime() === today.getTime() });
    }
    return rows;
  }, [offsetDate, posts, today]);

  const nextWeekRows = useMemo(() => {
    const start = offsetDate(7), end = offsetDate(13);
    return posts.filter(p => { const d = new Date(p.y, p.m, p.d); return d >= start && d <= end; })
      .sort((a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d));
  }, [offsetDate, posts]);

  const upcomingCount = useMemo(() => posts.filter(p => new Date(p.y, p.m, p.d) >= today).length, [posts, today]);

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: PAGE_BG, color: INK, fontFamily: FONT, display: 'flex' }}>
      <style>{STYLES}</style>

      <HonneSidebar
        open={sideOpen} onToggle={() => setSideOpen(o => !o)}
        chats={chats} activeIndex={-1}
        onSelect={(i) => goToChat(chats[i]?.sessionId)}
        onDelete={(i) => setChats(prev => prev.filter((_, idx) => idx !== i))}
        onNewChat={() => goToChat(null)}
        search={search} onSearch={setSearch} userName={userName} navigate={navigate}
        activeNav="scheduled"
      />

      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', position: 'relative' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '38px 40px 64px' }}>

          <header style={{ marginBottom: 26, animation: 'schRise .5s cubic-bezier(.22,1,.36,1) both' }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>Publishing</span>
            <h1 style={{ fontFamily: FONT, fontSize: 32, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-.02em', color: INK, margin: '8px 0 6px' }}>Schedule</h1>
            <p style={{ fontSize: 15, color: MUTED, margin: 0, letterSpacing: '-.005em' }}>Your ideas, planned for the week ahead.</p>
          </header>

          <section style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 20, alignItems: 'start', marginBottom: 34 }}>

            {/* CALENDAR */}
            <div style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 18, boxShadow: '0 1px 3px rgba(27,28,20,.05)', overflow: 'hidden', animation: 'schRise .55s cubic-bezier(.22,1,.36,1) both .04s' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <span style={{ fontFamily: FONT, fontSize: 19, fontWeight: 600, letterSpacing: '-.01em', color: INK }}>{MON[cal.month]}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '.04em', color: MUTED_4 }}>{cal.year}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button className="sch-navbtn" onClick={prevMonth} title="Previous month" style={{ width: 30, height: 30, border: 'none', background: 'none', borderRadius: 8, color: MUTED, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronLeft size={17} strokeWidth={2.1} />
                  </button>
                  <button className="sch-todaybtn" onClick={jumpToday} title="Jump to today" style={{ height: 30, padding: '0 11px', border: `1px solid ${HAIRLINE}`, background: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#5A5C4C', cursor: 'pointer' }}>Today</button>
                  <button className="sch-navbtn" onClick={nextMonth} title="Next month" style={{ width: 30, height: 30, border: 'none', background: 'none', borderRadius: 8, color: MUTED, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronRight size={17} strokeWidth={2.1} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 12px 6px' }}>
                {WEEKDAYS_MON_FIRST.map(w => (
                  <div key={w} style={{ textAlign: 'center', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED_6, fontWeight: 500, padding: '4px 0' }}>{w}</div>
                ))}
              </div>

              <div key={`g${cal.seq}`} style={{ padding: '2px 12px 16px', animation: 'schMonth .34s cubic-bezier(.22,1,.36,1) both' }}>
                {weeks.map((wk, wi) => (
                  <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                    {wk.map((c) => {
                      const d = dayVals(c);
                      let numBg = 'transparent', numColor = c.out ? '#C8CABA' : '#3A3C30', numWeight = c.out ? 400 : 500, numRing = 'none';
                      if (d.isSel) { numBg = ACCENT; numColor = '#F4F2EA'; numWeight = 600; }
                      else if (d.isToday) { numBg = 'rgba(20,102,59,.12)'; numColor = ACCENT; numWeight = 600; numRing = 'inset 0 0 0 1.5px rgba(20,102,59,.4)'; }
                      return (
                        <button
                          key={d.key}
                          className={`sch-daycell${c.out ? ' sch-out' : ''}${d.isSel ? ' sch-sel' : ''}`}
                          onClick={c.out ? undefined : () => selectDay(d.key)}
                          style={{
                            position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                            padding: '7px 0 8px', border: 'none', background: d.isSel ? 'rgba(20,102,59,.06)' : 'transparent',
                            borderRadius: 11, cursor: c.out ? 'default' : 'pointer',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 999, fontSize: 13, fontWeight: numWeight, background: numBg, color: numColor, boxShadow: numRing, transition: 'background .2s ease, color .2s ease' }}>{c.d}</span>
                          <span style={{ height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {d.hasPosts && <FlameIcon size={11} dim={!d.anySched} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateRows: selKey ? '1fr' : '0fr', transition: 'grid-template-rows .42s cubic-bezier(.22,1,.36,1)' }}>
                <div style={{ overflow: 'hidden', minHeight: 0 }}>
                  <div style={{ borderTop: `1px solid ${HAIRLINE}`, padding: '16px 20px 18px', background: '#F5F8F4' }}>
                    {detail && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>{detail.label}</span>
                          <button className="sch-closebtn" onClick={() => setSelKey(null)} title="Close" style={{ width: 24, height: 24, border: 'none', background: 'none', borderRadius: 7, color: MUTED_4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={13} strokeWidth={2.3} />
                          </button>
                        </div>
                        {detail.dayPosts.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                            {detail.dayPosts.map(p => {
                              const s = statusStyle(p.status);
                              return (
                                <div key={p.id} className="sch-detailcard" style={{ display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: '11px 13px' }}>
                                  <span style={{ fontFamily: MONO, fontSize: 12, color: ACCENT, fontWeight: 500, flex: '0 0 auto' }}>{p.time}</span>
                                  <span style={{ width: 1, height: 24, background: HAIRLINE, flex: '0 0 auto' }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', marginBottom: 4 }}>
                                      <svg width={15} height={15} viewBox="0 0 24 24"><path fill={channelColor(p.platform)} d={channelPath(p.platform)} /></svg>
                                    </span>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: INK, letterSpacing: '-.005em', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                                  </div>
                                  <span style={{ flex: '0 0 auto', fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, color: s.color, background: s.bg, borderRadius: 999, padding: '4px 9px' }}>{p.status}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fff', border: '1px dashed rgba(27,28,20,.16)', borderRadius: 12, padding: '14px 15px' }}>
                            <span style={{ fontSize: 13.5, color: MUTED_5, letterSpacing: '-.005em' }}>Nothing scheduled this day.</span>
                            <button className="sch-plan" onClick={() => detail.selDate && addOn(detail.selDate.getFullYear(), detail.selDate.getMonth(), detail.selDate.getDate())} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 13px', border: 'none', borderRadius: 9, background: ACCENT, color: '#F4F2EA', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                              <Plus size={13} strokeWidth={2.3} />Plan this day
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* MOMENTUM */}
            <div style={{ background: '#F1F7F1', border: '1px solid rgba(20,102,59,.14)', borderRadius: 18, padding: '22px 22px 20px', animation: 'schRise .55s cubic-bezier(.22,1,.36,1) both .1s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 18 }}>
                <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, flex: '0 0 38px', borderRadius: 11, background: '#fff', border: '1px solid rgba(20,102,59,.14)' }}>
                  <span style={{ position: 'absolute', width: 22, height: 22, borderRadius: 999, background: 'radial-gradient(circle,rgba(249,115,22,.45),transparent 70%)', animation: 'schGlow 1.6s ease-in-out infinite' }} />
                  <span style={{ position: 'relative', transformOrigin: '50% 80%', animation: 'schFlame 1.3s ease-in-out infinite', display: 'flex' }}><FlameIcon size={20} /></span>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT, fontSize: 19, fontWeight: 600, letterSpacing: '-.01em', color: INK, lineHeight: 1.1 }}>{STREAK_WEEKS}-week streak</div>
                  <div style={{ fontSize: 12.5, color: MUTED_2, marginTop: 2, letterSpacing: '-.005em' }}>You&rsquo;ve shown up consistently for {STREAK_WEEKS} weeks.</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 34, marginBottom: 20 }}>
                {history.map((h, i) => (
                  <span key={i} style={{ flex: 1, height: h.h, borderRadius: 3, background: h.bg }} />
                ))}
              </div>

              <div style={{ height: 1, background: HAIRLINE, marginBottom: 18 }} />

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 13 }}>
                <span style={{ fontSize: 13.5, color: '#5A5C4C', fontWeight: 500, letterSpacing: '-.005em' }}>This week</span>
                <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: INK }}><span style={{ color: ACCENT }}>{progressDone}</span> / {progressTarget} scheduled</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                {Array.from({ length: 5 }, (_, i) => {
                  if (i === progressDone) {
                    return (
                      <span key={i} style={{ position: 'relative', width: 19, height: 19, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ position: 'absolute', width: 24, height: 24, borderRadius: 999, background: 'radial-gradient(circle,rgba(249,115,22,.4),transparent 70%)', animation: 'schGlow 1.5s ease-in-out infinite' }} />
                        <span style={{ position: 'relative', transformOrigin: '50% 80%', animation: 'schFlame 1.2s ease-in-out infinite', display: 'flex' }}><FlameIcon size={17} /></span>
                      </span>
                    );
                  }
                  const filled = i < progressDone;
                  return (
                    <span key={i} style={{
                      width: 19, height: 19, borderRadius: 999,
                      background: filled ? ACCENT : 'rgba(20,102,59,.1)',
                      border: filled ? 'none' : '1.5px solid rgba(20,102,59,.25)',
                      boxShadow: filled ? 'inset 0 -2px 3px rgba(0,0,0,.16), 0 1px 2px rgba(20,102,59,.45)' : 'none',
                      animation: filled && justDone ? `schPop .5s cubic-bezier(.22,1,.36,1) both ${(i * 0.06).toFixed(2)}s` : 'none',
                    }} />
                  );
                })}
              </div>

              <div style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 13, padding: '14px 15px', animation: (justDone && progressDone >= 5) ? 'schPop .9s ease-out both' : 'none' }}>
                <p style={{ fontFamily: FONT, fontSize: 14.5, lineHeight: 1.5, color: '#26281C', margin: 0, letterSpacing: '-.005em' }}>{momentumMsg}</p>
              </div>

              <p style={{ fontSize: 12.5, color: MUTED_5, margin: '15px 0 0', lineHeight: 1.5, letterSpacing: '-.005em' }}>You&rsquo;re building a presence that compounds.</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 15, padding: '13px 14px', background: 'rgba(20,102,59,.08)', borderRadius: 12 }}>
                <span style={{ flex: '0 0 16px', marginTop: 1, transformOrigin: '50% 80%', animation: 'schFlame 1.4s ease-in-out infinite', display: 'flex' }}><FlameIcon size={16} /></span>
                <p style={{ fontSize: 13, lineHeight: 1.55, color: '#2C4A38', margin: 0, fontWeight: 500, letterSpacing: '-.005em' }}>
                  Post at least <span style={{ color: ACCENT, fontWeight: 600 }}>5 days a week</span> and you&rsquo;ll stand apart from 95% of the crowd — opening opportunities you could only ever imagine.
                </p>
              </div>
            </div>
          </section>

          {/* UPCOMING RUNWAY */}
          <section style={{ animation: 'schRise .55s cubic-bezier(.22,1,.36,1) both .16s' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
              <div>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>Content runway</span>
                <h2 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 600, letterSpacing: '-.015em', color: INK, margin: '6px 0 0' }}>Upcoming</h2>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>{upcomingCount} upcoming</span>
            </div>

            <div style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 18, padding: '8px 20px', boxShadow: '0 1px 3px rgba(27,28,20,.05)', marginBottom: 16 }}>
              <div style={{ padding: '14px 0 10px' }}><span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: ACCENT, fontWeight: 500 }}>This week</span></div>
              {thisWeekRows.map((r) => {
                const s = r.p ? statusStyle(r.p.status) : null;
                return (
                  <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0', borderTop: `1px solid ${HAIRLINE}` }}>
                    <div style={{ flex: '0 0 58px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, color: r.isTodayRow ? ACCENT : MUTED }}>{WD3[r.dt.getDay()]}</span>
                      <span style={{ fontSize: 11.5, color: MUTED_4 }}>{MON3[r.dt.getMonth()]} {r.dt.getDate()}</span>
                    </div>
                    <span style={{ flex: '0 0 auto', width: 11, height: 11, borderRadius: 999, background: r.p ? (r.p.status === 'Published' ? 'transparent' : ACCENT) : 'transparent', border: r.p ? (r.p.status === 'Published' ? `2px solid ${ACCENT}` : 'none') : '2px solid rgba(27,28,20,.16)' }} />
                    {r.p ? (
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 13 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 500, color: INK, letterSpacing: '-.005em', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.p.title}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}><svg width={15} height={15} viewBox="0 0 24 24"><path fill={channelColor(r.p.platform)} d={channelPath(r.p.platform)} /></svg></span>
                            <span style={{ width: 3, height: 3, borderRadius: 999, background: '#CBCDBB' }} />
                            <span style={{ fontSize: 11.5, color: MUTED_5 }}>{r.p.time}</span>
                          </div>
                        </div>
                        <span style={{ flex: '0 0 auto', fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, color: s.color, background: s.bg, borderRadius: 999, padding: '5px 10px' }}>{r.p.status}</span>
                        <div style={{ position: 'relative', flex: '0 0 auto' }}>
                          <button className="sch-kebab" onClick={() => setMenuId(id => (id === r.p.id ? null : r.p.id))} title="More" style={{ width: 30, height: 30, border: 'none', background: 'none', borderRadius: 8, color: MUTED_4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MoreHorizontal size={17} />
                          </button>
                          {menuId === r.p.id && (
                            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 170, background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 12, boxShadow: '0 22px 48px -24px rgba(27,28,20,.45)', padding: 5, zIndex: 20 }}>
                              <button className="sch-menuitem" onClick={() => setMenuId(null)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#3A3C30', cursor: 'pointer' }}>
                                <ExternalLink size={14} />Open in editor
                              </button>
                              <button className="sch-menuitem" onClick={() => setMenuId(null)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#3A3C30', cursor: 'pointer' }}>
                                <CalendarClock size={14} />Reschedule
                              </button>
                              <button className="sch-menuitem" onClick={() => removePost(r.p.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, color: DANGER, cursor: 'pointer' }}>
                                <Trash2 size={14} />Cancel post
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => addOn(r.dt.getFullYear(), r.dt.getMonth(), r.dt.getDate())} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
                        <span style={{ fontSize: 14, color: MUTED_6, letterSpacing: '-.005em', fontStyle: 'italic' }}>Open — nothing planned yet</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: ACCENT }}><Plus size={14} strokeWidth={2.2} />Plan</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {nextWeekRows.length > 0 && (
              <div style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 18, padding: '8px 20px', boxShadow: '0 1px 3px rgba(27,28,20,.05)' }}>
                <div style={{ padding: '14px 0 10px' }}><span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>Next week</span></div>
                {nextWeekRows.map((p) => {
                  const dt = new Date(p.y, p.m, p.d);
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0', borderTop: `1px solid ${HAIRLINE}` }}>
                      <div style={{ flex: '0 0 58px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, color: MUTED }}>{WD3[dt.getDay()]}</span>
                        <span style={{ fontSize: 11.5, color: MUTED_4 }}>{MON3[p.m]} {p.d}</span>
                      </div>
                      <span style={{ flex: '0 0 auto', width: 11, height: 11, borderRadius: 999, background: 'transparent', border: '2px solid rgba(20,102,59,.5)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 500, color: INK, letterSpacing: '-.005em', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center' }}><svg width={15} height={15} viewBox="0 0 24 24"><path fill={channelColor(p.platform)} d={channelPath(p.platform)} /></svg></span>
                          <span style={{ width: 3, height: 3, borderRadius: 999, background: '#CBCDBB' }} />
                          <span style={{ fontSize: 11.5, color: MUTED_5 }}>{p.time}</span>
                        </div>
                      </div>
                      <span style={{ flex: '0 0 auto', fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, color: ACCENT, background: 'rgba(20,102,59,.1)', borderRadius: 999, padding: '5px 10px' }}>Scheduled</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* NEXT ACTION */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', background: cta.completed ? 'rgba(20,102,59,.08)' : '#fff', border: `1px solid ${cta.completed ? 'rgba(20,102,59,.3)' : HAIRLINE}`, borderRadius: 18, padding: '22px 24px', marginTop: 20 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 600, letterSpacing: '-.012em', color: INK, marginBottom: 4 }}>{cta.title}</div>
                <div style={{ fontSize: 14, color: MUTED, letterSpacing: '-.005em' }}>{cta.sub}</div>
              </div>
              <button className="sch-ctabtn" onClick={cta.action} style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 9, height: 46, padding: '0 22px', border: 'none', borderRadius: 12, background: ACCENT, color: '#F4F2EA', fontFamily: FONT, fontSize: 14, fontWeight: 600, letterSpacing: '-.005em', cursor: 'pointer', boxShadow: '0 12px 26px -14px rgba(20,102,59,.7)' }}>
                {cta.btn}
                <ChevronRight size={16} strokeWidth={2.2} />
              </button>
            </div>
          </section>

        </div>

        {menuId != null && (
          <div onClick={() => setMenuId(null)} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />
        )}
      </main>
    </div>
  );
}
