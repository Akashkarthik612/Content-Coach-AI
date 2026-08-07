import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronDown } from 'lucide-react';
import { getSessions, deleteSession } from '../api/ai';
import { getWeeklyHistory, updatePostAnalytics } from '../api/vault';
import { getKpis, getRankings, getLoggablePosts, logExternalPost } from '../api/analytics';
import HonneSidebar from '../components/shared/HonneSidebar';

/* ────────────────────────────────────────────────────────────────────────
   Design tokens — ported 1:1 from the "Honne Analytics v2" design (Claude
   Design project ff122375-c3bc-4438-aece-706b0bd557b0, `Honne Analytics
   v2.dc.html`). Token names/values match SchedulePage.jsx (same source
   project, same palette) so the two pages stay visually consistent.

   Real data: KPIs, rankings (top/bottom-10), best posting day/hour, the
   consistency panel (reuses Schedule's GET /posts/weekly-history), and
   metric logging (including posts published outside Honne). "By topic" and
   "What your data says" are static "Coming soon" placeholders — no backend
   exists for topic classification yet. "By content type" has been removed
   entirely — there's no capture data for it anywhere in the schema.
   ──────────────────────────────────────────────────────────────────────── */
const PAGE_BG   = '#FFFFFF';
const INK       = '#1B1C14';
const ACCENT    = '#14663B';
const TINT      = '#F5F8F4';
const MUTED     = '#7A7C6C';
const MUTED_3   = '#9FA291';
const MUTED_4   = '#A6A895';
const MUTED_5   = '#9A9C8C';
const MUTED_6   = '#B0B2A2';
const RUST      = '#B4551F';
const HAIRLINE  = 'rgba(27,28,20,.08)';
const FONT = "'Geist', system-ui, sans-serif";
const MONO = "'JetBrains Mono', monospace";

const STYLES = `
@keyframes anRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { *{ animation-duration: .001ms !important; } }
.an-logbtn { transition: transform .2s cubic-bezier(.22,1,.36,1); }
.an-logbtn:hover { transform: translateY(-1px); }
.an-logbtn:active { transform: scale(.98); }
.an-savebtn { transition: transform .2s cubic-bezier(.22,1,.36,1); }
.an-savebtn:hover { transform: translateY(-1px); }
.an-savebtn:active { transform: scale(.98); }
.an-kpi { transition: transform .22s cubic-bezier(.22,1,.36,1), border-color .22s ease; }
.an-kpi:hover { transform: translateY(-1px); border-color: rgba(20,102,59,.3); }
.an-field { transition: border-color .18s ease; }
.an-field:focus { border-color: rgba(20,102,59,.5); outline: none; }
.an-row:hover { background: rgba(20,102,59,.03); }
`;

const PF = {
  linkedin: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  reddit: 'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z',
};

const PERIOD_LABELS = {
  weekly: 'Last 7 days.',
  monthly: 'Last 30 days.',
  yearly: 'Last 12 months.',
};

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

function fmt(n) {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(n));
}

function formatShortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatHour(hour) {
  if (hour == null) return null;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

function Icon({ paths, size = 16, color = 'currentColor', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

function PlatformIcon({ d, color, size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24"><path fill={color} d={d} /></svg>;
}

const fieldStyle = {
  width: '100%', height: 42, background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 10,
  padding: '0 12px', fontFamily: FONT, fontSize: 13.5, color: INK,
};
const labelStyle = {
  display: 'block', fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
  color: MUTED, fontWeight: 500, marginBottom: 6,
};

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const userName = localStorage.getItem('username') || 'there';

  const [sideOpen, setSideOpen] = useState(true);
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState('');

  // Same persisted (7-day TTL) chat history the Chat/Schedule sidebars read —
  // this page has no chat/message state of its own to select into.
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

  const [period, setPeriod] = useState('monthly');
  const [deepOpen, setDeepOpen] = useState(false);
  const [tab, setTab] = useState('top');

  // ── Real data ────────────────────────────────────────────────────────────
  const [kpis, setKpis] = useState(null);
  const [rankings, setRankings] = useState(null);
  const [loggablePosts, setLoggablePosts] = useState([]);
  const [weeklyHistory, setWeeklyHistory] = useState([]);

  const refetchKpis = useCallback(() => {
    getKpis(period).then(setKpis).catch(() => {});
  }, [period]);

  const refetchRankings = useCallback(() => {
    getRankings(period, 10).then(setRankings).catch(() => {});
  }, [period]);

  const refetchLoggablePosts = useCallback(() => {
    getLoggablePosts().then(setLoggablePosts).catch(() => {});
  }, []);

  useEffect(() => { refetchKpis(); }, [refetchKpis]);
  useEffect(() => { refetchRankings(); }, [refetchRankings]);
  useEffect(() => { refetchLoggablePosts(); }, [refetchLoggablePosts]);
  useEffect(() => {
    getWeeklyHistory(12).then(setWeeklyHistory).catch(() => {});
  }, []);

  // ── Log metrics form ────────────────────────────────────────────────────
  const [logOpen, setLogOpen] = useState(false);
  const [logPost, setLogPost] = useState('');
  const [logImp, setLogImp] = useState('');
  const [logLike, setLogLike] = useState('');
  const [logCom, setLogCom] = useState('');
  const [logTitle, setLogTitle] = useState('');
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logTime, setLogTime] = useState('09:00');
  const [logType, setLogType] = useState('original');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Derived default: the first real post once the list loads, until the
  // user picks something themselves — avoids a setState-in-effect just to
  // seed a controlled <select>'s initial value.
  const effectiveLogPost = logPost || loggablePosts[0]?.post_id || '';

  const logOutside = effectiveLogPost === 'outside';
  const selectedPost = loggablePosts.find(p => p.post_id === effectiveLogPost) || null;
  // Needs the date/platform fields: either a brand-new external post, or an
  // existing vault post that's never been published/backfilled through
  // Honne yet (no post_publish_log row — see LoggablePostOption).
  const needsBackfillFields = logOutside || (selectedPost != null && !selectedPost.published_at);

  const saveLog = async () => {
    setSaveError('');
    try {
      const impressions = Number(logImp) || 0;
      const reactions = Number(logLike) || 0;
      const comments = Number(logCom) || 0;

      if (logOutside) {
        await logExternalPost({
          post_id: null,
          title: logTitle || 'Untitled Post',
          platform: 'linkedin',
          published_at: `${logDate}T${logTime}:00`,
          impressions, reactions, comments,
        });
      } else if (!selectedPost) {
        return;
      } else if (needsBackfillFields) {
        await logExternalPost({
          post_id: selectedPost.post_id,
          title: selectedPost.title,
          platform: 'linkedin',
          published_at: `${logDate}T${logTime}:00`,
          impressions, reactions, comments,
        });
      } else {
        await updatePostAnalytics(selectedPost.post_id, impressions, reactions, comments);
      }

      setLogImp(''); setLogLike(''); setLogCom(''); setLogTitle('');
      setSaved(true);
      refetchKpis(); refetchRankings(); refetchLoggablePosts();
      setTimeout(() => setSaved(false), 2600);
    } catch {
      setSaveError('Could not save — please try again.');
    }
  };

  const periodLabel = PERIOD_LABELS[period] || PERIOD_LABELS.monthly;

  const kpiItems = useMemo(() => {
    if (!kpis) return [];
    return [
      { label: 'Avg impressions', value: fmt(kpis.avg_impressions) },
      { label: 'Avg likes', value: fmt(kpis.avg_reactions) },
      { label: 'Avg comments', value: fmt(kpis.avg_comments) },
      { label: 'Engagement rate', value: `${kpis.engagement_rate.toFixed(1)}%` },
      { label: 'Total posts', value: String(kpis.total_posts) },
    ];
  }, [kpis]);

  const bestPost = rankings?.top?.[0] || null;
  const bestDay = rankings?.best_day || null;
  const bestHourLabel = formatHour(rankings?.best_hour);

  // ── Consistency (reuses Schedule's real weekly-history endpoint) ───────
  const weeksWithPost = weeklyHistory.filter(w => w.days_with_post > 0).length;
  const consistencyScore = weeklyHistory.length ? Math.round(100 * weeksWithPost / weeklyHistory.length) : 0;
  const streakWeeks = useMemo(() => {
    let streak = 0;
    for (let i = weeklyHistory.length - 1; i >= 0; i--) {
      if (weeklyHistory[i].days_with_post > 0) streak++;
      else break;
    }
    return streak;
  }, [weeklyHistory]);
  const weekBars = useMemo(() => weeklyHistory.map((w) => ({
    label: formatShortDate(w.week_start),
    title: `${formatShortDate(w.week_start)} · ${w.days_with_post}/5 days posted`,
    h: `${Math.round(18 + (w.days_with_post / 5) * 82)}%`,
    bg: w.is_current ? ACCENT : `rgba(20,102,59,${(0.25 + (w.days_with_post / 5) * 0.45).toFixed(2)})`,
  })), [weeklyHistory]);

  const isTop = tab === 'top';
  const tableRows = useMemo(() => {
    const list = (isTop ? rankings?.top : rankings?.bottom) || [];
    return list.map((p, i) => {
      const good = p.engagement_rate >= 3;
      return {
        rank: String(i + 1).padStart(2, '0'),
        postId: p.post_id,
        title: p.title,
        date: formatShortDate(p.published_at),
        impressions: p.impressions.toLocaleString(),
        likes: p.reactions,
        comments: p.comments,
        rate: p.engagement_rate.toFixed(1),
        rateColor: good ? ACCENT : MUTED,
        rateBg: good ? 'rgba(20,102,59,.1)' : 'rgba(27,28,20,.055)',
      };
    });
  }, [isTop, rankings]);

  const platforms = [
    { key: 'linkedin', name: 'LinkedIn', active: true, title: 'Connected' },
    { key: 'x', name: 'X', soon: true, title: 'Coming soon' },
    { key: 'reddit', name: 'Reddit', soon: true, title: 'Coming soon' },
  ];

  const periods = [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']];

  const logNote = saveError
    ? saveError
    : saved
      ? '✓ Metrics saved — your analytics will update.'
      : (needsBackfillFields
        ? 'Tell us when it went live — we don’t have a publish record for this post yet.'
        : 'Publish time comes from your schedule automatically.');

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
        activeNav="analytics"
      />

      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', position: 'relative' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '38px 40px 64px' }}>

          {/* header */}
          <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 26, animation: 'anRise .5s cubic-bezier(.22,1,.36,1) both' }}>
            <div>
              <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: ACCENT, fontWeight: 700 }}>Performance</span>
              <h1 style={{ fontFamily: FONT, fontSize: 32, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-.02em', color: INK, margin: '8px 0 6px' }}>Analytics</h1>
              <p style={{ fontSize: 15, color: MUTED, margin: 0, letterSpacing: '-.005em' }}>{periodLabel}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {platforms.map((p) => (
                <div key={p.key} title={p.title} style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 999, border: '1px solid',
                  background: p.active ? 'rgba(20,102,59,.08)' : 'transparent',
                  borderColor: p.active ? 'rgba(20,102,59,.35)' : 'rgba(27,28,20,.1)',
                }}>
                  <PlatformIcon d={PF[p.key]} color={p.active ? ACCENT : MUTED_6} />
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-.005em', color: p.active ? INK : MUTED_5 }}>{p.name}</span>
                  {p.soon && (
                    <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED_5, background: 'rgba(27,28,20,.05)', padding: '3px 6px', borderRadius: 6, fontWeight: 500 }}>Soon</span>
                  )}
                </div>
              ))}
              <button className="an-logbtn" onClick={() => setLogOpen(o => !o)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 16px', border: 'none', borderRadius: 999,
                background: ACCENT, color: '#F4F2EA', fontFamily: FONT, fontSize: 13, fontWeight: 600, letterSpacing: '-.005em', cursor: 'pointer',
                boxShadow: '0 10px 22px -12px rgba(20,102,59,.7)',
              }}>
                <Plus size={14} strokeWidth={2.2} />Log metrics
                <span style={{ display: 'flex', transition: 'transform .3s cubic-bezier(.22,1,.36,1)', transform: logOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <ChevronDown size={13} strokeWidth={2.2} />
                </span>
              </button>
            </div>
          </header>

          {/* LOG METRICS */}
          <div style={{ display: 'grid', gridTemplateRows: logOpen ? '1fr' : '0fr', transition: 'grid-template-rows .5s cubic-bezier(.22,1,.36,1)' }}>
            <div style={{ overflow: 'hidden', minHeight: 0 }}>
              <section style={{ background: TINT, border: '1px solid rgba(20,102,59,.18)', borderRadius: 18, padding: '20px 22px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: ACCENT, fontWeight: 500 }}>Log metrics for a post</span>
                  <span style={{ fontSize: 11.5, color: MUTED_5 }}>LinkedIn doesn&#8217;t share these automatically &#8212; enter them from your post&#8217;s stats.</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>Post</label>
                    <select className="an-field" value={effectiveLogPost} onChange={(e) => setLogPost(e.target.value)} style={{ ...fieldStyle, fontWeight: 500, cursor: 'pointer' }}>
                      {loggablePosts.length === 0 && <option value="" disabled>Loading your posts…</option>}
                      {loggablePosts.map(p => (
                        <option key={p.post_id} value={p.post_id}>
                          {p.title}{p.published_at ? ` · ${formatShortDate(p.published_at)}` : ' (not yet tracked)'}
                        </option>
                      ))}
                      <option value="outside">Published outside Honne…</option>
                    </select>
                  </div>
                  {[
                    { label: 'Impressions', value: logImp, onInput: setLogImp },
                    { label: 'Likes', value: logLike, onInput: setLogLike },
                    { label: 'Comments', value: logCom, onInput: setLogCom },
                  ].map((f) => (
                    <div key={f.label}>
                      <label style={labelStyle}>{f.label}</label>
                      <input className="an-field" type="number" min="0" placeholder="0" value={f.value} onChange={(e) => f.onInput(e.target.value)} style={{ ...fieldStyle, fontFamily: MONO, fontSize: 14 }} />
                    </div>
                  ))}
                </div>
                {needsBackfillFields && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                    {logOutside && (
                      <div>
                        <label style={labelStyle}>Post title</label>
                        <input className="an-field" type="text" placeholder="What was the post about?" value={logTitle} onChange={(e) => setLogTitle(e.target.value)} style={fieldStyle} />
                      </div>
                    )}
                    <div>
                      <label style={labelStyle}>Published on</label>
                      <input className="an-field" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} style={fieldStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>At</label>
                      <input className="an-field" type="time" value={logTime} onChange={(e) => setLogTime(e.target.value)} style={fieldStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Type</label>
                      <select className="an-field" value={logType} onChange={(e) => setLogType(e.target.value)} style={{ ...fieldStyle, fontWeight: 500, cursor: 'pointer' }}>
                        <option value="original">Original</option>
                        <option value="repost">Repost</option>
                      </select>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                  <span style={{ fontSize: 12, color: saveError ? RUST : (saved ? ACCENT : MUTED_5), fontWeight: 500 }}>{logNote}</span>
                  <button className="an-savebtn" onClick={saveLog} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 20px', border: 'none', borderRadius: 10, background: ACCENT, color: '#F4F2EA', fontFamily: FONT, fontSize: 13, fontWeight: 600, letterSpacing: '-.005em', cursor: 'pointer' }}>Save metrics</button>
                </div>
              </section>
            </div>
          </div>

          {/* tracking banner */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: TINT, border: '1px solid rgba(20,102,59,.16)', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
            <Icon paths={['M3 3v18h18', 'M7 15l3-4 3 3 5-6']} color={ACCENT} strokeWidth={2} />
            <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-.005em', color: ACCENT }}>Tracking analytics is the most important part of your journey — if you don&#8217;t track, you don&#8217;t care.</span>
          </div>

          {/* period switch */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12 }}>
            <div style={{ display: 'inline-flex', background: 'rgba(27,28,20,.045)', borderRadius: 10, padding: 3, gap: 2 }}>
              {periods.map(([id, label]) => {
                const on = id === period;
                return (
                  <button key={id} onClick={() => setPeriod(id)} style={{
                    fontFamily: FONT, fontSize: 12.5, fontWeight: 600, letterSpacing: '-.005em', padding: '7px 15px', borderRadius: 8,
                    border: 'none', cursor: 'pointer', transition: 'background .2s ease, color .2s ease',
                    background: on ? ACCENT : 'transparent', color: on ? '#F4F2EA' : MUTED,
                  }}>{label}</button>
                );
              })}
            </div>
          </div>

          {!kpis ? (
            <div style={{ fontSize: 13, color: MUTED_5, padding: '18px 4px' }}>Loading analytics…</div>
          ) : kpis.total_posts === 0 ? (
            <div style={{ background: TINT, border: '1px solid rgba(20,102,59,.16)', borderRadius: 14, padding: '18px 20px', marginBottom: 20, fontSize: 13.5, color: MUTED }}>
              No published posts with metrics in this period yet. Publish a post or log metrics for one above to see your numbers here.
            </div>
          ) : (
            /* KPI row */
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 12, animation: 'anRise .55s cubic-bezier(.22,1,.36,1) both .04s' }}>
              {kpiItems.map((k) => (
                <div key={k.label} className="an-kpi" style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 16, padding: '16px 17px', boxShadow: '0 1px 3px rgba(27,28,20,.05)' }}>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500, marginBottom: 12 }}>{k.label}</div>
                  <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1 }}>{k.value}</div>
                </div>
              ))}
            </section>
          )}

          {/* best post + when you perform best */}
          <section style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, marginBottom: 28, animation: 'anRise .55s cubic-bezier(.22,1,.36,1) both .08s' }}>
            <div style={{ background: TINT, border: '1px solid rgba(20,102,59,.16)', borderRadius: 18, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: ACCENT, fontWeight: 500 }}>Best performing post</span>
                {bestPost && <span style={{ fontSize: 11.5, color: MUTED_5 }}>{formatShortDate(bestPost.published_at)}</span>}
              </div>
              {bestPost ? (
                <>
                  <div style={{ fontFamily: FONT, fontSize: 19, fontWeight: 600, letterSpacing: '-.012em', lineHeight: 1.35, color: INK }}>{bestPost.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                    {[
                      { value: bestPost.impressions.toLocaleString(), label: 'impressions' },
                      { value: String(bestPost.reactions), label: 'likes' },
                      { value: String(bestPost.comments), label: 'comments' },
                      { value: `${bestPost.engagement_rate.toFixed(1)}%`, label: 'eng. rate' },
                    ].map((s) => (
                      <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 500, color: ACCENT }}>{s.value}</span>
                        <span style={{ fontSize: 11.5, color: MUTED }}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13.5, color: MUTED_5 }}>No posts with metrics yet this period.</div>
              )}
            </div>
            <div style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 18, padding: '20px 22px', boxShadow: '0 1px 3px rgba(27,28,20,.05)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14 }}>
              <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>When you perform best</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 34, height: 34, flex: '0 0 34px', borderRadius: 10, background: 'rgba(20,102,59,.09)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon paths={['M4 5h16v16H4z', 'M4 9h16', 'M8 3v4', 'M16 3v4']} color={ACCENT} />
                  </span>
                  <div><div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 600, letterSpacing: '-.01em' }}>{bestDay || 'Not enough data yet'}</div><div style={{ fontSize: 11.5, color: MUTED_5 }}>Best posting day</div></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 34, height: 34, flex: '0 0 34px', borderRadius: 10, background: 'rgba(20,102,59,.09)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  </span>
                  <div><div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 600, letterSpacing: '-.01em' }}>{bestHourLabel || 'Not enough data yet'}</div><div style={{ fontSize: 11.5, color: MUTED_5 }}>Best posting time</div></div>
                </div>
              </div>
            </div>
          </section>

          {/* deeper analytics toggle */}
          <button onClick={() => setDeepOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', border: 'none', background: 'none', padding: '0 2px', marginBottom: deepOpen ? 16 : 8, cursor: 'pointer', transition: 'margin .42s cubic-bezier(.22,1,.36,1)' }}>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: ACCENT, fontWeight: 700, flex: '0 0 auto' }}>Deeper analytics</span>
            <span style={{ flex: 1, height: 1, background: HAIRLINE }} />
            <span style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: MUTED }}>
              {deepOpen ? 'Show less' : 'Consistency & post rankings'}
              <span style={{ display: 'flex', transition: 'transform .3s cubic-bezier(.22,1,.36,1)', transform: deepOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <Icon paths={['M6 9l6 6 6-6']} color={ACCENT} strokeWidth={2.1} size={14} />
              </span>
            </span>
          </button>

          <div style={{ display: 'grid', gridTemplateRows: deepOpen ? '1fr' : '0fr', transition: 'grid-template-rows .5s cubic-bezier(.22,1,.36,1)' }}>
            <div style={{ overflow: 'hidden', minHeight: 0 }}>
              <div style={{ paddingTop: 4 }}>

                {/* what your data says — coming soon */}
                <section style={{ background: ACCENT, borderRadius: 18, padding: '22px 24px', marginBottom: 12, color: '#F4F2EA' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#7BD389', fontWeight: 500 }}>What your data says</span>
                    <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7BD389', background: 'rgba(244,242,234,.12)', padding: '3px 8px', borderRadius: 6, fontWeight: 500 }}>Coming soon</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, letterSpacing: '-.005em', color: 'rgba(244,242,234,.85)' }}>
                    Automatic insights about what's working in your writing are on the way.
                  </p>
                </section>

                {/* topic — coming soon + consistency */}
                <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 18, padding: '19px 20px', boxShadow: '0 1px 3px rgba(27,28,20,.05)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>By topic</span>
                      <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED_5, background: 'rgba(27,28,20,.05)', padding: '3px 8px', borderRadius: 6, fontWeight: 500 }}>Coming soon</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: MUTED_4, lineHeight: 1.5 }}>Which themes in your writing perform best — on the way.</div>
                  </div>
                  <div style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 18, padding: '19px 20px', boxShadow: '0 1px 3px rgba(27,28,20,.05)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500, marginBottom: 16 }}>Consistency</div>
                    <div style={{ display: 'flex', gap: 22, marginBottom: 18 }}>
                      <div><div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', color: ACCENT }}>{streakWeeks} wks</div><div style={{ fontSize: 11.5, color: MUTED_5, marginTop: 2 }}>Posting streak</div></div>
                      <div><div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 600, letterSpacing: '-.02em' }}>{consistencyScore}</div><div style={{ fontSize: 11.5, color: MUTED_5, marginTop: 2 }}>Consistency score</div></div>
                    </div>
                    <div style={{ marginTop: 'auto' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 64 }}>
                        {weekBars.map((w, i) => (
                          <div key={i} title={w.title} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                            <div style={{ width: '100%', borderRadius: '5px 5px 2px 2px', background: w.bg, height: w.h, transition: 'height .5s cubic-bezier(.22,1,.36,1)' }} />
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED_4, marginTop: 10 }}>Days posted per week (last 12 weeks)</div>
                    </div>
                  </div>
                </section>

                {/* content performance table */}
                <section style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 18, boxShadow: '0 1px 3px rgba(27,28,20,.05)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '17px 20px 13px' }}>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>Content performance</span>
                    <div style={{ display: 'flex', background: 'rgba(27,28,20,.045)', borderRadius: 10, padding: 3 }}>
                      <button onClick={() => setTab('top')} style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: '-.005em', padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: isTop ? ACCENT : 'transparent', color: isTop ? '#F4F2EA' : MUTED }}>Top 10</button>
                      <button onClick={() => setTab('bottom')} style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: '-.005em', padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: !isTop ? ACCENT : 'transparent', color: !isTop ? '#F4F2EA' : MUTED }}>Bottom 10</button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr 92px 76px 92px 84px', gap: 10, padding: '8px 20px', borderBottom: `1px solid ${HAIRLINE}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED_6, fontWeight: 500 }}>#</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED_6, fontWeight: 500 }}>Post</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED_6, fontWeight: 500, textAlign: 'right' }}>Impressions</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED_6, fontWeight: 500, textAlign: 'right' }}>Likes</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED_6, fontWeight: 500, textAlign: 'right' }}>Comments</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED_6, fontWeight: 500, textAlign: 'right' }}>Eng. rate</span>
                  </div>
                  <div key={`t-${tab}`} style={{ animation: 'anRise .3s cubic-bezier(.22,1,.36,1) both' }}>
                    {tableRows.length === 0 && (
                      <div style={{ padding: '20px', fontSize: 13, color: MUTED_5 }}>No posts with metrics in this period yet.</div>
                    )}
                    {tableRows.map((r) => (
                      <div key={r.postId} className="an-row" style={{ display: 'grid', gridTemplateColumns: '34px 1fr 92px 76px 92px 84px', gap: 10, alignItems: 'center', padding: '11px 20px', borderBottom: '1px solid rgba(27,28,20,.045)', transition: 'background .16s ease' }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED_6 }}>{r.rank}</span>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, letterSpacing: '-.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: INK }}>{r.title}</span>
                          <span style={{ fontSize: 11, color: MUTED_4 }}>{r.date}</span>
                        </div>
                        <span style={{ fontFamily: MONO, fontSize: 12.5, textAlign: 'right', color: '#3A3C30' }}>{r.impressions}</span>
                        <span style={{ fontFamily: MONO, fontSize: 12.5, textAlign: 'right', color: '#3A3C30' }}>{r.likes}</span>
                        <span style={{ fontFamily: MONO, fontSize: 12.5, textAlign: 'right', color: '#3A3C30' }}>{r.comments}</span>
                        <span style={{ textAlign: 'right' }}>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: r.rateColor, background: r.rateBg, padding: '4px 8px', borderRadius: 6 }}>{r.rate}%</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
