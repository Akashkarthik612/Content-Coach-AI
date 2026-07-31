import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppSidebar } from '../components/shared/AppSidebar';

const BG      = '#EEF2F9';
const INK     = '#111827';
const BODY    = '#4B5563';
const MUTED   = '#6B7280';
const BLUE    = '#3B82F6';
const INDIGO  = '#6366F1';
const VIOLET  = '#8B5CF6';
const SKY     = '#0EA5E9';
const GREEN   = '#22C55E';
const GREEN_D = '#16A34A';
const AMBER_D = '#B45309';
const WHITE   = '#FFFFFF';
const BDR     = 'rgba(17,24,39,0.07)';

const FONT  = "'Hanken Grotesk','DM Sans',system-ui,sans-serif";
const SERIF = "'Newsreader',Georgia,serif";
const MONO  = "'JetBrains Mono','Fira Code',monospace";

const AGENTS = [
  {
    key: 'research',
    name: 'Research Agent',
    tagline: 'Surfaces what you already know',
    tileBg: '#EAF0FF',
    tileColor: BLUE,
    statusBg: '#DCFCE7',
    statusColor: GREEN_D,
    dotColor: GREEN,
    status: 'Active',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="26" height="26">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
    ),
    description: 'Searches your entire post vault using semantic AI to surface relevant content from your history. Ask it about any topic and it finds what you\'ve already written, spots gaps, and suggests angles you haven\'t covered yet.',
    capabilities: [
      'Semantic vector search across all your published posts',
      'Identifies content gaps and unexplored angles on a topic',
      'Prevents repetition by surfacing overlapping past work',
    ],
    cta: 'Ask a research question →',
    ctaPath: '/chat',
    ctaDisabled: false,
    ctaBg: `linear-gradient(90deg,${BLUE},${INDIGO})`,
  },
  {
    key: 'writer',
    name: 'Writer Agent',
    tagline: 'Writes in your voice, not a robot\'s',
    tileBg: '#EEF0FF',
    tileColor: INDIGO,
    statusBg: '#EEF0FF',
    statusColor: INDIGO,
    dotColor: INDIGO,
    status: 'Drafting',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="26" height="26">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    ),
    description: 'Learns your writing style from your published posts and generates LinkedIn content that sounds exactly like you. It builds a style DNA — your hook patterns, sentence rhythm, emoji usage, and paragraph structure — then uses it to draft every post.',
    capabilities: [
      'Builds a short-term + long-term style memory from your posts',
      'Matches your hook style, tone, rhythm, and emoji patterns precisely',
      'Human-in-the-loop approval before any draft is finalised',
    ],
    cta: 'Write a post →',
    ctaPath: '/chat',
    ctaDisabled: false,
    ctaBg: `linear-gradient(90deg,${INDIGO},${VIOLET})`,
  },
  {
    key: 'seo',
    name: 'SEO Agent',
    tagline: 'Optimises content for reach and discoverability',
    tileBg: '#F3EEFF',
    tileColor: VIOLET,
    statusBg: '#F3EEFF',
    statusColor: VIOLET,
    dotColor: VIOLET,
    status: 'Coming soon',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="26" height="26">
        <path d="M3 17l5-6 4 5 4-8 5 9"/>
      </svg>
    ),
    description: 'Analyses your content for LinkedIn discoverability and suggests improvements that increase organic reach. Tracks keyword ranking, optimal posting windows, and engagement patterns across your content history.',
    capabilities: [
      'Keyword analysis and LinkedIn SEO scoring per post',
      'Posting-time and frequency recommendations based on your audience',
      'Engagement pattern detection across your content archive',
    ],
    cta: 'Coming soon',
    ctaPath: null,
    ctaDisabled: true,
    ctaBg: `linear-gradient(90deg,${VIOLET},#A78BFA)`,
  },
  {
    key: 'analytics',
    name: 'Analytics Agent',
    tagline: 'Plain-English answers about your post performance',
    tileBg: '#E6F6FE',
    tileColor: SKY,
    statusBg: '#E6F6FE',
    statusColor: SKY,
    dotColor: SKY,
    status: 'Coming soon',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="26" height="26">
        <path d="M3 19V9M7 19V6M11 19v-4M15 19V3M19 19v-7"/>
      </svg>
    ),
    description: 'Digs into your post performance data — impressions, reactions, and publish history — and answers questions in plain English. Ask anything about your numbers and get clear answers about what\'s working and what to change.',
    capabilities: [
      'Impressions, likes, and engagement rate breakdown per post',
      'Trend analysis: what topics and formats perform best for you',
      'Natural language Q&A over your full analytics history',
    ],
    cta: 'Coming soon',
    ctaPath: null,
    ctaDisabled: true,
    ctaBg: `linear-gradient(90deg,${SKY},${BLUE})`,
  },
];

export default function AgentsPage() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  return (
    <div style={{ display: 'flex', height: '100vh', background: BG, fontFamily: FONT, overflow: 'hidden' }}>
      <AppSidebar
        navigate={navigate}
        activeKey="agents"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
      />

      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 400, color: INK, margin: '0 0 8px' }}>
            Your AI Team
          </h1>
          <p style={{ fontSize: 15, color: BODY, margin: 0, maxWidth: 560 }}>
            Every agent has a specific role. They work together behind the scenes — your message always goes through the supervisor, which decides which specialist handles it.
          </p>
        </div>

        {/* Agent cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20 }}>
          {AGENTS.map(agent => (
            <div
              key={agent.key}
              style={{
                background: WHITE, border: `1px solid ${BDR}`, borderRadius: 20, padding: 24,
                boxShadow: '0 16px 38px -28px rgba(17,24,39,.2)',
                display: 'flex', flexDirection: 'column',
              }}
            >
              {/* Icon + status row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, background: agent.tileBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ color: agent.tileColor, display: 'flex' }}>{agent.icon}</span>
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
                  background: agent.statusBg, color: agent.statusColor, fontFamily: FONT,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: agent.dotColor,
                    display: 'inline-block',
                    animation: agent.ctaDisabled ? 'none' : 'ccPulse 2s ease-in-out infinite',
                    opacity: agent.ctaDisabled ? 0.5 : 1,
                  }} />
                  {agent.status}
                </span>
              </div>

              {/* Name + tagline */}
              <div style={{ fontSize: 16, fontWeight: 700, color: INK, marginBottom: 4 }}>{agent.name}</div>
              <div style={{ fontSize: 13, color: agent.tileColor, fontWeight: 600, marginBottom: 12 }}>{agent.tagline}</div>

              {/* Description */}
              <p style={{ fontSize: 13.5, color: BODY, lineHeight: 1.6, margin: '0 0 16px' }}>
                {agent.description}
              </p>

              {/* Capabilities */}
              <div style={{ marginBottom: 20, flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.07em', fontFamily: MONO, marginBottom: 8 }}>
                  What it does
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {agent.capabilities.map((cap, i) => (
                    <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: BODY, lineHeight: 1.45 }}>
                      <span style={{ color: agent.tileColor, flexShrink: 0, marginTop: 1, fontWeight: 700 }}>·</span>
                      {cap}
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA */}
              <button
                disabled={agent.ctaDisabled}
                onClick={() => !agent.ctaDisabled && navigate(agent.ctaPath)}
                style={{
                  background: agent.ctaDisabled ? '#E5E7EB' : agent.ctaBg,
                  border: 'none', color: agent.ctaDisabled ? MUTED : WHITE,
                  borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 600,
                  fontFamily: FONT, cursor: agent.ctaDisabled ? 'not-allowed' : 'pointer',
                  width: '100%', textAlign: 'center',
                  opacity: agent.ctaDisabled ? 0.7 : 1,
                }}
              >
                {agent.cta}
              </button>
            </div>
          ))}
        </div>

        {/* How it works note */}
        <div style={{
          marginTop: 32, padding: '18px 22px', borderRadius: 14,
          background: WHITE, border: `1px solid ${BDR}`,
          display: 'flex', gap: 14, alignItems: 'flex-start',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: '#EAF0FF', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 20 20" fill="none" stroke={BLUE} strokeWidth="1.7" width="16" height="16">
              <circle cx="10" cy="10" r="8"/><path d="M10 6v4M10 14h.01"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 }}>How the agents work together</div>
            <p style={{ fontSize: 13, color: BODY, margin: 0, lineHeight: 1.6 }}>
              Every message you send goes to the <strong>Supervisor</strong> first. It reads your intent and routes to the right specialist — Research, Writer, or Analytics. Agents never receive your raw message directly; the supervisor enriches it with context before dispatching. This means you always get the right expert, automatically.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
