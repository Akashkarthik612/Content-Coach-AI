import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, X, Plus, MoreHorizontal, ExternalLink, CalendarClock, Trash2 } from 'lucide-react';
import { getSessions, deleteSession } from '../api/ai';
import { getCalendarPosts, getPost, getWeeklyHistory, updatePostStatus } from '../api/vault';
import { getProfile, updateWeeklyTarget } from '../api/profile';
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
@keyframes schRing { 0% { box-shadow: 0 0 0 0 rgba(20,102,59,.35); } 100% { box-shadow: 0 0 0 16px rgba(20,102,59,0); } }
@media (prefers-reduced-motion: reduce) { *{ animation-duration: .001ms !important; } }
.sch-navbtn { transition: background .18s ease, color .18s ease; }
.sch-navbtn:hover { background: rgba(27,28,20,.06); color: #14663B; }
.sch-todaybtn { transition: border-color .18s ease, color .18s ease; }
.sch-todaybtn:hover { border-color: rgba(20,102,59,.45); color: #14663B; }
.sch-targetbtn { transition: border-color .2s ease, transform .18s cubic-bezier(.22,1,.36,1); }
.sch-targetbtn:hover { border-color: rgba(20,102,59,.5); }
.sch-targetbtn:active { transform: scale(.97); }
.sch-chip { transition: transform .16s cubic-bezier(.22,1,.36,1); }
.sch-chip:active { transform: scale(.9); }
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

const STREAK_WEEKS = 12; // presentational default, mirrors the source design's own prop default

// Backend platform values are lowercase free text (only 'linkedin' is a real,
// working integration today); the icon/color maps below key off the same
// display labels the source design used.
function platformLabel(platform) {
  return { linkedin: 'LinkedIn', x: 'X Thread', reddit: 'Reddit' }[platform] || 'LinkedIn';
}
// Backend PostStatus values are lowercase ('scheduled'/'published'/'failed'/...);
// the rest of this page's rendering (statusStyle, detail cards, runway rows)
// was ported from the source design using capitalized display strings.
function statusLabel(status) {
  return { scheduled: 'Scheduled', published: 'Published', failed: 'Failed', draft: 'Draft' }[status] || 'Scheduled';
}

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
  if (status === 'Failed') return { color: DANGER, bg: 'rgba(178,59,59,.1)' };
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

  // Real deletion (DELETE /api/ai/sessions/{id}) — see the same handler's
  // comment in ChatPage.jsx. Optimistic removal, reverted if the server call fails.
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

  // Chat's "Schedule" button hands off a just-approved draft via ?postId=;
  // while present, picking a calendar day here schedules THAT specific post
  // rather than the normal "plan a new post" flow (which routes into chat).
  const [searchParams, setSearchParams] = useSearchParams();
  const schedulingPostId = searchParams.get('postId');
  const [schedulingPost, setSchedulingPost] = useState(null);
  const [pickTime, setPickTime] = useState('09:00');
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    if (!schedulingPostId) return;
    getPost(schedulingPostId).then(setSchedulingPost).catch(() => {});
  }, [schedulingPostId]);

  // Gate on both the query param AND a matching fetched post — avoids ever
  // flashing a stale previous post's title if postId changes before its
  // fetch resolves.
  const showScheduling = !!(schedulingPostId && schedulingPost && schedulingPost.id === schedulingPostId);

  const cancelScheduling = useCallback(() => {
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('postId'); return next; }, { replace: true });
  }, [setSearchParams]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const monday = useMemo(() => {
    const dow = (today.getDay() + 6) % 7; // Mon = 0
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow);
  }, [today]);
  const offsetDate = useCallback((n) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + n), [monday]);

  const [posts, setPosts] = useState([]);
  const [weeklyHistory, setWeeklyHistory] = useState([]);

  const [cal, setCal] = useState({ year: today.getFullYear(), month: today.getMonth(), seq: 0 });

  // Calendar range widened past the visible month so the content-runway rail
  // (anchored to *today*, independent of which month is on screen) always
  // has data — matches Phase 1 of the schedule/publish plan.
  const rangeStart = useMemo(() => {
    const monthStart = new Date(cal.year, cal.month, 1);
    const bufferStart = offsetDate(-7);
    return monthStart < bufferStart ? monthStart : bufferStart;
  }, [cal.year, cal.month, offsetDate]);
  const rangeEnd = useMemo(() => {
    const monthEnd = new Date(cal.year, cal.month + 1, 0, 23, 59, 59);
    const bufferEnd = offsetDate(13);
    return monthEnd > bufferEnd ? monthEnd : bufferEnd;
  }, [cal.year, cal.month, offsetDate]);

  const refetchCalendar = useCallback(() => {
    getCalendarPosts(rangeStart.toISOString(), rangeEnd.toISOString())
      .then(items => setPosts(items.map(item => {
        const dt = new Date(item.effective_at);
        return {
          // postId is the real vault post id (used for actions like cancel/reschedule);
          // id is unique per calendar entry — a post published on more than one
          // real day would otherwise collide as a React list key.
          id: `${item.id}-${dt.getTime()}`, postId: item.id,
          y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(),
          key: keyOf(dt.getFullYear(), dt.getMonth(), dt.getDate()),
          time: dt.toTimeString().slice(0, 5),
          platform: platformLabel(item.platform),
          title: item.title,
          status: statusLabel(item.status),
        };
      })))
      .catch(() => { /* calendar unavailable — leave the grid empty rather than fake data */ });
    // This week's history bar depends on the same scheduled/published data
    // the calendar just refreshed, so refetch it alongside — cheap, and
    // keeps the momentum panel in sync with every schedule/cancel action.
    getWeeklyHistory(12).then(setWeeklyHistory).catch(() => {});
  }, [rangeStart, rangeEnd]);

  useEffect(() => { refetchCalendar(); }, [refetchCalendar]);
  const [selKey, setSelKey] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [justDone, setJustDone] = useState(false);
  const [weekTarget, setWeekTarget] = useState(4);
  const [targetOpen, setTargetOpen] = useState(false);

  // Load the persisted weekly-posts target once on mount (falls back to the
  // default of 4 for a user who's never set one / hasn't onboarded yet).
  useEffect(() => {
    getProfile()
      .then(profile => { if (profile?.weekly_post_target) setWeekTarget(profile.weekly_post_target); })
      .catch(() => {});
  }, []);

  const setTarget = useCallback((n) => {
    setWeekTarget(n);
    setJustDone(true);
    setTimeout(() => setJustDone(false), 900);
    updateWeeklyTarget(n).catch(() => {});
  }, []);

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

  // Planning a day means drafting real content — chat is the app's one
  // content-creation entry point (see writer_node/human_approval_node), so
  // "Plan this day"/"Plan"/the runway CTA all hand off to a new chat rather
  // than fabricating a fake post. Scheduling an *existing* draft for a
  // specific day/time is the postId-driven flow below, reached via chat's
  // own "Schedule" button.
  const addOn = useCallback(() => { goToChat(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fillWeek = useCallback(() => { goToChat(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cancelling a scheduled/failed post reverts it to draft (keeps the post
  // in the vault, just off the calendar) — reuses the existing status
  // endpoint, no new backend call needed.
  const removePost = useCallback((postId) => {
    setMenuId(null);
    updatePostStatus(postId, 'draft').then(refetchCalendar).catch(() => {});
  }, [refetchCalendar]);

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

  const confirmSchedule = useCallback(() => {
    if (!schedulingPostId || !detail?.selDate) return;
    const [hh, mm] = pickTime.split(':').map(Number);
    const dt = new Date(detail.selDate.getFullYear(), detail.selDate.getMonth(), detail.selDate.getDate(), hh, mm);
    setScheduling(true);
    updatePostStatus(schedulingPostId, 'scheduled', dt.toISOString())
      .then(() => { cancelScheduling(); refetchCalendar(); })
      .catch(() => {})
      .finally(() => setScheduling(false));
  }, [schedulingPostId, detail, pickTime, cancelScheduling, refetchCalendar]);

  const progressDone = weekCount(posts);
  const metTarget = progressDone >= weekTarget;
  const onFire = progressDone > weekTarget;
  const over = progressDone - weekTarget;
  const dayWord = weekTarget === 1 ? 'day' : 'days';

  const targetChips = useMemo(() => [1, 2, 3, 4, 5, 6, 7].map((n) => {
    const on = n === weekTarget;
    return { n, bg: on ? ACCENT : 'rgba(27,28,20,.04)', color: on ? '#F4F2EA' : '#5A5C4C', border: on ? 'none' : '1px solid rgba(27,28,20,.1)' };
  }), [weekTarget]);

  const momentumMsg = onFire
    ? `You’re ${over} post${over === 1 ? '' : 's'} past your target — one step ahead of your own standards. Keep this energy.`
    : metTarget ? 'Target hit. Your week is complete — you did exactly what you set out to do.'
    : progressDone === 0 ? 'Set your pace above, then fill your week with ideas worth sharing.'
    : `${weekTarget - progressDone} more post${(weekTarget - progressDone) === 1 ? '' : 's'} to reach your target of ${weekTarget} this week.`;
  const momentumFoot = onFire ? 'This is how presence compounds — ahead of your own pace.' : 'You’re building a presence that compounds.';

  const history = useMemo(() => {
    const hn = weeklyHistory.length || 12;
    return Array.from({ length: hn }, (_, i) => {
      const point = weeklyHistory[i];
      const last = point ? point.is_current : i === hn - 1;
      const count = point ? point.days_with_post : 0;
      const r = weekTarget > 0 ? Math.min(1, count / weekTarget) : 0;
      const label = `${last ? 'This week' : (i === hn - 2 ? 'Last week' : `${hn - 1 - i} weeks ago`)} · ${count}/${weekTarget}${count >= weekTarget ? ' ✓' : ''}`;
      const bg = (last && onFire) ? '#C2410C' : `rgba(20,102,59,${(0.14 + r * 0.86).toFixed(2)})`;
      return {
        h: `${(26 + r * 74).toFixed(0)}%`, bg,
        border: (last && r === 0) ? '1px dashed rgba(20,102,59,.3)' : 'none',
        opacity: count >= weekTarget ? 1 : .92, title: label,
      };
    });
  }, [weeklyHistory, weekTarget, onFire]);

  const progressDots = useMemo(() => {
    const dotCount = Math.max(weekTarget, progressDone);
    const dots = [];
    for (let i = 0; i < dotCount; i++) {
      const bonus = i >= weekTarget;
      if (i < progressDone) dots.push({ isFlame: bonus, filled: true });
      else if (i === progressDone) dots.push({ isFlame: true, filled: false });
      else dots.push({ isFlame: false, filled: false });
    }
    return dots;
  }, [weekTarget, progressDone]);

  const cta = useMemo(() => {
    if (onFire) return { title: 'You’re ahead of your target.', sub: 'Every extra post compounds. Keep going.', btn: 'Plan next week', action: () => {}, completed: true };
    if (metTarget) return { title: 'Target reached — your week is complete.', sub: 'Keep the momentum going.', btn: 'Plan next week', action: () => {}, completed: true };
    if (progressDone >= 1) { const left = weekTarget - progressDone; return { title: 'You’re on your way.', sub: `${left} more post${left === 1 ? '' : 's'} to reach your target.`, btn: left === 1 ? 'Create one more' : `Create the next ${left}`, action: fillWeek, completed: false }; }
    return { title: 'Your week is waiting.', sub: 'Let’s fill it with ideas worth sharing.', btn: 'Plan my week', action: fillWeek, completed: false };
  }, [onFire, metTarget, progressDone, weekTarget, fillWeek]);

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
        onDelete={handleDeleteChat}
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

          {showScheduling && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'rgba(20,102,59,.08)', border: '1px solid rgba(20,102,59,.2)', borderRadius: 12, padding: '11px 16px', marginBottom: 20 }}>
              <span style={{ fontSize: 13.5, color: '#2C4A38', letterSpacing: '-.005em' }}>
                Scheduling <strong style={{ fontWeight: 600 }}>{schedulingPost.title}</strong> — pick a day on the calendar, then a time.
              </span>
              <button onClick={cancelScheduling} style={{ border: 'none', background: 'none', color: ACCENT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </div>
          )}

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
                        {showScheduling && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: '10px 13px', marginBottom: 9 }}>
                            <input
                              type="time" value={pickTime} onChange={(e) => setPickTime(e.target.value)}
                              style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '6px 8px', fontSize: 13, fontFamily: MONO, color: INK }}
                            />
                            <button
                              className="sch-plan" onClick={confirmSchedule} disabled={scheduling}
                              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 32, border: 'none', borderRadius: 9, background: ACCENT, color: '#F4F2EA', fontSize: 12.5, fontWeight: 600, cursor: scheduling ? 'default' : 'pointer', opacity: scheduling ? 0.7 : 1 }}
                            >
                              <CalendarClock size={13} strokeWidth={2.3} />{scheduling ? 'Scheduling…' : 'Schedule for this day'}
                            </button>
                          </div>
                        )}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
                <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, flex: '0 0 38px', borderRadius: 11, background: '#fff', border: '1px solid rgba(20,102,59,.14)' }}>
                  <span style={{ position: 'absolute', width: 22, height: 22, borderRadius: 999, background: 'radial-gradient(circle,rgba(249,115,22,.45),transparent 70%)', animation: 'schGlow 1.6s ease-in-out infinite' }} />
                  <span style={{ position: 'relative', transformOrigin: '50% 80%', animation: 'schFlame 1.3s ease-in-out infinite', display: 'flex' }}><FlameIcon size={20} /></span>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT, fontSize: 19, fontWeight: 600, letterSpacing: '-.01em', color: INK, lineHeight: 1.1 }}>{STREAK_WEEKS}-week streak</div>
                  <div style={{ fontSize: 12.5, color: MUTED_2, marginTop: 2, letterSpacing: '-.005em' }}>You&rsquo;ve shown up consistently for {STREAK_WEEKS} weeks.</div>
                </div>
              </div>

              <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button className="sch-targetbtn" onClick={() => setTargetOpen(o => !o)} title="Set weekly target" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px 0 14px', border: `1px solid ${targetOpen ? 'rgba(20,102,59,.5)' : 'rgba(27,28,20,.12)'}`, background: '#fff', borderRadius: 10, cursor: 'pointer' }}>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>Target</span>
                  <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: ACCENT }}>{weekTarget}/wk</span>
                  <ChevronDown size={12} strokeWidth={2.4} style={{ transform: targetOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s ease' }} />
                </button>
                {targetOpen && (
                  <>
                    <div onClick={() => setTargetOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                    <div style={{ position: 'absolute', top: 38, right: 0, zIndex: 21, width: 214, background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 13, boxShadow: '0 22px 50px -22px rgba(20,60,30,.4), 0 4px 12px -6px rgba(27,28,20,.14)', padding: 14, transformOrigin: 'top right', animation: 'schPop .22s cubic-bezier(.22,1,.36,1) both' }}>
                      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500, marginBottom: 10 }}>Posts per week</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
                        {targetChips.map(c => (
                          <button key={c.n} className="sch-chip" onClick={() => setTarget(c.n)} style={{ height: 32, border: c.border, borderRadius: 8, background: c.bg, color: c.color, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{c.n}</button>
                        ))}
                      </div>
                      <div style={{ fontSize: 11.5, color: MUTED_5, marginTop: 11, lineHeight: 1.45, letterSpacing: '-.005em' }}>Aim for <span style={{ color: ACCENT, fontWeight: 600 }}>{weekTarget} {dayWord} a week</span>. Hit it and the week is yours.</div>
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 34, marginBottom: 9 }}>
                {history.map((h, i) => (
                  <span key={i} title={h.title} style={{ flex: 1, height: h.h, borderRadius: 3, background: h.bg, border: h.border, opacity: h.opacity }} />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <span style={{ fontSize: 11, color: MUTED_4, letterSpacing: '-.005em' }}>12-week consistency</span>
                <span style={{ fontSize: 11, color: MUTED_2, fontWeight: 600, letterSpacing: '-.005em' }}>This week</span>
              </div>

              <div style={{ height: 1, background: HAIRLINE, marginBottom: 18 }} />

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 13 }}>
                <span style={{ fontSize: 13.5, color: '#5A5C4C', fontWeight: 500, letterSpacing: '-.005em' }}>This week</span>
                <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: INK }}><span style={{ color: onFire ? '#C2410C' : ACCENT }}>{progressDone}</span> / {weekTarget} {onFire ? `done · +${over} over` : 'target'}</span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 9, marginBottom: 16 }}>
                {progressDots.map((p, i) => {
                  if (p.isFlame) {
                    return (
                      <span key={i} style={{ position: 'relative', width: 19, height: 19, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ position: 'absolute', width: 24, height: 24, borderRadius: 999, background: 'radial-gradient(circle,rgba(249,115,22,.4),transparent 70%)', animation: 'schGlow 1.5s ease-in-out infinite' }} />
                        <span style={{ position: 'relative', transformOrigin: '50% 80%', animation: 'schFlame 1.2s ease-in-out infinite', display: 'flex' }}><FlameIcon size={17} /></span>
                      </span>
                    );
                  }
                  return (
                    <span key={i} style={{
                      width: 19, height: 19, borderRadius: 999,
                      background: p.filled ? ACCENT : 'rgba(20,102,59,.1)',
                      border: p.filled ? 'none' : '1.5px solid rgba(20,102,59,.25)',
                      boxShadow: p.filled ? 'inset 0 -2px 3px rgba(0,0,0,.16), 0 1px 2px rgba(20,102,59,.45)' : 'none',
                      animation: p.filled && justDone ? `schPop .5s cubic-bezier(.22,1,.36,1) both ${(i * 0.06).toFixed(2)}s` : 'none',
                    }} />
                  );
                })}
              </div>

              <div style={{ background: onFire ? '#FFF4EC' : '#fff', border: `1px solid ${onFire ? 'rgba(194,65,12,.2)' : HAIRLINE}`, borderRadius: 13, padding: '14px 15px', animation: (justDone && metTarget) ? 'schRing .9s ease-out both' : 'none' }}>
                {onFire && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ flex: '0 0 16px', transformOrigin: '50% 80%', animation: 'schFlame 1.1s ease-in-out infinite', display: 'flex' }}><FlameIcon size={16} /></span>
                    <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: '#C2410C', letterSpacing: '-.01em' }}>You&rsquo;re on fire</span>
                  </div>
                )}
                <p style={{ fontFamily: FONT, fontSize: 14.5, lineHeight: 1.5, color: '#26281C', margin: 0, letterSpacing: '-.005em' }}>{momentumMsg}</p>
              </div>

              <p style={{ fontSize: 12.5, color: MUTED_5, margin: '15px 0 0', lineHeight: 1.5, letterSpacing: '-.005em' }}>{momentumFoot}</p>
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
                              <button className="sch-menuitem" onClick={() => removePost(r.p.postId)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, color: DANGER, cursor: 'pointer' }}>
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
