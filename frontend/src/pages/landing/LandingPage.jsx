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
  dark: '#0C1F26',
}
const FONT = {
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'Geist', ui-sans-serif, system-ui, sans-serif",
  mono: "'Geist Mono', monospace",
}
const EASE = [0.16, 1, 0.3, 1]

/* ─── Content ────────────────────────────────────────────────────────────── */
const SOURCES = [
  { mono: 'G', name: 'Google Drive', desc: 'Docs and Sheets · 8 files' },
  { mono: 'N', name: 'Notion', desc: 'Build log · 4 pages' },
  { mono: 'Gh', name: 'GitHub', desc: 'honne-ai · README' },
  { mono: 'W', name: 'Microsoft Word', desc: 'Talk notes.docx' },
  { mono: 'F', name: 'Uploaded files', desc: '3 PDFs' },
]
const ANGLES = [
  { title: "AI agents aren't the hard part. Knowing what they can see is.", mono: 'N', src: 'Build log · Sep 18' },
  { title: 'Why I split one agent into five, and what broke first', mono: 'Gh', src: 'README · Architecture' },
  { title: 'Three weeks on retrieval before writing a single prompt', mono: 'G', src: 'Roadmap.doc' },
]
const DRAFT = "Everyone is building agents. Almost nobody is building the boring part: what the agent is allowed to know.\n\nI spent three weeks on Honne's retrieval before I wrote a single prompt.\n\nThat's the part users feel."
const STEPS = [
  { n: '01', title: 'Connect your knowledge', body: 'Link Google Drive, Notion, GitHub or Word, or upload files. Every suggestion starts from your own material.' },
  { n: '02', title: 'Find the angle', body: 'Ask an open question. The Angles and Research agents come back with options, each tied to the source it came from.' },
  { n: '03', title: 'Draft in your voice', body: 'Pick one. The Writer drafts it using your style memory. Ask for changes in plain words until it reads right.' },
  { n: '04', title: 'Approve, then publish', body: 'Save, schedule or publish to LinkedIn, X or Reddit. Nothing goes out until you approve it.' },
]
const AGENTS = [
  { id: 'researcher', name: 'Researcher', tag: 'WEB + SOURCES', desc: "Checks the web and your sources for what's current on a topic." },
  { id: 'angles', name: 'Angles', tag: 'WHAT TO SAY', desc: 'Turns raw material into a short list of things worth posting.' },
  { id: 'series', name: 'Series', tag: 'A WEEK AT ONCE', desc: 'Plans a run of connected posts in one sitting.' },
  { id: 'writer', name: 'Writer', tag: 'YOUR VOICE', desc: 'Drafts and redrafts from an angle, using your style memory.' },
]
const LOG = [
  { who: 'YOU', t: 'What should I post this week?' },
  { who: 'SUPERVISOR', t: 'Calling Angles with your Notion build log', agent: 'angles' },
  { who: 'ANGLES', t: '6 options from Notion and GitHub', agent: 'angles' },
  { who: 'YOU', t: 'The second one. Make it short.' },
  { who: 'SUPERVISOR', t: 'Calling Writer with that angle', agent: 'writer' },
  { who: 'WRITER', t: 'Draft ready for your review', agent: 'writer' },
  { who: 'YOU', t: 'Plan the rest of the week around it' },
  { who: 'SUPERVISOR', t: 'Calling Series and Researcher', agent: 'series' },
  { who: 'SERIES', t: '5 posts, Mon to Fri, ready to draft', agent: 'series' },
]
const STATEMENT = "You already have the ideas. They live in your docs, your notes, your READMEs. Honne finds what's worth saying, and helps you say it like you."
const ITAL_WORDS = new Set(['ideas.', 'like', 'you.'])
const USE_CASES = [
  {
    tag: 'SALES', title: 'Sell with what you know', desc: 'Turn call notes and deal learnings into posts that open conversations.',
    bg: '#FFFFFF', color: C.ink, border: C.border, divider: C.border,
    bullets: ['Researching accounts and industry news', 'Organising call notes into talking points', 'Drafting posts after every deal cycle'],
  },
  {
    tag: 'MARKETING', title: 'A content team on call', desc: 'Keep a steady calendar without adding headcount.',
    bg: C.orange, color: '#FFFFFF', border: C.orange, divider: 'rgba(255,255,255,.3)',
    bullets: ['Generating ideas from product docs', 'Planning a week of posts in one sitting', 'Adapting each post for LinkedIn, X and Reddit'],
  },
  {
    tag: 'INDIVIDUALS', title: 'No more blank page', desc: 'Share what you know while you keep doing the work.',
    bg: C.dark, color: '#FFFFFF', border: C.dark, divider: 'rgba(255,255,255,.16)',
    bullets: ['Organising scattered thoughts and notes', 'Researching what is current in your field', 'Writing drafts in your own voice'],
  },
]
const VOICE_TRAITS = ['Short first line', 'First person', 'No hashtags', 'Plain words']

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
function IconCalendar({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }} fill="none" stroke="#5E6366" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
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
  const ref = useRef(null)
  const onMouseMove = useCallback((e) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left - r.width / 2) * 0.25 * strength
    const y = (e.clientY - r.top - r.height / 2) * 0.35 * strength
    el.style.transform = `translate(${x}px, ${y}px)`
  }, [strength])
  const onMouseLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = 'translate(0,0)'
  }, [])
  return { ref, onMouseMove, onMouseLeave }
}
function useTilt() {
  const ref = useRef(null)
  const onMouseMove = useCallback((e) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    el.style.transform = `perspective(900px) rotateY(${px * 7}deg) rotateX(${-py * 7}deg) translateY(-4px)`
  }, [])
  const onMouseLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = 'perspective(900px) rotateY(0) rotateX(0) translateY(0)'
  }, [])
  return { ref, onMouseMove, onMouseLeave }
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
    <As ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className={`hn-tilt ${className || ''}`} style={style} {...rest}>
      {children}
    </As>
  )
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
        <a href="#how" onClick={scrollToId('how')} className="hn-nav-link" style={linkStyle}>How it works</a>
        <a href="#agents" onClick={scrollToId('agents')} className="hn-nav-link" style={linkStyle}>Agents</a>
        <a href="#voice" onClick={scrollToId('voice')} className="hn-nav-link" style={linkStyle}>Your voice</a>
        <a href="#uses" onClick={scrollToId('uses')} className="hn-nav-link" style={linkStyle}>Why Honne</a>
      </div>
      <div className="hn-nav-links" style={{ flex: 1 }} />
      <span
        className="hn-nav-links"
        onClick={() => navigate('/login')}
        style={{ fontSize: 14, color: 'rgba(255,255,255,.82)', padding: '0 6px', whiteSpace: 'nowrap', cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}
      >
        Sign in
      </span>
      <button
        ref={cta.ref} onMouseMove={cta.onMouseMove} onMouseLeave={cta.onMouseLeave}
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
          <motion.div className="hn-hero-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 250px', gap: 40, alignItems: 'center' }} initial="hidden" animate="show" variants={staggerParent}>
            <div>
              <motion.div variants={fadeUp} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 32, padding: '0 14px 0 6px', borderRadius: 999, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.16)', fontSize: 13, color: 'rgba(255,255,255,.9)', marginBottom: 28, whiteSpace: 'nowrap' }}>
                <span style={{ height: 22, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 999, background: '#FFFFFF', color: '#15181A', fontFamily: FONT.mono, fontSize: 11 }}>本音</span>
                honne · what you actually think
              </motion.div>
              <h1 className="hn-hero-h1" style={{ margin: 0, fontFamily: FONT.serif, fontWeight: 400, lineHeight: 0.95, letterSpacing: '-0.035em' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '.25em', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-block', overflow: 'hidden', padding: '0 .04em .2em 0', marginBottom: '-.14em' }}><motion.span variants={wordUp} style={{ display: 'inline-block' }}>Your</motion.span></span>
                  <span style={{ display: 'inline-block', overflow: 'hidden', padding: '0 .04em .2em 0', marginBottom: '-.14em' }}><motion.span variants={wordUp} style={{ display: 'inline-block' }}>knowledge,</motion.span></span>
                  <motion.span variants={{ hidden: { scale: 0, rotate: -180, opacity: 0 }, show: { scale: 1, rotate: 0, opacity: 1, transition: { duration: 1.3, ease: EASE } } }}>
                    <RingDots />
                  </motion.span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '.25em', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-block', overflow: 'hidden', padding: '0 .04em .2em 0', marginBottom: '-.14em' }}><motion.span variants={wordUp} style={{ display: 'inline-block' }}>from</motion.span></span>
                  <span style={{ display: 'inline-block', overflow: 'hidden', padding: '0 .04em .2em 0', marginBottom: '-.14em' }}><motion.span variants={wordUp} style={{ display: 'inline-block', color: 'rgba(255,255,255,.72)' }}>Google Docs</motion.span></span>
                </span>
                <span className="hn-hero-indent" style={{ display: 'flex', alignItems: 'center', gap: '.24em', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-block', overflow: 'hidden', padding: '0 .06em .24em 0', marginBottom: '-.12em' }}>
                    <motion.span variants={wordUp} className="hn-gradient-shimmer" style={{ display: 'inline-block', fontStyle: 'italic', padding: '0 .08em .2em 0', marginBottom: '-.2em' }}>to publishable posts.</motion.span>
                  </span>
                  <motion.span variants={fadeUp} style={{ display: 'inline-flex', alignItems: 'center', gap: '.12em', padding: '.06em .12em', borderRadius: '.16em', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', marginBottom: '.06em' }}>
                    <span style={{ width: '.46em', height: '.46em' }}><IconLinkedIn size="100%" /></span>
                    <span style={{ width: '.46em', height: '.46em' }}><IconX size="100%" /></span>
                    <span style={{ width: '.46em', height: '.46em' }}><IconReddit size="100%" /></span>
                  </motion.span>
                </span>
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '28px 40px', marginTop: 36 }}>
                <motion.p variants={fadeUp} className="hn-hero-sub" style={{ margin: 0, maxWidth: 540, lineHeight: 1.5, fontWeight: 300, color: 'rgba(255,255,255,.88)' }}>
                  Honne reads your knowledge sources, Google Docs, Notion and more, finds the ideas worth sharing, and turns them into posts for LinkedIn, X and Reddit that sound like you. 
                </motion.p>
                <motion.div variants={fadeUp} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    ref={startCta.ref} onMouseMove={startCta.onMouseMove} onMouseLeave={startCta.onMouseLeave}
                    onClick={() => navigate('/register')}
                    className="hn-magnetic hn-hover-light"
                    style={{ display: 'flex', alignItems: 'center', height: 52, padding: '0 24px', borderRadius: 999, background: '#FFFFFF', color: '#15181A', fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', boxShadow: '0 10px 30px -10px rgba(0,0,0,.4)', border: 'none', cursor: 'pointer' }}
                  >
                    Start with your knowledge
                  </button>
                  <a href="#how" onClick={scrollToId('how')} className="hn-hover-outline" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 52, padding: '0 20px', borderRadius: 999, border: '1px solid rgba(255,255,255,.28)', color: '#FFFFFF', fontSize: 15, whiteSpace: 'nowrap' }}>
                    See how it works
                    <IconChevronDown />
                  </a>
                </motion.div>
              </div>
            </div>
            <div className="hn-hero-side" style={{ display: 'flex', flexDirection: 'column', gap: 44, justifySelf: 'end', width: 250 }}>
              <motion.div variants={fadeUp}>
                <div style={{ position: 'relative', width: 18, height: 16, marginBottom: 12 }}>
                  <span style={{ position: 'absolute', left: 7, top: 0, width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />
                  <span style={{ position: 'absolute', left: 2, top: 7, width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />
                  <span style={{ position: 'absolute', left: 12, top: 7, width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />
                  <span style={{ position: 'absolute', left: 7, top: 12, width: 4, height: 4, borderRadius: '50%', background: '#fff', opacity: 0.6 }} />
                </div>
                <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 26, lineHeight: 1.1 }}>Angles, not blank pages</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,.8)', marginTop: 6, lineHeight: 1.45 }}>Options worth posting, pulled from your own notes and docs.</div>
              </motion.div>
              <motion.div variants={fadeUp}>
                <div style={{ position: 'relative', width: 18, height: 16, marginBottom: 12 }}>
                  <span style={{ position: 'absolute', left: 0, top: 6, width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />
                  <span style={{ position: 'absolute', left: 7, top: 0, width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />
                  <span style={{ position: 'absolute', left: 7, top: 12, width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />
                  <span style={{ position: 'absolute', left: 14, top: 6, width: 4, height: 4, borderRadius: '50%', background: '#fff', opacity: 0.6 }} />
                </div>
                <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 26, lineHeight: 1.1 }}>Style memory</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,.8)', marginTop: 6, lineHeight: 1.45 }}>Learns how you write from your past posts, then keeps to it.</div>
              </motion.div>
            </div>
          </motion.div>

          <motion.div className="hn-hero-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16, marginTop: 48 }} initial="hidden" animate="show" variants={staggerParent}>
            <TiltCard as={motion.div} variants={fadeUp} style={{ padding: '22px 24px 24px', borderRadius: 20, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.08em', color: 'rgba(255,255,255,.7)' }}><span>01 · IN</span><span>DOCS · NOTION · GITHUB</span></div>
              <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 30, marginTop: 22, lineHeight: 1 }}>Your knowledge</div>
              <div style={{ fontSize: 14, lineHeight: 1.45, color: 'rgba(255,255,255,.85)', marginTop: 8 }}>Google Docs and Sheets, Notion, GitHub READMEs, Word files and uploads.</div>
            </TiltCard>
            <TiltCard as={motion.div} variants={fadeUp} style={{ padding: '22px 24px 24px', borderRadius: 20, background: '#FFFFFF', color: '#15181A', boxShadow: '0 24px 60px -24px rgba(0,0,0,.45)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.08em', color: '#6B6F72' }}><span>02 · HONNE</span><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: C.orange }} />SUPERVISOR + 4 AGENTS</span></div>
              <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 30, marginTop: 22, lineHeight: 1.05 }}>Raw notes to publishable posts and branding</div>
              <div style={{ fontSize: 14, lineHeight: 1.45, color: '#4A4F53', marginTop: 8 }}>Research, angles, series planning and writing, each handled by a specialist.</div>
            </TiltCard>
            <TiltCard as={motion.div} variants={fadeUp} style={{ padding: '22px 24px 24px', borderRadius: 20, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.08em', color: 'rgba(255,255,255,.7)' }}><span>03 · OUT</span><span>LINKEDIN · X · REDDIT</span></div>
              <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 30, marginTop: 22, lineHeight: 1 }}>Your content</div>
              <div style={{ fontSize: 14, lineHeight: 1.45, color: 'rgba(255,255,255,.85)', marginTop: 8 }}>Drafts ready to review, schedule or publish, written the way you write, in your voice.</div>
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
    <section ref={sectionRef} style={{ maxWidth: 1180, margin: '0 auto', padding: '112px 40px 48px' }}>
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
    <section style={{ maxWidth: 1180, margin: '0 auto', padding: '0 40px' }}>
      <Reveal style={{ position: 'relative', borderRadius: 28, background: '#FFFFFF', border: `1px solid ${C.border}`, padding: 36, boxShadow: '0 40px 80px -50px rgba(12,31,38,.35)' }}>
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
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', margin: '8px 0 18px' }}>Supervisor + 4 specialist agents</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
              {AGENTS.map((a) => (
                <span key={a.id} style={{ height: 28, display: 'flex', alignItems: 'center', padding: '0 11px', borderRadius: 999, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', fontSize: 12 }}>{a.name}</span>
              ))}
            </div>
          </div>
          <ConnectorLines paths={CONNECTOR_RIGHT} />
          <div className="hn-flow-list" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40, height: 400 }}>
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
/* How it works — interactive stepper                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
function HowItWorks() {
  const [step, setStep] = useState(0)
  const [typed, setTyped] = useState(0)
  const [p4done, setP4done] = useState(false)
  const sectionRef = useRef(null)
  const visibleRef = useRef(false)
  const pickedAtRef = useRef(0)

  const pickStep = (i) => { pickedAtRef.current = Date.now(); setStep(i) }

  useEffect(() => {
    let io
    if ('IntersectionObserver' in window && sectionRef.current) {
      io = new IntersectionObserver(([e]) => { visibleRef.current = e.isIntersecting }, { threshold: 0.35 })
      io.observe(sectionRef.current)
    } else visibleRef.current = true
    const cyc = setInterval(() => {
      if (visibleRef.current && Date.now() - pickedAtRef.current > 7000) setStep((s) => (s + 1) % 4)
    }, 4200)
    return () => { io && io.disconnect(); clearInterval(cyc) }
  }, [])

  useEffect(() => {
    setTyped(0)
    setP4done(false)
    let typeTimer = null
    let p4Timer = null
    if (step === 2) {
      typeTimer = setInterval(() => {
        setTyped((t) => {
          if (t >= DRAFT.length) { clearInterval(typeTimer); return t }
          return t + 3
        })
      }, 28)
    }
    if (step === 3) p4Timer = setTimeout(() => setP4done(true), 1400)
    return () => { clearInterval(typeTimer); clearTimeout(p4Timer) }
  }, [step])

  const panelStyle = (i) => ({
    opacity: step === i ? 1 : 0,
    transform: step === i ? 'none' : step > i ? 'translateY(-16px) scale(.98)' : 'translateY(16px) scale(.98)',
    pointerEvents: step === i ? 'auto' : 'none',
  })

  return (
    <section id="how" ref={sectionRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '96px 40px 0' }} className="hn-how-pad">
        <div className="hn-how-grid" style={{ width: '100%', maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,.9fr) minmax(0,1.1fr)', gap: 80, alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.1em', color: C.orange, marginBottom: 18 }}>HOW IT WORKS</div>
            <h2 className="hn-h2" style={{ margin: '0 0 36px', fontFamily: FONT.serif, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.03em' }}>From what you know <span style={{ fontStyle: 'italic', color: C.faint }}>to what you post.</span></h2>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 22 }}>
              <div style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 2, borderRadius: 2, background: '#E8E2D9' }} />
              <div style={{ position: 'absolute', left: 0, top: 6, width: 2, borderRadius: 2, background: C.orange, height: `${((step + 1) / 4) * 100}%`, transition: 'height .2s linear' }} />
              {STEPS.map((s, i) => (
                <button key={s.n} onClick={() => pickStep(i)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: '14px 0', cursor: 'pointer', opacity: step === i ? 1 : 0.4, transition: 'opacity .35s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: 12, color: step === i ? C.orange : '#A5A9AB', transition: 'color .35s' }}>{s.n}</span>
                    <span style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em' }}>{s.title}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateRows: step === i ? '1fr' : '0fr', transition: 'grid-template-rows .45s cubic-bezier(.2,.7,.2,1)' }}>
                    <div style={{ overflow: 'hidden' }}><p style={{ margin: '8px 0 0 34px', fontSize: 15, lineHeight: 1.55, color: C.body, maxWidth: 420 }}>{s.body}</p></div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="hn-how-stage" style={{ position: 'relative', borderRadius: 28, background: 'linear-gradient(140deg, #F6A15B 0%, #F0662A 38%, #2C6E7F 100%)', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, opacity: 0.2, mixBlendMode: 'overlay', backgroundImage: 'radial-gradient(rgba(255,255,255,.35) 0.6px, transparent 0.8px)', backgroundSize: '3px 3px' }} />
            <div className="hn-how-window" style={{ position: 'relative' }}>

              <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF', borderRadius: 18, boxShadow: '0 30px 80px -30px rgba(12,31,38,.55)', padding: 22, transition: 'opacity .45s ease, transform .55s cubic-bezier(.2,.7,.2,1)', ...panelStyle(0) }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}><span style={{ fontSize: 15, fontWeight: 600 }}>Connect knowledge</span><span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint }}>{step === 0 ? '5 of 5 connected' : ''}</span></div>
                {SOURCES.map((r, i) => {
                  const active = step === 0
                  const d = `${i * 0.08}s`, d2 = `${0.5 + i * 0.25}s`
                  return (
                    <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, border: `1px solid ${C.borderAlt}`, marginBottom: 8, opacity: active ? 1 : 0, transform: active ? 'none' : 'translateY(10px)', transition: `opacity .4s ease ${d}, transform .5s cubic-bezier(.2,.7,.2,1) ${d}` }}>
                      <span style={{ width: 32, height: 32, borderRadius: 9, background: C.panelAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#3D4144', flex: 'none' }}>{r.mono}</span>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 500 }}>{r.name}</div><div style={{ fontSize: 12, color: C.faint }}>{r.desc}</div></div>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: active ? '#E7F2EA' : C.panelAlt, color: active ? '#2F7A4E' : '#6B6F72', transition: `background .3s ease ${d2}, color .3s ease ${d2}` }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{active ? 'Connected' : 'Connect'}</span>
                    </div>
                  )
                })}
              </div>

              <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF', borderRadius: 18, boxShadow: '0 30px 80px -30px rgba(12,31,38,.55)', padding: 22, transition: 'opacity .45s ease, transform .55s cubic-bezier(.2,.7,.2,1)', ...panelStyle(1) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: C.panelAlt, fontSize: 14, color: '#3D4144', marginBottom: 16 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: C.chipBg, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>AK</span>
                  What could I post about this week?
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint, letterSpacing: '.06em', marginBottom: 10 }}>ANGLES AGENT · 3 OPTIONS</div>
                {ANGLES.map((c, i) => {
                  const active = step === 1
                  const d = `${0.2 + i * 0.14}s`
                  const bd = i === 0 ? '#F3C3AA' : C.border, bg = i === 0 ? '#FFF7F2' : '#FFFFFF'
                  return (
                    <div key={c.title} style={{ padding: '14px 16px', borderRadius: 12, border: `1px solid ${bd}`, background: bg, marginBottom: 8, opacity: active ? 1 : 0, transform: active ? 'none' : 'translateY(14px)', transition: `opacity .45s ease ${d}, transform .55s cubic-bezier(.2,.7,.2,1) ${d}, border-color .3s, background .3s` }}>
                      <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.35 }}>{c.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: C.faint }}><span style={{ height: 20, display: 'flex', alignItems: 'center', padding: '0 7px', borderRadius: 5, background: C.panelAlt, fontSize: 11, fontWeight: 600, color: '#3D4144' }}>{c.mono}</span>{c.src}</div>
                    </div>
                  )
                })}
              </div>

              <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF', borderRadius: 18, boxShadow: '0 30px 80px -30px rgba(12,31,38,.55)', padding: 22, display: 'flex', flexDirection: 'column', transition: 'opacity .45s ease, transform .55s cubic-bezier(.2,.7,.2,1)', ...panelStyle(2) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ width: 36, height: 36, borderRadius: '50%', background: C.chipBg, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>AK</span>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>Akash</div><div style={{ fontSize: 12, color: C.faint }}>Draft · LinkedIn</div></div>
                  <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.orange }}>WRITER AGENT</span>
                </div>
                <div style={{ flex: 1, fontSize: 15, lineHeight: 1.6, color: C.ink, whiteSpace: 'pre-wrap' }}>
                  {DRAFT.slice(0, step === 2 ? typed : 0)}
                  <span style={{ display: 'inline-block', width: 2, height: '1.1em', background: C.orange, verticalAlign: '-3px', marginLeft: 1, animation: 'hn-blink 1s step-end infinite' }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 14, borderTop: `1px solid ${C.borderAlt}` }}>
                  <span style={{ fontSize: 12, color: C.faint, marginRight: 4, alignSelf: 'center' }}>Your style</span>
                  {VOICE_TRAITS.map((t) => (<span key={t} style={{ height: 26, display: 'flex', alignItems: 'center', padding: '0 10px', borderRadius: 999, background: C.panelAlt, fontSize: 12, color: '#3D4144' }}>{t}</span>))}
                </div>
              </div>

              <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF', borderRadius: 18, boxShadow: '0 30px 80px -30px rgba(12,31,38,.55)', padding: 22, display: 'flex', flexDirection: 'column', transition: 'opacity .45s ease, transform .55s cubic-bezier(.2,.7,.2,1)', ...panelStyle(3) }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Ready to go out</div>
                <div style={{ fontSize: 13, color: C.faint, marginBottom: 18 }}>&quot;AI agents aren&apos;t the hard part&quot;</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 14 }}>
                  {[{ mono: 'in', name: 'LinkedIn', on: true }, { mono: 'X', name: 'X', on: true }, { mono: 'r/', name: 'Reddit', on: false }].map((pl) => (
                    <div key={pl.name} style={{ padding: 14, borderRadius: 12, border: `1px solid ${pl.on ? '#15181A' : '#E3DDD4'}`, background: pl.on ? '#FFFFFF' : '#FAF7F2', transition: 'all .3s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{pl.mono}</span>
                        <span style={{ width: 16, height: 16, borderRadius: 5, border: `1.5px solid ${pl.on ? '#15181A' : '#E3DDD4'}`, background: pl.on ? '#15181A' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10 }}>{pl.on ? '✓' : ''}</span>
                      </div>
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 10 }}>{pl.name}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.borderAlt}`, fontSize: 14 }}>
                  <IconCalendar />
                  Tue, Sep 29 · 9:00 AM
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 500, background: p4done ? '#2F7A4E' : '#15181A', color: '#FFFFFF', transition: 'background .4s ease' }}>
                  {p4done && <IconCheck size={16} color="currentColor" />}
                  {p4done ? 'Scheduled for Tue, 9:00 AM' : 'Approve and schedule'}
                </div>
                <div style={{ fontSize: 12, color: C.faint, textAlign: 'center', marginTop: 10 }}>Nothing is published until you approve it.</div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Agents — supervisor + specialists                                          */
/* ─────────────────────────────────────────────────────────────────────────── */
function AgentCard({ a, hover, onEnter, onLeave, side }) {
  const active = hover === a.id
  return (
    <Reveal
      as={motion.div}
      style={{ position: 'relative', padding: 22, borderRadius: 18, background: active ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)', border: `1px solid ${active ? 'rgba(246,161,91,.6)' : 'rgba(255,255,255,.1)'}`, transition: 'background .3s, border-color .3s, transform .3s', transform: active ? 'translateY(-2px)' : 'none' }}
    >
      <div onMouseEnter={onEnter} onMouseLeave={onLeave}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 28 }}>{a.name}</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{a.tag}</span>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: 'rgba(255,255,255,.72)', marginTop: 8 }}>{a.desc}</div>
        <div className="hn-agents-tick" style={{ position: 'absolute', top: '50%', [side]: -21, width: 21, height: 1, background: active ? C.orangeLight : 'rgba(255,255,255,.15)' }} />
      </div>
    </Reveal>
  )
}

function AgentsSection() {
  const [hover, setHover] = useState(null)
  const [logI, setLogI] = useState(3)
  useEffect(() => {
    const t = setInterval(() => setLogI((i) => (i + 1) % LOG.length), 1800)
    return () => clearInterval(t)
  }, [])
  const activeAgent = hover || LOG[logI].agent
  const visibleLog = [3, 2, 1, 0].map((k) => {
    const i = (logI - k + LOG.length) % LOG.length
    const l = LOG[i]
    const you = l.who === 'YOU'
    return { ...l, bg: you ? C.panelAlt : '#FFFFFF', c: you ? '#6B6F72' : l.who === 'SUPERVISOR' ? '#15181A' : C.orange, op: 1 - k * 0.18 }
  })

  return (
    <section id="agents" style={{ padding: 12 }}>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, background: C.dark, color: '#FFFFFF', padding: 48 }} className="hn-agents-pad">
        <div style={{ position: 'absolute', right: '-10%', top: '-30%', width: '60%', height: '80%', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(44,110,127,.6), rgba(44,110,127,0))', filter: 'blur(20px)' }} />
        <div style={{ position: 'absolute', left: '-10%', bottom: '-40%', width: '50%', height: '70%', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(240,102,42,.35), rgba(240,102,42,0))', filter: 'blur(20px)' }} />
        <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto' }}>
          <Reveal className="hn-agents-head" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '24px 60px', alignItems: 'end', marginBottom: 64 }}>
            <div>
              <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.1em', color: C.orangeLight, marginBottom: 18 }}>UNDER THE HOOD</div>
              <h2 className="hn-h2" style={{ margin: 0, fontFamily: FONT.serif, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.03em' }}>One supervisor. <span style={{ fontStyle: 'italic', color: C.tealLight }}>Four specialists.</span></h2>
            </div>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55, color: 'rgba(255,255,255,.72)', fontWeight: 300 }}>One agent doing everything writes generic posts. Honne splits the work: a supervisor talks with you and calls the right specialist at each step, then brings the results back to you.</p>
          </Reveal>

          <div className="hn-agents-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr) minmax(0,1fr)', gap: 20, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {AGENTS.slice(0, 2).map((a) => <AgentCard key={a.id} a={a} hover={activeAgent} onEnter={() => setHover(a.id)} onLeave={() => setHover(null)} side="right" />)}
            </div>

            <Reveal style={{ padding: 24, borderRadius: 22, background: '#FFFFFF', color: '#15181A', boxShadow: '0 30px 80px -30px rgba(0,0,0,.6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <LogoMark />
                <span style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 30, lineHeight: 1 }}>Supervisor</span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT.mono, fontSize: 11, color: '#3F8A5E' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3F8A5E', animation: 'hn-blink 1.4s step-end infinite' }} />LIVE</span>
              </div>
              <div style={{ fontSize: 13, color: '#6B6F72', marginBottom: 18 }}>The only agent that talks to you.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 212 }}>
                {visibleLog.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: l.bg, fontSize: 13, lineHeight: 1.4, opacity: l.op, transition: 'opacity .4s' }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: 11, color: l.c, flex: 'none', width: 74, paddingTop: 1 }}>{l.who}</span>
                    <span style={{ color: '#2D3134' }}>{l.t}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {AGENTS.slice(2).map((a) => <AgentCard key={a.id} a={a} hover={activeAgent} onEnter={() => setHover(a.id)} onLeave={() => setHover(null)} side="left" />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Voice memory                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */
function VoiceSection() {
  const [honne, setHonne] = useState(true)
  return (
    <section id="voice" style={{ maxWidth: 1180, margin: '0 auto', padding: '112px 40px' }}>
      <div className="hn-voice-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: '48px 72px', alignItems: 'center' }}>
        <Reveal>
          <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.1em', color: C.orange, marginBottom: 18 }}>STYLE MEMORY</div>
          <h2 className="hn-h2" style={{ margin: '0 0 20px', fontFamily: FONT.serif, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.03em' }}>It learns <span style={{ fontStyle: 'italic', color: C.orange }}>how you write.</span></h2>
          <p style={{ margin: '0 0 32px', fontSize: 17, lineHeight: 1.55, color: C.body, maxWidth: 440 }}>Honne builds a style memory from your past posts: how long your sentences run, how you open, what you never say. Every draft starts from it.</p>
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
              <div><div style={{ fontSize: 14, fontWeight: 600 }}>Akash</div><div style={{ fontSize: 12, color: C.faint }}>Building Honne</div></div>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
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
/* Use cases                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */
function UseCases() {
  return (
    <section id="uses" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 40px 112px' }}>
      <Reveal className="hn-uses-head" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '20px 60px', alignItems: 'end', marginBottom: 40 }}>
        <div>
          <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.1em', color: C.orange, marginBottom: 18 }}>THE PROBLEM WE SOLVE</div>
          <h2 className="hn-h2" style={{ margin: 0, fontFamily: FONT.serif, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.03em' }}>Your expertise is buried <span style={{ fontStyle: 'italic', color: C.faint }}>under admin.</span></h2>
        </div>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: C.body }}>Salespeople, marketers and individuals lose hours to research, sorting notes and hunting for ideas before anything gets written. Honne gives each of them a team of specialised AI agents that handles that work, so they can focus on what they want to say.</p>
      </Reveal>
      <div className="hn-uses-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
        {USE_CASES.map((u) => (
          <TiltCard key={u.tag} as={Reveal} style={{ position: 'relative', overflow: 'hidden', padding: 28, borderRadius: 22, background: u.bg, color: u.color, border: `1px solid ${u.border}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.1em', opacity: 0.7 }}>{u.tag}</div>
            <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 32, lineHeight: 1.05, margin: '14px 0 10px' }}>{u.title}</div>
            <div style={{ fontSize: 15, lineHeight: 1.55, opacity: 0.85 }}>{u.desc}</div>
            <div style={{ height: 1, background: u.divider, margin: '22px 0 16px' }} />
            <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.08em', opacity: 0.7, marginBottom: 12 }}>AGENTS TAKE OVER</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {u.bullets.map((b) => (
                <div key={b} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.45 }}>
                  <IconCheck size={16} />
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </TiltCard>
        ))}
      </div>
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
            ref={cta.ref} onMouseMove={cta.onMouseMove} onMouseLeave={cta.onMouseLeave}
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
    <footer style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 40px 48px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 20, fontSize: 14, color: '#6B6F72' }}>
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
function NavigateLink({ to, children, className }) {
  const navigate = useNavigate()
  return <a href={to} className={className} onClick={(e) => { e.preventDefault(); navigate(to) }}>{children}</a>
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
        <HowItWorks />
        <AgentsSection />
        <VoiceSection />
        <UseCases />
      </main>
      <FinalCTA />
      <Footer />

      <style>{`
        .hn-landing { -webkit-font-smoothing: antialiased; }
        .hn-landing * { box-sizing: border-box; }
        .hn-landing a { color: inherit; text-decoration: none; }
        .hn-landing button { font: inherit; color: inherit; }
        .hn-landing ::selection { background: ${C.orange}; color: #fff; }
        .hn-landing section[id] { scroll-margin-top: 96px; }

        @keyframes hn-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
        @keyframes hn-spin { to { transform: rotate(360deg); } }
        @keyframes hn-shine { 0%,55% { left: -60%; } 100% { left: 130%; } }
        @keyframes hn-flow { to { stroke-dashoffset: -24; } }
        @keyframes hn-pulse { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes hn-shimmer { 0%,100% { background-position: 0% 0; } 50% { background-position: 100% 0; } }
        @keyframes hn-drift-a { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(3%,-4%) scale(1.06); } }
        @keyframes hn-drift-b { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-4%,3%) scale(0.94); } }
        @media (prefers-reduced-motion: reduce) {
          .hn-landing [style*="animation"] { animation: none !important; }
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
        .hn-nav-link:hover, .hn-hover-outline:hover { background: rgba(255,255,255,.1); color: #FFFFFF; }
        .hn-hover-light:hover { color: #15181A; }
        .hn-footer-link:hover { color: ${C.orange}; }

        .hn-h2 { font-size: clamp(52px, 5.6vw, 84px); }
        .hn-statement { font-size: clamp(44px, 5.2vw, 76px); }
        .hn-hero-h1 { font-size: clamp(58px, 6.8vw, 112px); }
        .hn-hero-indent { padding-left: .6em; }
        .hn-hero-sub { font-size: 18px; }
        .hn-how-window { height: 480px; }
        .hn-how-stage { padding: 40px; }
        .hn-agents-pad { padding: 120px 48px; }
        .hn-cta-pad { padding: 160px 40px; }
        .hn-cta-h { font-size: clamp(64px, 8vw, 128px); }

        @media (max-width: 999px) {
          .hn-nav-links { display: none !important; }
          .hn-hero-grid, .hn-how-grid, .hn-agents-grid, .hn-voice-grid, .hn-agents-head, .hn-uses-head { grid-template-columns: 1fr !important; }
          .hn-hero-side { display: none !important; }
          .hn-hero-cards, .hn-uses-grid { grid-template-columns: 1fr !important; }
          .hn-flow-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .hn-flow-labels, .hn-flow-lines { display: none !important; }
          .hn-flow-list { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)) !important; height: auto !important; }
          .hn-agents-tick { display: none !important; }
          .hn-how-grid { gap: 40px !important; }
          .hn-agents-pad { padding: 72px 24px !important; }
        }
        @media (max-width: 759px) {
          .hn-h2 { font-size: 44px; }
          .hn-statement { font-size: 36px; }
          .hn-hero-h1 { font-size: 46px !important; }
          .hn-hero-indent { padding-left: 0 !important; }
          .hn-hero-sub { font-size: 16px !important; }
          .hn-hero-ring { display: none !important; }
          .hn-hero-shell { min-height: auto !important; }
          .hn-hero-pad { padding: 120px 20px 20px !important; min-height: auto !important; }
          .hn-how-pad { padding: 72px 20px 0 !important; }
          .hn-how-window { height: 440px !important; }
          .hn-how-stage { padding: 18px !important; }
          .hn-cta-pad { padding: 96px 20px !important; }
          .hn-cta-h { font-size: 52px !important; }
        }
      `}</style>
    </div>
  )
}
