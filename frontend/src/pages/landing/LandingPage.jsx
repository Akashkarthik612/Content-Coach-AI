import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/* ─── Design tokens (Honne) ──────────────────────────────────────────────── */
const C = {
  bg:        '#F3F1E7',
  altBg:     '#EAE7DA',
  ink:       '#17180F',
  body:      '#5B5F52',
  faint:     '#8A9089',
  green:     '#14663B',
  greenBright: '#2FA35B',
  greenLight:  '#7BD389',
  greenPale:   '#CDEBD6',
  greenPaleAlt:'#E3F0E7',
  darkGreen: '#0C3D22',
}
const FONT = {
  serif: "'EB Garamond', serif",
  sans:  "'Hanken Grotesk', system-ui, sans-serif",
  mono:  "'JetBrains Mono', monospace",
}

/* ─── Icons ──────────────────────────────────────────────────────────────── */
const SearchIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth="1.8" />
    <line x1="15.3" y1="15.3" x2="21" y2="21" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)
const PenIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 20l1.2-4.4L16.6 4.2a1.6 1.6 0 0 1 2.3 0l1 1a1.6 1.6 0 0 1 0 2.3L8.5 18.8 4 20z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
)
const TargetIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 18l5-6 4 4 7-9" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 6h5v5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const BookIcon = ({ size = 30, color = '#14663B' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 6.5C10.5 5 8 4.6 4 5v13c4-.6 6.5-.2 8 1.3 1.5-1.5 4-1.9 8-1.3V5c-4-.4-6.5 0-8 1.5z" />
    <path d="M12 6.5V20" />
  </svg>
)
const CapIcon = ({ size = 30, color = '#14663B' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9l9-4 9 4-9 4-9-4z" />
    <path d="M7 11.5V16c0 1 2.2 2 5 2s5-1 5-2v-4.5" />
    <path d="M21 9v5" />
  </svg>
)
const TrendIcon = ({ size = 30, color = '#14663B' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 18l5-6 4 4 7-9" />
    <path d="M15 7h6v6" />
  </svg>
)
const CaseIcon = ({ size = 30, color = '#14663B' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7.5" width="18" height="12.5" rx="2" />
    <path d="M8 7.5V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
  </svg>
)
const MicIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" fill="#fff" />
    <path d="M6 11a6 6 0 0 0 12 0" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12" y2="21" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
const LinkedInMark = ({ size = 24, color = '#14663B' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" />
  </svg>
)
const XMark = ({ size = 20, color = '#17180F' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)
const RedditMark = ({ size = 24, color = '#FF4500' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12c-.688 0-1.25.562-1.25 1.25 0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.248 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.249-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.119-.071 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.599.6-1.941.804-2.532.804-.591 0-1.932-.204-2.532-.804a.325.325 0 0 0-.192-.094z" />
  </svg>
)
const ArrowIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

/* ─── Small primitives ───────────────────────────────────────────────────── */
function Eyebrow({ children }) {
  return (
    <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.24em', textTransform: 'uppercase', color: C.green, marginBottom: 14 }}>
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Nav                                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
function Nav() {
  const navigate = useNavigate()
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 50, padding: '16px 40px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT.serif, fontWeight: 600, fontSize: 25, letterSpacing: '-.01em', color: C.green }}>Honne</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div className="hn-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#5B5F52' }}>How it works</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#5B5F52' }}>For creators</span>
          </div>
          <button
            onClick={() => navigate('/login')}
            style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#5B5F52', background: 'none', border: 'none', cursor: 'pointer', padding: 0, minHeight: 44 }}
          >
            Log in
          </button>
          <button
            onClick={() => navigate('/register')}
            className="hn-pill-btn"
            style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: C.bg, background: C.green, border: 'none', padding: '12px 20px', borderRadius: 12, boxShadow: '0 8px 18px -8px rgba(20,102,59,.7)', cursor: 'pointer', minHeight: 44 }}
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
const ROT_WORDS = ['write', 'research', 'analyse']

function Hero() {
  const navigate = useNavigate()
  const [rotIdx, setRotIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setRotIdx((i) => (i + 1) % ROT_WORDS.length), 2200)
    return () => clearInterval(t)
  }, [])

  return (
    <section className="hn-hero-grid" style={{ maxWidth: 1200, margin: '0 auto', padding: '56px 40px 40px', display: 'grid', gridTemplateColumns: '1fr', gap: 48, alignItems: 'center' }}>
      <div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: '#fff', border: '1.5px solid rgba(20,24,15,.1)', borderRadius: 999, padding: '8px 15px 8px 11px', marginBottom: 26, boxShadow: '0 8px 20px -12px rgba(20,60,30,.35)' }}>
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, animation: 'hPulse 2s infinite' }} />
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.greenBright, animation: 'hPulse 2s infinite .3s' }} />
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.greenLight, animation: 'hPulse 2s infinite .6s' }} />
          </span>
          <span style={{ fontSize: 13, color: C.body, fontWeight: 600 }}>A team of agents that protect your voice</span>
        </span>

        <h1 className="hn-hero-h1" style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 68, lineHeight: 1, letterSpacing: '-.035em', margin: 0, color: C.ink }}>
          For creators<br />
          who <span key={rotIdx} style={{ display: 'inline-block', color: C.greenBright, animation: 'hWordIn .5s cubic-bezier(.22,1,.36,1)' }}>{ROT_WORDS[rotIdx]}</span>.<br />
          Not just post.
        </h1>

        <p style={{ fontSize: 16.5, lineHeight: 1.65, color: C.body, margin: '24px 0 0', maxWidth: 460, fontWeight: 500 }}>
          Stop competing with generic AI spam. Honne pairs you with a team of specialized AI agents that study your thinking, protect your voice, and turn your ideas into high-converting content ecosystems.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 32, flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/register')}
            className="hn-pill-btn"
            style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: C.bg, background: C.green, border: 'none', padding: '16px 28px', borderRadius: 14, boxShadow: '0 16px 34px -12px rgba(20,102,59,.75)', cursor: 'pointer', minHeight: 44 }}
          >
            Start writing
          </button>
          
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Method — staggered diagram with connectors                                  */
/* ─────────────────────────────────────────────────────────────────────────── */
const METHOD_STEPS = [
  { n: '01', left: 0, top: 150, title: 'Seed Your Voice', desc: 'Upload your best posts. Honne captures your specific sentence structures and insights.',
    svg: <svg viewBox="0 0 96 96" width={112} height={112} fill="none"><path d="M48 14a26 26 0 0 0-16 46c3 2.4 5 5 5.2 9h21.6c.2-4 2-6.6 5.2-9A26 26 0 0 0 48 14z" fill="#CDEBD6" stroke="#14663B" strokeWidth="3.5" strokeLinejoin="round" /><path d="M42 60c0-6-6-9-6-15a12 12 0 0 1 24 0c0 6-6 9-6 15" stroke="#2FA35B" strokeWidth="3" strokeLinecap="round" /><path d="M38 76h20M41 84h14" stroke="#14663B" strokeWidth="3.5" strokeLinecap="round" /></svg> },
  { n: '02', left: 266, top: 40, title: 'The Orchestrator', desc: 'Drop a raw thought. It challenges your thinking, fetches research, and structures the narrative first.',
    svg: <svg viewBox="0 0 96 96" width={112} height={112} fill="none"><rect x="14" y="20" width="68" height="52" rx="6" fill="#CDEBD6" stroke="#14663B" strokeWidth="3.5" /><path d="M14 34h68" stroke="#14663B" strokeWidth="3.5" /><circle cx="23" cy="27" r="2.3" fill="#14663B" /><circle cx="32" cy="27" r="2.3" fill="#14663B" /><circle cx="41" cy="27" r="2.3" fill="#14663B" /><rect x="23" y="44" width="20" height="19" rx="3" fill="#fff" stroke="#2FA35B" strokeWidth="3" /><path d="M51 47h22M51 55h22M51 63h13" stroke="#2FA35B" strokeWidth="3" strokeLinecap="round" /></svg> },
  { n: '03', left: 532, top: 170, title: 'Specialized Writing', desc: 'Agents craft content specific to each platform, from deep-dive essays to punchy social hooks.',
    svg: <svg viewBox="0 0 96 96" width={112} height={112} fill="none"><path d="M22 16h34a4 4 0 0 1 4 4v40l-13 13H26a4 4 0 0 1-4-4z" fill="#CDEBD6" stroke="#14663B" strokeWidth="3.5" strokeLinejoin="round" /><path d="M47 73V60h13" stroke="#14663B" strokeWidth="3.5" strokeLinejoin="round" /><path d="M30 30h20M30 40h20M30 50h12" stroke="#2FA35B" strokeWidth="3" strokeLinecap="round" /><path d="M67 40l11 11-20 20-13 2 2-13z" fill="#fff" stroke="#14663B" strokeWidth="3.5" strokeLinejoin="round" /><path d="M63 44l11 11" stroke="#14663B" strokeWidth="3.5" /></svg> },
  { n: '04', left: 798, top: 60, title: 'Multi-Channel Scale', desc: 'Review, refine and ship across 3 platforms at once with a full week presence across channels.',
    svg: <svg viewBox="0 0 96 96" width={112} height={112} fill="none"><path d="M48 12c12 6 20 20 20 36 0 6-1 10-3 14H31c-2-4-3-8-3-14 0-16 8-30 20-36z" fill="#CDEBD6" stroke="#14663B" strokeWidth="3.5" strokeLinejoin="round" /><circle cx="48" cy="40" r="7.5" fill="#fff" stroke="#14663B" strokeWidth="3.5" /><path d="M31 60c-7 3-11 9-11 18 7-1 12-4 15-8M65 60c7 3 11 9 11 18-7-1-12-4-15-8" fill="#2FA35B" stroke="#14663B" strokeWidth="3" strokeLinejoin="round" /><path d="M41 74c0 6 3 11 7 14 4-3 7-8 7-14z" fill="#2FA35B" stroke="#14663B" strokeWidth="3" strokeLinejoin="round" /></svg> },
]

function Method() {
  const wrapRef = useRef(null)
  const diagRef = useRef(null)

  useLayoutEffect(() => {
    const fit = () => {
      if (!wrapRef.current || !diagRef.current) return
      const w = wrapRef.current.clientWidth
      const s = Math.min(1, w / 1040)
      diagRef.current.style.transform = `scale(${s})`
      wrapRef.current.style.height = `${540 * s}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (wrapRef.current) ro.observe(wrapRef.current)
    window.addEventListener('resize', fit)
    return () => { ro.disconnect(); window.removeEventListener('resize', fit) }
  }, [])

  return (
    <section id="method" style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 40px 40px' }}>
      <h2 style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 44, letterSpacing: '-.03em', margin: '0 0 8px' }}>The Honne method</h2>
      <p style={{ fontSize: 15, color: C.body, margin: 0, fontWeight: 500, maxWidth: 460 }}>One hour of thinking becomes a full week of authoritative presence.</p>
      <div ref={wrapRef} style={{ position: 'relative', marginTop: 20, overflow: 'hidden' }}>
        <div ref={diagRef} style={{ position: 'relative', width: 1040, height: 540, transformOrigin: 'top left' }}>
          <svg viewBox="0 0 1040 540" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} preserveAspectRatio="none">
            <path d="M96,150 C220,60 250,40 340,44" fill="none" stroke="rgba(20,24,15,.32)" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" style={{ animation: 'hDash 1.1s linear infinite' }} />
            <path d="M356,60 C470,240 490,250 600,178" fill="none" stroke="rgba(20,24,15,.32)" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" style={{ animation: 'hDash 1.1s linear infinite' }} />
            <path d="M612,164 C720,70 740,52 856,64" fill="none" stroke="rgba(20,24,15,.32)" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" style={{ animation: 'hDash 1.1s linear infinite' }} />
          </svg>
          {METHOD_STEPS.map((s) => (
            <div key={s.n} style={{ position: 'absolute', left: s.left, top: s.top, width: 240, background: 'rgba(255,255,255,.55)', border: '1.5px solid rgba(20,24,15,.08)', borderRadius: 22, padding: 26 }}>
              <div style={{ position: 'relative', width: 112, height: 112, margin: '-64px 0 16px', filter: 'drop-shadow(0 16px 20px rgba(20,60,30,.3))' }}>{s.svg}</div>
              <div style={{ fontFamily: FONT.mono, fontSize: 12, color: C.greenBright, fontWeight: 600, marginBottom: 8 }}>{s.n}</div>
              <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 26, letterSpacing: '-.02em', marginBottom: 10 }}>{s.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: C.body, fontWeight: 500 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Agents — hover to expand                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */
const AGENTS = [
  { name: 'Orchestrator', dark: true, desc: 'The bridge between your brain and the output. Coordinates research, validates logic, and manages the other agents.' },
  { name: 'Research', icon: SearchIcon, desc: 'Fetches platform data points and contrarian perspectives to beef up your arguments.' },
  { name: 'Write', icon: PenIcon, desc: 'Maps your vocal patterns to written formats while maintaining your unique rhythm.' },
  { name: 'Strategize', icon: TargetIcon, desc: 'Optimizes hooks and structures for specific algorithms without sacrificing soul.' },
]

function Agents() {
  const [active, setActive] = useState(0)

  return (
    <section id="agents" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 40px 84px' }}>
      <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 40px' }}>
        <h2 style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 44, letterSpacing: '-.03em', margin: '0 0 12px' }}>Meet the agents</h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, color: C.body, margin: 0, fontWeight: 500 }}>
          Not just &quot;AI bots&quot;. Specialists built to handle the heavy lifting of modern content creation. <span style={{ color: C.greenBright, fontWeight: 600 }}>Hover to expand.</span>
        </p>
      </div>
      <div className="hn-agents-row" style={{ display: 'flex', gap: 14, alignItems: 'stretch', minHeight: 280 }}>
        {AGENTS.map((a, i) => {
          const isActive = active === i
          const Icon = a.icon
          return (
            <div
              key={a.name}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(0)}
              style={{
                flex: isActive ? 2.4 : 1, minWidth: 0, transition: 'flex .45s cubic-bezier(.22,1,.36,1)',
                background: a.dark ? C.green : '#fff', color: a.dark ? '#F3F1E7' : C.ink,
                border: a.dark ? 'none' : '1.5px solid rgba(20,24,15,.1)', borderRadius: 22,
                padding: a.dark ? '30px 28px' : '30px 26px', display: 'flex', flexDirection: 'column',
                boxShadow: a.dark ? '0 24px 50px -28px rgba(20,102,59,.7)' : '0 18px 40px -30px rgba(20,60,30,.4)',
                cursor: 'pointer',
              }}
            >
              {a.dark
                ? <span style={{ width: 10, height: 10, borderRadius: 3, background: C.greenLight, marginBottom: 'auto' }} />
                : <span style={{ color: C.green, marginBottom: 'auto', display: 'inline-flex' }}><Icon size={24} color={C.green} /></span>}
              <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: a.dark ? 26 : 24, letterSpacing: '-.02em', marginTop: 20 }}>{a.name}</div>
              <div style={{ maxHeight: isActive ? 160 : 0, opacity: isActive ? 1 : 0, overflow: 'hidden', transition: 'max-height .45s ease,opacity .35s ease' }}>
                <div style={{ fontSize: a.dark ? 13.5 : 13, lineHeight: 1.6, color: a.dark ? 'rgba(243,241,231,.8)' : C.body, marginTop: 12 }}>{a.desc}</div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Template Library                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */
const TEMPLATES = [
  { icon: BookIcon, title: 'Founder Story', desc: 'Turn your origin into a magnetic narrative that builds trust.' },
  { icon: CapIcon, title: 'Education', desc: 'Teach complex concepts with a memorable, repeatable model.' },
  { icon: TrendIcon, title: 'Build in Public', desc: 'Share progress and bring your audience along for the journey.' },
  { icon: CaseIcon, title: 'Lessons Learned', desc: 'Distill hard-won experience into shareable, authoritative insight.' },
]

function Templates() {
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 40px 84px', textAlign: 'center' }}>
      <Eyebrow>Template Library</Eyebrow>
      <h2 style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 44, letterSpacing: '-.03em', margin: '0 0 12px' }}>Start from a proven template</h2>
      <p style={{ fontSize: 15, color: C.body, margin: '0 auto 48px', maxWidth: 560, fontWeight: 500 }}>Choose a template to accelerate your content creation without losing your edge.</p>
      <div className="hn-tmpl-grid">
        {TEMPLATES.map((t) => {
          const Icon = t.icon
          return (
            <div key={t.title} className="hn-tmpl-card" style={{ display: 'flex', flexDirection: 'column', background: '#fff', border: '1.5px solid rgba(20,24,15,.1)', borderRadius: 20, padding: 28, boxShadow: '0 22px 46px -30px rgba(20,60,30,.4)', textAlign: 'left' }}>
              <span style={{ width: 64, height: 64, borderRadius: 18, background: C.greenPaleAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
                <Icon />
              </span>
              <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 23, letterSpacing: '-.02em', marginBottom: 10 }}>{t.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: C.body, marginBottom: 24 }}>{t.desc}</div>
              <button className="hn-tmpl-btn" style={{ marginTop: 'auto', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 12, padding: '7px 7px 7px 18px', border: '1.5px solid rgba(20,24,15,.2)', borderRadius: 999, background: '#fff', fontFamily: FONT.sans, fontSize: 13, fontWeight: 700, color: C.ink, cursor: 'pointer' }}>
                Use template
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: C.greenBright, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowIcon /></span>
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Voice Vault                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */
const VAULT_CHECKLIST = ['Writing samples imported', 'LinkedIn analyzed', 'Style memory created', 'Brand voice learned', 'Context vault active']

function VoiceVault() {
  return (
    <section style={{ padding: '70px 40px', background: C.altBg }}>
      <div className="hn-voice-grid" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
        <div>
          <Eyebrow>Voice Vault</Eyebrow>
          <h2 style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 48, lineHeight: 1, letterSpacing: '-.03em', margin: '0 0 24px' }}>Teach agents your voice</h2>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: C.body, maxWidth: 420, margin: '0 0 32px', fontWeight: 500 }}>
            Import your best work once. Every agent learns your rhythm, phrases, and point of view, so everything they create already sounds like you.
          </p>
          <div style={{ height: 1, background: 'rgba(20,24,15,.12)', marginBottom: 28 }} />
          <div style={{ display: 'flex', gap: 52 }}>
            <div>
              <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 40, lineHeight: 1, marginBottom: 8, color: C.green }}>94%</div>
              <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: C.faint }}>Voice match</div>
            </div>
            <div>
              <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 40, lineHeight: 1, marginBottom: 8, color: C.green }}>47</div>
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
                  <span style={{ color: C.greenBright, fontSize: 15, fontWeight: 700 }}>&#10003;</span>
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
/* VS — live typing comparison                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */
const VS_COPY = {
  topic: 'Why most AI content fails',
  gen: 'Most AI content fails because it sounds generic, lacks original insights, and doesn’t reflect real human experience. It often prioritizes perfect grammar over personality, emotion, and clear opinions. Readers engage with content that feels authentic, specific, and genuinely useful—not predictable or repetitive.',
  hon: 'Most AI content fails for one reason, it sounds like everyone. It’s often too safe and never risks an opinion. Readers feel the emptiness in a single line and they simply scroll past it. The fix was never more words. It is your point of view, left fully intact.',
}

function VsSection() {
  const [topic, setTopic] = useState('')
  const [gen, setGen] = useState('')
  const [hon, setHon] = useState('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
    const typeInto = async (setter, text, cps) => {
      const step = Math.max(14, 1000 / cps)
      for (let i = 1; i <= text.length; i++) {
        if (!mountedRef.current) return
        setter(text.slice(0, i))
        await sleep(step)
      }
    }
    const run = async () => {
      while (mountedRef.current) {
        setTopic(''); setGen(''); setHon('')
        await sleep(700)
        await typeInto(setTopic, VS_COPY.topic, 26)
        await sleep(450)
        await Promise.all([typeInto(setGen, VS_COPY.gen, 55), typeInto(setHon, VS_COPY.hon, 48)])
        await sleep(3600)
      }
    }
    run()
    return () => { mountedRef.current = false }
  }, [])

  const caret = (on) => ({ display: 'inline-block', width: 2, marginLeft: 1, color: C.greenBright, opacity: on ? 1 : 0, animation: on ? 'hBlink .85s step-end infinite' : 'none' })

  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 40px 84px', textAlign: 'center' }}>
      <Eyebrow>With your voice</Eyebrow>
      <h2 style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 44, letterSpacing: '-.03em', margin: '0 0 14px' }}>Same topic. <span style={{ color: C.greenBright }}>Not the same voice.</span></h2>
      <p style={{ fontSize: 14.5, lineHeight: 1.6, color: C.body, margin: '0 auto 24px', maxWidth: 520, fontWeight: 500 }}>Watch it happen live, flat generic AI texts on the left and your Honne voice on the right.</p>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, border: '1.5px solid rgba(23,24,15,.85)', borderRadius: 14, padding: '13px 22px', background: '#fff', marginBottom: 34 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: C.green }}>Topic</span>
        <span style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 17 }}>{topic}<span style={caret(topic.length < VS_COPY.topic.length)}>|</span></span>
      </div>
      <div className="hn-vs-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, textAlign: 'left' }}>
        <div style={{ background: '#fff', border: '1.5px solid rgba(20,24,15,.1)', borderRadius: 22, padding: '32px 30px', minHeight: 240 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 21, letterSpacing: '-.02em' }}>Generic AI</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#A0A69F' }}>Sounds like everyone</span>
          </div>
          <div style={{ height: 1, background: 'rgba(20,24,15,.1)', marginBottom: 16 }} />
          <p style={{ fontSize: 15, lineHeight: 1.7, color: C.faint, margin: 0 }}>{gen}<span style={caret(gen.length > 0 && gen.length < VS_COPY.gen.length)}>|</span></p>
        </div>
        <div style={{ background: C.green, color: '#F3F1E7', borderRadius: 22, padding: '32px 30px', minHeight: 240, boxShadow: '0 24px 50px -28px rgba(20,102,59,.7)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <span style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 21, letterSpacing: '-.02em', color: '#fff' }}>Honne &mdash; your voice</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.greenLight }}>Sounds like you</span>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,.16)', marginBottom: 16 }} />
          <p style={{ fontFamily: FONT.serif, fontSize: 18.5, lineHeight: 1.62, margin: 0, color: '#F3F1E7' }}>{hon}<span style={caret(hon.length > 0 && hon.length < VS_COPY.hon.length)}>|</span></p>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Repurpose                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */
function Repurpose() {
  return (
    <section style={{ padding: '80px 40px 96px', textAlign: 'center', background: C.altBg }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Eyebrow>Repurpose</Eyebrow>
        <h2 style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 44, letterSpacing: '-.03em', margin: '0 0 14px' }}>1 idea. 3 formats. <span style={{ color: C.greenBright }}>Zero friction.</span></h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, color: C.body, margin: '0 auto 30px', maxWidth: 520, fontWeight: 500 }}>Your Repurpose Agent reshapes a single draft into platform-native content. No copy-pasting, just pure transformation.</p>
        <div style={{ position: 'relative', maxWidth: 720, margin: '64px auto 0' }}>
          <div style={{ position: 'absolute', top: -46, left: '50%', transform: 'translateX(-50%)', background: C.green, color: '#F3F1E7', fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', padding: '14px 20px', borderRadius: 12, boxShadow: '0 14px 30px -14px rgba(20,102,59,.7)', whiteSpace: 'nowrap' }}>
            Repurpose agent
          </div>
          <svg viewBox="0 0 720 110" style={{ width: '100%', height: 100, display: 'block' }} preserveAspectRatio="none">
            <path d="M360,0 C360,60 120,70 120,110" fill="none" stroke={C.greenBright} strokeWidth="1.5" strokeDasharray="4 7" style={{ animation: 'hDash 1.1s linear infinite' }} />
            <path d="M360,0 C360,70 360,70 360,110" fill="none" stroke={C.greenBright} strokeWidth="1.5" strokeDasharray="4 7" style={{ animation: 'hDash 1.1s linear infinite' }} />
            <path d="M360,0 C360,60 600,70 600,110" fill="none" stroke={C.greenBright} strokeWidth="1.5" strokeDasharray="4 7" style={{ animation: 'hDash 1.1s linear infinite' }} />
          </svg>
          <div className="hn-repurpose-row" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 150 }}>
              <div style={{ width: 72, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 16, background: '#fff', border: '1.5px solid rgba(20,24,15,.12)', boxShadow: '0 14px 28px -18px rgba(20,60,30,.4)' }}><LinkedInMark /></div>
              <div style={{ fontSize: 11, color: C.body, fontWeight: 600 }}>LinkedIn Post</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 150 }}>
              <div style={{ width: 72, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 16, background: '#fff', border: '1.5px solid rgba(20,24,15,.12)', boxShadow: '0 14px 28px -18px rgba(20,60,30,.4)' }}><XMark /></div>
              <div style={{ fontSize: 11, color: C.body, fontWeight: 600 }}>X Thread</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 150 }}>
              <div style={{ width: 72, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 16, background: '#fff', border: '1.5px solid rgba(20,24,15,.12)', boxShadow: '0 14px 28px -18px rgba(20,60,30,.4)' }}><RedditMark /></div>
              <div style={{ fontSize: 11, color: C.body, fontWeight: 600 }}>Reddit Thread</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Flow — toggle pills                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
const FLOWS = [
  { name: 'The Founder', desc: 'Build authority while running a company. Turn your internal memos and meetings into a thought-leadership engine.', b1: '30 min/day, not 3hr/day', b2: "Transforms 1-on-1's to threads" },
  { name: 'The Ghostwriter', desc: 'Manage 10 clients with the mental load of 1. Switch voice profiles instantly and keep high-quality output for every client.', b1: 'Per-client voice fingerprints', b2: 'Bulk export & scheduling' },
  { name: 'The Solo Creator', desc: 'Scale from 1 platform to 5 without the burnout. Let the agents handle formatting while you focus on the big ideas.', b1: 'Focus on ideation only', b2: 'Never-miss-a-post engine' },
  { name: 'The Operator', desc: 'Executive presence made easy. Turn voice notes recorded during your commute into polished industry analysis.', b1: 'No more blank-page anxiety', b2: 'Scales your thinking, not your typing' },
]

function FlowSection() {
  const [flowIdx, setFlowIdx] = useState(0)
  const flow = FLOWS[flowIdx]

  return (
    <section id="flow" style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 40px 88px', textAlign: 'center' }}>
      <h2 style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 44, letterSpacing: '-.03em', margin: 0 }}>Built for your flow</h2>
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
                background: isActive ? C.green : 'transparent', color: isActive ? '#F3F1E7' : C.ink,
                border: isActive ? `1.5px solid ${C.green}` : '1.5px solid rgba(23,24,15,.75)',
              }}
            >
              {f.name}
            </button>
          )
        })}
      </div>
      <div key={flowIdx} style={{ background: '#fff', border: '1.5px solid rgba(20,24,15,.1)', borderRadius: 22, padding: 44, maxWidth: 640, margin: '0 auto', textAlign: 'left', boxShadow: '0 30px 64px -36px rgba(20,60,30,.45)', animation: 'hWordIn .45s cubic-bezier(.22,1,.36,1)' }}>
        <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 28, letterSpacing: '-.02em', marginBottom: 12 }}>{flow.name}</div>
        <div style={{ fontSize: 15, lineHeight: 1.65, color: C.body, marginBottom: 20, fontWeight: 500 }}>{flow.desc}</div>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.04em', color: C.green, marginBottom: 8 }}>&mdash; {flow.b1}</div>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.04em', color: C.green }}>&mdash; {flow.b2}</div>
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
    <section style={{ padding: '104px 40px 112px', textAlign: 'center', background: C.green, color: '#F3F1E7' }}>
      <h2 style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 54, lineHeight: 1, letterSpacing: '-.03em', margin: '0 0 18px', color: '#F3F1E7' }}>
        Stop sounding like<br />everyone else&apos;s AI.
      </h2>
      <p style={{ fontSize: 15.5, lineHeight: 1.6, color: 'rgba(243,241,231,.82)', margin: '0 auto 34px', maxWidth: 480, fontWeight: 500 }}>
        Build an authority engine that actually scales your thinking, not just your post count.
      </p>
      <button
        onClick={() => navigate('/register')}
        className="hn-pill-btn"
        style={{ display: 'inline-block', fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: C.green, background: '#F3F1E7', padding: '17px 34px', borderRadius: 14, border: 'none', boxShadow: '0 18px 40px -12px rgba(0,0,0,.4)', cursor: 'pointer', minHeight: 44 }}
      >
        Start writing
      </button>
      <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(243,241,231,.5)', marginTop: 26 }}>
        &copy; 2026 Honne. The art of true voice.
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ background: C.darkGreen, color: '#F3F1E7', padding: '60px 40px' }}>
      <div className="hn-footer-grid" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.4fr 2fr', gap: 40 }}>
        <div>
          <div style={{ fontFamily: FONT.serif, fontWeight: 600, fontSize: 26, color: '#F3F1E7' }}>Honne</div>
          <div style={{ fontSize: 13, fontStyle: 'italic', color: 'rgba(243,241,231,.7)', marginTop: 14, maxWidth: 320, lineHeight: 1.6 }}>
            Crafted by four friends united by a simple mission: to build together while exploring everything life has to offer.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <span style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,.22)', fontFamily: FONT.mono, fontSize: 11 }}>X</span>
            <span style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,.22)', fontFamily: FONT.mono, fontSize: 11 }}>in</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
          {[
            { title: 'Product', items: ['How it works', 'For creators'] },
            { title: 'Resources', items: ['Docs', 'API Reference', 'Voice Guide'] },
            { title: 'Company', items: ['About', 'Privacy', 'Terms'] },
          ].map((col) => (
            <div key={col.title} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(243,241,231,.45)', marginBottom: 4 }}>{col.title}</div>
              {col.items.map((it) => (
                <div key={it} style={{ fontSize: 13.5, color: 'rgba(243,241,231,.75)' }}>{it}</div>
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
    <div style={{ overflowX: 'hidden', background: C.bg, backgroundImage: 'radial-gradient(rgba(20,102,59,.08) 1.4px, transparent 1.4px)', backgroundSize: '26px 26px', color: C.ink, fontFamily: FONT.sans }}>
      <style>{`
        @keyframes hPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.8); } }
        @keyframes hDash { to { stroke-dashoffset: -22; } }
        @keyframes hFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes hWordIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes hBlink { 50% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .hn-pill-btn, [style*="animation"] { animation: none !important; } }

        .hn-pill-btn { transition: transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease; }
        .hn-pill-btn:hover { transform: translateY(-1px); }
        .hn-pill-btn:active { transform: translateY(0) scale(.98); }

        .hn-tmpl-card { transition: transform .18s ease, box-shadow .18s ease; }
        .hn-tmpl-card:hover { transform: translateY(-5px); box-shadow: 0 30px 56px -28px rgba(20,60,30,.5); }
        .hn-tmpl-btn { transition: border-color .18s ease; }
        .hn-tmpl-btn:hover { border-color: #14663B; }

        @media (max-width: 860px) { .hn-nav-links { display: none !important; } }
        @media (max-width: 900px) {
          .hn-hero-grid { grid-template-columns: 1fr !important; }
          .hn-voice-grid { grid-template-columns: 1fr !important; }
          .hn-vs-grid { grid-template-columns: 1fr !important; }
          .hn-footer-grid { grid-template-columns: 1fr !important; text-align: center; }
        }
        @media (max-width: 767px) {
          .hn-hero-h1 { font-size: 44px !important; }
          .hn-agents-row { flex-direction: column; }
          .hn-tmpl-grid { grid-template-columns: 1fr !important; }
          .hn-repurpose-row { gap: 12px; }
        }
        @media (max-width: 1023px) and (min-width: 768px) {
          .hn-tmpl-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
        .hn-tmpl-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 22px; text-align: left; }
      `}</style>

      <Nav />
      <main>
        <Hero />
        <Method />
        <Agents />
        <Templates />
        <VoiceVault />
        <VsSection />
        <Repurpose />
        <FlowSection />
      </main>
      <FinalCTA />
      <Footer />
    </div>
  )
}
