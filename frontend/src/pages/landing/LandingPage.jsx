import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import LandingView, { HOVER_CSS } from './LandingView'
import { mountHeroScene } from './heroScene'

// Landing page ported from the Claude Design file "Honne Landing v2.dc.html".
// LandingView.jsx holds the markup; this file owns state, motion and the values it renders.

const STATEMENT = 'Company knowledge is scattered across docs, notes and repos. Honne brings it into one place, so every team can build agents on top of it.'
const ITAL = new Set(['one', 'place,'])
const TRAITS = ['Plain words', 'No hype', 'Short first line', 'Product terms', 'No hashtags']
// Studio demos are the static Claude Design prototypes in public/demo; `?demo=1` makes them auto-play.
const STUDIO_SRC = { li: '/demo/linkedin.html?demo=1', x: '/demo/x.html?demo=1', rd: '/demo/reddit.html?demo=1' }
const STUDIO_W = 1360
const STUDIO_H = 820
const FEED = [
  { t: 'Q3 roadmap.doc edited', d: '3 chunks re-embedded', c: '#F6A15B' },
  { t: 'Pricing.pdf', d: 'Unchanged · skipped', c: 'rgba(255,255,255,.45)' },
  { t: 'Launch brief.doc added', d: '41 chunks embedded', c: '#4ADE80' },
  { t: 'Old FAQ.doc deleted', d: 'Removed from layer', c: '#9CCAD3' },
  { t: 'Hiring plan.doc', d: 'Over 10 MB · skipped', c: '#F3B8A0' },
  { t: 'Customer notes.doc edited', d: '1 chunk re-embedded', c: '#F6A15B' },
]
const FEED_ROW = { display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 10px', borderRadius: 8, background: 'rgba(255,255,255,.06)', fontSize: 12, color: '#FFFFFF' }

const statement = STATEMENT.split(' ').map((t) => ({ t, fs: ITAL.has(t) ? 'italic' : 'normal', c: ITAL.has(t) ? '#F0662A' : '#15181A' }))
const ringDots = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2
  return { x: 50 + Math.cos(a) * 42 + '%', y: 50 + Math.sin(a) * 42 + '%', s: '6px', o: 0.35 + (i / 8) * 0.65 }
})

// framer-motion props for the knowledge-layer section; they don't depend on state.
const kl = (() => {
  const o = {
    layer: { initial: false, animate: { boxShadow: ['0 0 0 1px rgba(246,161,91,.5), 0 0 30px rgba(240,102,42,.2)', '0 0 0 1px rgba(246,161,91,.9), 0 0 70px rgba(240,102,42,.45)', '0 0 0 1px rgba(246,161,91,.5), 0 0 30px rgba(240,102,42,.2)'] }, transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' }, style: { borderRadius: 21 } },
    shine: { animate: { left: ['-45%', '125%'] }, transition: { duration: 3.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.6 }, style: { position: 'absolute', top: 0, bottom: 0, width: '40%', background: 'linear-gradient(90deg, rgba(255,236,220,0), rgba(255,236,220,.12), rgba(255,236,220,0))', pointerEvents: 'none' } },
  }
  const dot = (dir, delay, c) => ({ animate: { y: dir > 0 ? [0, 58] : [58, 0], opacity: [0, 1, 1, 0] }, transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay, repeatDelay: 0.5 }, style: { position: 'absolute', left: -3, top: 0, width: 7, height: 7, borderRadius: 4, background: c, boxShadow: '0 0 12px ' + c } })
  for (let i = 0; i < 6; i++) {
    o['d' + i] = dot(i % 2 ? -1 : 1, i * 0.23, i % 2 ? '#9CCAD3' : '#F6A15B')
    o['a' + i] = { initial: { opacity: 0, y: 18, scale: 0.94 }, whileInView: { opacity: 1, y: 0, scale: 1 }, viewport: { once: true, amount: 0.3 }, transition: { type: 'spring', stiffness: 240, damping: 22, delay: 0.1 + i * 0.1 }, style: { height: '100%' } }
  }
  for (let i = 0; i < 7; i++) o['s' + i] = dot(-1, i * 0.19, '#F6A15B')
  for (let i = 0; i < 4; i++) o['p' + i] = { animate: { backgroundColor: ['rgba(255,255,255,.06)', 'rgba(246,161,91,.3)', 'rgba(255,255,255,.06)'], borderColor: ['rgba(255,255,255,.14)', 'rgba(246,161,91,.9)', 'rgba(255,255,255,.14)'] }, transition: { duration: 1.2, delay: i * 0.6, repeat: Infinity, repeatDelay: 1.2 }, style: { height: 32, display: 'flex', alignItems: 'center', padding: '0 13px', borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', fontSize: 13, color: '#FFFFFF', whiteSpace: 'nowrap' } }
  return o
})()

// Dots travelling along the people ⇄ Honne ⇄ apps connectors.
const pbDots = (() => {
  const o = {}
  const h = (dir, delay, c) => ({ animate: { left: dir > 0 ? ['0%', '100%'] : ['100%', '0%'], opacity: [0, 1, 1, 0] }, transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay, repeatDelay: 0.4 }, style: { position: 'absolute', top: -3, marginLeft: -3, width: 7, height: 7, borderRadius: 4, background: c, boxShadow: '0 0 10px ' + c } })
  for (let i = 0; i < 3; i++) {
    o['l' + i] = h(i === 1 ? -1 : 1, i * 0.35, i === 1 ? '#2C6E7F' : '#F0662A')
    o['r' + i] = h(i === 1 ? -1 : 1, 0.2 + i * 0.35, i === 1 ? '#2C6E7F' : '#F0662A')
  }
  return o
})()

function SyncFeed({ tick }) {
  const items = [0, 1, 2].map((k) => {
    const i = (((tick - k) % FEED.length) + FEED.length) % FEED.length
    return { ...FEED[i], key: tick - k, k }
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((it) => (
          <motion.div key={it.key} layout initial={{ opacity: 0, y: -14, scale: 0.97 }} animate={{ opacity: 1 - it.k * 0.3, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }} style={FEED_ROW}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: it.c, flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.t}</span>
            <span style={{ color: 'rgba(255,255,255,.6)', whiteSpace: 'nowrap' }}>{it.d}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default function LandingPage() {
  const [w, setW] = useState(() => window.innerWidth)
  const [scrolled, setScrolled] = useState(false)
  const [feed, setFeed] = useState(0)
  const [clipTab, setClipTab] = useState('li')
  const [clipW, setClipW] = useState(1100)
  const [voice, setVoice] = useState('honne')

  const rootRef = useRef(null)
  const sceneRef = useRef(null)
  const stRef = useRef(null)
  const lenisRef = useRef(null)
  const glowRef = useRef(null) // gsap quickTo setters for the hero glow and blobs

  // "The idea" statement lights up word by word as it scrolls through the viewport.
  const paintWords = useCallback(() => {
    const el = stRef.current
    if (!el) return
    const ws = el.querySelectorAll('[data-sw]')
    const r = el.getBoundingClientRect(), vh = window.innerHeight
    const p = Math.max(0, Math.min(1, (vh * 0.8 - r.top) / Math.max(1, r.height + vh * 0.25)))
    const lit = p * ws.length
    ws.forEach((wd, i) => { wd.style.opacity = (0.14 + 0.86 * Math.max(0, Math.min(1, lit - i))).toFixed(3) })
  }, [])

  useEffect(() => {
    let raf = null
    const measure = () => { paintWords(); setScrolled(window.scrollY > window.innerHeight * 0.6) }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = null; measure() }) }
    const onResize = () => setW(window.innerWidth)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, { passive: true })
    measure()
    const feedTimer = setInterval(() => setFeed((n) => n + 1), 3000)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      clearInterval(feedTimer)
    }
  }, [paintWords])

  useEffect(() => {
    const host = sceneRef.current
    if (!host) return
    try { return mountHeroScene(host) } catch (e) { console.warn('scene:', e && e.message) }
  }, [])

  // GSAP intro, ambient motion, smooth scroll, magnetic buttons, tilt cards and reveals.
  useEffect(() => {
    const root = rootRef.current
    gsap.registerPlugin(ScrollTrigger)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let lenisTick = null
    if (!reduce && window.self === window.top) {
      const lenis = new Lenis({ lerp: 0.09, smoothWheel: true })
      lenis.on('scroll', ScrollTrigger.update)
      lenisTick = (t) => lenis.raf(t * 1000)
      gsap.ticker.add(lenisTick)
      gsap.ticker.lagSmoothing(0)
      lenisRef.current = lenis
    }
    const blobs = root.querySelector('[data-blobs]')
    const ctx = gsap.context(() => {
      if (!reduce) {
        gsap.timeline({ defaults: { ease: 'expo.out' } })
          .from('[data-hw]', { yPercent: 115, rotate: 3, duration: 1.4, stagger: 0.09 }, 0.15)
          .from('[data-ring]', { scale: 0, rotate: -180, opacity: 0, duration: 1.4 }, 0.5)
          .from('[data-hin]', { y: 24, opacity: 0, duration: 1.1, stagger: 0.08 }, 0.55)
          .from('[data-hcard]', { y: 60, opacity: 0, duration: 1.3, stagger: 0.1 }, 0.7)
        if (blobs) gsap.from(blobs, { scale: 1.25, opacity: 0, duration: 2.2, ease: 'power2.out' })
      }
      gsap.utils.toArray('[data-blob]').forEach((b, i) => {
        gsap.to(b, { xPercent: gsap.utils.random(-18, 18), yPercent: gsap.utils.random(-16, 16), scale: gsap.utils.random(0.9, 1.15), duration: gsap.utils.random(7, 11), repeat: -1, yoyo: true, ease: 'sine.inOut', delay: i * 0.3 })
      })
      gsap.utils.toArray('[data-cblob]').forEach((b, i) => gsap.to(b, { xPercent: i % 2 ? -20 : 20, yPercent: i % 2 ? 15 : -10, duration: 8 + i, repeat: -1, yoyo: true, ease: 'sine.inOut' }))
      if (root.querySelector('[data-ring]')) gsap.to('[data-ring]', { rotate: 360, duration: 16, repeat: -1, ease: 'none' })
      gsap.to('[data-grad]', { backgroundPosition: '100% 0', duration: 6, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      if (blobs) gsap.to(blobs, { yPercent: 18, ease: 'none', scrollTrigger: { trigger: root.querySelector('[data-hero]'), start: 'top top', end: 'bottom top', scrub: true } })
      const glow = root.querySelector('[data-glow]')
      if (glow) {
        gsap.set(glow, { x: window.innerWidth * 0.3, y: 300 })
        glowRef.current = {
          gx: gsap.quickTo(glow, 'x', { duration: 0.8, ease: 'power3' }),
          gy: gsap.quickTo(glow, 'y', { duration: 0.8, ease: 'power3' }),
          bx: blobs && gsap.quickTo(blobs, 'x', { duration: 1.6, ease: 'power3' }),
        }
      }
    }, root)

    const unbind = []
    const on = (el, type, fn) => { el.addEventListener(type, fn); unbind.push(() => el.removeEventListener(type, fn)) }
    root.querySelectorAll('[data-magnetic]').forEach((el) => {
      const qx = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' }), qy = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' })
      on(el, 'mousemove', (e) => { const r = el.getBoundingClientRect(); qx((e.clientX - r.left - r.width / 2) * 0.25); qy((e.clientY - r.top - r.height / 2) * 0.35) })
      on(el, 'mouseleave', () => { qx(0); qy(0) })
    })
    root.querySelectorAll('[data-tilt]').forEach((el) => {
      on(el, 'mousemove', (e) => {
        const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5
        gsap.to(el, { rotateY: px * 7, rotateX: -py * 7, y: -4, transformPerspective: 900, duration: 0.5, ease: 'power3.out' })
      })
      on(el, 'mouseleave', () => gsap.to(el, { rotateY: 0, rotateX: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, .6)' }))
    })
    requestAnimationFrame(() => ScrollTrigger.refresh())

    let io = null
    if (!reduce && 'IntersectionObserver' in window) {
      io = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (!en.isIntersecting) return
        io.unobserve(en.target)
        gsap.to(en.target, { y: 0, opacity: 1, duration: 1.2, ease: 'expo.out', delay: +en.target.dataset.rd || 0 })
      }), { rootMargin: '0px 0px -8% 0px' })
      // Reveals that share a row stagger left to right.
      let lastTop = null, k = 0
      root.querySelectorAll('[data-reveal]').forEach((el) => {
        const top = Math.round(el.getBoundingClientRect().top)
        k = top === lastTop ? k + 1 : 0
        lastTop = top
        el.dataset.rd = (k * 0.08).toFixed(2)
        if (top > window.innerHeight) { gsap.set(el, { y: 48, opacity: 0 }); io.observe(el) }
      })
    }
    paintWords()

    return () => {
      io && io.disconnect()
      unbind.forEach((fn) => fn())
      ctx.revert()
      glowRef.current = null
      if (lenisTick) gsap.ticker.remove(lenisTick)
      lenisRef.current && lenisRef.current.destroy()
      lenisRef.current = null
    }
  }, [paintWords])

  const clipObserver = useRef(null)
  const clipRef = useCallback((el) => {
    clipObserver.current && clipObserver.current.disconnect()
    clipObserver.current = null
    if (el && window.ResizeObserver) {
      clipObserver.current = new ResizeObserver((e) => setClipW(e[0].contentRect.width))
      clipObserver.current.observe(el)
    }
  }, [])

  // In-page nav: every link's href is "#<section id>".
  const goTo = useCallback((e) => {
    e.preventDefault()
    const id = e.currentTarget.getAttribute('href').slice(1)
    const el = id === 'top' ? document.body : document.getElementById(id)
    if (!el) return
    if (lenisRef.current) lenisRef.current.scrollTo(id === 'top' ? 0 : el, { offset: id === 'how' ? 0 : -20, duration: 1.4 })
    else window.scrollTo({ top: id === 'top' ? 0 : el.getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' })
  }, [])

  const sm = w < 760, md = w < 1000
  const honne = voice === 'honne'
  const clipScale = Math.min(1, clipW / STUDIO_W)
  const tab = (id) => ({ bg: clipTab === id ? '#FFFFFF' : 'transparent', bd: clipTab === id ? '#E3DDD4' : 'transparent' })

  const v = {
    ringDots, statement,
    bpFeed: <SyncFeed tick={feed} />,
    proofCols: md ? '1fr' : 'repeat(2, minmax(0,1fr))',
    nav: { top: scrolled ? '12px' : '24px', w: scrolled ? 'min(1080px, calc(100% - 24px))' : 'calc(100% - 72px)', bg: scrolled ? 'rgba(12,31,38,.78)' : 'rgba(255,255,255,.04)', bd: scrolled ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.18)', sh: scrolled ? '0 20px 50px -20px rgba(12,31,38,.5)' : 'none', linksDisp: md ? 'none' : 'flex' },
    go: { top: goTo, proof: goTo, how: goTo, build: goTo, agents: goTo },
    hero: { minH: sm ? 'auto' : 'calc(100vh - 24px)', pad: sm ? '112px 20px 20px' : '120px 44px 32px', cols: md ? '1fr' : 'minmax(0,.95fr) minmax(0,1.05fr)', h1: sm ? '42px' : 'clamp(44px, 4.7vw, 76px)', sub: sm ? '15px' : '16px', chipsJust: md ? 'flex-start' : 'flex-end', ycText: w < 1060 ? 'none' : 'inline', sceneDisp: sm ? 'none' : 'block', ringDisp: sm ? 'none' : 'inline-block', cardCols: md ? '1fr' : 'repeat(3, minmax(0,1fr))' },
    onHeroMove: (e) => {
      const g = glowRef.current
      if (!g) return
      const r = e.currentTarget.getBoundingClientRect()
      g.gx(e.clientX - r.left)
      g.gy(e.clientY - r.top)
      g.bx && g.bx(((e.clientX - r.left) / r.width - 0.5) * -40)
    },
    onCtaMove: undefined,
    sec: { pad: sm ? '88px 20px' : '144px 40px', stPad: sm ? '88px 20px 40px' : '144px 40px 56px', padX: sm ? '20px' : '40px', padB: sm ? '88px' : '144px', statement: sm ? '30px' : 'clamp(32px, 3.3vw, 48px)', h2: sm ? '36px' : 'clamp(38px, 3.6vw, 54px)', darkPad: sm ? '88px 20px' : '144px 48px' },
    flow: { pad: sm ? '0 20px' : '0 40px', inPad: sm ? '18px' : '36px', cols: md ? '1fr' : 'minmax(0,1fr) 72px minmax(0,1fr) 72px minmax(0,.9fr)', gap: md ? '16px' : '0', lineDisp: md ? 'none' : 'block', labelDisp: md ? 'none' : 'grid', srcDisp: md ? 'grid' : 'flex', colH: md ? 'auto' : '400px', outGap: md ? '8px' : '40px' },
    bp: { cols: md ? '1fr' : 'minmax(0,.85fr) 56px minmax(0,1.2fr) 56px minmax(0,.95fr)', gap: md ? '20px' : '0', lineDisp: md ? 'none' : 'block', pad: sm ? '18px' : '32px', colH: md ? 'auto' : '400px', agH: md ? 'auto' : '400px', coreMt: md ? '0' : '24px', agMt: '0' },
    clip: {
      scale: clipScale.toFixed(4), h: Math.round(STUDIO_H * clipScale) + 'px', src: STUDIO_SRC[clipTab],
      onLi: () => setClipTab('li'), onX: () => setClipTab('x'), onRd: () => setClipTab('rd'),
      bgLi: tab('li').bg, bdLi: tab('li').bd, bgX: tab('x').bg, bdX: tab('x').bd, bgRd: tab('rd').bg, bdRd: tab('rd').bd,
    },
    kl: { ...kl, agCols: sm ? 'repeat(2, minmax(0,1fr))' : md ? 'repeat(3, minmax(0,1fr))' : 'repeat(6, minmax(0,1fr))', srcCols: sm ? 'repeat(3, minmax(0,1fr))' : md ? 'repeat(4, minmax(0,1fr))' : 'repeat(7, minmax(0,1fr))', stripDisp: md ? 'none' : 'grid', gapH: md ? '20px' : '0px' },
    pb: { ...pbDots, cols: md ? '1fr' : 'minmax(0,1fr) 72px minmax(0,1.1fr) 72px minmax(0,1fr)', gap: md ? '16px' : '0', connDisp: md ? 'none' : 'block' },
    agents: { headCols: md ? '1fr' : '1.1fr 1fr' },
    uses: { headCols: md ? '1fr' : '1.1fr 1fr' },
    voice: {
      cols: md ? '1fr' : '1fr 1.1fr', pillL: honne ? 'calc(50%)' : '4px', gC: honne ? '#6B6F72' : '#15181A', hC: honne ? '#15181A' : '#6B6F72',
      setGeneric: () => setVoice('generic'), setHonne: () => setVoice('honne'),
      gOp: honne ? 0 : 1, hOp: honne ? 1 : 0, gTf: honne ? 'translateY(-8px)' : 'none', hTf: honne ? 'none' : 'translateY(8px)', gBlur: honne ? 'blur(6px)' : 'none', hBlur: honne ? 'none' : 'blur(6px)',
      tag: honne ? 'Your voice' : 'Generic', tagBg: honne ? '#FFF1E9' : '#F2F2F2', tagC: honne ? '#C4501E' : '#6B6F72',
    },
    voiceTraits: TRAITS.map((t, i) => ({ t, bd: honne ? '#15181A' : '#E3DDD4', bg: honne ? '#15181A' : 'transparent', c: honne ? '#FFFFFF' : '#A5A9AB', td: honne ? 'none' : 'line-through', d: i * 0.06 + 's' })),
    cta: { pad: sm ? '96px 20px' : '160px 40px', h: sm ? '42px' : 'clamp(46px, 5.4vw, 84px)' },
  }

  return (
    <>
      <style>{`
        html, body { margin: 0; padding: 0; background: #FAF7F2; -webkit-font-smoothing: antialiased; height: auto !important; min-height: 100%; overflow-y: visible; }
        * { box-sizing: border-box; }
        a { color: inherit; text-decoration: none; } a:hover { color: #F0662A; }
        button { font: inherit; color: inherit; }
        ::selection { background: #F0662A; color: #fff; }
        html.lenis, html.lenis body { height: auto; } .lenis.lenis-smooth { scroll-behavior: auto !important; }
        @keyframes hn-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
        @keyframes hn-spin { to { transform: rotate(360deg); } }
        @keyframes hn-shine { 0%,55% { left: -60%; } 100% { left: 130%; } }
        @keyframes hn-flow { to { stroke-dashoffset: -24; } }
        @keyframes hn-sweep { from { stroke-dashoffset: 276.5; } to { stroke-dashoffset: 0; } }
        @keyframes hn-chip { 0%,22%,100% { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.14); } 7%,15% { background: rgba(246,161,91,.32); border-color: rgba(246,161,91,.9); } }
        @keyframes hn-pulse { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(1.9); opacity: 0; } }
        ${HOVER_CSS}
      `}</style>
      <LandingView v={v} rootRef={rootRef} sceneRef={sceneRef} stRef={stRef} clipRef={clipRef} />
    </>
  )
}
