import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalytics } from '../hooks/useAnalytics';

const C = {
  bg:      '#F0F2F8',
  sidebar: '#0B1220',
  white:   '#FFFFFF',
  ink:     '#0F172A',
  muted:   '#64748B',
  faint:   '#94A3B8',
  border:  '#E2E8F0',
  blue:    '#3B82F6',
  purple:  '#8B5CF6',
};
const FONT = "'Hanken Grotesk', 'DM Sans', system-ui, sans-serif";

const PLATFORMS = [
  { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
  { key: 'x',        label: 'X (Twitter)', color: '#000000' },
  { key: 'reddit',   label: 'Reddit', color: '#FF4500' },
];

export default function AnalyticsPage() {
  const navigate          = useNavigate();
  const { data, loading } = useAnalytics();
  const [tab, setTab]     = useState('linkedin');

  const platform = data?.byPlatform?.[tab];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: FONT, background: C.bg }}>

      {/* Sidebar stub */}
      <div style={{ width: 248, background: C.sidebar, display: 'flex', flexDirection: 'column', padding: '24px 0' }}>
        <div style={{ padding: '0 20px 24px', color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>
          ContentCoach AI
        </div>
        <NavItem label="Dashboard" onClick={() => navigate('/dashboard')} />
        <NavItem label="Analytics" active />
        <NavItem label="My Work" onClick={() => navigate('/my-work')} />
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: '40px 48px', overflowY: 'auto' }}>
        <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 32, fontWeight: 600, color: C.ink, margin: '0 0 8px' }}>
          Analytics
        </h1>
        <p style={{ color: C.muted, fontSize: 14, margin: '0 0 32px' }}>
          Performance across all platforms
        </p>

        {/* Platform tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: '#E2E8F0', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          {PLATFORMS.map(p => (
            <button
              key={p.key}
              onClick={() => setTab(p.key)}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: FONT,
                background: tab === p.key ? C.white : 'transparent',
                color: tab === p.key ? C.ink : C.muted,
                boxShadow: tab === p.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: C.muted }}>Loading…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 760 }}>
            <StatCard label="Impressions" value={platform?.impressions?.toLocaleString() ?? '—'} />
            <StatCard label="Avg. Likes"  value={platform?.likes ?? '—'} />
            <StatCard label="Posts"       value={platform?.posts ?? '—'} />
          </div>
        )}

        <p style={{ marginTop: 48, color: C.faint, fontSize: 13 }}>
          {/* TODO: add per-post breakdown table + trend chart here */}
          Detailed per-post breakdown coming soon.
        </p>
      </div>
    </div>
  );
}

function NavItem({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '10px 20px', border: 'none', cursor: 'pointer', fontFamily: FONT,
        fontSize: 13, fontWeight: active ? 600 : 400,
        background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.55)',
        borderLeft: active ? '2px solid #3B82F6' : '2px solid transparent',
      }}
    >
      {label}
    </button>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', border: '1px solid #E2E8F0' }}>
      <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#0F172A' }}>{value}</div>
    </div>
  );
}
