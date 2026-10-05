import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'

/* ─── Design tokens (Honne) ──────────────────────────────────────────────── */
const C = {
  bg: '#FAF7F2',
  ink: '#15181A',
  body: '#5E6366',
  bodyMuted: '#6B6F72',
  faint: '#8A8F92',
  border: '#EDE7DE',
  borderAlt: '#EFEAE3',
  panelAlt: '#F6F2EC',
  chipBg: '#E4DDD2',
  orange: '#F0662A',
  orangeLight: '#F6A15B',
  orangeDark: '#C2553A',
  teal: '#2C6E7F',
  tealLight: '#9CCAD3',
  green: '#2F7A4E',
  greenBg: '#E7F2EA',
  dark: '#0C1F26',
}
const FONT = {
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'Geist', ui-sans-serif, system-ui, sans-serif",
  mono: "'Geist Mono', monospace",
  display: "'Bricolage Grotesque', Geist, sans-serif",
}
const EASE = [0.16, 1, 0.3, 1]

/* ─── Content ────────────────────────────────────────────────────────────── */
const STATEMENT = "Company knowledge is scattered across docs, notes and repos. Honne brings it into one place, so every team can build agents on top of it."
const ITAL_WORDS = new Set(['one', 'place,'])
const VOICE_TRAITS = ['Plain words', 'No hype', 'Short first line', 'Product terms', 'No hashtags']

// Studio demos are the static Claude Design prototypes in public/demo; `?demo=1` makes them auto-play.
const STUDIO_TABS = [
  { id: 'li', label: 'LinkedIn', src: '/demo/linkedin.html?demo=1' },
  { id: 'x', label: 'X', src: '/demo/x.html?demo=1' },
  { id: 'rd', label: 'Reddit', src: '/demo/reddit.html?demo=1' },
]
const STUDIO_W = 1360
const STUDIO_H = 820

const BUILD_STEPS = [
  { title: 'Platform agents', sub: 'LinkedIn · X · Reddit', state: 'live' },
  { title: 'Thread memory', sub: 'Chats saved per thread', state: 'live' },
  { title: 'Unified knowledge', sub: 'One searchable layer', state: 'building', n: '03' },
  { title: 'Supervisor + agents', sub: 'Agents on shared knowledge', state: 'next', n: '04' },
]
const STACK = [
  ['React', 'react'], ['Vite', 'vite'], ['Tailwind', 'tailwindcss'], ['FastAPI', 'fastapi'], ['LangGraph', 'langchain'], ['Postgres', 'postgresql'],
  ['Supabase', 'supabase'], ['Gemini', 'googlegemini'], ['Redis', 'redis'], ['Render', 'render'], ['Vercel', 'vercel'],
]
const PIPELINE = ['Retrieve', 'Chunk', 'Embed', 'Semantic search']

/* ─── Icons ──────────────────────────────────────────────────────────────── */
function IconArrowUpRight({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7" /><path d="M8 7h9v9" />
    </svg>
  )
}
function IconChevronDown({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" /><path d="m19 12-7 7-7-7" />
    </svg>
  )
}
function IconCheck({ size = 16, color = 'currentColor' }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
function IconGoogleDocs({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'block' }} aria-hidden="true">
      <path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#4285F4" />
      <path d="M14 2v5h5z" fill="#A1C2FA" />
      <path d="M8 12h8M8 15h8M8 18h5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function IconGoogleDrive({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'block' }} aria-hidden="true">
      <path d="M8.5 2.5 1 15.5l3.8 6.5 7.5-13z" fill="#0F9D58" />
      <path d="M8.5 2.5h7l7.5 13h-7z" fill="#F4B400" />
      <path d="M4.8 22h14.4l3.8-6.5H8.6z" fill="#4285F4" />
    </svg>
  )
}
function IconNotion({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'block' }} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#fff" stroke="#15181A" strokeWidth="1.6" />
      <text x="12" y="16.6" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="12" fill="#15181A">N</text>
    </svg>
  )
}
function IconSheets({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'block' }} aria-hidden="true">
      <path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#0F9D58" />
      <path d="M14 2v5h5z" fill="#87CEAC" />
      <rect x="7.5" y="11" width="9" height="7" fill="none" stroke="#fff" strokeWidth="1.3" />
      <path d="M7.5 14.5h9M12 11v7" stroke="#fff" strokeWidth="1.3" />
    </svg>
  )
}
function IconWord({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'block' }} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#185ABD" />
      <text x="12" y="16.4" textAnchor="middle" fontFamily="Geist, Arial, sans-serif" fontWeight="700" fontSize="11" fill="#fff">W</text>
    </svg>
  )
}
function IconLinkedIn({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'block' }} aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#0A66C2" />
      <text x="12" y="17.4" textAnchor="middle" fontFamily="Geist, Arial, sans-serif" fontWeight="700" fontSize="13" fill="#fff">in</text>
    </svg>
  )
}
function IconX({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'block' }} aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#000" />
      <g transform="translate(5.5 5.5) scale(.54)">
        <path fill="#fff" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
      </g>
    </svg>
  )
}
function IconReddit({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'block' }} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#FF4500" />
      <ellipse cx="12" cy="14.2" rx="6.6" ry="4.6" fill="#fff" />
      <circle cx="17.4" cy="6.6" r="1.4" fill="#fff" />
      <path d="M12 9.6 13 5.8l4.2 1" stroke="#fff" strokeWidth="1" fill="none" />
      <circle cx="9.6" cy="13.6" r="1" fill="#FF4500" />
      <circle cx="14.4" cy="13.6" r="1" fill="#FF4500" />
      <path d="M9.8 16.3c1.3.8 3.1.8 4.4 0" stroke="#FF4500" strokeWidth=".9" fill="none" strokeLinecap="round" />
    </svg>
  )
}
function LogoMark({ size = 28, fontSize = 22 }) {
  return (
    <span style={{ position: 'relative', width: size, height: size, borderRadius: size * 0.28, background: 'linear-gradient(140deg, #F6A15B 0%, #F0662A 55%, #C2553A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.28), 0 0 18px rgba(240,102,42,.65)' }}>
      <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize, lineHeight: 1, color: '#FFFFFF', textShadow: '0 0 10px rgba(255,236,220,.95)', marginTop: 2 }}>H</span>
      <span className="hn-shine" />
    </span>
  )
}

/* ─── Small interaction hooks ────────────────────────────────────────────── */
function useMagnetic(strength = 1) {
  const onMouseMove = useCallback((e) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left - r.width / 2) * 0.25 * strength
    const y = (e.clientY - r.top - r.height / 2) * 0.35 * strength
    el.style.transform = `translate(${x}px, ${y}px)`
  }, [strength])
  const onMouseLeave = useCallback((e) => { e.currentTarget.style.transform = 'translate(0,0)' }, [])
  return { onMouseMove, onMouseLeave }
}
function useTilt() {
  const onMouseMove = useCallback((e) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    el.style.transform = `perspective(900px) rotateY(${px * 7}deg) rotateX(${-py * 7}deg) translateY(-4px)`
  }, [])
  const onMouseLeave = useCallback((e) => { e.currentTarget.style.transform = 'perspective(900px) rotateY(0) rotateX(0) translateY(0)' }, [])
  return { onMouseMove, onMouseLeave }
}
function useScrolled(threshold) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    let raf = null
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = null
        setScrolled(window.scrollY > (threshold ?? window.innerHeight * 0.6))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [threshold])
  return scrolled
}
function scrollToId(id) {
  return (e) => {
    e && e.preventDefault()
    const el = id === 'top' ? document.body : document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function Reveal({ children, delay = 0, as: As = motion.div, style, className }) {
  return (
    <As
      className={className}
      style={style}
      initial={{ opacity: 0, y: 48 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 1, ease: EASE, delay }}
    >
      {children}
    </As>
  )
}
function TiltCard({ children, style, className, as: As = 'div', ...rest }) {
  const tilt = useTilt()
  return (
    <As onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className={`hn-tilt ${className || ''}`} style={style} {...rest}>
      {children}
    </As>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Nav                                                                         */
/* Brand marks used only on this page */
function IconLinkedInGlyph({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, fill: '#FFFFFF', display: 'block' }} aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452z" />
    </svg>
  )
}
function IconXGlyph({ size = 11 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, fill: '#FFFFFF', display: 'block' }} aria-hidden="true">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  )
}
function IconRedditGlyph({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'block' }} aria-hidden="true">
      <circle cx="18.3" cy="4.9" r="1.6" fill="#FFFFFF" />
      <path d="M12.4 8.2 13.5 3.8l3.6.8" fill="none" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="5.2" cy="11" r="2.1" fill="#FFFFFF" />
      <circle cx="18.8" cy="11" r="2.1" fill="#FFFFFF" />
      <ellipse cx="12" cy="14.6" rx="7.6" ry="5.4" fill="#FFFFFF" />
      <circle cx="9" cy="13.6" r="1.25" fill="#FF4500" />
      <circle cx="15" cy="13.6" r="1.25" fill="#FF4500" />
    </svg>
  )
}
function SimpleIcon({ slug, size = 18, alt = '' }) {
  return <img src={`https://cdn.simpleicons.org/${slug}`} alt={alt} loading="lazy" style={{ width: size, height: size, display: 'block' }} />
}

function NavigateLink({ to, children, className, style }) {
  const navigate = useNavigate()
  return <a href={to} className={className} style={style} onClick={(e) => { e.preventDefault(); navigate(to) }}>{children}</a>
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Nav                                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
function Nav() {
  const navigate = useNavigate()
  const cta = useMagnetic()
  const linkStyle = { height: 36, display: 'flex', alignItems: 'center', padding: '0 14px', borderRadius: 9, fontSize: 14, color: 'rgba(255,255,255,.82)' }
  const scrolled = useScrolled()
  return (
    <nav
      className="hn-nav"
      style={{
        position: 'fixed', zIndex: 50, top: scrolled ? 12 : 24, left: '50%', transform: 'translateX(-50%)',
        width: scrolled ? 'min(1080px, calc(100% - 24px))' : 'calc(100% - 72px)',
        display: 'flex', alignItems: 'center', gap: 24, height: 60, padding: '0 8px 0 20px', borderRadius: 16,
        border: `1px solid ${scrolled ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.18)'}`,
        background: scrolled ? 'rgba(12,31,38,.78)' : 'rgba(255,255,255,.04)',
        backdropFilter: 'blur(18px) saturate(140%)', WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        color: '#FFFFFF', transition: 'background .35s ease, border-color .35s ease, top .35s ease, width .35s ease, box-shadow .35s ease',
        boxShadow: scrolled ? '0 20px 50px -20px rgba(12,31,38,.5)' : 'none',
      }}
    >
      <a href="#top" onClick={scrollToId('top')} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#FFFFFF' }}>
        <LogoMark />
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>Honne <span style={{ color: C.orangeLight }}>AI</span></span>
      </a>
      <div style={{ flex: 1 }} />
      <div className="hn-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <a href="#how" onClick={scrollToId('how')} className="hn-nav-link" style={linkStyle}>Live demo</a>
        <a href="#agents" onClick={scrollToId('agents')} className="hn-nav-link" style={linkStyle}>Agents</a>
        <a href="#voice" onClick={scrollToId('voice')} className="hn-nav-link" style={linkStyle}>Brand memory</a>
        <a href="#uses" onClick={scrollToId('uses')} className="hn-nav-link" style={linkStyle}>Why Honne</a>
      </div>
      <div className="hn-nav-links" style={{ flex: 1 }} />
      <NavigateLink to="/login" className="hn-nav-links" style={{ fontSize: 14, color: 'rgba(255,255,255,.82)', padding: '0 6px', whiteSpace: 'nowrap', minHeight: 44, display: 'flex', alignItems: 'center' }}>
        Sign in
      </NavigateLink>
      <button
        onMouseMove={cta.onMouseMove} onMouseLeave={cta.onMouseLeave}
        onClick={() => navigate('/register')}
        className="hn-magnetic hn-hover-light"
        style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 5px 0 16px', borderRadius: 12, background: '#FFFFFF', color: '#15181A', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer' }}
      >
        Open Honne
        <span style={{ width: 34, height: 34, borderRadius: 9, background: '#15181A', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconArrowUpRight size={15} />
        </span>
      </button>
    </nav>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Hero                                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */
const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 1.1, ease: EASE } } }
const wordUp = { hidden: { y: '115%', rotate: 3 }, show: { y: 0, rotate: 0, transition: { duration: 1.3, ease: EASE } } }
const staggerParent = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } } }
const GRADIENT_TEXT = 'hn-gradient-shimmer'

function RingDots() {
  const dots = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2
    return { x: 50 + Math.cos(a) * 42 + '%', y: 50 + Math.sin(a) * 42 + '%', o: 0.35 + (i / 8) * 0.65 }
  }), [])
  return (
    <span className="hn-hero-ring" style={{ position: 'relative', display: 'inline-block', width: '.56em', height: '.56em', flex: 'none', animation: 'hn-spin 16s linear infinite' }}>
      {dots.map((d, i) => (
        <span key={i} style={{ position: 'absolute', left: d.x, top: d.y, width: 6, height: 6, margin: '-3px 0 0 -3px', borderRadius: '50%', background: '#FFFFFF', opacity: d.o }} />
      ))}
    </span>
  )
}

function HeroWord({ children, style }) {
  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', padding: '0 .04em .2em 0', marginBottom: '-.14em' }}>
      <motion.span variants={wordUp} style={{ display: 'inline-block', ...style }}>{children}</motion.span>
    </span>
  )
}

const glassCard = { borderRadius: 18, background: 'rgba(12,31,38,.5)', border: '1px solid rgba(255,255,255,.16)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }
const ycChip = { height: 28, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderRadius: 999, background: 'rgba(242,101,34,.18)', border: '1px solid rgba(246,161,91,.5)', fontSize: 12, color: '#FFE3CC', whiteSpace: 'nowrap' }

function Hero() {
  const navigate = useNavigate()
  const heroRef = useRef(null)
  const glowRef = useRef(null)
  const blobsXRef = useRef(null)
  const startCta = useMagnetic()

  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const blobsY = useTransform(scrollYProgress, [0, 1], ['0%', '18%'])

  const onHeroMove = useCallback((e) => {
    const r = heroRef.current.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    if (glowRef.current) glowRef.current.style.transform = `translate(${x}px, ${y}px)`
    if (blobsXRef.current) blobsXRef.current.style.transform = `translateX(${(x / r.width - 0.5) * -40}px)`
  }, [])

  return (
    <section id="top" style={{ padding: 12 }}>
      <div ref={heroRef} data-hero onMouseMove={onHeroMove} className="hn-hero-shell" style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, minHeight: 'calc(100vh - 24px)', background: C.dark, color: '#FFFFFF', isolation: 'isolate' }}>
        <motion.div style={{ position: 'absolute', inset: '-10%', zIndex: 0, y: blobsY }}>
          <div ref={blobsXRef} style={{ position: 'absolute', inset: 0 }}>
            <div className="hn-blob hn-blob-1" style={{ position: 'absolute', left: '-8%', bottom: '-18%', width: '62%', height: '78%', borderRadius: '50%', background: 'radial-gradient(closest-side, #F0662A 0%, rgba(240,102,42,.55) 45%, rgba(240,102,42,0) 100%)', filter: 'blur(30px)' }} />
            <div className="hn-blob hn-blob-2" style={{ position: 'absolute', left: '22%', top: '-24%', width: '58%', height: '70%', borderRadius: '50%', background: 'radial-gradient(closest-side, #2C6E7F 0%, rgba(44,110,127,.5) 50%, rgba(44,110,127,0) 100%)', filter: 'blur(30px)' }} />
            <div className="hn-blob hn-blob-3" style={{ position: 'absolute', right: '-12%', top: '8%', width: '54%', height: '80%', borderRadius: '50%', background: 'radial-gradient(closest-side, #F6A15B 0%, rgba(246,161,91,.45) 45%, rgba(246,161,91,0) 100%)', filter: 'blur(40px)', opacity: 0.85 }} />
            <div className="hn-blob hn-blob-4" style={{ position: 'absolute', right: '18%', bottom: '-30%', width: '44%', height: '60%', borderRadius: '50%', background: 'radial-gradient(closest-side, #C2553A 0%, rgba(194,85,58,0) 100%)', filter: 'blur(40px)', opacity: 0.8 }} />
            <div className="hn-blob hn-blob-5" style={{ position: 'absolute', left: '38%', top: '30%', width: '30%', height: '40%', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(127,184,196,.55) 0%, rgba(127,184,196,0) 100%)', filter: 'blur(30px)' }} />
          </div>
        </motion.div>
        <div ref={glowRef} style={{ position: 'absolute', zIndex: 1, left: 0, top: 0, width: 520, height: 520, margin: '-260px 0 0 -260px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,236,220,.22), rgba(255,236,220,0))', pointerEvents: 'none', transition: 'transform .8s cubic-bezier(.2,.7,.2,1)' }} />
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, opacity: 0.22, mixBlendMode: 'overlay', pointerEvents: 'none', backgroundImage: 'radial-gradient(rgba(255,255,255,.35) 0.6px, transparent 0.8px)', backgroundSize: '3px 3px' }} />
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'linear-gradient(180deg, rgba(12,31,38,.35) 0%, rgba(12,31,38,0) 30%, rgba(12,31,38,0) 60%, rgba(12,31,38,.45) 100%)', pointerEvents: 'none' }} />

        <div className="hn-hero-pad" style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 24px)', padding: '128px 44px 32px' }}>
          <motion.div className="hn-hero-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 40, alignItems: 'center' }} initial="hidden" animate="show" variants={staggerParent}>
            <div>
              <motion.div variants={fadeUp} style={{ position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', gap: 12, maxWidth: '100%', minHeight: 46, padding: '6px 22px 6px 6px', borderRadius: 999, background: 'linear-gradient(100deg, #FFF4EA 0%, #FFD4B0 45%, #F6A15B 100%)', color: '#15181A', fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: 30, boxShadow: '0 0 0 1px rgba(255,255,255,.65), 0 0 40px rgba(246,161,91,.8), 0 12px 34px -8px rgba(240,102,42,.85)' }}>
                <span style={{ height: 34, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 11px', borderRadius: 999, background: '#15181A', color: '#FFFFFF', fontFamily: FONT.mono, fontSize: 12, fontWeight: 500 }}>本音</span>
                <span style={{ position: 'relative' }}>Multiplayer AI layer for large enterprises</span>
                <span style={{ position: 'absolute', top: '-20%', left: '-60%', width: '30%', height: '140%', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.85), rgba(255,255,255,0))', transform: 'rotate(20deg)', animation: 'hn-shine 4.2s ease-in-out infinite', pointerEvents: 'none' }} />
              </motion.div>
              <h1 className="hn-hero-h1" style={{ margin: 0, fontFamily: FONT.serif, fontWeight: 400, lineHeight: 0.95, letterSpacing: '-0.035em' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '.25em', flexWrap: 'wrap' }}>
                  <HeroWord>Multiplayer</HeroWord>
                  <HeroWord>AI</HeroWord>
                  <HeroWord>Layer</HeroWord>
                  <motion.span variants={{ hidden: { scale: 0, rotate: -180, opacity: 0 }, show: { scale: 1, rotate: 0, opacity: 1, transition: { duration: 1.3, ease: EASE } } }}>
                    <RingDots />
                  </motion.span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '.24em', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-block', overflow: 'hidden', padding: '0 .06em .24em 0', marginBottom: '-.12em' }}>
                    <motion.span variants={wordUp} className={GRADIENT_TEXT} style={{ display: 'inline-block', fontStyle: 'italic', padding: '0 .08em .2em 0', marginBottom: '-.2em' }}>with specialized agents</motion.span>
                  </span>
                </span>
              </h1>
              <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 22 }}>
                <span className={GRADIENT_TEXT} style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 'clamp(24px, 2.4vw, 36px)', lineHeight: 1.15, letterSpacing: '-0.02em' }}>Turn what your team builds into what your team posts.</span>
                <span style={{ display: 'flex', gap: 6, padding: 5, borderRadius: 10, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)' }}>
                  <IconLinkedIn size={30} /><IconX size={30} /><IconReddit size={30} />
                </span>
              </motion.div>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '28px 40px', marginTop: 36 }}>
                <motion.p variants={fadeUp} className="hn-hero-sub" style={{ margin: 0, maxWidth: 540, lineHeight: 1.5, fontWeight: 300, color: 'rgba(255,255,255,.88)', textWrap: 'pretty' }}>
                  Honne brings your team&apos;s Google Docs, Notion and GitHub into one knowledge source. Build specialised AI agents to turn it into marketing and sales ready product.
                </motion.p>
                <motion.div variants={fadeUp} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    onMouseMove={startCta.onMouseMove} onMouseLeave={startCta.onMouseLeave}
                    onClick={() => navigate('/register')}
                    className="hn-magnetic hn-hover-light"
                    style={{ display: 'flex', alignItems: 'center', height: 52, padding: '0 24px', borderRadius: 999, background: '#FFFFFF', color: '#15181A', fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', boxShadow: '0 10px 30px -10px rgba(0,0,0,.4)', border: 'none', cursor: 'pointer' }}
                  >
                    Start with your knowledge
                  </button>
                  <a href="#how" onClick={scrollToId('how')} className="hn-hover-outline" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 52, padding: '0 20px', borderRadius: 999, border: '1px solid rgba(255,255,255,.28)', color: '#FFFFFF', fontSize: 15, whiteSpace: 'nowrap' }}>
                    See it working
                    <IconChevronDown />
                  </a>
                </motion.div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, justifySelf: 'start', alignSelf: 'start', width: 280, maxWidth: '100%' }}>
              <motion.div variants={fadeUp} style={{ ...glassCard, display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 28, height: 28, flex: 'none', borderRadius: 6, background: '#F26522', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 600, color: '#FFFFFF', boxShadow: '0 0 18px rgba(242,101,34,.6)' }}>Y</span>
                  <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>On Y Combinator&apos;s Requests for Startups</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.45, color: 'rgba(255,255,255,.75)' }}>The problem large enterprises are trying to solve right now.</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span style={ycChip}>Multiplayer AI<span style={{ fontFamily: FONT.mono, fontSize: 9, color: 'rgba(255,227,204,.7)' }}>FALL 2026</span></span>
                  <span style={ycChip}>Company Brain<span style={{ fontFamily: FONT.mono, fontSize: 9, color: 'rgba(255,227,204,.7)' }}>SUMMER 2026</span></span>
                </div>
              </motion.div>
              <motion.div variants={fadeUp} style={{ ...glassCard, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '16px 18px', fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,.72)' }}>
                <span style={{ height: 22, display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,.24)', fontFamily: FONT.mono, fontSize: 10, letterSpacing: '.08em', color: '#FFFFFF' }}>PROTOTYPE</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', textWrap: 'pretty' }}>
                  Inspired by
                  <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 6px', borderRadius: 6, background: '#FFFFFF' }}>
                    <span style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 700, letterSpacing: '-0.03em', color: '#111418' }}>Dust</span>
                  </span>
                  AI: a GenAI layer over enterprise knowledge, starting with marketing and sales.
                </span>
              </motion.div>
            </div>
          </motion.div>

          <motion.div className="hn-hero-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16, marginTop: 48 }} initial="hidden" animate="show" variants={staggerParent}>
            <TiltCard as={motion.div} variants={fadeUp} style={{ padding: '22px 24px 24px', borderRadius: 20, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.08em', color: 'rgba(255,255,255,.7)' }}><span>01 · IN</span><span>DOCS · NOTION · GITHUB</span></div>
              <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 30, marginTop: 22, lineHeight: 1 }}>Your knowledge</div>
              <div style={{ fontSize: 14, lineHeight: 1.45, color: 'rgba(255,255,255,.85)', marginTop: 8 }}>Docs, Sheets, Notion, GitHub, Word and uploads.</div>
            </TiltCard>
            <TiltCard as={motion.div} variants={fadeUp} style={{ padding: '22px 24px 24px', borderRadius: 20, background: '#FFFFFF', color: '#15181A', boxShadow: '0 24px 60px -24px rgba(0,0,0,.45)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.08em', color: '#6B6F72' }}><span>02 · HONNE</span><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: C.orange }} />SPECIALISED AI AGENTS</span></div>
              <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 30, marginTop: 22, lineHeight: 1.05 }}>Raw notes to publishable posts</div>
              <div style={{ fontSize: 14, lineHeight: 1.45, color: '#4A4F53', marginTop: 8 }}>Research, angles, series and writing, each handled by its own agent.</div>
            </TiltCard>
            <TiltCard as={motion.div} variants={fadeUp} style={{ padding: '22px 24px 24px', borderRadius: 20, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.08em', color: 'rgba(255,255,255,.7)' }}><span>03 · OUT</span><span>LINKEDIN · X · REDDIT</span></div>
              <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 30, marginTop: 22, lineHeight: 1 }}>Your content</div>
              <div style={{ fontSize: 14, lineHeight: 1.45, color: 'rgba(255,255,255,.85)', marginTop: 8 }}>Drafts to review, schedule or publish, in your voice.</div>
            </TiltCard>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Statement — word-by-word scroll reveal                                     */
/* ─────────────────────────────────────────────────────────────────────────── */
function Statement() {
  const sectionRef = useRef(null)
  const wordsRef = useRef([])

  useEffect(() => {
    const paint = () => {
      const el = sectionRef.current
      const ws = wordsRef.current
      if (!el || !ws.length) return
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const p = Math.max(0, Math.min(1, (vh * 0.8 - r.top) / Math.max(1, r.height + vh * 0.25)))
      const lit = p * ws.length
      ws.forEach((w, i) => {
        if (!w) return
        const o = 0.14 + 0.86 * Math.max(0, Math.min(1, lit - i))
        w.style.opacity = o.toFixed(3)
      })
    }
    let raf = null
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = null; paint() }) }
    paint()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const words = useMemo(() => STATEMENT.split(' ').map((t) => ({ t, italic: ITAL_WORDS.has(t), color: ITAL_WORDS.has(t) ? C.orange : C.ink })), [])

  return (
    <section ref={sectionRef} className="hn-st-pad" style={{ maxWidth: 1180, margin: '0 auto', padding: '112px 40px 48px' }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.1em', color: C.orange, marginBottom: 28 }}>THE IDEA</div>
      <p className="hn-statement" style={{ margin: 0, fontFamily: FONT.serif, lineHeight: 1.08, letterSpacing: '-0.025em', color: C.ink, display: 'flex', flexWrap: 'wrap', columnGap: '.24em' }}>
        {words.map((w, i) => (
          <span key={i} ref={(el) => { wordsRef.current[i] = el }} style={{ fontStyle: w.italic ? 'italic' : 'normal', color: w.color, opacity: 0.14, transition: 'opacity .1s linear' }}>{w.t}</span>
        ))}
      </p>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Flow diagram                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */
const CONNECTOR_LEFT = ['M0 32 C 55 32, 45 200, 100 200', 'M0 116 C 55 116, 45 200, 100 200', 'M0 200 C 55 200, 45 200, 100 200', 'M0 284 C 55 284, 45 200, 100 200', 'M0 368 C 55 368, 45 200, 100 200']
const CONNECTOR_RIGHT = ['M0 200 C 55 200, 45 96, 100 96', 'M0 200 C 55 200, 45 200, 100 200', 'M0 200 C 55 200, 45 304, 100 304']

function ConnectorLines({ paths }) {
  return (
    <svg viewBox="0 0 100 400" preserveAspectRatio="none" className="hn-flow-lines" style={{ width: '100%', height: 400, overflow: 'visible' }}>
      {paths.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="#EAD9CC" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d={d} fill="none" stroke={C.orange} strokeWidth="1.75" strokeDasharray="3 9" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ animation: 'hn-flow 1.1s linear infinite' }} />
        </g>
      ))}
    </svg>
  )
}
function SourceRow({ icon, name, desc }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 64, padding: '0 14px', borderRadius: 14, border: `1px solid ${C.borderAlt}`, background: C.bg }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: '#FFFFFF', border: `1px solid ${C.borderAlt}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{name}</div>
        <div style={{ fontSize: 12, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</div>
      </div>
    </div>
  )
}

function FlowDiagram() {
  return (
    <section className="hn-flow-pad" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 40px' }}>
      <Reveal className="hn-flow-card" style={{ position: 'relative', borderRadius: 28, background: '#FFFFFF', border: `1px solid ${C.border}`, padding: 36, boxShadow: '0 40px 80px -50px rgba(12,31,38,.35)' }}>
        <div className="hn-flow-labels" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 72px minmax(0,1fr) 72px minmax(0,.9fr)', marginBottom: 18 }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.1em', color: C.faint }}>YOUR KNOWLEDGE</div><div /><div style={{ textAlign: 'center' }}><div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.1em', color: C.faint }}>HONNE AI</div></div><div /><div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.1em', color: C.faint }}>PUBLISH TO</div>
        </div>
        <div className="hn-flow-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 72px minmax(0,1fr) 72px minmax(0,.9fr)', alignItems: 'center', gap: 0 }}>
          <div className="hn-flow-list" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8, height: 400 }}>
            <SourceRow icon={<IconGoogleDocs />} name="Google Docs" desc="Talk notes, drafts" />
            <SourceRow icon={<IconGoogleDrive />} name="Google Drive" desc="8 files" />
            <SourceRow icon={<IconNotion />} name="Notion" desc="Build log" />
            <SourceRow icon={<IconSheets />} name="Google Sheets" desc="Roadmap" />
            <SourceRow icon={<IconWord />} name="Microsoft Word" desc="Uploads" />
          </div>
          <ConnectorLines paths={CONNECTOR_LEFT} />
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, background: C.dark, color: '#FFFFFF', padding: '36px 24px', textAlign: 'center', isolation: 'isolate' }}>
            <div style={{ position: 'absolute', left: '50%', top: '30%', width: 320, height: 320, margin: '-160px 0 0 -160px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(240,102,42,.55), rgba(240,102,42,0))', zIndex: -1 }} />
            <div style={{ position: 'relative', width: 76, height: 76, margin: '0 auto 18px' }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: 24, border: `1.5px solid ${C.orangeLight}`, animation: 'hn-pulse 2.4s ease-out infinite' }} />
              <LogoMark size={76} fontSize={60} />
            </div>
            <div style={{ fontFamily: FONT.serif, fontSize: 34, lineHeight: 1 }}>Honne <span style={{ fontStyle: 'italic', color: C.orangeLight }}>AI</span></div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, marginTop: 14, padding: '0 13px', borderRadius: 999, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', fontSize: 13, color: 'rgba(255,255,255,.9)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.orangeLight, boxShadow: `0 0 8px ${C.orangeLight}` }} />
              Specialised AI agents
            </div>
          </div>
          <ConnectorLines paths={CONNECTOR_RIGHT} />
          <div className="hn-flow-list hn-flow-out" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40, height: 400 }}>
            <SourceRow icon={<IconLinkedIn />} name="LinkedIn" desc="Posts and carousels" />
            <SourceRow icon={<IconX />} name="X" desc="Posts and threads" />
            <SourceRow icon={<IconReddit />} name="Reddit" desc="Community posts" />
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Live studio demo — the design prototypes, scaled to fit                    */
/* ─────────────────────────────────────────────────────────────────────────── */
const STUDIO_TAB_ICON = {
  li: <span style={{ width: 24, height: 24, borderRadius: 7, background: '#0A66C2', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(10,102,194,.4)' }}><IconLinkedInGlyph /></span>,
  x: <span style={{ width: 24, height: 24, borderRadius: 7, background: '#0F1419', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(15,20,25,.3)' }}><IconXGlyph /></span>,
  rd: <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#FF4500', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(255,69,0,.4)' }}><IconRedditGlyph /></span>,
}

function StudioDemo() {
  const [tab, setTab] = useState('li')
  const [width, setWidth] = useState(1100)
  const frameRef = useRef(null)

  useEffect(() => {
    const el = frameRef.current
    if (!el || !window.ResizeObserver) return
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = Math.min(1, width / STUDIO_W)
  const active = STUDIO_TABS.find((t) => t.id === tab)

  return (
    <section id="how" className="hn-sec-pad" style={{ maxWidth: 1240, margin: '0 auto', padding: '112px 40px' }}>
      <Reveal className="hn-two-head" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '20px 60px', alignItems: 'end', marginBottom: 36 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.1em', color: C.green, marginBottom: 18 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, boxShadow: '0 0 0 4px rgba(47,122,78,.15)' }} />LIVE IN THE APP
          </div>
          <h2 className="hn-h2" style={{ margin: 0, fontFamily: FONT.serif, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.03em' }}>Three platform studios, <span style={{ fontStyle: 'italic', color: C.faint }}>working today.</span></h2>
        </div>
        <p style={{ margin: 0, lineHeight: 1.55, color: C.ink, fontFamily: FONT.display, fontWeight: 700, fontSize: 20, letterSpacing: '-0.01em', textWrap: 'pretty' }}>Each platform has its own agent and studio. Ask in chat and the draft streams into a live preview, ready to edit, schedule or publish. This is the real app running.</p>
      </Reveal>
      <Reveal style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {STUDIO_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            style={{ display: 'flex', alignItems: 'center', gap: 9, height: 40, padding: '0 14px 0 8px', borderRadius: 11, border: `1px solid ${tab === t.id ? '#E3DDD4' : 'transparent'}`, background: tab === t.id ? '#FFFFFF' : 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: C.ink, transition: 'background .25s, border-color .25s' }}
          >
            {STUDIO_TAB_ICON[t.id]}{t.label}
          </button>
        ))}
      </Reveal>
      <Reveal style={{ borderRadius: 20, padding: 8, background: '#EFE9E1', boxShadow: '0 40px 80px -40px rgba(12,31,38,.35)' }}>
        <div ref={frameRef} style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, background: '#F8F7F4', border: '1px solid #E5DED4', height: Math.round(STUDIO_H * scale) }}>
          <iframe
            key={active.id}
            src={active.src}
            title={`Honne ${active.label} studio demo`}
            tabIndex={-1}
            loading="lazy"
            style={{ position: 'absolute', left: 0, top: 0, width: STUDIO_W, height: STUDIO_H, border: 0, transform: `scale(${scale.toFixed(4)})`, transformOrigin: '0 0', pointerEvents: 'none' }}
          />
        </div>
      </Reveal>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Build progress + stack                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */
const BUILD_PILL = {
  live: { label: 'LIVE', bg: C.greenBg, color: C.green },
  building: { label: 'BUILDING', bg: '#FDE6DA', color: '#C4501E' },
  next: { label: 'NEXT', bg: '#F1ECE5', color: C.bodyMuted },
}

function BuildNode({ step }) {
  const pill = BUILD_PILL[step.state]
  const circle = { position: 'relative', width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.mono, fontSize: 14 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 8px' }}>
      <div style={{ position: 'relative', width: 56, height: 56 }}>
        {step.state === 'building' && (
          <motion.div
            animate={{ scale: [1, 1.7], opacity: [0.6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${C.orange}` }}
          />
        )}
        {step.state === 'live' && <span style={{ ...circle, background: C.green, color: '#FFFFFF', boxShadow: `0 0 0 6px ${C.greenBg}` }}><IconCheck size={22} /></span>}
        {step.state === 'building' && <span style={{ ...circle, background: C.orange, color: '#FFFFFF', boxShadow: '0 0 0 6px #FDE6DA, 0 0 30px rgba(240,102,42,.5)' }}>{step.n}</span>}
        {step.state === 'next' && <span style={{ ...circle, background: C.bg, color: C.faint, border: '2px dashed #CFC7BB' }}>{step.n}</span>}
      </div>
      <span style={{ marginTop: 18, height: 22, display: 'flex', alignItems: 'center', padding: '0 9px', borderRadius: 999, fontFamily: FONT.mono, fontSize: 10, letterSpacing: '.08em', background: pill.bg, color: pill.color }}>{pill.label}</span>
      <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: '-0.01em', marginTop: 12 }}>{step.title}</div>
      <div style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>{step.sub}</div>
    </div>
  )
}

function BuildProgress() {
  return (
    <section className="hn-sec-padb" style={{ maxWidth: 1240, margin: '0 auto', padding: '0 40px 112px' }}>
      <Reveal style={{ textAlign: 'center', marginBottom: 64 }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.1em', color: C.orange, marginBottom: 18 }}>BUILD PROGRESS</div>
        <h2 className="hn-h2" style={{ margin: 0, fontFamily: FONT.serif, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.03em' }}>Where the build is <span style={{ fontStyle: 'italic', color: C.faint }}>right now.</span></h2>
      </Reveal>
      <div style={{ position: 'relative' }}>
        <div className="hn-bp-line" style={{ display: 'flex', position: 'absolute', top: 27, left: '12.5%', right: '12.5%', height: 2, zIndex: 0 }}>
          <div style={{ flex: 1, background: C.green }} />
          <div style={{ position: 'relative', flex: 1, background: `linear-gradient(90deg, ${C.green}, ${C.orange})` }}>
            <motion.div
              animate={{ left: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ position: 'absolute', top: -4, width: 10, height: 10, marginLeft: -5, borderRadius: 5, background: C.orange, boxShadow: `0 0 14px ${C.orange}` }}
            />
          </div>
          <div style={{ flex: 1, borderTop: '2px dashed #D8D1C6' }} />
        </div>
        <div className="hn-bp-grid" style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '40px 0' }}>
          {BUILD_STEPS.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ type: 'spring', stiffness: 200, damping: 22, delay: i * 0.15 }}
            >
              <BuildNode step={step} />
            </motion.div>
          ))}
        </div>
      </div>
      <Reveal style={{ marginTop: 80, paddingTop: 40, borderTop: '1px solid #EAE3D9' }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.1em', color: C.faint, textAlign: 'center', marginBottom: 24 }}>BUILT WITH</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px 12px' }}>
          {STACK.map(([name, slug]) => (
            <div key={slug} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 76 }}>
              <span style={{ width: 52, height: 52, borderRadius: 14, background: '#FFFFFF', border: '1px solid #E8E2D9', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px -10px rgba(12,31,38,.35)' }}>
                <SimpleIcon slug={slug} size={26} alt={name} />
              </span>
              <span style={{ fontSize: 11, color: C.bodyMuted, textAlign: 'center', whiteSpace: 'nowrap' }}>{name}</span>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Knowledge layer — agents on one shared source                             */
/* ─────────────────────────────────────────────────────────────────────────── */
const comingSoon = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', marginLeft: 12, borderRadius: 999, border: '1px solid currentColor', fontSize: 10, letterSpacing: '.08em', verticalAlign: 1 }
const iconTile = { width: 30, height: 30, flex: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const neutralTile = { ...iconTile, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)' }
const KL_AGENTS = [
  { name: 'LinkedIn agent', team: 'Marketing team', live: true, icon: <span style={{ ...iconTile, background: '#0A66C2', boxShadow: '0 0 14px rgba(10,102,194,.55)' }}><IconLinkedInGlyph size={15} /></span> },
  { name: 'X agent', team: 'Marketing team', live: true, icon: <span style={{ ...iconTile, background: '#000000', border: '1px solid rgba(255,255,255,.25)', boxShadow: '0 0 14px rgba(255,255,255,.2)' }}><IconXGlyph size={13} /></span> },
  { name: 'Reddit agent', team: 'Community team', live: true, icon: <span style={{ ...iconTile, borderRadius: '50%', background: '#FF4500', boxShadow: '0 0 14px rgba(255,69,0,.55)' }}><IconRedditGlyph size={22} /></span> },
  { name: 'Sales agent', team: 'Sales team', icon: <span style={neutralTile}><svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'none', stroke: C.orangeLight, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}><rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg></span> },
  { name: 'Campaign agent', team: 'Marketing team', icon: <span style={neutralTile}><svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'none', stroke: C.orangeLight, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg></span> },
]
const KL_SOURCES = [
  { name: 'Docs', icon: <IconGoogleDocs size={20} /> },
  { name: 'Sheets', icon: <IconSheets size={20} /> },
  { name: 'Drive', icon: <IconGoogleDrive size={20} /> },
  { name: 'Notion', icon: <SimpleIcon slug="notion/000000" /> },
  { name: 'GitHub', icon: <SimpleIcon slug="github/181717" /> },
  { name: 'Word', icon: <IconWord size={20} /> },
  { name: 'CRM', icon: <SimpleIcon slug="hubspot" /> },
]

function FlowDot({ delay, color, up }) {
  return (
    <motion.div
      animate={{ y: up ? [58, 0] : [0, 58], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay, repeatDelay: 0.5 }}
      style={{ position: 'absolute', left: -3, top: 0, width: 7, height: 7, borderRadius: 4, background: color, boxShadow: `0 0 12px ${color}` }}
    />
  )
}
function DotStrip({ count, dot }) {
  return (
    <div className="hn-kl-strip" style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, minmax(0,1fr))`, gap: 12, height: 64 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ position: 'relative', width: 1, height: '100%', margin: '0 auto', background: 'rgba(255,255,255,.14)' }}>{dot(i)}</div>
      ))}
    </div>
  )
}

function KnowledgeLayer() {
  const agentCard = { height: '100%', padding: 14, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 12 }
  return (
    <section id="agents" style={{ padding: 12 }}>
      <div className="hn-dark-pad" style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, background: C.dark, color: '#FFFFFF', padding: '120px 48px' }}>
        <div style={{ position: 'absolute', right: '-10%', top: '-30%', width: '60%', height: '80%', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(44,110,127,.6), rgba(44,110,127,0))', filter: 'blur(20px)' }} />
        <div style={{ position: 'absolute', left: '-10%', bottom: '-40%', width: '50%', height: '70%', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(240,102,42,.35), rgba(240,102,42,0))', filter: 'blur(20px)' }} />
        <div style={{ position: 'relative', maxWidth: 1120, margin: '0 auto' }}>
          <Reveal className="hn-two-head" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '24px 60px', alignItems: 'end', marginBottom: 56 }}>
            <div>
              <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.1em', color: C.orangeLight, marginBottom: 18 }}>UNDER THE HOOD<span style={comingSoon}>COMING SOON</span></div>
              <h2 className="hn-h2" style={{ margin: 0, fontFamily: FONT.serif, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.03em' }}>One knowledge layer. <span style={{ fontStyle: 'italic', color: C.tealLight }}>Any number of agents.</span></h2>
            </div>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55, color: 'rgba(255,255,255,.72)', fontWeight: 300, textWrap: 'pretty' }}>Every source merges into one layer with semantic search. Teams build their own agents on top, all working from the same knowledge.</p>
          </Reveal>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.1em', color: 'rgba(255,255,255,.55)' }}><span>AGENTS · BUILT BY TEAMS</span><span>ROUTED BY A SUPERVISOR</span></div>
          <div className="hn-kl-agents" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 12 }}>
            {KL_AGENTS.map((a, i) => (
              <motion.div key={a.name} style={{ height: '100%' }} initial={{ opacity: 0, y: 18, scale: 0.94 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: 0.3 }} transition={{ type: 'spring', stiffness: 240, damping: 22, delay: 0.1 + i * 0.1 }}>
                <div style={{ ...agentCard, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {a.icon}
                    {a.live && <span style={{ fontFamily: FONT.mono, fontSize: 10, color: '#4ADE80' }}>LIVE</span>}
                  </div>
                  <div><div style={{ fontSize: 14, fontWeight: 500 }}>{a.name}</div><div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>{a.team}</div></div>
                </div>
              </motion.div>
            ))}
            <motion.div style={{ height: '100%' }} initial={{ opacity: 0, y: 18, scale: 0.94 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: 0.3 }} transition={{ type: 'spring', stiffness: 240, damping: 22, delay: 0.6 }}>
              <div style={{ ...agentCard, border: '1.5px dashed rgba(246,161,91,.6)', background: 'rgba(246,161,91,.06)' }}>
                <span style={{ position: 'relative', width: 30, height: 30, borderRadius: 8, background: C.orange, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 8, border: `1.5px solid ${C.orangeLight}`, animation: 'hn-pulse 2s ease-out infinite' }} />
                  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'none', stroke: '#FFFFFF', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M12 5v14M5 12h14" /></svg>
                </span>
                <div><div style={{ fontSize: 14, fontWeight: 500, color: '#FFE3CC' }}>New agent</div><div style={{ fontSize: 12, color: 'rgba(255,227,204,.6)', marginTop: 2 }}>Any team, any task</div></div>
              </div>
            </motion.div>
          </div>
          <DotStrip count={6} dot={(i) => <FlowDot up={i % 2 === 1} delay={i * 0.23} color={i % 2 ? C.tealLight : C.orangeLight} />} />
          <div className="hn-kl-gap" />
          <motion.div
            initial={false}
            animate={{ boxShadow: ['0 0 0 1px rgba(246,161,91,.5), 0 0 30px rgba(240,102,42,.2)', '0 0 0 1px rgba(246,161,91,.9), 0 0 70px rgba(240,102,42,.45)', '0 0 0 1px rgba(246,161,91,.5), 0 0 30px rgba(240,102,42,.2)'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{ borderRadius: 21 }}
          >
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 21, background: 'linear-gradient(180deg, #13323C, #0E262E)', padding: '24px 26px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '20px 28px' }}>
              <motion.div
                animate={{ left: ['-45%', '125%'] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.6 }}
                style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', background: 'linear-gradient(90deg, rgba(255,236,220,0), rgba(255,236,220,.12), rgba(255,236,220,0))', pointerEvents: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 'none' }}>
                <LogoMark size={52} fontSize={40} />
                <div>
                  <div style={{ fontFamily: FONT.serif, fontSize: 30, lineHeight: 1 }}>Unified knowledge layer</div>
                  <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.08em', color: 'rgba(255,255,255,.55)', marginTop: 6 }}>HONNE IQ · POSTGRES + PGVECTOR</div>
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                {PIPELINE.map((p, i) => (
                  <span key={p} style={{ display: 'contents' }}>
                    {i > 0 && <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, flex: 'none', fill: 'none', stroke: 'rgba(255,255,255,.4)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>}
                    <motion.div
                      animate={{ backgroundColor: ['rgba(255,255,255,.06)', 'rgba(246,161,91,.3)', 'rgba(255,255,255,.06)'], borderColor: ['rgba(255,255,255,.14)', 'rgba(246,161,91,.9)', 'rgba(255,255,255,.14)'] }}
                      transition={{ duration: 1.2, delay: i * 0.6, repeat: Infinity, repeatDelay: 1.2 }}
                      style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 13px', borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', fontSize: 13, color: '#FFFFFF', whiteSpace: 'nowrap' }}
                    >
                      {p}
                    </motion.div>
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
          <div className="hn-kl-gap" />
          <DotStrip count={7} dot={(i) => <FlowDot up delay={i * 0.19} color={C.orangeLight} />} />
          <div className="hn-kl-sources" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 12 }}>
            {KL_SOURCES.map((s) => (
              <div key={s.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 6px', borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)' }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.icon}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.8)', whiteSpace: 'nowrap' }}>{s.name}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.1em', color: 'rgba(255,255,255,.55)' }}>KNOWLEDGE SOURCES · CONNECTED ONCE</div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Brand memory                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */
function VoiceSection() {
  const [honne, setHonne] = useState(true)
  return (
    <section id="voice" className="hn-sec-pad" style={{ maxWidth: 1180, margin: '0 auto', padding: '112px 40px' }}>
      <div className="hn-voice-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: '48px 72px', alignItems: 'center' }}>
        <Reveal>
          <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.1em', color: C.orange, marginBottom: 18 }}>BRAND MEMORY<span style={comingSoon}>COMING SOON</span></div>
          <h2 className="hn-h2" style={{ margin: '0 0 20px', fontFamily: FONT.serif, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.03em' }}>Every agent speaks <span style={{ fontStyle: 'italic', color: C.orange }}>in your brand voice.</span></h2>
          <p style={{ margin: '0 0 32px', fontSize: 17, lineHeight: 1.55, color: C.body, maxWidth: 440, textWrap: 'pretty' }}>Honne IQ learns how your company writes and works, from past posts and docs. Every agent a team creates starts from it, so nothing reads like generic AI.</p>
          <div style={{ display: 'inline-flex', padding: 4, borderRadius: 14, background: '#EFE9E1', position: 'relative' }}>
            <span style={{ position: 'absolute', top: 4, bottom: 4, left: honne ? 'calc(50%)' : 4, width: 'calc(50% - 4px)', borderRadius: 10, background: '#FFFFFF', boxShadow: '0 2px 8px -2px rgba(0,0,0,.12)', transition: 'left .4s cubic-bezier(.2,.7,.2,1)' }} />
            <button onClick={() => setHonne(false)} style={{ position: 'relative', width: 150, height: 42, border: 0, background: 'transparent', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', color: honne ? '#6B6F72' : '#15181A', transition: 'color .3s' }}>Generic AI</button>
            <button onClick={() => setHonne(true)} style={{ position: 'relative', width: 150, height: 42, border: 0, background: 'transparent', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', color: honne ? '#15181A' : '#6B6F72', transition: 'color .3s' }}>With Honne</button>
          </div>
        </Reveal>
        <Reveal style={{ position: 'relative' }}>
          <div style={{ position: 'relative', padding: 28, borderRadius: 24, background: '#FFFFFF', border: `1px solid ${C.border}`, boxShadow: '0 40px 80px -40px rgba(12,31,38,.3)', minHeight: 360 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{ width: 40, height: 40, borderRadius: '50%', background: C.chipBg, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>AK</span>
              <div><div style={{ fontSize: 14, fontWeight: 600 }}>LinkedIn agent</div><div style={{ fontSize: 12, color: C.faint }}>Writing for Honne</div></div>
              <span style={{ marginLeft: 'auto', height: 26, display: 'flex', alignItems: 'center', padding: '0 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: honne ? '#FFF1E9' : '#F2F2F2', color: honne ? '#C4501E' : '#6B6F72', transition: 'all .3s' }}>{honne ? 'Your voice' : 'Generic'}</span>
            </div>
            <div style={{ display: 'grid' }}>
              <p style={{ gridArea: '1/1', margin: 0, fontSize: 17, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#6B6F72', opacity: honne ? 0 : 1, transform: honne ? 'translateY(-8px)' : 'none', filter: honne ? 'blur(6px)' : 'none', transition: 'opacity .45s ease, transform .5s cubic-bezier(.2,.7,.2,1), filter .45s' }}>
                {"Excited to share some key insights on AI agents! In today's fast-paced landscape, leveraging agentic workflows is a game-changer for unlocking productivity. Here are 5 tips to supercharge your journey...\n\n#AI #Innovation #Growth #Leadership"}
              </p>
              <p style={{ gridArea: '1/1', margin: 0, fontSize: 17, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#15181A', opacity: honne ? 1 : 0, transform: honne ? 'none' : 'translateY(8px)', filter: honne ? 'none' : 'blur(6px)', transition: 'opacity .45s ease, transform .5s cubic-bezier(.2,.7,.2,1), filter .45s' }}>
                {"Everyone is building agents. Almost nobody is building the boring part: what the agent is allowed to know.\n\nI spent three weeks on Honne's retrieval before I wrote a single prompt.\n\nThat's the part users feel."}
              </p>
            </div>
          </div>
          <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.08em', color: C.faint, marginTop: 20 }}>BRAND MEMORY · SHARED BY EVERY AGENT</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {VOICE_TRAITS.map((t, i) => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${honne ? '#15181A' : '#E3DDD4'}`, background: honne ? '#15181A' : 'transparent', fontSize: 13, color: honne ? '#FFFFFF' : '#A5A9AB', textDecoration: honne ? 'none' : 'line-through', transition: `all .35s ease ${i * 0.06}s` }}>{t}</span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* The problem — people ⇄ Honne ⇄ company data                                */
/* ─────────────────────────────────────────────────────────────────────────── */
const PEOPLE = [
  { mono: 'SL', name: 'Sales', desc: 'Account research, follow-ups', bg: '#FDE6DA', color: '#C4501E' },
  { mono: 'MK', name: 'Marketing', desc: 'Campaigns, posts, briefs', bg: '#DCEDF0', color: C.teal },
  { mono: 'EN', name: 'Engineering', desc: 'Docs, release notes', bg: C.greenBg, color: C.green },
]
const COMPANY_DATA = [
  { name: 'CRM', desc: 'Accounts, deals, contacts', icon: <SimpleIcon slug="hubspot" /> },
  { name: 'Google Workspace', desc: 'Docs, Sheets, Drive', icon: <IconGoogleDrive size={20} /> },
  { name: 'Notion', desc: 'Wikis, plans', icon: <SimpleIcon slug="notion/000000" /> },
  { name: 'GitHub', desc: 'Repos, READMEs', icon: <SimpleIcon slug="github/181717" /> },
]
const LAYER_AGENTS = ['Sales agent', 'Marketing agent', 'Docs agent']

function Connector({ side }) {
  const rows = [0.3, 0.5, 0.7]
  return (
    <div className="hn-pb-conn" style={{ position: 'relative', height: '100%' }}>
      {rows.map((top, i) => {
        const back = i === 1
        const color = back ? C.teal : C.orange
        return (
          <div key={top} style={{ position: 'absolute', left: 0, right: 0, top: `${top * 100}%`, height: 1, background: '#E3D8CB' }}>
            <motion.div
              animate={{ left: back ? ['100%', '0%'] : ['0%', '100%'], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: (side === 'r' ? 0.2 : 0) + i * 0.35, repeatDelay: 0.4 }}
              style={{ position: 'absolute', top: -3, marginLeft: -3, width: 7, height: 7, borderRadius: 4, background: color, boxShadow: `0 0 10px ${color}` }}
            />
          </div>
        )
      })}
    </div>
  )
}

function ProblemSection() {
  const panel = { padding: 20, borderRadius: 22, background: '#FFFFFF', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }
  const row = { display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, background: C.bg, border: `1px solid ${C.borderAlt}` }
  const label = { fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.1em', color: C.faint, marginBottom: 6 }
  return (
    <section id="uses" className="hn-sec-padb" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 40px 112px' }}>
      <Reveal style={{ textAlign: 'center', maxWidth: 820, margin: '0 auto 56px' }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.1em', color: C.orange, marginBottom: 18 }}>THE PROBLEM WE SOLVE</div>
        <h2 className="hn-h2" style={{ margin: 0, fontFamily: FONT.serif, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.03em' }}>An AI layer between your people <span style={{ fontStyle: 'italic', color: C.faint }}>and your company&apos;s data.</span></h2>
        <p style={{ margin: '22px auto 0', maxWidth: 600, fontSize: 17, lineHeight: 1.55, color: C.body, textWrap: 'pretty' }}>Teams work across CRMs, docs and repos. Honne sits in between, with AI agents that work alongside people on the same data.</p>
      </Reveal>
      <Reveal className="hn-pb-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 72px minmax(0,1.1fr) 72px minmax(0,1fr)', gap: 0, alignItems: 'stretch' }}>
        <div style={panel}>
          <div style={label}>YOUR PEOPLE</div>
          {PEOPLE.map((p) => (
            <div key={p.name} style={row}>
              <span style={{ width: 34, height: 34, flex: 'none', borderRadius: '50%', background: p.bg, color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{p.mono}</span>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 12, color: C.faint }}>{p.desc}</div></div>
            </div>
          ))}
        </div>
        <Connector side="l" />
        <div style={{ position: 'relative', overflow: 'hidden', padding: 24, borderRadius: 22, background: C.dark, color: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14, isolation: 'isolate', boxShadow: '0 30px 70px -30px rgba(240,102,42,.55)' }}>
          <div style={{ position: 'absolute', left: '50%', top: '40%', width: 320, height: 320, margin: '-160px 0 0 -160px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(240,102,42,.5), rgba(240,102,42,0))', zIndex: -1 }} />
          <LogoMark size={56} fontSize={44} />
          <div style={{ fontFamily: FONT.serif, fontSize: 32, lineHeight: 1 }}>Honne AI layer</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
            {LAYER_AGENTS.map((a) => (
              <span key={a} style={{ height: 28, display: 'flex', alignItems: 'center', padding: '0 11px', borderRadius: 999, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', fontSize: 12 }}>{a}</span>
            ))}
            <span style={{ height: 28, display: 'flex', alignItems: 'center', padding: '0 11px', borderRadius: 999, border: '1px dashed rgba(246,161,91,.7)', color: '#FFE3CC', fontSize: 12 }}>+ your agents</span>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.65)' }}>Working alongside your people</div>
        </div>
        <Connector side="r" />
        <div style={panel}>
          <div style={label}>COMPANY APPS AND DATA</div>
          {COMPANY_DATA.map((d) => (
            <div key={d.name} style={row}>
              <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, background: '#FFFFFF', border: `1px solid ${C.borderAlt}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{d.icon}</span>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 500 }}>{d.name}</div><div style={{ fontSize: 12, color: C.faint }}>{d.desc}</div></div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Final CTA + Footer                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
function FinalCTA() {
  const navigate = useNavigate()
  const cta = useMagnetic()
  return (
    <section style={{ padding: '0 12px 12px' }}>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, background: C.dark, color: '#FFFFFF', padding: '160px 40px', textAlign: 'center', isolation: 'isolate' }} className="hn-cta-pad">
        <div className="hn-blob hn-cta-blob-1" style={{ position: 'absolute', left: '10%', top: '20%', width: '50%', height: '90%', borderRadius: '50%', background: `radial-gradient(closest-side, ${C.orange}, rgba(240,102,42,0))`, filter: 'blur(40px)', zIndex: -1 }} />
        <div className="hn-blob hn-cta-blob-2" style={{ position: 'absolute', right: '5%', top: '-30%', width: '50%', height: '90%', borderRadius: '50%', background: `radial-gradient(closest-side, ${C.teal}, rgba(44,110,127,0))`, filter: 'blur(40px)', zIndex: -1 }} />
        <div className="hn-blob hn-cta-blob-3" style={{ position: 'absolute', left: '40%', bottom: '-50%', width: '40%', height: '80%', borderRadius: '50%', background: `radial-gradient(closest-side, ${C.orangeLight}, rgba(246,161,91,0))`, filter: 'blur(50px)', zIndex: -1, opacity: 0.8 }} />
        <Reveal>
          <h2 className="hn-cta-h" style={{ margin: '0 auto', maxWidth: 900, fontFamily: FONT.serif, fontWeight: 400, lineHeight: 0.95, letterSpacing: '-0.035em' }}>Open Honne. <span style={{ fontStyle: 'italic' }}>Tell it what you know.</span></h2>
          <p style={{ margin: '24px auto 36px', maxWidth: 460, fontSize: 17, lineHeight: 1.55, color: 'rgba(255,255,255,.82)', fontWeight: 300 }}>Connect Honne to your knowledge source and start creating your content as it is the future.</p>
          <button
            onMouseMove={cta.onMouseMove} onMouseLeave={cta.onMouseLeave}
            onClick={() => navigate('/register')}
            className="hn-magnetic hn-hover-light"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 14, height: 58, padding: '0 6px 0 26px', borderRadius: 999, background: '#FFFFFF', color: '#15181A', fontSize: 16, fontWeight: 500, boxShadow: '0 20px 50px -20px rgba(0,0,0,.5)', border: 'none', cursor: 'pointer' }}
          >
            Get started
            <span style={{ width: 46, height: 46, borderRadius: '50%', background: '#15181A', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconArrowUpRight size={17} /></span>
          </button>
        </Reveal>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="hn-footer" style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 40px 48px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 20, fontSize: 14, color: '#6B6F72' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.ink }}>
        <LogoMark size={26} fontSize={20} />
        <span style={{ fontWeight: 600 }}>Honne <span style={{ color: C.orange }}>AI</span></span>
      </span>
      <span>From your knowledge to publishable posts.</span>
      <div style={{ flex: 1 }} />
      <a href="#how" onClick={scrollToId('how')} className="hn-footer-link">How it works</a>
      <a href="#agents" onClick={scrollToId('agents')} className="hn-footer-link">Agents</a>
      <NavigateLink to="/register" className="hn-footer-link">Open app</NavigateLink>
      <span>© 2026 Honne AI</span>
    </footer>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Page root                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="hn-landing" style={{ overflowX: 'hidden', background: C.bg, color: C.ink, fontFamily: FONT.sans }}>
      <Nav />
      <main>
        <Hero />
        <Statement />
        <FlowDiagram />
        <StudioDemo />
        <BuildProgress />
        <KnowledgeLayer />
        <VoiceSection />
        <ProblemSection />
      </main>
      <FinalCTA />
      <Footer />

      <style>{`
        .hn-landing { -webkit-font-smoothing: antialiased; }
        .hn-landing * { box-sizing: border-box; }
        .hn-landing a { color: inherit; text-decoration: none; }
        .hn-landing a:hover { color: ${C.orange}; }
        .hn-landing button { font: inherit; color: inherit; }
        .hn-landing ::selection { background: ${C.orange}; color: #fff; }
        .hn-landing section[id] { scroll-margin-top: 20px; }

        @keyframes hn-spin { to { transform: rotate(360deg); } }
        @keyframes hn-shine { 0%,55% { left: -60%; } 100% { left: 130%; } }
        @keyframes hn-flow { to { stroke-dashoffset: -24; } }
        @keyframes hn-pulse { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes hn-shimmer { 0%,100% { background-position: 0% 0; } 50% { background-position: 100% 0; } }
        @keyframes hn-drift-a { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(3%,-4%) scale(1.06); } }
        @keyframes hn-drift-b { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-4%,3%) scale(0.94); } }
        @media (prefers-reduced-motion: reduce) {
          .hn-landing [style*="animation"], .hn-landing .hn-blob, .hn-landing .hn-gradient-shimmer { animation: none !important; }
        }

        .hn-shine { position: absolute; top: -20%; left: -60%; width: 40%; height: 140%; background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.75), rgba(255,255,255,0)); transform: rotate(20deg); animation: hn-shine 3.6s ease-in-out infinite; }
        .hn-gradient-shimmer { background: linear-gradient(100deg, #FFE3CC 0%, #F6A15B 28%, #F0662A 48%, #9CCAD3 72%, #FFE3CC 100%); background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: hn-shimmer 6s ease-in-out infinite; }

        .hn-blob { will-change: transform; }
        .hn-blob-1, .hn-cta-blob-1 { animation: hn-drift-a 9s ease-in-out infinite; }
        .hn-blob-2, .hn-cta-blob-2 { animation: hn-drift-b 10s ease-in-out infinite; animation-delay: .3s; }
        .hn-blob-3, .hn-cta-blob-3 { animation: hn-drift-a 8s ease-in-out infinite; animation-delay: .6s; }
        .hn-blob-4 { animation: hn-drift-b 11s ease-in-out infinite; animation-delay: .9s; }
        .hn-blob-5 { animation: hn-drift-a 7.5s ease-in-out infinite; animation-delay: 1.2s; }

        .hn-magnetic { transition: transform .35s cubic-bezier(.2,.7,.2,1); }
        .hn-tilt { transition: transform .5s cubic-bezier(.2,.7,.2,1); }
        .hn-landing .hn-nav-link:hover, .hn-landing .hn-hover-outline:hover { background: rgba(255,255,255,.1); color: #FFFFFF; }
        .hn-landing .hn-hover-light:hover { color: #15181A; }

        .hn-h2 { font-size: clamp(52px, 5.6vw, 84px); }
        .hn-statement { font-size: clamp(44px, 5.2vw, 76px); }
        .hn-hero-h1 { font-size: clamp(58px, 6.8vw, 112px); }
        .hn-hero-sub { font-size: 18px; }
        .hn-kl-gap { height: 0; }

        @media (max-width: 999px) {
          .hn-nav-links { display: none !important; }
          .hn-hero-grid, .hn-two-head, .hn-voice-grid { grid-template-columns: 1fr !important; }
          .hn-hero-cards { grid-template-columns: 1fr !important; }
          .hn-flow-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .hn-flow-labels, .hn-flow-lines { display: none !important; }
          .hn-flow-list { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)) !important; height: auto !important; }
          .hn-flow-out { display: flex !important; gap: 8px !important; }
          .hn-bp-line, .hn-kl-strip, .hn-pb-conn { display: none !important; }
          .hn-bp-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
          .hn-kl-agents { grid-template-columns: repeat(3, minmax(0,1fr)) !important; }
          .hn-kl-sources { grid-template-columns: repeat(4, minmax(0,1fr)) !important; }
          .hn-kl-gap { height: 20px; }
          .hn-pb-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
        }
        @media (max-width: 759px) {
          .hn-h2 { font-size: 44px; }
          .hn-statement { font-size: 36px; }
          .hn-hero-h1 { font-size: 46px !important; }
          .hn-hero-sub { font-size: 16px !important; }
          .hn-hero-ring { display: none !important; }
          .hn-hero-shell { min-height: auto !important; }
          .hn-hero-pad { padding: 120px 20px 20px !important; min-height: auto !important; }
          .hn-st-pad { padding: 80px 20px 36px !important; }
          .hn-flow-pad { padding: 0 20px !important; }
          .hn-flow-card { padding: 18px !important; }
          .hn-sec-pad { padding: 80px 20px !important; }
          .hn-sec-padb { padding: 0 20px 80px !important; }
          .hn-dark-pad { padding: 80px 20px !important; }
          .hn-bp-grid { grid-template-columns: 1fr !important; }
          .hn-kl-agents { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
          .hn-kl-sources { grid-template-columns: repeat(3, minmax(0,1fr)) !important; }
          .hn-cta-pad { padding: 96px 20px !important; }
          .hn-cta-h { font-size: 52px !important; }
          .hn-footer { padding: 40px 20px 48px !important; }
        }
        .hn-cta-h { font-size: clamp(64px, 8vw, 128px); }
      `}</style>
    </div>
  )
}
