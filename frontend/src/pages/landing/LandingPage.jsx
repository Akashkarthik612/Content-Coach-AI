import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/* ─── Design tokens (Honne) ──────────────────────────────────────────────── */
const C = {
  bg:        '#F3F1E7',
  panel:     '#F4F2EA',
  chrome:    '#EFEDE3',
  toolbar:   '#FBFAF5',
  altBg:     '#EAE7DA',
  ink:       '#17180F',
  body:      '#5B5F52',
  faint:     '#8A9089',
  faint2:    '#A6A895',
  faint3:    '#A0A69F',
  muted:     '#7A7C6C',
  green:     '#14663B',
  greenBright: '#2FA35B',
  greenLight:  '#7BD389',
  greenPaleAlt:'#E3F0E7',
  darkGreen: '#0C3D22',
  maroon:    '#6B1F2A',
}
const FONT = {
  serif: "'EB Garamond', serif",
  sans:  "'Hanken Grotesk', system-ui, sans-serif",
  mono:  "'JetBrains Mono', monospace",
}

const MicIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" fill="#fff" />
    <path d="M6 11a6 6 0 0 0 12 0" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12" y2="21" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
const ArrowIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

function Eyebrow({ children }) {
  return (
    <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.24em', textTransform: 'uppercase', color: C.green, marginBottom: 14 }}>
      {children}
    </div>
  )
}
function PulseDots({ colors, size = 7, gap = 4 }) {
  return (
    <span style={{ display: 'inline-flex', gap }}>
      {colors.map((color, i) => (
        <span key={i} style={{ width: size, height: size, borderRadius: '50%', background: color, animation: `hPulse 2s infinite ${i * 0.3}s` }} />
      ))}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Nav                                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
function Nav() {
  const navigate = useNavigate()
  const linkStyle = { fontSize: 14, fontWeight: 600, color: C.body }
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 50, padding: '16px 40px', backdropFilter: 'blur(6px)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px' }}>
        <span style={{ fontFamily: FONT.serif, fontWeight: 700, fontSize: 30, letterSpacing: '-.02em', color: C.green }}>Honne AI</span>
        <div className="hn-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <a href="#method" style={linkStyle}>How it works</a>
          <a href="#agents" style={linkStyle}>The agents</a>
          <a href="#flow" style={linkStyle}>For creators</a>
          <span
            onClick={() => navigate('/login')}
            style={{ ...linkStyle, cursor: 'pointer', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
          >
            Log in
          </span>
          <button
            onClick={() => navigate('/register')}
            className="hn-pill-btn"
            style={{ fontSize: 14, fontWeight: 700, color: C.bg, background: C.green, border: 'none', padding: '11px 20px', borderRadius: 12, boxShadow: '0 8px 18px -8px rgba(20,102,59,.7)', cursor: 'pointer', minHeight: 44 }}
          >
            Start writing
          </button>
        </div>
      </div>
    </nav>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Hero                                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */
function Hero() {
  const navigate = useNavigate()
  return (
    <section className="hn-hero-grid" style={{ maxWidth: 1200, margin: '0 auto', padding: '52px 40px 44px', display: 'grid', gridTemplateColumns: '1.04fr .96fr', gap: 52, alignItems: 'center' }}>
      <div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: '#fff', border: '1.5px solid rgba(20,24,15,.1)', borderRadius: 999, padding: '8px 15px 8px 11px', marginBottom: 26, boxShadow: '0 8px 20px -12px rgba(20,60,30,.35)' }}>
          <PulseDots colors={[C.green, C.greenBright, C.greenLight]} />
          <span style={{ fontSize: 13, color: C.body, fontWeight: 600 }}>Six specialized agents. One voice: yours.</span>
        </span>

        <h1 className="hn-hero-h1" style={{ fontWeight: 800, fontSize: 46, lineHeight: 1.1, letterSpacing: '-.03em', margin: 0, color: C.ink }}>
          Create and automate <span style={{ fontSize: 60, letterSpacing: '-.035em', color: C.greenBright }}>content creation</span> with specialized <span style={{ color: C.maroon }}>AI agents</span>.
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: C.body, margin: '24px 0 0', maxWidth: 470, fontWeight: 500 }}>
          In a world full of generic AI spam, Honne writes in your voice and your style. Give it a thought, a link, or a document. It researches, drafts, and ships posts that sound like the top 1% of your feed, because they sound like you.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 32 }}>
          <button
            onClick={() => navigate('/register')}
            className="hn-pill-btn"
            style={{ fontSize: 15, fontWeight: 700, color: C.bg, background: C.green, border: 'none', padding: '15px 28px', borderRadius: 14, boxShadow: '0 16px 34px -12px rgba(20,102,59,.75)', cursor: 'pointer', minHeight: 44 }}
          >
            Start writing
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: C.greenPaleAlt, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.serif, fontWeight: 700, fontSize: 13, flex: 'none' }}>A</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.muted, whiteSpace: 'nowrap' }}>Built by <span style={{ color: C.green, fontWeight: 700 }}>Akash Balamurugan</span></span>
          <span style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.faint3, whiteSpace: 'nowrap' }}>· Solo project · 2026</span>
        </div>

        <div style={{ display: 'flex', gap: 30, marginTop: 34, paddingTop: 26, borderTop: '1px solid rgba(20,24,15,.1)' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 26, color: C.green, lineHeight: 1 }}>6</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.faint, marginTop: 6 }}>Agents</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 26, color: C.green, lineHeight: 1 }}>30 min</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.faint, marginTop: 6 }}>To a week of posts</div>
          </div>
        </div>
      </div>

      {/* Hero product view: input -> agents -> output */}
      <div style={{ background: '#fff', border: '1.5px solid rgba(20,24,15,.12)', borderRadius: 22, padding: 22, boxShadow: '0 40px 84px -40px rgba(20,60,30,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(20,24,15,.14)' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(20,24,15,.14)' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(20,24,15,.14)' }} />
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: C.faint3 }}>Honne workspace</span>
        </div>
        <div style={{ background: C.bg, borderRadius: 14, padding: '14px 16px', fontSize: 14, lineHeight: 1.55, color: C.ink, fontWeight: 500 }}>
          Turn this quarterly retro into a LinkedIn post about why our deploy time halved.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, margin: '16px 0' }}>
          {[
            { n: '01', name: 'Researcher', status: '6 sources', statusColor: C.greenBright, iconBg: C.greenPaleAlt, iconColor: C.green, live: false },
            { n: '02', name: 'Series Generator', status: '6 days of posts', statusColor: C.greenBright, iconBg: C.greenPaleAlt, iconColor: C.green, live: false },
            { n: '03', name: 'Writer', status: 'drafting', statusColor: C.green, iconBg: C.green, iconColor: '#fff', live: true },
          ].map((row) => (
            <div key={row.n} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, background: row.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: row.iconColor, fontFamily: FONT.mono, fontSize: 9, fontWeight: 700 }}>{row.n}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{row.name}</span>
              <span style={{ flex: 1, height: 1, background: 'rgba(20,24,15,.08)' }} />
              {row.live ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FONT.mono, fontSize: 10, color: row.statusColor }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.greenBright, animation: 'hPulse 1.4s infinite' }} />drafting
                </span>
              ) : (
                <span style={{ fontFamily: FONT.mono, fontSize: 10, color: row.statusColor }}>{row.status}</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(20,24,15,.1)', paddingTop: 16 }}>
          <p style={{ fontFamily: FONT.serif, fontSize: 19, lineHeight: 1.5, margin: 0, color: C.ink }}>
            We cut deploy time from 42 minutes to 19. Nobody wrote a new pipeline. We just stopped waiting on ourselves.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <span style={{ fontFamily: FONT.serif, fontStyle: 'italic', color: C.green, fontWeight: 700, fontSize: 17 }}>H</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.faint }}>Written in your voice</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Method — chat + post preview product shot                                   */
/* ─────────────────────────────────────────────────────────────────────────── */
const ANGLES = [
  { title: 'The 19-minute deploy', sub: 'What you deleted, not what you built.' },
  { title: 'The 2021 approval step', sub: 'Why old scar tissue outlives the incident.' },
  { title: 'Queue time is the cost', sub: 'The benchmark most teams measure wrong.' },
]
const MINI_STEPS = [
  { n: '01', title: 'Research the claim', desc: 'Every number comes back with a source and one opposing view, so the post holds up in the comments.' },
  { n: '02', title: 'Draft in your voice', desc: 'The draft is scored against your own writing, not a generic tone dial.' },
  { n: '03', title: 'One topic, a whole series', desc: 'Give it an idea and a length. It plans the arc, then writes each day in order.' },
  { n: '04', title: 'Publish or schedule', desc: 'Approve in the preview pane and send it out, or queue the week from one screen.' },
]
const POST_PARAGRAPHS = [
  'We cut deploy time from 42 minutes to 19.',
  'Nobody wrote a new pipeline. We deleted three approval steps that existed because someone got burned in 2021.',
  'Here is what we found when we actually timed the pipeline:',
]

function Method() {
  return (
    <section id="method" style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 40px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40, marginBottom: 36, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>How it works</Eyebrow>
          <h2 style={{ fontWeight: 800, fontSize: 44, letterSpacing: '-.03em', margin: 0 }}>The Honne method</h2>
        </div>
        <p style={{ fontSize: 15, color: C.body, margin: 0, fontWeight: 500, maxWidth: 420 }}>
          Ask on the left, watch the post build on the right. One hour of thinking becomes a full week of presence.
        </p>
      </div>

      <div style={{ border: '1.5px solid rgba(20,24,15,.12)', borderRadius: 22, overflow: 'hidden', background: '#fff', boxShadow: '0 44px 90px -50px rgba(20,60,30,.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: C.chrome, borderBottom: '1px solid rgba(20,24,15,.08)' }}>
          <span style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(20,24,15,.16)' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(20,24,15,.16)' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(20,24,15,.16)' }} />
          </span>
          <span style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: C.muted, whiteSpace: 'nowrap' }}>Honne AI · Workspace</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.greenBright, animation: 'hPulse 1.6s infinite' }} />
            <span style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.green, whiteSpace: 'nowrap' }}>4 agents live</span>
          </span>
        </div>

        <div className="hn-product-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.08fr)' }}>
          {/* LEFT: chat */}
          <div style={{ background: C.panel, borderRight: '1px solid rgba(20,24,15,.1)', padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ background: C.ink, color: C.bg, fontSize: 13, fontWeight: 600, lineHeight: 1.45, padding: '11px 16px', borderRadius: '16px 16px 5px 16px', maxWidth: '80%' }}>
                Write a post about our deploy time dropping to 19 minutes
              </div>
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint2, textAlign: 'right', marginTop: -8 }}>11:48 PM</div>

            <div style={{ background: '#fff', border: '1px solid rgba(20,24,15,.09)', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 14px 32px -28px rgba(20,60,30,.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: C.green, color: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.serif, fontStyle: 'italic', fontWeight: 700, fontSize: 14 }}>H</span>
                <span style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: C.muted }}>Orchestrator</span>
              </div>
              <p style={{ fontSize: 12.5, lineHeight: 1.6, color: C.body, margin: 0, fontWeight: 500 }}>
                I read the incident doc and checked the numbers with the Researcher. Three angles hold up. Pick one and the Writer drafts it in your voice.
              </p>
              {ANGLES.map((a) => (
                <div key={a.title} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.ink }}>
                    <span style={{ color: C.greenBright }}>→</span> <strong style={{ fontWeight: 700 }}>{a.title}</strong> <span style={{ color: C.body, fontWeight: 500 }}>{a.sub}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {['Draft for LinkedIn', 'Draft for X', 'Expand'].map((label) => (
                      <span key={label} style={{ fontSize: 10.5, fontWeight: 700, color: C.green, background: '#fff', border: '1px solid rgba(20,102,59,.25)', borderRadius: 8, padding: '6px 10px', whiteSpace: 'nowrap' }}>{label}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ background: C.ink, color: C.bg, fontSize: 13, fontWeight: 600, lineHeight: 1.45, padding: '11px 16px', borderRadius: '16px 16px 5px 16px', maxWidth: '80%' }}>
                Draft the LinkedIn post on the first angle
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid rgba(20,24,15,.12)', borderRadius: 999, padding: '9px 10px 9px 16px' }}>
              <span style={{ fontSize: 13, color: C.faint2, fontWeight: 500, flex: 1 }}>Ask Honne anything</span>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: C.green, color: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>↑</span>
            </div>
          </div>

          {/* RIGHT: post preview */}
          <div style={{ background: '#fff', display: 'flex', flexDirection: 'column' }}>
            <div className="hn-toolbar-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid rgba(20,24,15,.08)', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.greenPaleAlt, borderRadius: 8, padding: '5px 9px' }}>
                <span style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.green, fontWeight: 700 }}>LinkedIn</span>
              </span>
              <span style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.faint2 }}>X thread</span>
              <div style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.faint2 }}>Preview mode</div>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, border: '1px solid rgba(20,24,15,.16)', borderRadius: 9, padding: '7px 12px' }}>Schedule</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.bg, background: C.green, borderRadius: 9, padding: '7px 14px' }}>Publish</span>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderBottom: '1px solid rgba(20,24,15,.08)', background: C.toolbar }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.ink, background: '#fff', border: '1px solid rgba(20,24,15,.14)', borderRadius: 8, padding: '5px 11px' }}>View</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, padding: '5px 9px' }}>Edit</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>Copy</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>Save as draft</span>
              </span>
            </div>

            <div style={{ padding: '20px 18px', flex: 1, background: C.panel }}>
              <div style={{ background: '#fff', border: '1px solid rgba(20,24,15,.09)', borderRadius: 16, padding: 18, boxShadow: '0 18px 40px -34px rgba(20,60,30,.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', background: C.greenPaleAlt, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.serif, fontWeight: 700, fontSize: 16 }}>V</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>Vani</div>
                    <div style={{ fontSize: 10.5, color: C.faint2, fontWeight: 500 }}>Platform engineering · 2d</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontFamily: FONT.mono, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.green, background: C.greenPaleAlt, borderRadius: 6, padding: '4px 7px' }}>94% voice match</span>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.72, color: C.ink, display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {POST_PARAGRAPHS.map((p) => <p key={p} style={{ margin: 0 }}>{p}</p>)}
                  <p style={{ margin: 0 }}>
                    → Build was never the problem. It was 6 minutes.<br />
                    → Waiting for a human to click approve was 21 minutes.<br />
                    → Two of the three approvals had no owner left at the company.
                  </p>
                  <p style={{ margin: 0 }}>Queue time, not build time, is where most teams lose the day.</p>
                  <p style={{ margin: 0 }}>We kept one gate: the one that touches customer data. Everything else ships on merge.</p>
                  <p style={{ margin: 0, color: C.body }}>What is the oldest approval step in your pipeline, and who added it?</p>
                </div>
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(20,24,15,.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint2 }}>Sourced from 6 references</span>
                  <span style={{ marginLeft: 'auto', fontFamily: FONT.mono, fontSize: 9.5, color: C.muted }}>1,258 characters</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="hn-steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 28, marginTop: 38 }}>
        {MINI_STEPS.map((s) => (
          <div key={s.n} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', color: C.greenBright }}>{s.n}</span>
            <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-.02em' }}>{s.title}</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.body, margin: 0, fontWeight: 500 }}>{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Agents — orbit diagram                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */
const AGENTS_LEFT = [
  { n: '01', name: 'Researcher', io: 'Topic → cited brief' },
  { n: '02', name: 'Voice Analyst', io: 'Samples → voice profile' },
  { n: '03', name: 'Writer', io: 'Brief → draft' },
]
const AGENTS_RIGHT = [
  { n: '04', name: 'Series', io: 'Idea → post sequence' },
  { n: '05', name: 'URL to Post', io: 'Link → LinkedIn post' },
  { n: '06', name: 'Knowledge to Post', io: 'Document → post' },
]
const ORBIT_PATHS_LEFT = [
  'M232,63 C340,63 360,180 405,228',
  'M232,240 L405,240',
  'M232,417 C340,417 360,300 405,252',
]
const ORBIT_PATHS_RIGHT = [
  'M768,63 C660,63 640,180 595,228',
  'M768,240 L595,240',
  'M768,417 C660,417 640,300 595,252',
]

function AgentOrbitCard({ n, name, io, reverse }) {
  return (
    <div style={{ background: '#fff', border: '1.5px solid rgba(20,24,15,.1)', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 18px 38px -32px rgba(20,60,30,.5)', flexDirection: reverse ? 'row-reverse' : 'row', textAlign: reverse ? 'left' : 'right' }}>
      <span style={{ width: 36, height: 36, borderRadius: 11, background: C.greenPaleAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: C.green, flex: 'none' }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15.5, letterSpacing: '-.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint2, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{io}</div>
      </div>
    </div>
  )
}

function AgentsOrbit() {
  return (
    <section id="agents" style={{ padding: '70px 40px 84px', background: C.altBg }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 20px' }}>
          <Eyebrow>The agents</Eyebrow>
          <h2 style={{ fontWeight: 800, fontSize: 44, letterSpacing: '-.03em', margin: '0 0 12px' }}>Six specialists, one orchestrator</h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: C.body, margin: 0, fontWeight: 500 }}>
            Let the specialists do the researching, maintaining your voice, gathering ideas from knowledge sources and monitoring your analytics, while you focus on improving your content.
          </p>
        </div>

        <div className="hn-orbit-grid" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(180px,260px) minmax(0,1fr) minmax(180px,260px)', alignItems: 'center', gap: 0, minHeight: 480 }}>
          <svg viewBox="0 0 1000 480" preserveAspectRatio="none" className="hn-orbit-svg" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {[...ORBIT_PATHS_LEFT, ...ORBIT_PATHS_RIGHT].map((d) => (
              <g key={d}>
                <path d={d} fill="none" stroke="rgba(20,102,59,.28)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                <path d={d} fill="none" stroke={C.greenBright} strokeWidth="1.6" strokeDasharray="4 14" vectorEffect="non-scaling-stroke" style={{ animation: 'hFlow 1.9s linear infinite' }} />
              </g>
            ))}
          </svg>

          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 420 }}>
            {AGENTS_LEFT.map((a) => <AgentOrbitCard key={a.n} {...a} />)}
          </div>

          <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ position: 'absolute', width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,163,91,.30) 0%, rgba(47,163,91,0) 68%)', animation: 'hHalo 4.2s ease-in-out infinite' }} />
            <div style={{ position: 'relative', width: 196, height: 196, borderRadius: '50%', background: '#fff', border: '1.5px solid rgba(20,102,59,.22)', boxShadow: '0 32px 64px -34px rgba(20,102,59,.75)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <span style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontWeight: 700, fontSize: 62, lineHeight: 1, color: C.green }}>H</span>
              <span style={{ fontFamily: FONT.serif, fontWeight: 700, fontSize: 20, letterSpacing: '-.01em', color: C.green, marginTop: 6 }}>Honne AI</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: C.faint2 }}>Orchestrator</span>
            </div>
          </div>

          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 420 }}>
            {AGENTS_RIGHT.map((a) => <AgentOrbitCard key={a.n} {...a} reverse />)}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: C.muted }}>Every run leaves a trace you can open</span>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Voice Vault                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */
const VAULT_CHECKLIST = ['Writing samples imported', 'LinkedIn history analyzed', 'Style memory created', 'Brand voice learned', 'Context vault active']

function VoiceVault() {
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '84px 40px' }}>
      <div className="hn-voice-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
        <div>
          <Eyebrow>Voice Vault</Eyebrow>
          <h2 style={{ fontWeight: 800, fontSize: 46, lineHeight: 1.03, letterSpacing: '-.03em', margin: '0 0 24px' }}>Teach the agents your voice once</h2>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: C.body, maxWidth: 430, margin: '0 0 32px', fontWeight: 500 }}>
            Import your best work. The Voice Analyst extracts your sentence rhythm, your recurring phrases and the opinions you actually hold, then every other agent writes against that profile.
          </p>
          <div style={{ height: 1, background: 'rgba(20,24,15,.12)', marginBottom: 28 }} />
          <div style={{ display: 'flex', gap: 52 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 40, lineHeight: 1, marginBottom: 8, color: C.green }}>94%</div>
              <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: C.faint }}>Voice match</div>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 40, lineHeight: 1, marginBottom: 8, color: C.green }}>47</div>
              <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: C.faint }}>Samples learned</div>
            </div>
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, transform: 'translate(12px,12px)', background: C.green, borderRadius: 22 }} />
          <div style={{ position: 'relative', background: '#fff', border: `1.5px solid ${C.green}`, borderRadius: 22, padding: '32px 34px', display: 'flex', flexDirection: 'column', gap: 24, boxShadow: '0 30px 60px -34px rgba(20,60,30,.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ width: 48, height: 48, borderRadius: 12, background: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MicIcon /></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Your Voice Vault</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: C.greenBright, marginTop: 3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.greenBright, animation: 'hPulse 1.8s infinite' }} />Active
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {VAULT_CHECKLIST.map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ color: C.greenBright, fontSize: 15, fontWeight: 700 }}>✓</span>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Template Library                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */
const TEMPLATES = [
  { tag: 'STORY', name: 'Founder Story', desc: 'Turn your origin into a narrative that builds trust.' },
  { tag: 'TEACH', name: 'Educate', desc: 'Explain a complex idea with a repeatable model.' },
  { tag: 'BUILD', name: 'Build in Public', desc: 'Share progress and bring your audience along.' },
  { tag: 'LEARN', name: 'Lessons Learned', desc: 'Distill hard-won experience into authoritative insight.' },
]

function TemplateLibrary() {
  const navigate = useNavigate()
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 40px 84px', textAlign: 'center' }}>
      <Eyebrow>Template library</Eyebrow>
      <h2 style={{ fontWeight: 800, fontSize: 44, letterSpacing: '-.03em', margin: '0 0 12px' }}>Start from a proven structure</h2>
      <p style={{ fontSize: 15, color: C.body, margin: '0 auto 48px', maxWidth: 560, fontWeight: 500 }}>Pick a shape for the post. The agents fill it with your material, not a template's.</p>
      <div className="hn-tmpl-grid">
        {TEMPLATES.map((t) => (
          <div key={t.name} className="hn-tmpl-card" style={{ display: 'flex', flexDirection: 'column', background: '#fff', border: '1.5px solid rgba(20,24,15,.1)', borderRadius: 20, padding: 28, boxShadow: '0 22px 46px -30px rgba(20,60,30,.4)', textAlign: 'left' }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: C.greenPaleAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22, fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: C.green }}>{t.tag}</span>
            <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.02em', marginBottom: 10 }}>{t.name}</div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: C.body, marginBottom: 24 }}>{t.desc}</div>
            <button onClick={() => navigate('/register')} className="hn-tmpl-btn" style={{ marginTop: 'auto', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 12, padding: '7px 7px 7px 18px', border: '1.5px solid rgba(20,24,15,.2)', borderRadius: 999, background: '#fff', fontFamily: FONT.sans, fontSize: 13, fontWeight: 700, color: C.ink, cursor: 'pointer' }}>
              Use template
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: C.greenBright, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowIcon /></span>
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Flow — toggle pills                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
const FLOWS = [
  { name: 'The Founder', desc: 'Build authority while running a company. Turn your internal memos and meetings into a thought-leadership engine.', b1: '30 min/day, not 3hr/day', b2: "Transforms 1-on-1's into posts" },
  { name: 'The Ghostwriter', desc: 'Manage 10 clients with the mental load of 1. Switch voice profiles instantly and keep high-quality output for every client.', b1: 'Per-client voice fingerprints', b2: 'Bulk export & scheduling' },
  { name: 'The Solo Creator', desc: 'Scale from 1 platform to 5 without the burnout. Let the agents handle formatting while you focus on the big ideas.', b1: 'Focus on ideation only', b2: 'Never-miss-a-post engine' },
  { name: 'The Operator', desc: 'Executive presence made easy. Turn voice notes recorded during your commute into polished industry analysis.', b1: 'No more blank-page anxiety', b2: 'Scales your thinking, not your typing' },
]

function FlowSection() {
  const [flowIdx, setFlowIdx] = useState(0)
  const flow = FLOWS[flowIdx]

  return (
    <section id="flow" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 40px 88px', textAlign: 'center' }}>
      <h2 style={{ fontWeight: 800, fontSize: 44, letterSpacing: '-.03em', margin: 0 }}>Built for your flow</h2>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', margin: '34px 0 30px' }}>
        {FLOWS.map((f, i) => {
          const isActive = flowIdx === i
          return (
            <button
              key={f.name}
              onClick={() => setFlowIdx(i)}
              style={{
                fontFamily: FONT.mono, fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase',
                padding: '11px 20px', borderRadius: 12, cursor: 'pointer', transition: 'background-color .25s ease,color .25s ease,border-color .25s ease',
                background: isActive ? C.green : 'transparent', color: isActive ? C.bg : C.ink,
                border: isActive ? `1.5px solid ${C.green}` : '1.5px solid rgba(23,24,15,.75)',
              }}
            >
              {f.name}
            </button>
          )
        })}
      </div>
      <div key={flowIdx} style={{ background: '#fff', border: '1.5px solid rgba(20,24,15,.1)', borderRadius: 22, padding: 44, maxWidth: 640, margin: '0 auto', textAlign: 'left', boxShadow: '0 30px 64px -36px rgba(20,60,30,.45)', animation: 'hWordIn .45s cubic-bezier(.22,1,.36,1)' }}>
        <div style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-.02em', marginBottom: 12 }}>{flow.name}</div>
        <div style={{ fontSize: 15, lineHeight: 1.65, color: C.body, marginBottom: 20, fontWeight: 500 }}>{flow.desc}</div>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.04em', color: C.green, marginBottom: 8 }}>— {flow.b1}</div>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.04em', color: C.green }}>— {flow.b2}</div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Final CTA + Footer                                                          */
/* ─────────────────────────────────────────────────────────────────────────── */
function FinalCTA() {
  const navigate = useNavigate()
  return (
    <section style={{ padding: '104px 40px 112px', textAlign: 'center', background: C.green, color: C.bg }}>
      <h2 style={{ fontWeight: 800, fontSize: 52, lineHeight: 1.04, letterSpacing: '-.03em', margin: '0 0 18px', color: C.bg }}>
        Stop sounding like<br />everyone else&apos;s AI.
      </h2>
      <p style={{ fontSize: 15.5, lineHeight: 1.6, color: 'rgba(243,241,231,.85)', margin: '0 auto 34px', maxWidth: 480, fontWeight: 500 }}>
        Build an authority engine that scales your thinking, not your post count.
      </p>
      <button
        onClick={() => navigate('/register')}
        className="hn-pill-btn"
        style={{ display: 'inline-block', fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: C.green, background: C.bg, padding: '17px 34px', borderRadius: 14, border: 'none', boxShadow: '0 18px 40px -12px rgba(0,0,0,.4)', cursor: 'pointer', minHeight: 44 }}
      >
        Start writing
      </button>
      <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(243,241,231,.6)', marginTop: 26 }}>
        © 2026 Honne. The art of true voice.
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ background: C.darkGreen, color: C.bg, padding: '60px 40px' }}>
      <div className="hn-footer-grid" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.4fr 2fr', gap: 40 }}>
        <div>
          <div style={{ fontFamily: FONT.serif, fontWeight: 600, fontSize: 26, color: C.bg }}>Honne</div>
          <div style={{ fontSize: 13, fontStyle: 'italic', color: 'rgba(243,241,231,.75)', marginTop: 14, maxWidth: 320, lineHeight: 1.6 }}>
            Crafted by four friends united by a simple mission: to build together while exploring everything life has to offer.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <span style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,.28)', fontFamily: FONT.mono, fontSize: 11 }}>in</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 24 }}>
          {[
            { title: 'Product', items: ['How it works', 'The agents', 'For creators'] },
            { title: 'Resources', items: ['Docs', 'API reference', 'Voice guide'] },
            { title: 'Company', items: ['About', 'Privacy', 'Terms'] },
          ].map((col) => (
            <div key={col.title} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(243,241,231,.5)', marginBottom: 4 }}>{col.title}</div>
              {col.items.map((it) => (
                <div key={it} style={{ fontSize: 13.5, color: 'rgba(243,241,231,.8)' }}>{it}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </footer>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Page root                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="hn-landing" style={{ overflowX: 'hidden', background: C.bg, backgroundImage: 'radial-gradient(rgba(20,102,59,.08) 1.4px, transparent 1.4px)', backgroundSize: '26px 26px', color: C.ink, fontFamily: FONT.sans }}>
      <style>{`
        @keyframes hPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.8); } }
        @keyframes hFlow { to { stroke-dashoffset: -36; } }
        @keyframes hHalo { 0%,100% { transform: scale(1); opacity: .55; } 50% { transform: scale(1.12); opacity: .25; } }
        @keyframes hWordIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { [style*="animation"] { animation: none !important; } }

        .hn-pill-btn { transition: transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease; }
        .hn-pill-btn:hover { transform: translateY(-1px); }
        .hn-pill-btn:active { transform: translateY(0) scale(.98); }

        .hn-landing ::selection { background: ${C.greenLight}; color: ${C.ink}; }
        .hn-landing section[id] { scroll-margin-top: 90px; }

        .hn-tmpl-card { transition: transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease; }
        .hn-tmpl-card:hover { transform: translateY(-1px); box-shadow: 0 30px 56px -28px rgba(20,60,30,.5); }
        .hn-tmpl-btn { transition: border-color .18s ease; }
        .hn-tmpl-btn:hover { border-color: #14663B; }

        .hn-tmpl-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 22px; text-align: left; }

        @media (max-width: 860px) { .hn-nav-links { display: none !important; } }
        @media (max-width: 900px) {
          .hn-hero-grid { grid-template-columns: 1fr !important; }
          .hn-voice-grid { grid-template-columns: 1fr !important; }
          .hn-product-grid { grid-template-columns: 1fr !important; }
          .hn-footer-grid { grid-template-columns: 1fr !important; text-align: center; }
          .hn-orbit-grid { grid-template-columns: 1fr !important; min-height: auto !important; gap: 14px !important; }
          .hn-orbit-svg { display: none; }
        }
        @media (max-width: 767px) {
          .hn-hero-h1 { font-size: 34px !important; }
          .hn-steps-grid { grid-template-columns: 1fr !important; }
          .hn-tmpl-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 1023px) and (min-width: 768px) {
          .hn-tmpl-grid { grid-template-columns: repeat(2,1fr) !important; }
          .hn-steps-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
      `}</style>

      <Nav />
      <main>
        <Hero />
        <Method />
        <AgentsOrbit />
        <VoiceVault />
        <TemplateLibrary />
        <FlowSection />
      </main>
      <FinalCTA />
      <Footer />
    </div>
  )
}
