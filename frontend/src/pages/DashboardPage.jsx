import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalytics }    from '../hooks/useAnalytics';
import { useIdeas }        from '../hooks/useIdeas';
import { useReviewQueue }  from '../context/ReviewQueueContext';
import { getRecentPosts }  from '../api/vault';
import { AppSidebar } from '../components/shared/AppSidebar';

// ── Design tokens (exact from §A) ─────────────────────────────────────────────
const BG     = '#EEF2F9';
const INK    = '#111827';
const BODY   = '#4B5563';
const MUTED  = '#6B7280';
const FAINT  = '#9CA3AF';
const BLUE   = '#3B82F6';
const INDIGO = '#6366F1';
const VIOLET = '#8B5CF6';
const SKY    = '#0EA5E9';
const GREEN  = '#22C55E';
const GREEN_D = '#16A34A';
const AMBER  = '#F59E0B';
const AMBER_D = '#B45309';
const TINT   = '#F7FAFF';
const WHITE  = '#FFFFFF';
const BDR    = 'rgba(17,24,39,0.07)';
const BDR_LT = 'rgba(17,24,39,0.06)';

const FONT  = "'Hanken Grotesk','DM Sans',system-ui,sans-serif";
const SERIF = "'Newsreader',Georgia,serif";
const MONO  = "'JetBrains Mono','Fira Code',monospace";

// ── Platform helpers ──────────────────────────────────────────────────────────
const PLATFORM = {
  linkedin: { label: 'LinkedIn',  bg: '#0A66C2', text: '#fff', glyph: 'in' },
  x:        { label: 'X',         bg: '#000000', text: '#fff', glyph: '𝕏'  },
  reddit:   { label: 'Reddit',    bg: '#FF4500', text: '#fff', glyph: 'r/' },
  medium:   { label: 'Medium',    bg: '#000000', text: '#fff', glyph: 'M'  },
  blog:     { label: 'Blog',      bg: SKY,       text: '#fff', glyph: 'B'  },
  newsletter:{ label: 'Newsletter', bg: INDIGO,  text: '#fff', glyph: '✉'  },
};

function PlatformBadge({ p = 'linkedin', size = 13 }) {
  const pl = PLATFORM[p] ?? PLATFORM.linkedin;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size + 8, height: size + 8, borderRadius: 5,
      background: pl.bg, color: pl.text, fontSize: size - 2, fontWeight: 700, fontFamily: FONT,
      flexShrink: 0,
    }}>{pl.glyph}</span>
  );
}

// ── Sidebar nav ───────────────────────────────────────────────────────────────
// ── Agent card ─────────────────────────────────────────────────────────────────
function AgentCard({ tileBg, tileColor, icon, name, task, status, statusBg, statusColor, dotColor, children, staggerClass }) {
  return (
    <div
      className={`cc-hover-lift cc-stagger ${staggerClass}`}
      style={{
        background: WHITE, border: `1px solid ${BDR}`, borderRadius: 20, padding: 20,
        boxShadow: '0 16px 38px -28px rgba(17,24,39,.2)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12, background: tileBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ color: tileColor, display: 'flex' }}>{icon}</span>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: 999,
          background: statusBg, color: statusColor, fontFamily: FONT,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block', animation: 'ccPulse 2s ease-in-out infinite' }} />
          {status}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 2 }}>{name}</div>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>{task}</div>
      {children}
    </div>
  );
}

function ProgressBar({ pct, gradient, label = 'Progress' }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: MUTED, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: BLUE, fontFamily: MONO }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: '#EEF2F7', overflow: 'hidden' }}>
        <div className="cc-stagger" style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: gradient }} />
      </div>
    </div>
  );
}

// ── Pipeline connectors (§B2) ─────────────────────────────────────────────────
function Connector() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 22, flexShrink: 0 }}>
      <svg width="28" height="18" viewBox="0 0 28 18">
        <line x1="0" y1="9" x2="20" y2="9"
          stroke="#C7D2FE" strokeWidth="1.5" strokeDasharray="4 3"
          style={{ animation: 'ccDash 1s linear infinite' }}
        />
        <path d="M17 5l5 4-5 4" fill="none" stroke="#6366F1" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

// ── Pipeline column ───────────────────────────────────────────────────────────
function PipelineCol({ title, dot, count, children, staggerClass }) {
  return (
    <div className={`cc-stagger ${staggerClass}`} style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, display: 'inline-block' }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, fontFamily: FONT }}>{title}</span>
        {count != null && (
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: FAINT, fontFamily: MONO }}>{count}</span>
        )}
      </div>
      <div style={{
        background: TINT, border: `1px solid ${BDR_LT}`, borderRadius: 16, padding: 13,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {children}
      </div>
    </div>
  );
}

function PCard({ platform, label, title, extra, extraStyle }) {
  return (
    <div
      className="cc-hover-lift cc-press"
      style={{
        background: WHITE, border: `1px solid ${BDR}`, borderRadius: 12, padding: 12,
        boxShadow: '0 6px 16px -12px rgba(17,24,39,.2)', cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <PlatformBadge p={platform} size={11} />
        {label && <span style={{ fontSize: 10.5, color: MUTED, fontFamily: MONO }}>{label}</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: INK, lineHeight: 1.4 }}>{title}</div>
      {extra && <div style={{ marginTop: 6, ...extraStyle }}>{extra}</div>}
    </div>
  );
}

// ── Growth trend chart (§B7) ──────────────────────────────────────────────────
const MOCK_TREND = [
  { month: 'Dec', impressions: 9200,  likes: 88  },
  { month: 'Jan', impressions: 11400, likes: 101 },
  { month: 'Feb', impressions: 13800, likes: 117 },
  { month: 'Mar', impressions: 15200, likes: 128 },
  { month: 'Apr', impressions: 16900, likes: 134 },
  { month: 'May', impressions: 17600, likes: 139 },
  { month: 'Jun', impressions: 18400, likes: 142 },
];

function GrowthTrend({ data }) {
  const pts = (data?.length >= 2 ? data : MOCK_TREND);
  const W = 760, H = 200, PX = 20, PY = 14;
  const maxI = Math.max(...pts.map(d => d.impressions));
  const maxL = Math.max(...pts.map(d => d.likes));
  const n = pts.length;
  const xs = pts.map((_, i) => PX + (i / (n - 1)) * (W - PX * 2));
  const iys = pts.map(d => PY + (1 - d.impressions / maxI) * (H - PY * 2));
  const lys = pts.map(d => PY + (1 - d.likes      / maxL) * (H - PY * 2));

  const poly  = (xArr, yArr) => xArr.map((x, i) => `${x},${yArr[i]}`).join(' ');
  const areaI = `M${xs[0]},${H - PY} ` + xs.map((x, i) => `L${x},${iys[i]}`).join(' ') + ` L${xs[n-1]},${H - PY} Z`;
  const areaL = `M${xs[0]},${H - PY} ` + xs.map((x, i) => `L${x},${lys[i]}`).join(' ') + ` L${xs[n-1]},${H - PY} Z`;

  const gridYs = [PY, PY + (H - PY*2)/2, H - PY];

  return (
    <div style={{ background: WHITE, borderRadius: 20, padding: 24, border: `1px solid ${BDR}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: INK, marginBottom: 2 }}>Growth trend</div>
          <div style={{ fontSize: 13, color: MUTED }}>Views over the last 7 months</div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[['#3B82F6','Impressions'],['#8B5CF6','Likes']].map(([c, l]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: MUTED, fontFamily: MONO }}>
              <span style={{ width: 22, height: 3, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block', marginTop: 8 }}>
        <defs>
          <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity=".28"/>
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity=".18"/>
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {gridYs.map((y, i) => (
          <line key={i} x1={PX} y1={y} x2={W - PX} y2={y} stroke="#EEF2F7" strokeWidth="1"/>
        ))}
        <path d={areaI} fill="url(#gI)"/>
        <path d={areaL} fill="url(#gL)"/>
        <polyline points={poly(xs, iys)} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinejoin="round"/>
        <polyline points={poly(xs, lys)} fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinejoin="round"/>
        <circle cx={xs[n-1]} cy={iys[n-1]} r="5" fill="#3B82F6"/>
        {pts.map((d, i) => (
          <text key={i} x={xs[i]} y={H - 2} textAnchor="middle" fontSize="11" fill={FAINT} fontFamily={MONO}>{d.month}</text>
        ))}
      </svg>
    </div>
  );
}

// ── Calendar side panel ────────────────────────────────────────────────────────
function CalendarPanel({ open, onClose }) {
  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.35)', zIndex: 39, transition: 'opacity .22s' }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 360,
        background: WHITE, borderLeft: `1px solid ${BDR}`,
        fontFamily: FONT, padding: 28,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform .28s cubic-bezier(.16,1,.3,1)',
        zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>Calendar</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: MUTED }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: MUTED }}>Full calendar view — coming soon.</p>
      </div>
    </>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, delta, deltaColor = GREEN_D, staggerClass }) {
  return (
    <div className={`cc-hover-lift cc-stagger ${staggerClass}`} style={{ background: WHITE, borderRadius: 18, padding: 20, border: `1px solid ${BDR}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '.07em', fontFamily: MONO, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 400, color: INK, lineHeight: 1.1, marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 13, color: deltaColor }}>{delta}</div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: analytics, loading: analyticsLoading } = useAnalytics();
  const { ideas }    = useIdeas();
  const { queue }    = useReviewQueue();
  const plan         = 'pro'; // TODO: from session

  const [panelOpen,        setPanelOpen]        = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [recentPosts,      setRecentPosts]      = useState([]);
  const [currentDraft,     setCurrentDraft]     = useState('Drafting LinkedIn Post');

  useEffect(() => {
    getRecentPosts(3).then(posts => { if (posts?.length) setRecentPosts(posts); }).catch(() => {});
    getRecentPosts(1).then(posts => { if (posts?.[0]?.title) setCurrentDraft(`Drafting: ${posts[0].title}`); }).catch(() => {});
  }, []);

  const displayName = localStorage.getItem('display_name') ?? localStorage.getItem('username') ?? 'there';
  const hour   = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: BG, fontFamily: FONT, color: INK }}>
      <AppSidebar
        onCalendarOpen={() => setPanelOpen(true)}
        navigate={navigate}
        activeKey="dashboard"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(v => !v)}
      />

      <main style={{ flex: 1, minWidth: 0, padding: '28px 32px', overflowY: 'auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 className="cc-stagger cc-stagger-1" style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 400, letterSpacing: '-0.015em', color: INK, margin: '0 0 14px', lineHeight: 1.15 }}>
              {greeting}, {displayName} 👋
            </h1>
            {/* Status pills row — §B8: remove "12 Tasks Running", move "Drafts Need Review" to tab group below */}
            <div className="cc-stagger cc-stagger-2" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <StatusPill dot={GREEN} pulse label="Agents Active" count={4} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* Bell */}
            <button className="cc-press" style={{ width: 40, height: 40, borderRadius: 11, background: WHITE, border: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
              <svg viewBox="0 0 20 20" fill="none" stroke={MUTED} strokeWidth="1.6" width="17" height="17"><path d="M10 2a6 6 0 016 6v3l1.5 3H2.5L4 11V8a6 6 0 016-6zM8.5 17a1.5 1.5 0 003 0"/></svg>
              <span style={{ position: 'absolute', top: 7, right: 8, width: 6, height: 6, borderRadius: '50%', background: '#EF4444', border: `1.5px solid ${WHITE}` }} />
            </button>
            {/* Quick Actions → Chat */}
            <button
              className="cc-press"
              onClick={() => navigate('/chat')}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 11, border: 'none',
                background: INK, color: WHITE, fontSize: 13.5, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
              }}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z"/></svg>
              Quick Actions
            </button>
            {/* Avatar */}
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#3B82F6,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <span style={{ fontFamily: SERIF, fontSize: 16, color: WHITE }}>{displayName[0]?.toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* ── Your agents (§A + §B1) ── */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: INK, margin: 0 }}>Your agents</h2>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: BLUE, fontWeight: 600, fontFamily: FONT }}>View all →</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
            {/* Research */}
            <AgentCard tileBg="#EAF0FF" tileColor={BLUE} staggerClass="cc-stagger-1"
              icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" width="20" height="20"><circle cx="9" cy="9" r="6"/><path d="M15 15l3 3"/></svg>}
              name="Research Agent" task="Finding AI Trends"
              status="Active" statusBg="#DCFCE7" statusColor={GREEN_D} dotColor={GREEN}>
              <ProgressBar pct={82} gradient="linear-gradient(90deg,#3B82F6,#6366F1)" />
            </AgentCard>
            {/* Writer (§B1 dynamic draft) */}
            <AgentCard tileBg="#EEF0FF" tileColor={INDIGO} staggerClass="cc-stagger-2"
              icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" width="20" height="20"><path d="M13.5 3.5a2.121 2.121 0 013 3L7 16l-4 1 1-4 9.5-9.5z"/></svg>}
              name="Writer Agent" task={currentDraft}
              status="Drafting" statusBg="#EEF0FF" statusColor={INDIGO} dotColor={INDIGO}>
              <ProgressBar pct={64} gradient="linear-gradient(90deg,#6366F1,#8B5CF6)" label="Progress" />
              <button
                className="cc-press"
                onClick={() => navigate('/chat')}
                style={{ marginTop: 10, background: 'linear-gradient(90deg,#6366F1,#8B5CF6)', border: 'none', color: WHITE, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: 'pointer', width: '100%' }}
              >
                Draft with AI →
              </button>
            </AgentCard>
            {/* SEO (§B1 performance signal) */}
            <AgentCard tileBg="#F3EEFF" tileColor={VIOLET} staggerClass="cc-stagger-3"
              icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" width="20" height="20"><path d="M3 14l5-5 4 4 5-6"/></svg>}
              name="SEO Agent" task="Optimizing Content"
              status="Optimizing" statusBg="#F3EEFF" statusColor={VIOLET} dotColor={VIOLET}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 400, color: VIOLET, lineHeight: 1 }}>92</span>
                <span style={{ fontSize: 14, color: MUTED, paddingBottom: 3 }}>/100</span>
              </div>
              <div style={{ fontSize: 12, color: BODY }}>Discoverable &mdash; est. +34% reach</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 11, fontWeight: 600, color: GREEN_D, background: '#DCFCE7', padding: '2px 8px', borderRadius: 20, fontFamily: MONO }}>
                <span>↑</span> Ranking for 6 keywords
              </div>
            </AgentCard>
            {/* Analytics (§B1 real metrics) */}
            <AgentCard tileBg="#E6F6FE" tileColor={SKY} staggerClass="cc-stagger-4"
              icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" width="20" height="20"><path d="M3 15V9M7 15V6M11 15v-4M15 15V3"/></svg>}
              name="Analytics Agent" task="Analyzing Performance"
              status="Processing" statusBg="#E6F6FE" statusColor={SKY} dotColor={SKY}>
              {analyticsLoading ? (
                <div style={{ fontSize: 12, color: FAINT }}>Loading…</div>
              ) : (
                <>
                  <MetRow label="Impressions"   value={analytics?.impressions?.toLocaleString() ?? '—'} />
                  <MetRow label="Avg likes/post" value={analytics?.avgLikes ?? '—'} />
                  <button onClick={() => navigate('/analytics')} style={{ background: 'none', border: 'none', padding: '6px 0 0', cursor: 'pointer', fontSize: 12, color: SKY, fontWeight: 600, fontFamily: FONT, display: 'block' }}>View detailed analytics →</button>
                </>
              )}
            </AgentCard>
          </div>
        </div>

        {/* ── Content pipeline (§A + §B2-6) ── */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: INK, margin: 0 }}>Content pipeline</h2>
            <span style={{ fontSize: 13, color: MUTED }}>5 stages · {3 + 2 + 2 + queue.length + 1} items</span>
          </div>
          <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>

            {/* Ideas (§B3) */}
            <PipelineCol title="Ideas" dot={MUTED} count={ideas.length} staggerClass="cc-stagger-1">
              {ideas.map(idea => (
                <PCard key={idea.id} platform="linkedin" label={idea.source}
                  title={idea.title}
                  extra={
                    <button onClick={() => { setCurrentDraft(`Drafting: ${idea.title}`); navigate('/my-work'); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: BLUE, fontWeight: 600, fontFamily: FONT, padding: 0 }}>
                      Draft this →
                    </button>
                  }
                />
              ))}
            </PipelineCol>
            <Connector />

            {/* Research (§B4 Pro-gated) */}
            <PipelineCol title="Research" dot={BLUE} count={2} staggerClass="cc-stagger-2">
              {plan === 'pro' ? (
                <>
                  <PCard platform="x" label="Medium" title="The future of AI teams"
                    extra={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: BLUE, background: '#EAF0FF', padding: '2px 7px', borderRadius: 20, fontFamily: MONO }}>
                      <svg viewBox="0 0 12 12" fill="none" stroke={BLUE} strokeWidth="1.5" width="10" height="10"><circle cx="5.5" cy="5.5" r="4"/><path d="M10 10l2 2"/></svg>
                      Research · 82%
                    </span>}
                  />
                  <PCard platform="linkedin" label="" title="Research my past writing & docs →"
                    extra={<button onClick={() => navigate('/vault')} style={{ background: '#EAF0FF', border: `1px solid ${BLUE}`, color: BLUE, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>Open Vault</button>}
                  />
                </>
              ) : (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ fontSize: 12, color: FAINT, marginBottom: 6 }}>Research my past writing & docs</div>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#FEF3C7', color: AMBER_D, fontWeight: 700, fontFamily: MONO }}>Pro</span>
                </div>
              )}
            </PipelineCol>
            <Connector />

            {/* Drafting */}
            <PipelineCol title="Drafting" dot={INDIGO} count={2} staggerClass="cc-stagger-3">
              <div className="cc-hover-lift cc-press" style={{ background: WHITE, border: `1px solid ${BDR}`, borderRadius: 12, padding: 12, boxShadow: '0 6px 16px -12px rgba(17,24,39,.2)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}><PlatformBadge p="linkedin" size={11}/><span style={{ fontSize: 10.5, color: MUTED, fontFamily: MONO }}>LinkedIn</span></div>
                <div style={{ fontSize: 13, fontWeight: 500, color: INK, lineHeight: 1.4, marginBottom: 6 }}>AI won't replace creators</div>
                <div style={{ height: 4, borderRadius: 2, background: '#EEF2F7', overflow: 'hidden' }}><div style={{ width: '64%', height: '100%', background: `linear-gradient(90deg,${INDIGO},${VIOLET})` }} /></div>
              </div>
              <PCard platform="blog" label="Blog" title="Guide to AI workflows" />
            </PipelineCol>
            <Connector />

            {/* Review (§B5) */}
            <PipelineCol title="Review" dot={AMBER} count={queue.length} staggerClass="cc-stagger-4">
              <button className="cc-press"
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1.5px dashed ${AMBER}`, borderRadius: 10, padding: '9px 12px', cursor: 'pointer', fontSize: 12, color: AMBER_D, fontWeight: 600, fontFamily: FONT, width: '100%' }}>
                + Add files to review
              </button>
              {queue.slice(0, 2).map(item => (
                <div key={item.id} style={{ background: '#FEF9C3', border: `1px solid #FCE7B5`, borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><PlatformBadge p={item.platform} size={11}/></div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: INK, marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 10.5, color: AMBER_D, fontWeight: 600, fontFamily: MONO }}>Needs review</div>
                </div>
              ))}
            </PipelineCol>
            <Connector />

            {/* Published (§B6 Pro-gated) */}
            <PipelineCol title="Published" dot={GREEN} count={1} staggerClass="cc-stagger-5">
              {plan === 'pro' ? (
                <div className="cc-hover-lift" style={{ background: WHITE, border: `1px solid ${BDR}`, borderRadius: 12, padding: 12, boxShadow: '0 6px 16px -12px rgba(17,24,39,.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><PlatformBadge p="linkedin" size={11}/></div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: INK, lineHeight: 1.4, marginBottom: 5 }}>Building in public truth</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10.5, color: GREEN_D, fontWeight: 600, background: '#DCFCE7', padding: '2px 7px', borderRadius: 20, fontFamily: MONO }}>Live</span>
                    <span style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>👍 1.2k · 💬 127</span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ fontSize: 12, color: FAINT, marginBottom: 6 }}>Schedule publishing</div>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#FEF3C7', color: AMBER_D, fontWeight: 700, fontFamily: MONO }}>Pro</span>
                </div>
              )}
            </PipelineCol>
          </div>
        </div>

        {/* ── Recent content + Voice Vault ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 26 }}>
          {/* Recent content */}
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: INK, margin: '0 0 14px' }}>Recent content</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(recentPosts.length > 0 ? recentPosts.map(post => ({
                platform: 'linkedin', meta: `${post.status} · ${post.updated_at?.split('T')[0] ?? ''}`,
                title: post.title, stats: null,
              })) : [
                { platform: 'linkedin',    meta: 'LinkedIn Post · 2d ago', title: 'AI Will Not Replace Creators',   stats: '👍 1,284 · 💬 127 · 🔄 89' },
                { platform: 'medium',      meta: 'Medium Article · 8 min read', title: 'The Future Of AI Teams',   stats: '👁 3,452 views · 👏 412' },
                { platform: 'newsletter',  meta: 'Newsletter · Issue #24',  title: 'Weekly Creator Digest',         stats: '✉ 2,143 opens · 📈 41% open rate' },
              ]).map((c, i) => (
                <div key={i} className="cc-hover-lift cc-press" style={{ background: WHITE, borderRadius: 18, padding: 18, border: `1px solid ${BDR}`, boxShadow: '0 8px 24px -16px rgba(17,24,39,.15)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <PlatformBadge p={c.platform} size={12} />
                    <span style={{ fontSize: 12, color: MUTED }}>{c.meta}</span>
                  </div>
                  <div style={{ fontFamily: SERIF, fontSize: 19, color: INK, lineHeight: 1.35, marginBottom: c.stats ? 8 : 0 }}>{c.title}</div>
                  {c.stats && <div style={{ fontSize: 13, color: MUTED }}>{c.stats}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Voice Vault */}
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: INK, margin: '0 0 14px' }}>Voice Vault</h2>
            <div className="cc-hover-lift cc-press" onClick={() => navigate('/vault')} style={{
              background: 'linear-gradient(160deg,#3B82F6,#6366F1 55%,#8B5CF6)',
              borderRadius: 20, padding: 24, color: WHITE, cursor: 'pointer',
              boxShadow: '0 24px 50px -24px rgba(99,102,241,.6)',
              height: 'calc(100% - 33px)',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="1.7" width="18" height="18"><rect x="7" y="2" width="6" height="11" rx="3"/><path d="M4 11a6 6 0 0012 0M10 17v2M7 19h6"/></svg>
                </div>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Your Voice</span>
              </div>
              <div style={{ fontSize: 10, fontFamily: MONO, letterSpacing: '.1em', opacity: .7, marginBottom: 4 }}>VOICE ACCURACY</div>
              <div style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 400, lineHeight: 1, marginBottom: 16 }}>96%</div>
              {[
                'Writing Samples Imported',
                'LinkedIn History Analyzed',
                'Style Memory Active',
                'Brand Voice Learned',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg viewBox="0 0 12 12" fill="white" width="9" height="9"><path d="M2 6l3 3 5-5"/></svg>
                  </div>
                  <span style={{ fontSize: 13.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Analytics (§A + §B7) ── */}
        <div style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: INK, margin: '0 0 14px' }}>Analytics</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 16 }}>
            <StatCard staggerClass="cc-stagger-1" label="VIEWS" value="128k" delta="↑ 18% this month" deltaColor={GREEN_D} />
            <StatCard staggerClass="cc-stagger-2" label="ENGAGEMENT" value={<span style={{ color: BLUE }}>8.4%</span>} delta="↑ 2.1% this month" deltaColor={BLUE} />
            <StatCard staggerClass="cc-stagger-3" label="FOLLOWERS" value={<span style={{ color: INDIGO }}>+2,341</span>} delta="↑ 12% this month" deltaColor={INDIGO} />
            <StatCard staggerClass="cc-stagger-4" label="POSTS PUBLISHED" value={<span style={{ color: VIOLET }}>46</span>} delta={<span style={{ color: MUTED }}>across 3 platforms</span>} />
          </div>
          <GrowthTrend data={analytics?.weeklyTrend} />
        </div>

      </main>

      <CalendarPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
}

// ── Metric row (for Analytics agent card) ─────────────────────────────────────
function MetRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${BDR}` }}>
      <span style={{ fontSize: 12, color: MUTED }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: INK, fontFamily: MONO }}>{value}</span>
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ dot, pulse, label, count }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: WHITE, border: `1px solid ${BDR}`, borderRadius: 999,
      padding: '7px 14px', fontSize: 13, color: '#374151',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: dot, display: 'inline-block',
        ...(pulse ? { animation: 'ccPulse 2s ease-in-out infinite' } : {}),
      }} />
      <strong>{count}</strong> {label}
    </span>
  );
}

