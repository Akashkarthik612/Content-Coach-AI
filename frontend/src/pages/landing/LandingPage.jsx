import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { COPY } from './landingContent'

// ─── Shared style helpers ─────────────────────────────────────────────────────
const S = {
  container:    { maxWidth: 1100, margin: '0 auto', padding: '0 24px' },
  sectionLabel: { fontSize: 12, fontWeight: 600, color: 'var(--cc-blue)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 },
  sectionTitle: { fontSize: 'clamp(20px,3vw,28px)', fontWeight: 700, color: 'var(--cc-text)', marginBottom: 32 },
  card:         { background: 'white', border: '1px solid var(--cc-border)', borderRadius: 14, padding: 24 },
  mono:         { fontFamily: "'IBM Plex Mono', monospace" },
}

// ─── SVG logos ────────────────────────────────────────────────────────────────
const LinkedInSVG = ({ size = 20, fill = '#0A66C2' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
)

const MediumSVG = ({ size = 20, fill = '#000' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
    <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>
  </svg>
)

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const n = COPY.nav

  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--cc-border)' }}>
      <div style={{ ...S.container, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--cc-blue)', fontWeight: 700, fontSize: 17 }}>
          <div style={{ width: 30, height: 30, background: 'var(--cc-blue)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1" fill="white"/>
              <rect x="9" y="1" width="6" height="6" rx="1" fill="white" opacity="0.7"/>
              <rect x="1" y="9" width="6" height="6" rx="1" fill="white" opacity="0.7"/>
              <rect x="9" y="9" width="6" height="6" rx="1" fill="white" opacity="0.4"/>
            </svg>
          </div>
          {COPY.brand.name}
        </a>

        {/* Desktop links */}
        <div className="cc-hide-mobile" style={{ display: 'flex', gap: 32 }}>
          {n.links.map(l => (
            <a key={l.label} href={l.href}
              style={{ textDecoration: 'none', color: 'var(--cc-text-muted)', fontSize: 14, fontWeight: 500, transition: 'color 0.15s' }}
              onMouseEnter={e => e.target.style.color = 'var(--cc-blue)'}
              onMouseLeave={e => e.target.style.color = 'var(--cc-text-muted)'}>
              {l.label}
            </a>
          ))}
        </div>

        {/* Desktop buttons */}
        <div className="cc-hide-mobile" style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate('/login')}
            style={{ background: 'none', border: 'none', color: 'var(--cc-text-muted)', fontSize: 14, fontWeight: 500, padding: '7px 16px', borderRadius: 8, cursor: 'pointer' }}>
            {n.login}
          </button>
          <button onClick={() => navigate('/register')}
            style={{ background: 'var(--cc-blue)', color: 'white', border: 'none', fontSize: 14, fontWeight: 500, padding: '8px 18px', borderRadius: 8, cursor: 'pointer' }}>
            {n.cta}
          </button>
        </div>

        {/* Mobile hamburger */}
        <button className="cc-show-mobile" onClick={() => setOpen(!open)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cc-text)', padding: 4 }}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div style={{ borderTop: '1px solid var(--cc-border)', background: 'white', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {n.links.map(l => (
            <a key={l.label} href={l.href} onClick={() => setOpen(false)}
              style={{ textDecoration: 'none', color: 'var(--cc-text-muted)', fontSize: 15, fontWeight: 500, padding: '6px 0' }}>
              {l.label}
            </a>
          ))}
          <button onClick={() => { navigate('/login'); setOpen(false) }}
            style={{ background: 'none', border: '1px solid var(--cc-border)', color: 'var(--cc-text)', fontSize: 14, fontWeight: 500, padding: 10, borderRadius: 8, cursor: 'pointer', marginTop: 4 }}>
            {n.login}
          </button>
          <button onClick={() => { navigate('/register'); setOpen(false) }}
            style={{ background: 'var(--cc-blue)', color: 'white', border: 'none', fontSize: 14, fontWeight: 500, padding: 10, borderRadius: 8, cursor: 'pointer' }}>
            {n.cta}
          </button>
        </div>
      )}
    </nav>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  const navigate = useNavigate()
  const h = COPY.hero
  const d = h.diff

  return (
    <section style={{ ...S.container, padding: '64px 24px 56px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }} className="cc-hero-grid">

      {/* Left */}
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--cc-blue-light)', color: 'var(--cc-blue)', fontSize: 12, fontWeight: 500, padding: '4px 12px', borderRadius: 20, marginBottom: 20, ...S.mono }}>
          ✦ {h.eyebrow}
        </div>
        <h1 style={{ fontSize: 'clamp(32px,4vw,52px)', fontWeight: 700, lineHeight: 1.15, color: 'var(--cc-text)', marginBottom: 16, letterSpacing: '-0.5px' }}>
          {h.headlineLine1}<br />
          <span style={{ color: 'var(--cc-blue)' }}>{h.headlineAccent}</span>
        </h1>
        <p style={{ color: 'var(--cc-text-muted)', fontSize: 'clamp(15px,1.8vw,17px)', lineHeight: 1.65, marginBottom: 28, maxWidth: 440 }}>
          {h.subline}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
          <button onClick={() => navigate('/login')}
            style={{ background: 'var(--cc-blue)', color: 'white', border: 'none', fontSize: 15, fontWeight: 500, padding: '11px 22px', borderRadius: 9, cursor: 'pointer' }}>
            {h.ctaPrimary} →
          </button>
          <button
            onClick={() => { const el = document.getElementById('problem'); if (el) el.scrollIntoView({ behavior: 'smooth' }) }}
            style={{ background: 'white', color: 'var(--cc-blue)', border: '1.5px solid var(--cc-blue)', fontSize: 15, fontWeight: 500, padding: '10px 20px', borderRadius: 9, cursor: 'pointer' }}>
            {h.ctaSecondary}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'LinkedIn', icon: <LinkedInSVG size={14} /> },
            { label: 'Medium',   icon: <MediumSVG size={14} />   },
          ].map(p => (
            <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cc-bg-soft)', border: '1px solid var(--cc-border)', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 500, color: 'var(--cc-text-muted)' }}>
              {p.icon} {p.label}
            </div>
          ))}
          <span style={{ fontSize: 12, color: 'var(--cc-text-faint)' }}>{h.platformNote}</span>
        </div>
      </div>

      {/* Right — Diff Card */}
      <div style={{ background: 'var(--cc-bg-soft)', border: '1px solid var(--cc-border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(37,99,235,0.10)' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'white', borderBottom: '1px solid var(--cc-border)' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--cc-text-muted)' }}>🗂 {d.postTitle}</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ ...S.mono, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: 'var(--cc-accent)', color: 'var(--cc-red-text)' }}>v1</span>
            <span style={{ color: 'var(--cc-text-faint)', fontSize: 12 }}>→</span>
            <span style={{ ...S.mono, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: 'var(--cc-green-light)', color: 'var(--cc-green-text)' }}>v2</span>
          </div>
        </div>
        {/* body */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--cc-border)', padding: '12px 14px' }}>
            <div style={{ ...S.mono, fontSize: 10, fontWeight: 500, color: 'var(--cc-red-text)', marginBottom: 7 }}>● {d.v1Label}</div>
            <p style={{ fontSize: 13, color: 'var(--cc-text)', lineHeight: 1.55, margin: 0 }}>
              {d.v1Text}{' '}
              <span style={{ background: 'var(--cc-red-light)', color: 'var(--cc-red-text)', borderRadius: 3, padding: '0 3px', textDecoration: 'line-through', fontSize: 12 }}>{d.v1Del}</span>
            </p>
          </div>
          <div style={{ textAlign: 'center', color: 'var(--cc-text-faint)', fontSize: 16 }}>↓</div>
          <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--cc-border)', padding: '12px 14px' }}>
            <div style={{ ...S.mono, fontSize: 10, fontWeight: 500, color: 'var(--cc-green-text)', marginBottom: 7 }}>● {d.v2Label}</div>
            <p style={{ fontSize: 13, color: 'var(--cc-text)', lineHeight: 1.55, margin: 0 }}>
              {d.v1Text}{' '}
              <span style={{ background: '#F0FDF4', color: 'var(--cc-green-text)', borderRadius: 3, padding: '0 3px', fontSize: 12 }}>{d.v2Add}</span>
            </p>
          </div>
        </div>
        {/* footer */}
        <div style={{ padding: '10px 16px', background: 'white', borderTop: '1px solid var(--cc-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {['+ 18 chars', '2026-05-25'].map(t => (
            <span key={t} style={{ ...S.mono, fontSize: 11, color: 'var(--cc-text-muted)', background: '#F1F5F9', borderRadius: 4, padding: '2px 8px' }}>{t}</span>
          ))}
          <span style={{ ...S.mono, fontSize: 11, color: 'var(--cc-blue)', background: 'var(--cc-blue-light)', borderRadius: 4, padding: '2px 8px', marginLeft: 'auto' }}>{d.aiBadge}</span>
        </div>
      </div>
    </section>
  )
}

// ─── Problem Strip ────────────────────────────────────────────────────────────
function ProblemStrip() {
  const c = COPY.problem
  return (
    <section id="problem" style={{ background: 'var(--cc-bg-subtle)', padding: '40px 24px' }}>
      <div style={S.container}>
        <p style={S.sectionLabel}>{c.label}</p>
        <h2 style={S.sectionTitle}>{c.title}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 16 }}>
          {c.cards.map(card => (
            <div key={card.title} style={{ background: 'white', borderRadius: 12, padding: 20, border: '1px solid var(--cc-border)' }}>
              <div style={{ width: 36, height: 36, background: 'var(--cc-accent)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, fontSize: 17 }}>{card.icon}</div>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--cc-text)', marginBottom: 6 }}>{card.title}</h4>
              <p style={{ fontSize: 13, color: 'var(--cc-text-muted)', lineHeight: 1.55, margin: 0 }}>{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Features ─────────────────────────────────────────────────────────────────
function Features() {
  const c = COPY.features
  return (
    <section id="features" style={{ padding: '56px 24px' }}>
      <div style={S.container}>
        <p style={S.sectionLabel}>{c.label}</p>
        <h2 style={S.sectionTitle}>{c.title}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 20 }}>
          {c.cards.map(card => (
            <div key={card.title} style={{ ...S.card, transition: 'box-shadow 0.2s, border-color 0.2s', cursor: 'default' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(37,99,235,0.10)'; e.currentTarget.style.borderColor = '#BFDBFE' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--cc-border)' }}>
              <div style={{ width: 40, height: 40, background: 'var(--cc-blue-light)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, fontSize: 18 }}>{card.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cc-text)', marginBottom: 6 }}>
                {card.title}
                {card.badge && <span style={{ display: 'inline-block', background: '#FEF3C7', color: '#92400E', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, marginLeft: 8, verticalAlign: 'middle' }}>{card.badge}</span>}
              </h3>
              <p style={{ fontSize: 13, color: 'var(--cc-text-muted)', lineHeight: 1.55, margin: 0 }}>{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const c = COPY.steps
  return (
    <section id="how-it-works" style={{ background: 'var(--cc-bg-soft)', padding: '56px 24px' }}>
      <div style={{ ...S.container, textAlign: 'center' }}>
        <p style={S.sectionLabel}>{c.label}</p>
        <h2 style={S.sectionTitle}>{c.title}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 32 }}>
          {c.list.map(step => (
            <div key={step.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 56, height: 56, background: 'var(--cc-blue)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{step.num}</div>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--cc-text)', marginBottom: 8 }}>{step.title}</h4>
              <p style={{ fontSize: 13, color: 'var(--cc-text-muted)', lineHeight: 1.55, margin: 0 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Platforms ────────────────────────────────────────────────────────────────
const PLAT_STYLE = {
  linkedin: { bg: '#0A66C2',                                    icon: <LinkedInSVG size={22} fill="white" /> },
  medium:   { bg: '#000000',                                    icon: <MediumSVG size={22} fill="white"   /> },
  ai:       { bg: 'linear-gradient(135deg,#8B5CF6,#2563EB)',    icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5"/>
      <path d="M8 12h8M12 8l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )},
}

function Platforms() {
  const c = COPY.platforms
  return (
    <section style={{ padding: '56px 24px' }}>
      <div style={S.container}>
        <p style={S.sectionLabel}>{c.label}</p>
        <h2 style={S.sectionTitle}>{c.title}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 20 }}>
          {c.cards.map(card => {
            const p = PLAT_STYLE[card.key]
            return (
              <div key={card.key}
                style={{ border: card.key === 'ai' ? '1.5px solid #C4B5FD' : '1.5px solid var(--cc-border)', borderRadius: 14, padding: 24, textAlign: 'center', transition: 'box-shadow 0.2s, border-color 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(37,99,235,0.08)'; e.currentTarget.style.borderColor = '#93C5FD' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = card.key === 'ai' ? '#C4B5FD' : 'var(--cc-border)' }}>
                <div style={{ width: 44, height: 44, background: p.bg, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>{p.icon}</div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--cc-text)', marginBottom: 6 }}>{card.title}</h3>
                <p style={{ fontSize: 13, color: 'var(--cc-text-muted)', lineHeight: 1.5, margin: 0 }}>{card.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
const CheckMark = ({ blue }) => (
  <span style={{ width: 16, height: 16, background: blue ? 'var(--cc-blue-light)' : 'var(--cc-green-light)', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: blue ? 'var(--cc-blue)' : 'var(--cc-green-text)', flexShrink: 0 }}>✓</span>
)

function Pricing() {
  const navigate = useNavigate()
  const c = COPY.pricing

  return (
    <section id="pricing" style={{ background: 'var(--cc-bg-soft)', padding: '56px 24px' }}>
      <div style={{ ...S.container, maxWidth: 700 }}>
        <p style={{ ...S.sectionLabel, textAlign: 'center' }}>{c.label}</p>
        <h2 style={{ ...S.sectionTitle, textAlign: 'center' }}>{c.title}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 20 }}>

          {/* Free */}
          <div style={{ background: 'white', borderRadius: 16, padding: '28px 24px', border: '1.5px solid var(--cc-border)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--cc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{c.free.tier}</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: 'var(--cc-text)', marginBottom: 4 }}>{c.free.price} <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--cc-text-muted)' }}>{c.free.period}</span></p>
            <p style={{ fontSize: 13, color: 'var(--cc-text-muted)', marginBottom: 20 }}>{c.free.desc}</p>
            <hr style={{ border: 'none', borderTop: '1px solid var(--cc-bg-soft)', marginBottom: 18 }} />
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {c.free.features.map(f => (
                <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
                  <CheckMark /> {f}
                </li>
              ))}
            </ul>
            <button onClick={() => navigate('/register')}
              style={{ width: '100%', background: 'white', color: 'var(--cc-blue)', border: '1.5px solid var(--cc-blue)', fontSize: 14, fontWeight: 500, padding: 10, borderRadius: 9, cursor: 'pointer' }}>
              {c.free.cta}
            </button>
          </div>

          {/* Pro */}
          <div style={{ background: 'white', borderRadius: 16, padding: '28px 24px', border: '2px solid var(--cc-blue)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'var(--cc-blue)', color: 'white', fontSize: 11, fontWeight: 600, padding: '3px 14px', borderRadius: 20, whiteSpace: 'nowrap' }}>{c.pro.badge}</div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--cc-blue)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{c.pro.tier}</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: 'var(--cc-text)', marginBottom: 4 }}>{c.pro.price} <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--cc-text-muted)' }}>{c.pro.period}</span></p>
            <p style={{ fontSize: 13, color: 'var(--cc-text-muted)', marginBottom: 20 }}>{c.pro.desc}</p>
            <hr style={{ border: 'none', borderTop: '1px solid var(--cc-bg-soft)', marginBottom: 18 }} />
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {c.pro.features.map((f, i) => (
                <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
                  <CheckMark blue={i >= 2} /> {f}
                </li>
              ))}
            </ul>
            <button style={{ width: '100%', background: 'var(--cc-blue)', color: 'white', border: 'none', fontSize: 14, fontWeight: 500, padding: 11, borderRadius: 9, cursor: 'pointer' }}>
              {c.pro.cta}
            </button>
          </div>

        </div>
      </div>
    </section>
  )
}

// ─── Final CTA ────────────────────────────────────────────────────────────────
function FinalCTA() {
  const navigate = useNavigate()
  const c = COPY.cta
  return (
    <section style={{ background: 'var(--cc-blue-dark)', padding: '56px 24px', textAlign: 'center' }}>
      <h2 style={{ fontSize: 'clamp(22px,3.5vw,32px)', fontWeight: 700, color: 'white', marginBottom: 12 }}>{c.title}</h2>
      <p style={{ color: '#BFDBFE', fontSize: 'clamp(14px,2vw,16px)', marginBottom: 28 }}>{c.sub}</p>
      <button onClick={() => navigate('/register')}
        style={{ background: 'white', color: 'var(--cc-blue-dark)', border: 'none', fontSize: 15, fontWeight: 600, padding: '12px 28px', borderRadius: 9, cursor: 'pointer' }}>
        {c.btn}
      </button>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  const f = COPY.footer
  return (
    <footer style={{ padding: '20px 24px', borderTop: '1px solid var(--cc-border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cc-blue-dark)' }}>{COPY.brand.name}</span>
      <div style={{ display: 'flex', gap: 20 }}>
        {f.links.map(l => <a key={l} href="#" style={{ fontSize: 13, color: 'var(--cc-text-faint)', textDecoration: 'none' }}>{l}</a>)}
      </div>
      <span style={{ fontSize: 12, color: 'var(--cc-text-faint)' }}>{f.copy}</span>
    </footer>
  )
}

// ─── Page root ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cc-white)' }}>
      <Navbar />
      <main>
        <Hero />
        <ProblemStrip />
        <Features />
        <HowItWorks />
        <Platforms />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
