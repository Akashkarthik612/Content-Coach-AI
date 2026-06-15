import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { COPY } from './landingContent'

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const C = {
  ink:      '#111827', body:    '#4B5563', muted:   '#6B7280',
  faint:    '#9CA3AF', blue:    '#3B82F6', indigo:  '#6366F1',
  violet:   '#8B5CF6', sky:     '#0EA5E9', green:   '#22C55E',
  greenDk:  '#16A34A', tint:    '#F7FAFF', dark:    '#0B1220',
  darkCard: '#121A2E', bLt:     '#EAF0FF', iLt:     '#EEF0FF',
  vLt:      '#F3EEFF', sLt:     '#E6F6FE',
}
const FONT = {
  serif: "'Newsreader', Georgia, serif",
  sans:  "'Hanken Grotesk', system-ui, sans-serif",
  mono:  "'JetBrains Mono', monospace",
}
const GRAD = {
  sig:  'linear-gradient(135deg,#3B82F6,#8B5CF6)',
  bi:   'linear-gradient(135deg,#3B82F6,#6366F1)',
  text: 'linear-gradient(120deg,#3B82F6,#6366F1,#8B5CF6)',
}

/* ─── SVG Icons ──────────────────────────────────────────────────────────── */
const ResearchIcon = ({ size = 20, color = '#3B82F6' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)
const WriterIcon = ({ size = 20, color = '#6366F1' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z" />
  </svg>
)
const SEOIcon = ({ size = 20, color = '#8B5CF6' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" />
  </svg>
)
const RepurposeIcon = ({ size = 20, color = '#0EA5E9' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
)
const AnalyticsIcon = ({ size = 20, color = '#3B82F6' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
  </svg>
)
const PublisherIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)
const MicIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)
const GridIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
)

function LinkedInIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="LinkedIn" role="img">
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path d="M7.5 9.5H5v9h2.5v-9zm-1.25-1a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM19 18.5h-2.5v-4.3c0-1-.4-1.7-1.35-1.7-.74 0-1.18.5-1.37.98-.07.17-.09.41-.09.65v4.37H11v-9h2.5v1.22c.33-.51.92-1.22 2.23-1.22 1.62 0 2.77 1.06 2.77 3.33v5.67z" fill="white" />
    </svg>
  )
}

function MediumIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Medium" role="img">
      <rect width="24" height="24" rx="4" fill="#111827" />
      <ellipse cx="8.5" cy="12" rx="4.5" ry="5.5" fill="white" />
      <ellipse cx="16" cy="12" rx="2" ry="5" fill="white" />
      <ellipse cx="21.5" cy="12" rx="1" ry="4.5" fill="white" />
    </svg>
  )
}

function XIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="X (Twitter)" role="img">
      <rect width="24" height="24" rx="4" fill="#000" />
      <path d="M17.5 4h2.5l-5.5 6.3L21 20h-4.9l-3.7-4.8L8 20H5.5l5.9-6.7L4 4h5l3.3 4.3L17.5 4zm-.9 14.4h1.4L7.5 5.4H6l10.6 13z" fill="white" />
    </svg>
  )
}

/* ─── Reusable primitives ─────────────────────────────────────────────────── */
function IconTile({ bg, gradient, size = 46, radius = 13, children }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: gradient || bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  )
}

function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 5, background: '#EEF2F7', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99 }} />
    </div>
  )
}

function Eyebrow({ children, color = C.blue }) {
  return (
    <p style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color, margin: '0 0 14px' }}>
      {children}
    </p>
  )
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function PulsingDot({ color, delay = '0s', size = 6 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0, animation: `ccPulse 1.8s ease-in-out ${delay} infinite` }} />
  )
}

/* ─── Agent identity map ─────────────────────────────────────────────────── */
const AGENT = {
  research:  { color: C.blue,   bg: C.bLt,  Icon: ResearchIcon,  gradient: null },
  writer:    { color: C.indigo, bg: C.iLt,  Icon: WriterIcon,    gradient: null },
  seo:       { color: C.violet, bg: C.vLt,  Icon: SEOIcon,       gradient: null },
  repurpose: { color: C.sky,    bg: C.sLt,  Icon: RepurposeIcon, gradient: null },
  analytics: { color: C.blue,   bg: C.bLt,  Icon: AnalyticsIcon, gradient: null },
  publisher: { color: 'white',  bg: null,   Icon: PublisherIcon, gradient: GRAD.bi },
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 1. Nav                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */
function Nav() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(17,24,39,.06)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: GRAD.sig, boxShadow: '0 6px 16px -6px rgba(59,130,246,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
            <span style={{ fontFamily: FONT.serif, fontSize: 19, color: 'white', lineHeight: 1, display: 'block', marginTop: -2 }}>C</span>
          </div>
          <span style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 16.5, letterSpacing: '-0.01em', color: C.ink }}>
            ContentCoach<span style={{ color: C.blue }}> AI</span>
          </span>
        </a>

        {/* Desktop links */}
        <div className="lp-hide-phone" style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          {COPY.nav.links.map(l => (
            <a key={l.label} href={l.href} style={{ fontFamily: FONT.sans, fontSize: 14.5, color: C.body, textDecoration: 'none' }}>{l.label}</a>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="lp-hide-phone" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', fontFamily: FONT.sans, fontSize: 14.5, fontWeight: 500, color: C.ink, cursor: 'pointer', padding: '10px 0', minHeight: 44 }}>
            Sign in
          </button>
          <button onClick={() => navigate('/register')} style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: 'white', background: C.ink, border: 'none', padding: '10px 18px', borderRadius: 10, cursor: 'pointer', minHeight: 44 }}>
            Start Free
          </button>
        </div>

        {/* Mobile hamburger */}
        <button className="lp-show-phone" onClick={() => setOpen(!open)} aria-label="Toggle menu" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink, padding: 4, display: 'none', minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div style={{ background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(14px)', boxShadow: '0 8px 24px rgba(17,24,39,.1)', padding: '8px 20px 20px', borderTop: '1px solid rgba(17,24,39,.06)' }}>
          {[...COPY.nav.links, { label: 'Sign in', href: '/login' }].map(l => (
            <a key={l.label} href={l.href} onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', fontFamily: FONT.sans, fontSize: 16, color: C.ink, textDecoration: 'none', padding: '12px 0', borderBottom: '1px solid rgba(17,24,39,.05)', minHeight: 44 }}>
              {l.label}
            </a>
          ))}
          <button onClick={() => { navigate('/register'); setOpen(false) }} style={{ display: 'block', width: '100%', marginTop: 12, fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: 'white', background: C.ink, border: 'none', padding: '13px 20px', borderRadius: 10, cursor: 'pointer', minHeight: 44 }}>
            Start Free
          </button>
        </div>
      )}
    </nav>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 2. Hero                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */
function Hero() {
  const navigate = useNavigate()

  return (
    <section style={{ position: 'relative', overflow: 'hidden', background: '#FFFFFF' }}>
      {/* Ambient field */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 1100, height: 700, top: -120, left: '50%', transform: 'translateX(-50%)', background: 'radial-gradient(ellipse at center, rgba(59,130,246,.10), transparent 60%)', filter: 'blur(20px)' }} />
        <div style={{ position: 'absolute', width: 380, height: 380, top: 80, left: '4%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,.16), transparent 70%)', filter: 'blur(40px)', animation: 'ccBlob 20s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', width: 420, height: 420, top: 200, right: '2%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,.16), transparent 70%)', filter: 'blur(46px)', animation: 'ccBlob2 24s ease-in-out infinite' }} />
      </div>

      {/* Centered copy */}
      <div className="lp-hero-copy" style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '84px 32px 40px', textAlign: 'center' }}>
        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.tint, border: '1px solid rgba(17,24,39,.08)', borderRadius: 999, padding: '7px 15px 7px 11px', marginBottom: 30 }}>
          {[{ color: C.blue, delay: '0s' }, { color: C.indigo, delay: '.3s' }, { color: C.violet, delay: '.6s' }].map((d, i) => (
            <PulsingDot key={i} color={d.color} delay={d.delay} />
          ))}
          <span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, color: C.body, marginLeft: 4 }}>5 specialized agents, one content team</span>
        </div>

        {/* H1 */}
        <h1 className="lp-hero-h1" style={{ fontFamily: FONT.serif, fontWeight: 400, fontSize: 72, lineHeight: 1.02, letterSpacing: '-0.025em', maxWidth: 880, margin: '0 auto', color: C.ink }}>
          Your AI content team,<br />
          <span style={{ fontStyle: 'italic', background: GRAD.text, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            running 24/7.
          </span>
        </h1>

        {/* Sub */}
        <p style={{ fontFamily: FONT.sans, fontSize: 19, color: C.body, lineHeight: 1.6, margin: '28px auto 0', maxWidth: 620 }}>
          Research, write, optimize, repurpose, and publish content with specialized AI agents that learn your voice and work alongside you.
        </p>

        {/* CTAs */}
        <div className="lp-cta-row">
          <button onClick={() => navigate('/register')} style={{ fontFamily: FONT.sans, fontSize: 15.5, fontWeight: 600, color: 'white', background: C.blue, border: 'none', padding: '15px 28px', borderRadius: 12, cursor: 'pointer', boxShadow: '0 12px 30px -8px rgba(59,130,246,.55)', minHeight: 44 }}>
            Start Free
          </button>
          <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: FONT.sans, fontSize: 15.5, fontWeight: 500, color: C.ink, background: 'white', border: '1px solid rgba(17,24,39,.12)', padding: '15px 22px', borderRadius: 12, cursor: 'pointer', minHeight: 44 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><polygon points="3,1 13,7 3,13" fill="#3B82F6" /></svg>
            Watch Demo
          </button>
        </div>

        {/* Fine print */}
        <p style={{ fontFamily: FONT.mono, fontSize: 13, color: C.faint, marginTop: 20 }}>No credit card required · Free forever plan</p>
      </div>

      {/* Floating card ecosystem — desktop/tablet only */}
      <div className="lp-hero-stage" style={{ position: 'relative', maxWidth: 1240, margin: '0 auto', height: 600, padding: '0 32px' }}>

        {/* 1. Research Agent — top:30 left:40 w256 ccFloatA 9s */}
        <div style={{ position: 'absolute', top: 30, left: 40, width: 256, background: 'white', border: '1px solid rgba(17,24,39,.08)', borderRadius: 18, padding: '17px 20px', boxShadow: '0 18px 40px -22px rgba(17,24,39,.22)', animation: 'ccFloatA 9s ease-in-out infinite' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <IconTile bg={C.bLt} size={40} radius={11}><ResearchIcon size={18} color={C.blue} /></IconTile>
            <div>
              <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.ink }}>Research Agent</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <PulsingDot color="#22C55E" /><span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: '#22C55E' }}>Active</span>
              </div>
            </div>
          </div>
          <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.body, marginBottom: 10 }}>Found <strong>18 high-quality sources</strong></p>
          <ProgressBar pct={74} color={C.blue} />
        </div>

        {/* 2. Writer Agent — top:330 left:90 w244 ccFloatC 11s */}
        <div style={{ position: 'absolute', top: 330, left: 90, width: 244, background: 'white', border: '1px solid rgba(17,24,39,.08)', borderRadius: 18, padding: '17px 20px', boxShadow: '0 18px 40px -22px rgba(17,24,39,.22)', animation: 'ccFloatC 11s ease-in-out infinite' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <IconTile bg={C.iLt} size={40} radius={11}><WriterIcon size={18} color={C.indigo} /></IconTile>
            <div>
              <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.ink }}>Writer Agent</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <PulsingDot color={C.indigo} /><span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: C.indigo }}>Drafting</span>
              </div>
            </div>
          </div>
          <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.body }}>
            Generating LinkedIn article
            <span style={{ display: 'inline-block', width: 2, height: 13, background: C.indigo, marginLeft: 2, verticalAlign: 'middle', animation: 'ccBlink 1s steps(1) infinite' }} />
          </p>
        </div>

        {/* 3. LinkedIn post — Akash (center, z3) top:64 left:50% w360 ccFloatB 10s */}
        <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', width: 360, background: 'white', border: '1px solid rgba(17,24,39,.08)', borderRadius: 18, padding: 20, boxShadow: '0 34px 70px -26px rgba(17,24,39,.3)', animation: 'ccFloatB 10s ease-in-out infinite', zIndex: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: GRAD.bi, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: FONT.serif, fontSize: 18, color: 'white' }}>A</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT.sans, fontSize: 14.5, fontWeight: 700, color: C.ink }}>Akash B.</div>
              <div style={{ fontFamily: FONT.sans, fontSize: 12, color: C.muted }}>Founder @ ContentCoach AI</div>
            </div>
            <LinkedInIcon size={18} />
          </div>
          <p style={{ fontFamily: FONT.sans, fontSize: 14, color: '#374151', lineHeight: 1.6, margin: 0 }}>
            The biggest mistake creators make isn't posting too little. It's creating content without a system.
            <br /><br />
            After testing AI agents for 90 days, we reduced our workflow from 6 hours to 45 minutes.
          </p>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(17,24,39,.07)', fontFamily: FONT.sans, fontSize: 13, color: C.muted }}>
            <span>👍 1,284</span><span>💬 127</span><span>🔄 89</span>
          </div>
        </div>

        {/* 4. SEO Agent — top:24 right:56 w248 ccFloatD 12s */}
        <div style={{ position: 'absolute', top: 24, right: 56, width: 248, background: 'white', border: '1px solid rgba(17,24,39,.08)', borderRadius: 18, padding: '17px 20px', boxShadow: '0 18px 40px -22px rgba(17,24,39,.22)', animation: 'ccFloatD 12s ease-in-out infinite' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <IconTile bg={C.vLt} size={40} radius={11}><SEOIcon size={18} color={C.violet} /></IconTile>
            <div>
              <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.ink }}>SEO Agent</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <PulsingDot color={C.violet} delay=".3s" /><span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: C.violet }}>Optimizing</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 13, color: C.body }}>SEO Score</span>
            <span style={{ fontFamily: FONT.serif, fontSize: 28, color: C.violet, marginLeft: 'auto' }}>92</span>
            <span style={{ fontFamily: FONT.sans, fontSize: 15, color: C.faint }}>/100</span>
          </div>
        </div>

        {/* 5. Medium article — top:250 right:30 w300 ccFloatA 13s z2 */}
        <div style={{ position: 'absolute', top: 250, right: 30, width: 300, background: 'white', border: '1px solid rgba(17,24,39,.08)', borderRadius: 18, padding: '17px 20px', boxShadow: '0 30px 60px -24px rgba(17,24,39,.25)', animation: 'ccFloatA 13s ease-in-out infinite', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <MediumIcon size={20} />
            <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.muted, letterSpacing: '0.08em' }}>MEDIUM · 8 MIN READ</span>
          </div>
          <p style={{ fontFamily: FONT.serif, fontSize: 19, color: C.ink, lineHeight: 1.3, marginBottom: 8 }}>How I Built a Content System That Writes With Me, Not For Me</p>
          <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>Most AI tools generate content. The best ones create workflows.</p>
          <a href="#" style={{ fontFamily: FONT.sans, fontSize: 13, color: C.blue, fontWeight: 600, textDecoration: 'none' }}>Read More →</a>
        </div>

        {/* 6. Analytics Agent — top:400 left:56% w250 ccFloatC 10.5s z2 */}
        <div style={{ position: 'absolute', top: 400, left: '56%', width: 250, background: 'white', border: '1px solid rgba(17,24,39,.08)', borderRadius: 18, padding: '17px 20px', boxShadow: '0 18px 40px -22px rgba(17,24,39,.22)', animation: 'ccFloatC 10.5s ease-in-out infinite', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <IconTile bg={C.bLt} size={40} radius={11}><AnalyticsIcon size={18} color={C.blue} /></IconTile>
            <div>
              <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.ink }}>Analytics Agent</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <PulsingDot color={C.blue} delay=".6s" /><span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: C.blue }}>Predicting</span>
              </div>
            </div>
          </div>
          <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.body }}>Expected engagement: <strong>8.3%</strong></p>
        </div>

        {/* 7. LinkedIn post — Sara — top:470 left:30 w322 ccFloatD 11.5s */}
        <div style={{ position: 'absolute', top: 470, left: 30, width: 322, background: 'white', border: '1px solid rgba(17,24,39,.08)', borderRadius: 18, padding: '17px 20px', boxShadow: '0 28px 56px -24px rgba(17,24,39,.25)', animation: 'ccFloatD 11.5s ease-in-out infinite' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#8B5CF6,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: FONT.serif, fontSize: 16, color: 'white' }}>S</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 700, color: C.ink }}>Sara Lin</div>
              <div style={{ fontFamily: FONT.sans, fontSize: 12, color: C.muted }}>Creator • 450k Followers</div>
            </div>
            <LinkedInIcon size={18} />
          </div>
          <p style={{ fontFamily: FONT.sans, fontSize: 13.5, color: '#374151', lineHeight: 1.55, margin: 0 }}>
            One idea became:<br />→ LinkedIn Post → Newsletter → Blog → Thread<br /><br />The leverage is insane.
          </p>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(17,24,39,.07)', fontFamily: FONT.sans, fontSize: 12.5, color: C.muted }}>
            <span>👍 2,481</span><span>💬 214</span><span>🔄 173</span>
          </div>
        </div>
      </div>

      {/* Mobile hero cards — phone only */}
      <div className="lp-hero-mobile">
        {/* Research Agent */}
        <div style={{ width: '100%', maxWidth: 340, background: 'white', border: '1px solid rgba(17,24,39,.08)', borderRadius: 18, padding: '17px 20px', boxShadow: '0 18px 40px -22px rgba(17,24,39,.22)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <IconTile bg={C.bLt} size={40} radius={11}><ResearchIcon size={18} color={C.blue} /></IconTile>
            <div>
              <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.ink }}>Research Agent</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <PulsingDot color="#22C55E" /><span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: '#22C55E' }}>Active</span>
              </div>
            </div>
          </div>
          <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.body, marginBottom: 10 }}>Found <strong>18 high-quality sources</strong></p>
          <ProgressBar pct={74} color={C.blue} />
        </div>

        {/* Akash post */}
        <div style={{ width: '100%', maxWidth: 340, background: 'white', border: '1px solid rgba(17,24,39,.08)', borderRadius: 18, padding: 18, boxShadow: '0 18px 40px -22px rgba(17,24,39,.22)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: GRAD.bi, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: FONT.serif, fontSize: 16, color: 'white' }}>A</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 700, color: C.ink }}>Akash B.</div>
              <div style={{ fontFamily: FONT.sans, fontSize: 12, color: C.muted }}>Founder @ ContentCoach AI</div>
            </div>
            <LinkedInIcon size={16} />
          </div>
          <p style={{ fontFamily: FONT.sans, fontSize: 13.5, color: '#374151', lineHeight: 1.6, margin: 0 }}>
            The biggest mistake creators make isn't posting too little. It's creating content without a system.
          </p>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(17,24,39,.07)', fontFamily: FONT.sans, fontSize: 12.5, color: C.muted }}>
            <span>👍 1,284</span><span>💬 127</span>
          </div>
        </div>

        {/* SEO Agent */}
        <div style={{ width: '100%', maxWidth: 340, background: 'white', border: '1px solid rgba(17,24,39,.08)', borderRadius: 18, padding: '17px 20px', boxShadow: '0 18px 40px -22px rgba(17,24,39,.22)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <IconTile bg={C.vLt} size={40} radius={11}><SEOIcon size={18} color={C.violet} /></IconTile>
            <div>
              <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.ink }}>SEO Agent</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <PulsingDot color={C.violet} delay=".3s" /><span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: C.violet }}>Optimizing</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 13, color: C.body }}>SEO Score</span>
            <span style={{ fontFamily: FONT.serif, fontSize: 26, color: C.violet, marginLeft: 'auto' }}>92</span>
            <span style={{ fontFamily: FONT.sans, fontSize: 14, color: C.faint }}>/100</span>
          </div>
        </div>
      </div>

      {/* Gradient fade strip */}
      <div style={{ height: 40, background: `linear-gradient(to bottom, transparent, ${C.tint})` }} />
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 3. TeamGrid — Build Your Content Team                                       */
/* ─────────────────────────────────────────────────────────────────────────── */
function TeamGrid() {
  return (
    <section id="agents" className="lp-section" style={{ background: C.tint, padding: '100px 32px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Eyebrow color={C.blue}>YOUR TEAM</Eyebrow>
          <h2 className="lp-h2" style={{ fontFamily: FONT.serif, fontWeight: 400, fontSize: 48, letterSpacing: '-0.02em', color: C.ink, margin: '0 0 16px' }}>Build your content team</h2>
          <p style={{ fontFamily: FONT.sans, fontSize: 17, color: C.body, lineHeight: 1.6, maxWidth: 560, margin: '0 auto' }}>Five specialized agents, each an expert at one job. Assemble the team your content actually needs.</p>
        </div>
        <div className="lp-agent-grid">
          {COPY.team.agents.map(a => (
            <div key={a.key} style={{ background: 'white', borderRadius: 20, padding: 22, boxShadow: '0 18px 40px -26px rgba(17,24,39,.22)' }}>
              <IconTile bg={a.bg} size={46} radius={13} style={{ marginBottom: 14 }}>
                {a.key === 'research'  && <ResearchIcon  size={20} color={a.color} />}
                {a.key === 'writer'    && <WriterIcon    size={20} color={a.color} />}
                {a.key === 'seo'       && <SEOIcon       size={20} color={a.color} />}
                {a.key === 'repurpose' && <RepurposeIcon size={20} color={a.color} />}
                {a.key === 'analytics' && <AnalyticsIcon size={20} color={a.color} />}
              </IconTile>
              <div style={{ marginTop: 14, marginBottom: 6, fontFamily: FONT.sans, fontSize: 16, fontWeight: 600, color: C.ink }}>{a.name}</div>
              <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: C.muted, marginBottom: 12 }}>{a.task}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <PulsingDot color={a.statusColor} />
                <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: a.statusColor }}>{a.status}</span>
                <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.muted, marginLeft: 'auto' }}>{a.pct}%</span>
              </div>
              <ProgressBar pct={a.pct} color={a.color} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 4. VoiceVault — Teach Agents Your Voice                                     */
/* ─────────────────────────────────────────────────────────────────────────── */
function VoiceVault() {
  return (
    <section className="lp-section" style={{ background: '#fff', padding: '110px 32px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="lp-2col">
          {/* Left */}
          <div>
            <Eyebrow color={C.indigo}>VOICE VAULT</Eyebrow>
            <h2 className="lp-h2" style={{ fontFamily: FONT.serif, fontWeight: 400, fontSize: 48, letterSpacing: '-0.02em', color: C.ink, lineHeight: 1.05, margin: '0 0 20px' }}>Teach agents your voice</h2>
            <p style={{ fontFamily: FONT.sans, fontSize: 17, color: C.body, lineHeight: 1.6, maxWidth: 460 }}>
              Import your best work once. Every agent learns your rhythm, your phrases, your point of view — so everything they create already sounds like you.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 30, flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontFamily: FONT.serif, fontSize: 34, color: C.blue, fontWeight: 400 }}>94%</span>
                <div style={{ fontFamily: FONT.sans, fontSize: 13, color: C.muted }}>voice match</div>
              </div>
              <div style={{ width: 1, height: 40, background: 'rgba(17,24,39,.1)' }} />
              <div>
                <span style={{ fontFamily: FONT.serif, fontSize: 34, color: C.ink, fontWeight: 400 }}>47</span>
                <div style={{ fontFamily: FONT.sans, fontSize: 13, color: C.muted }}>samples learned</div>
              </div>
            </div>
          </div>

          {/* Right — Vault UI card */}
          <div style={{ background: C.tint, borderRadius: 24, padding: 12, boxShadow: '0 40px 80px -40px rgba(17,24,39,.3)' }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: GRAD.sig, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MicIcon size={18} />
                </div>
                <div>
                  <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.ink }}>Your Voice Vault</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <PulsingDot color="#22C55E" /><span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: '#22C55E' }}>Active</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {COPY.voiceVault.checklist.map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span style={{ fontFamily: FONT.sans, fontSize: 14, color: '#1F2937' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 5. Orchestration — Agents Work Together                                     */
/* ─────────────────────────────────────────────────────────────────────────── */
function PipelineArrow() {
  return (
    <svg width="44" height="24" viewBox="0 0 44 24" className="lp-pipeline-arrow-svg" style={{ flexShrink: 0 }} aria-hidden="true">
      <line x1="2" y1="12" x2="36" y2="12" stroke="#C7D2FE" strokeWidth="2" strokeDasharray="4 4" style={{ animation: 'ccDash 1s linear infinite' }} />
      <polyline points="32,6 42,12 32,18" stroke="#6366F1" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PipelineNode({ agentKey, label, isPublisher }) {
  const a = AGENT[agentKey]
  return (
    <div style={{ background: isPublisher ? GRAD.bi : 'white', borderRadius: 16, padding: '18px 20px', boxShadow: isPublisher ? '0 18px 40px -18px rgba(59,130,246,.6)' : '0 16px 36px -24px rgba(17,24,39,.22)', display: 'flex', alignItems: 'center', gap: 12, minWidth: 184, flexShrink: 0 }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: isPublisher ? 'rgba(255,255,255,.18)' : a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <a.Icon size={18} color={isPublisher ? 'white' : a.color} />
      </div>
      <span style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: isPublisher ? 'white' : C.ink }}>{label}</span>
    </div>
  )
}

function Orchestration() {
  return (
    <section className="lp-section" style={{ background: C.tint, padding: '110px 32px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <Eyebrow color={C.violet}>ORCHESTRATION</Eyebrow>
        <h2 className="lp-h2" style={{ fontFamily: FONT.serif, fontWeight: 400, fontSize: 48, letterSpacing: '-0.02em', color: C.ink, margin: '0 0 16px' }}>Agents work together</h2>
        <p style={{ fontFamily: FONT.sans, fontSize: 17, color: C.body, lineHeight: 1.6, maxWidth: 560, margin: '0 auto 48px' }}>
          A handoff pipeline, not a single bot. Each agent passes its work to the next — automatically.
        </p>

        {/* Row 1: Research → Writer → SEO */}
        <div className="lp-pipeline-row" style={{ gap: 0, marginBottom: 22, justifyContent: 'center' }}>
          <PipelineNode agentKey="research" label="Research" />
          <PipelineArrow />
          <PipelineNode agentKey="writer" label="Writer" />
          <PipelineArrow />
          <PipelineNode agentKey="seo" label="SEO" />
        </div>

        {/* Row 2: Analytics → Publisher */}
        <div className="lp-pipeline-row" style={{ gap: 0, justifyContent: 'center' }}>
          <PipelineNode agentKey="analytics" label="Analytics" />
          <PipelineArrow />
          <PipelineNode agentKey="publisher" label="Publisher" isPublisher />
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 6. WorkspaceMockup — One Workspace                                          */
/* ─────────────────────────────────────────────────────────────────────────── */
function WorkspaceMockup() {
  const sidebarItems = [
    { label: 'Projects',      active: true,  Icon: GridIcon },
    { label: 'Content Vault', active: false, Icon: null },
    { label: 'Assets',        active: false, Icon: null },
    { label: 'Templates',     active: false, Icon: null },
    { label: 'Analytics',     active: false, Icon: null },
  ]
  const agentStatuses = [
    { key: 'research',  name: 'Research Agent',  status: 'Done · 18 sources', color: '#22C55E' },
    { key: 'writer',    name: 'Writer Agent',    status: 'Drafting v3…',       color: C.indigo  },
    { key: 'seo',       name: 'SEO Agent',       status: 'Queued',             color: C.faint   },
    { key: 'analytics', name: 'Analytics Agent', status: 'Queued',             color: C.faint   },
  ]

  return (
    <section className="lp-section" style={{ background: '#fff', padding: '110px 32px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <Eyebrow color={C.blue}>THE WORKSPACE</Eyebrow>
          <h2 className="lp-h2" style={{ fontFamily: FONT.serif, fontWeight: 400, fontSize: 48, letterSpacing: '-0.02em', color: C.ink, margin: '0 0 16px' }}>One workspace. Unlimited content.</h2>
          <p style={{ fontFamily: FONT.sans, fontSize: 17, color: C.body, lineHeight: 1.6, maxWidth: 560, margin: '0 auto' }}>Your projects, your editor, and your agent team — together in one calm, focused view.</p>
        </div>

        {/* Browser chrome */}
        <div style={{ border: '1px solid rgba(17,24,39,.1)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 50px 100px -45px rgba(17,24,39,.4)', background: '#fff' }}>
          {/* Top bar */}
          <div style={{ height: 40, background: C.tint, borderBottom: '1px solid rgba(17,24,39,.08)', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#D1D5DB', '#D1D5DB', '#D1D5DB'].map((bg, i) => <span key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: bg, display: 'inline-block' }} />)}
            </div>
            <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.faint, margin: '0 auto' }}>app.contentcoach.ai</span>
          </div>

          {/* 3-pane grid */}
          <div className="lp-workspace-grid">
            {/* Sidebar */}
            <div className="lp-ws-sidebar" style={{ background: '#FBFCFF', borderRight: '1px solid rgba(17,24,39,.06)', padding: '18px 14px' }}>
              {sidebarItems.map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 9, marginBottom: 2, background: item.active ? '#EAF0FF' : 'transparent', cursor: 'pointer' }}>
                  {item.Icon ? <item.Icon size={16} /> : <span style={{ width: 16 }} />}
                  <span style={{ fontFamily: FONT.sans, fontSize: 13.5, color: item.active ? C.blue : '#4B5563', fontWeight: item.active ? 600 : 400 }}>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Editor */}
            <div style={{ padding: '30px 34px', overflow: 'hidden' }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint, letterSpacing: '0.1em', marginBottom: 20 }}>DRAFT · ~3 MIN READ</div>
              <h3 style={{ fontFamily: FONT.serif, fontSize: 30, color: C.ink, fontWeight: 400, lineHeight: 1.2, marginBottom: 16 }}>The creator economy is moving from tools to teams</h3>
              <p style={{ fontFamily: FONT.sans, fontSize: 14.5, color: '#374151', lineHeight: 1.85, marginBottom: 12 }}>
                For a decade, creators bought tools. A scheduler here, a grammar checker there, an analytics dashboard nobody opened.
              </p>
              <p style={{ fontFamily: FONT.sans, fontSize: 14.5, color: '#374151', lineHeight: 1.85 }}>
                The next leap isn't another tool. It's a{' '}
                <span style={{ background: '#EAF0FF', borderBottom: '2px solid #3B82F6', borderRadius: 2, padding: '0 2px' }}>team that works while you sleep</span>
                <span style={{ display: 'inline-block', width: 2, height: 16, background: C.blue, marginLeft: 1, verticalAlign: 'middle', animation: 'ccBlink 1s steps(1) infinite' }} />
              </p>
            </div>

            {/* Agent workspace */}
            <div className="lp-ws-agents" style={{ background: '#FBFCFF', borderLeft: '1px solid rgba(17,24,39,.06)', padding: 18 }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint, letterSpacing: '0.1em', marginBottom: 16 }}>AGENT WORKSPACE</div>
              {agentStatuses.map(item => {
                const a = AGENT[item.key]
                return (
                  <div key={item.key} style={{ background: 'white', borderRadius: 12, padding: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <a.Icon size={15} color={a.color} />
                    </div>
                    <div>
                      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 600, color: C.ink }}>{item.name}</div>
                      <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: item.color, marginTop: 2 }}>{item.status}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 7. Repurpose — Create Everywhere                                            */
/* ─────────────────────────────────────────────────────────────────────────── */
function Repurpose() {
  const cards = [
    {
      header: <><LinkedInIcon size={22} /><span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.ink, marginLeft: 8 }}>LinkedIn Post</span></>,
      content: <p style={{ fontFamily: FONT.sans, fontSize: 13.5, color: '#374151', lineHeight: 1.6 }}>The biggest mistake creators make isn't posting too little. It's creating without a system. Here's the 45-minute workflow that replaced our 6-hour grind →</p>,
    },
    {
      header: <><MediumIcon size={22} /><span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.ink, marginLeft: 8 }}>Medium Article</span></>,
      content: <>
        <p style={{ fontFamily: FONT.serif, fontSize: 18, color: C.ink, lineHeight: 1.3, marginBottom: 8 }}>The creator economy is moving from tools to teams</p>
        <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>The next generation of content platforms won't be assistants. They'll be specialized AI teams.</p>
      </>,
    },
    {
      header: <><div style={{ width: 22, height: 22, borderRadius: 6, background: C.iLt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg></div><span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.ink, marginLeft: 8 }}>Newsletter</span></>,
      content: <>
        <p style={{ fontFamily: FONT.serif, fontSize: 17, color: C.ink, lineHeight: 1.3, marginBottom: 8 }}>Issue #24 — Build the team</p>
        <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>This week: why systems beat hustle, and the 5 agents doing our heavy lifting.</p>
      </>,
    },
    {
      header: <><div style={{ width: 22, height: 22, borderRadius: 6, background: C.sLt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.sky} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg></div><span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.ink, marginLeft: 8 }}>Blog Post</span></>,
      content: <>
        <p style={{ fontFamily: FONT.serif, fontSize: 18, color: C.ink, lineHeight: 1.3, marginBottom: 8 }}>A complete guide to AI content systems</p>
        <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>SEO-optimized, 1,800 words, structured with H2s and a meta description.</p>
      </>,
    },
    {
      header: <><XIcon size={22} /><span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.ink, marginLeft: 8 }}>X Thread</span></>,
      content: <p style={{ fontFamily: FONT.sans, fontSize: 13.5, color: '#374151', lineHeight: 1.7 }}>
        1/ Everyone's drowning in content tools.<br />
        2/ But tools don't create — teams do.<br />
        3/ Here's how 5 AI agents replaced our content stack 🧵
      </p>,
    },
    {
      isGradient: true,
    },
  ]

  return (
    <section className="lp-section" style={{ background: C.tint, padding: '110px 32px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Eyebrow color={C.violet}>REPURPOSE</Eyebrow>
          <h2 className="lp-h2" style={{ fontFamily: FONT.serif, fontWeight: 400, fontSize: 48, letterSpacing: '-0.02em', color: C.ink, margin: '0 0 16px' }}>Create everywhere</h2>
          <p style={{ fontFamily: FONT.sans, fontSize: 17, color: C.body, lineHeight: 1.6, maxWidth: 560, margin: '0 auto' }}>One idea, every platform. Your agents reshape a single draft into native content for each channel.</p>
        </div>
        <div className="lp-3col">
          {cards.map((card, i) =>
            card.isGradient ? (
              <div key={i} style={{ background: GRAD.sig, borderRadius: 18, padding: 24, boxShadow: '0 24px 50px -24px rgba(99,102,241,.6)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ fontFamily: FONT.serif, fontSize: 26, color: 'white', lineHeight: 1.15, marginBottom: 12 }}>1 idea →<br />5 formats</p>
                <p style={{ fontFamily: FONT.sans, fontSize: 14, color: 'rgba(255,255,255,.8)', lineHeight: 1.6 }}>Generated in under a minute, each one native to its platform.</p>
              </div>
            ) : (
              <div key={i} style={{ background: 'white', borderRadius: 18, padding: 20, boxShadow: '0 20px 44px -28px rgba(17,24,39,.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>{card.header}</div>
                {card.content}
              </div>
            )
          )}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 8. AlwaysOn — Dark live activity                                            */
/* ─────────────────────────────────────────────────────────────────────────── */
function AlwaysOn() {
  return (
    <section className="lp-section" style={{ position: 'relative', overflow: 'hidden', background: C.dark, padding: '110px 32px' }}>
      {/* Background blobs */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: 420, height: 420, top: '-10%', left: '-5%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.28), transparent 70%)', filter: 'blur(60px)', animation: 'ccBlob 22s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', width: 460, height: 460, bottom: '-10%', right: '-5%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,.26), transparent 70%)', filter: 'blur(70px)', animation: 'ccBlob2 26s ease-in-out infinite' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 880, margin: '0 auto', textAlign: 'center' }}>
        <Eyebrow color="#6FA8FF">ALWAYS ON</Eyebrow>
        <h2 className="lp-alwayson-h2" style={{ fontFamily: FONT.serif, fontWeight: 400, fontSize: 52, color: '#F4F7FF', letterSpacing: '-0.02em', margin: '0 0 20px', lineHeight: 1.1 }}>
          Your agents never stop working.
        </h2>
        <p style={{ fontFamily: FONT.sans, fontSize: 17, color: '#9AA6C4', lineHeight: 1.6, maxWidth: 500, margin: '0 auto 40px' }}>
          While you're offline, the team keeps researching, drafting, and optimizing — ready when you're back.
        </p>

        {/* Activity feed card */}
        <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, padding: 12, backdropFilter: 'blur(8px)', maxWidth: 560, margin: '0 auto', textAlign: 'left' }}>
          {COPY.alwaysOn.feed.map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px', borderBottom: i < COPY.alwaysOn.feed.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
              <PulsingDot color={row.color} delay={row.delay} />
              <span style={{ fontFamily: FONT.sans, fontSize: 14, color: '#DCE3F5', flex: 1 }}>
                <strong style={{ color: 'white' }}>{row.agent}</strong> {row.action}
              </span>
              <span style={{ fontFamily: FONT.mono, fontSize: 12, color: '#6B7794', whiteSpace: 'nowrap' }}>{row.time}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 9. Pricing                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */
function Pricing() {
  const navigate = useNavigate()

  return (
    <section id="pricing" className="lp-section" style={{ background: C.tint, padding: '110px 32px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Eyebrow color={C.indigo}>PRICING</Eyebrow>
          <h2 className="lp-h2" style={{ fontFamily: FONT.serif, fontWeight: 400, fontSize: 48, letterSpacing: '-0.02em', color: C.ink, margin: 0 }}>Start free. Scale your team.</h2>
        </div>
        <div className="lp-pricing-grid">
          {COPY.pricing.tiers.map(tier => (
            <div key={tier.name} className={tier.highlighted ? 'lp-pro-lift' : ''} style={{
              background: 'white',
              borderRadius: 22,
              padding: 30,
              position: 'relative',
              border: tier.highlighted ? '2px solid #3B82F6' : '1px solid rgba(17,24,39,.1)',
              boxShadow: tier.highlighted ? '0 0 0 6px rgba(59,130,246,.1), 0 40px 80px -34px rgba(59,130,246,.55)' : 'none',
              transform: tier.highlighted ? 'translateY(-12px)' : 'none',
            }}>
              {tier.badge && (
                <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: C.blue, color: 'white', fontFamily: FONT.mono, fontSize: 11.5, fontWeight: 600, padding: '4px 14px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  {tier.badge}
                </div>
              )}
              <div style={{ fontFamily: FONT.sans, fontSize: 18, fontWeight: 600, color: tier.highlighted ? C.blue : C.ink, marginBottom: 4 }}>{tier.name}</div>
              <div style={{ fontFamily: FONT.sans, fontSize: 13.5, color: C.muted, marginBottom: 16 }}>{tier.desc}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 24 }}>
                <span style={{ fontFamily: FONT.serif, fontSize: 46, fontWeight: 400, color: C.ink, letterSpacing: '-0.02em' }}>{tier.price}</span>
                <span style={{ fontFamily: FONT.sans, fontSize: 15, color: C.muted }}>/mo</span>
              </div>
              <button onClick={() => navigate('/register')} style={{
                width: '100%',
                fontFamily: FONT.sans, fontSize: 15, fontWeight: 600,
                padding: '12px 20px', borderRadius: 12, cursor: 'pointer', minHeight: 44,
                border: tier.highlighted ? 'none' : '1px solid rgba(17,24,39,.15)',
                background: tier.highlighted ? C.blue : C.tint,
                color: tier.highlighted ? 'white' : C.ink,
                boxShadow: tier.highlighted ? '0 8px 20px -6px rgba(59,130,246,.5)' : 'none',
                marginBottom: 24,
              }}>
                Start Free
              </button>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tier.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONT.sans, fontSize: 14, color: '#374151' }}>
                    <CheckIcon />{f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 10. FinalCTA — Dark                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
function FinalCTA() {
  const navigate = useNavigate()
  const chips = [
    { style: { top: '10%', left: '6%', animation: 'ccFloatA 11s ease-in-out infinite' }, agentKey: 'research', label: 'Research · Active' },
    { style: { bottom: '14%', right: '7%', animation: 'ccFloatD 13s ease-in-out infinite' }, agentKey: 'seo', label: 'SEO · 92/100' },
    { style: { top: '24%', right: '16%', animation: 'ccFloatB 12s ease-in-out infinite' }, agentKey: 'writer', label: 'Writer · Drafting' },
  ]

  return (
    <section style={{ position: 'relative', overflow: 'hidden', background: C.dark, padding: '130px 32px', textAlign: 'center' }}>
      {/* Background floating chips */}
      {chips.map((chip, i) => {
        const a = AGENT[chip.agentKey]
        return (
          <div key={i} className="lp-cta-chips" style={{ position: 'absolute', zIndex: 0, opacity: 0.45, background: C.darkCard, border: '1px solid rgba(255,255,255,.06)', borderRadius: 16, padding: 15, display: 'flex', alignItems: 'center', gap: 10, ...chip.style }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: a.bg || 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <a.Icon size={15} color={a.color || 'white'} />
            </div>
            <span style={{ fontFamily: FONT.sans, fontSize: 13, color: '#9AA6C4', whiteSpace: 'nowrap' }}>{chip.label}</span>
          </div>
        )
      })}

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto' }}>
        <h2 className="lp-finalcta-h2" style={{ fontFamily: FONT.serif, fontWeight: 400, fontSize: 60, color: '#F4F7FF', letterSpacing: '-0.02em', margin: '0 0 20px', lineHeight: 1.05 }}>
          Stop creating content alone.
        </h2>
        <p style={{ fontFamily: FONT.sans, fontSize: 18, color: '#9AA6C4', lineHeight: 1.6, maxWidth: 520, margin: '0 auto 36px' }}>
          Build an AI content team that learns your voice and grows with you.
        </p>
        <button onClick={() => navigate('/register')} style={{ fontFamily: FONT.sans, fontSize: 16, fontWeight: 600, color: 'white', background: C.blue, border: 'none', padding: '16px 34px', borderRadius: 13, cursor: 'pointer', boxShadow: '0 16px 40px -10px rgba(59,130,246,.7)', minHeight: 44 }}>
          Start Free Today
        </button>
        <p style={{ fontFamily: FONT.mono, fontSize: 13, color: '#6B7794', marginTop: 18 }}>No credit card required · Free forever plan</p>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 11. Footer                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ background: C.dark, borderTop: '1px solid rgba(255,255,255,.07)', padding: '40px 32px' }}>
      <div className="lp-footer-inner">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: GRAD.sig, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
            <span style={{ fontFamily: FONT.serif, fontSize: 16, color: 'white' }}>C</span>
          </div>
          <span style={{ fontFamily: FONT.sans, fontSize: 14.5, fontWeight: 600, color: '#E5EAF6' }}>ContentCoach AI</span>
        </div>

        {/* Links */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 26, justifyContent: 'center' }}>
          {COPY.footer.links.map(l => (
            <a key={l} href="#" style={{ fontFamily: FONT.sans, fontSize: 13.5, color: '#8893AE', textDecoration: 'none' }}>{l}</a>
          ))}
        </div>

        {/* Copyright */}
        <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: '#6B7794' }}>{COPY.footer.copyright}</span>
      </div>
    </footer>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Page root                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div style={{ overflowX: 'hidden', fontFamily: FONT.sans }}>
      <Nav />
      <main>
        <Hero />
        <TeamGrid />
        <VoiceVault />
        <Orchestration />
        <WorkspaceMockup />
        <Repurpose />
        <AlwaysOn />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
