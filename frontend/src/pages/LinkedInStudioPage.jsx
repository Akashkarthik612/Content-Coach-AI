import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  agentErrorMessage, deleteLinkedInThread, getLinkedInThread, listLinkedInThreads, sendLinkedInMessage,
} from '../api/independentAgents'

/* ─── LinkedIn Studio ("Honne LinkedIn" design) ─────────────────────────────
   Chat on the left, a LinkedIn-styled post editor on the right. Each chat is a
   thread on the LinkedIn agent (/api/independent-agents/linkedin): history,
   messages and drafts come from the backend. Schedule, publish and images are
   still simulated on the client. */

const CFG = {
  name: 'LinkedIn', kind: 'LinkedIn Post', accent: '#0A66C2',
  publish: 'Post', publishedToast: 'Posted to LinkedIn', scheduledToast: 'Scheduled on LinkedIn',
  cardDesc: 'Professional post built from your knowledge, written in your voice.',
  greeting: 'What should we post on LinkedIn?',
  placeholder: 'Describe the LinkedIn post you want…',
  suggestions: ['Turn my Q3 launch notes into a LinkedIn post', 'Write a founder story about why I started Honne', 'Share 3 lessons from our latest customer calls'],
}

const GROUPS = ['Today', 'Yesterday', 'Previous 7 days']
const SPRING = { type: 'spring', stiffness: 380, damping: 30 }
const MO = {
  msg: { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: SPRING },
  card: { initial: { opacity: 0, y: 18, scale: 0.985 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { type: 'spring', stiffness: 240, damping: 26 }, style: { width: '100%' } },
  pop: { initial: { opacity: 0, y: 8, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { type: 'spring', stiffness: 440, damping: 30 }, style: { position: 'absolute', right: 0, bottom: 'calc(100% + 10px)', zIndex: 20, transformOrigin: 'bottom right' } },
  toast: { initial: { opacity: 0, y: 24, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { type: 'spring', stiffness: 360, damping: 26 }, style: { position: 'absolute', left: 0, right: 0, bottom: 28, display: 'flex', justifyContent: 'center', zIndex: 30, pointerEvents: 'none' } },
  btn: { whileHover: { scale: 1.03 }, whileTap: { scale: 0.95 }, transition: { type: 'spring', stiffness: 500, damping: 28 } },
}
const sugMo = i => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, whileHover: { x: 3 }, whileTap: { scale: 0.98 }, transition: { ...SPRING, delay: 0.08 + i * 0.06 } })
const tomorrow = () => new Date(Date.now() + 864e5).toISOString().slice(0, 10)
const groupOf = iso => {
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 864e5)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : 'Previous 7 days'
}
const newChatState = (id, title) => ({
  id, title, group: 'Today', msgs: [], post: '', img: null, status: 'empty', sched: null,
  busy: false, loaded: true, limit: false,
})
const fromSummary = t => ({ ...newChatState(t.id, t.title || 'Untitled chat'), group: groupOf(t.last_message_at), loaded: false })

/* Brand tiles in the rail: the active platform pulses with a ring in its colour. */
const BRAND = { li: ['10,102,194', '#0A66C2'], x: ['15,20,25', '#0F1419'], rd: ['255,69,0', '#FF4500'] }
function tileProps(k, active) {
  const [rgb, bg] = BRAND[k]
  const sh = (r, b, o) => `0 0 0 2px #F2F0EC, 0 0 0 ${r}px rgba(${rgb},${active ? 1 : 0}), 0 0 ${b}px rgba(${rgb},${o})`
  return {
    initial: false,
    animate: active ? { scale: 1, y: 0, boxShadow: [sh(3.5, 12, 0.4), sh(3.5, 26, 0.8), sh(3.5, 12, 0.4)] } : { scale: 1, y: 0, boxShadow: sh(2, 10, 0.22) },
    transition: active ? { boxShadow: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }, default: { type: 'spring', stiffness: 500, damping: 28 } } : { type: 'spring', stiffness: 500, damping: 28 },
    whileHover: { scale: 1.09, y: -1, boxShadow: sh(active ? 3.5 : 2, 24, 0.75) },
    whileTap: { scale: 0.93 },
    style: { width: 34, height: 34, borderRadius: k === 'rd' ? 17 : 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, padding: 0, cursor: 'pointer', background: `linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0) 60%), ${bg}` },
  }
}

/* ─── Icons ──────────────────────────────────────────────────────────────── */
const LI_PATH = 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452z'
const X_PATH = 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'
function Icon({ size = 16, sw = 1.75, children, style }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', ...style }}>{children}</svg>
}
function RedditGlyph({ size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M12.4 8.2 13.5 3.8l3.6.8" fill="none" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18.3" cy="4.9" r="1.6" fill="#FFFFFF" /><circle cx="5.2" cy="11" r="2.1" fill="#FFFFFF" /><circle cx="18.8" cy="11" r="2.1" fill="#FFFFFF" />
      <ellipse cx="12" cy="14.6" rx="7.6" ry="5.4" fill="#FFFFFF" /><circle cx="9" cy="13.6" r="1.25" fill="#FF4500" /><circle cx="15" cy="13.6" r="1.25" fill="#FF4500" />
      <path d="M9.3 16.7c1.6 1.1 3.8 1.1 5.4 0" fill="none" stroke="#FF4500" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
const SidebarIcon = () => <Icon><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></Icon>
const DbIcon = ({ size = 17 }) => <Icon size={size}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" /></Icon>
const CheckIcon = ({ size, color = '#2F8F5B', sw = 2.2 }) => <Icon size={size} sw={sw} style={{ stroke: color }}><path d="M20 6 9 17l-5-5" /></Icon>
const Spin = ({ size, ring, top, w = 1.5 }) => <span style={{ width: size, height: size, borderRadius: '50%', border: `${w}px solid ${ring}`, borderTopColor: top, animation: 'hn-li-spin .7s linear infinite', flex: 'none', display: 'block' }} />

/* ─────────────────────────────────────────────────────────────────────────── */
export default function LinkedInStudioPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const userName = localStorage.getItem('display_name') ?? localStorage.getItem('username') ?? 'You'
  const initials = userName.split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'U'

  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1400 : window.innerWidth))
  const [input, setInput] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [histCollapsed, setHistCollapsed] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [tab, setTab] = useState('chat')
  const [pop, setPop] = useState(false)
  const [sd, setSd] = useState(tomorrow)
  const [stm, setStm] = useState('09:00')
  const [toast, setToast] = useState(null)
  const [chats, setChats] = useState([])
  const [error, setError] = useState(null) // message of the last failed call, shown above the composer

  const rootRef = useRef(null)
  const scrollRef = useRef(null)
  const postRef = useRef(null)
  const fileRef = useRef(null)
  const alive = useRef(true)
  const wRef = useRef(w)
  const toastTimer = useRef(null)
  const handedOff = useRef(false)

  useEffect(() => { wRef.current = w }, [w])
  useEffect(() => {
    alive.current = true
    const el = rootRef.current
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(e => setW(e[0].contentRect.width)) : null
    if (ro) ro.observe(el)
    return () => { alive.current = false; ro && ro.disconnect(); clearTimeout(toastTimer.current) }
  }, [])

  const c = chats.find(x => x.id === activeId) || null

  // Keep the streaming chat pinned to the bottom, and the editor sized to its text.
  useEffect(() => {
    if (scrollRef.current && c && c.busy) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  })
  useLayoutEffect(() => {
    const t = postRef.current
    if (t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }
  }, [c?.post, tab, w])

  const upd = useCallback((id, fn) => setChats(cs => cs.map(x => (x.id === id ? fn(x) : x))), [])
  const toastMsg = useCallback(t => {
    clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  // History lives on the backend. Chats created before it arrives stay on top.
  useEffect(() => {
    listLinkedInThreads()
      .then(ts => {
        if (!alive.current) return
        setChats(cs => {
          const local = new Set(cs.map(x => x.id))
          return [...cs, ...ts.filter(t => !local.has(t.id)).map(fromSummary)]
        })
      })
      .catch(err => { if (alive.current) setError(agentErrorMessage(err)) })
  }, [])

  // Opening a chat from history loads its messages; the editor shows the latest draft.
  const openChat = useCallback(id => {
    setActiveId(id); setHistOpen(false); setPop(false); setError(null)
    const chat = chats.find(x => x.id === id)
    if (!chat || chat.loaded || chat.busy) return
    upd(id, x => ({ ...x, busy: true }))
    getLinkedInThread(id)
      .then(d => {
        const msgs = []
        let post = ''
        for (const m of d.messages) {
          if (m.role === 'user') msgs.push({ k: 'user', text: m.content })
          else { msgs.push({ k: 'card', st: 'done' }); post = m.content }
        }
        if (post) msgs.push({ k: 'actions' })
        upd(id, x => ({ ...x, msgs, post, status: post ? 'draft' : 'empty', loaded: true, busy: false, limit: d.thread.limit_reached }))
      })
      .catch(err => { upd(id, x => ({ ...x, busy: false })); setError(agentErrorMessage(err)) })
  }, [chats, upd])

  // One turn: the agent answers with the whole post, which replaces the draft
  // in the editor. A failed turn is rolled back on the server, so it is rolled
  // back here too and the text goes back into the composer.
  const send = useCallback(async txt => {
    const text = (typeof txt === 'string' ? txt : input).trim()
    if (!text || (c && (c.busy || c.limit))) return
    setInput(''); setError(null)
    const isNew = !c
    const id = isNew ? 'new-' + Date.now() : c.id
    const prev = c
    if (isNew) {
      setChats(cs => [newChatState(id, text.length > 40 ? text.slice(0, 38) + '…' : text), ...cs])
      setActiveId(id)
    }
    upd(id, x => ({ ...x, busy: true, status: 'writing', msgs: [...x.msgs.filter(m => m.k !== 'actions'), { k: 'user', text }, { k: 'card', st: 'writing' }] }))
    try {
      const res = await sendLinkedInMessage({ message: text, thread_id: isNew ? null : id })
      const tid = res.thread.thread_id
      setChats(cs => cs.map(x => (x.id !== id ? x : {
        ...x, id: tid, busy: false, status: 'draft', post: res.content, sched: null, limit: res.thread.limit_reached,
        msgs: [...x.msgs.slice(0, -1), { k: 'card', st: 'done' }, { k: 'actions' }],
      })))
      if (isNew) setActiveId(a => (a === id ? tid : a))
      if (wRef.current < 880) setTab('post')
    } catch (err) {
      if (isNew) {
        setChats(cs => cs.filter(x => x.id !== id))
        setActiveId(a => (a === id ? null : a))
      } else {
        upd(id, () => ({ ...prev, busy: false }))
      }
      setError(agentErrorMessage(err))
      setInput(cur => cur || text)
    }
  }, [c, input, upd])

  const deleteChat = () => {
    if (!c || c.busy) return
    const id = c.id
    deleteLinkedInThread(id)
      .then(() => {
        setChats(cs => cs.filter(x => x.id !== id))
        setActiveId(a => (a === id ? null : a))
        toastMsg('Chat deleted')
      })
      .catch(err => setError(agentErrorMessage(err)))
  }

  // A prompt handed over from the Home composer starts a new chat straight away.
  useEffect(() => {
    const prompt = location.state?.prompt
    if (!prompt || handedOff.current) return
    handedOff.current = true
    navigate(location.pathname, { replace: true, state: null })
    send(prompt)
  }, [location, navigate, send])

  const wide = w >= 1180
  const narrow = w < 880
  const writing = !!c && c.status === 'writing'
  const hasPost = !!c && (!!c.post || writing)
  const st = c ? c.status : 'empty'
  const canPub = hasPost && !writing && st !== 'published' && st !== 'publishing'
  const histVisible = wide ? !histCollapsed : histOpen
  const pill = {
    empty: { label: 'No draft yet', bg: 'rgba(0,0,0,.06)', fg: 'rgba(0,0,0,.55)' },
    writing: { label: 'Writing…', bg: 'rgba(240,102,42,.14)', fg: '#C4501E' },
    draft: { label: 'Draft', bg: 'rgba(0,0,0,.06)', fg: 'rgba(0,0,0,.65)' },
    scheduled: { label: 'Scheduled · ' + (c && c.sched), bg: CFG.accent + '1F', fg: CFG.accent },
    publishing: { label: 'Publishing…', bg: CFG.accent + '1F', fg: CFG.accent },
    published: { label: 'Published', bg: 'rgba(34,160,90,.14)', fg: '#1E7B46' },
  }[st]
  const pubBg = st === 'published' ? '#5E6B75' : canPub || st === 'publishing' ? CFG.accent : '#B9C3CC'
  const pubLabel = st === 'publishing' ? 'Posting…' : st === 'published' ? 'Posted' : CFG.publish
  const whenLabel = st === 'scheduled' ? c.sched : st === 'published' ? 'Just now' : 'Now'
  const footNote = st === 'published' ? 'Live on ' + CFG.name : st === 'scheduled' ? 'Goes live ' + c.sched : writing ? 'Honne is writing…' : hasPost ? 'Draft saved' : ''
  const chatW = narrow ? 'auto' : w < 1040 ? 340 : 400

  const toggleHist = () => (wide ? setHistCollapsed(x => !x) : setHistOpen(x => !x))
  const newChat = () => { setActiveId(null); setInput(''); setError(null); setTab('chat'); setPop(false); setHistOpen(false) }
  const fmtSched = () => {
    const d = new Date(sd + 'T' + stm)
    return isNaN(d) ? `${sd} ${stm}` : d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }
  const confirmSched = () => {
    const l = fmtSched()
    if (c) upd(c.id, x => ({ ...x, status: 'scheduled', sched: l }))
    setPop(false)
    toastMsg(CFG.scheduledToast + ' · ' + l)
  }
  const publish = () => {
    if (!canPub || !c) return
    const id = c.id
    setPop(false)
    upd(id, x => ({ ...x, status: 'publishing' }))
    setTimeout(() => {
      if (!alive.current) return
      upd(id, x => ({ ...x, status: 'published' }))
      toastMsg(CFG.publishedToast)
    }, 1100)
  }
  const onFile = e => {
    const f = e.target.files && e.target.files[0]
    if (f && c) { const u = URL.createObjectURL(f); upd(c.id, x => ({ ...x, img: u })) }
    e.target.value = ''
  }
  const removeImg = () => {
    if (!c) return
    if (c.img) URL.revokeObjectURL(c.img)
    upd(c.id, x => ({ ...x, img: null }))
  }
  const copyPost = () => {
    try { navigator.clipboard.writeText(c.post) } catch { /* clipboard unavailable */ }
    toastMsg('Copied to clipboard')
  }

  const groups = GROUPS.map(g => ({ label: g, items: chats.filter(x => x.group === g) })).filter(g => g.items.length)
  const iconBtn = { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 7, background: 'transparent', color: '#77726A', cursor: 'pointer', flex: 'none' }
  const actBtn = { width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 7, background: 'transparent', color: '#8A857C', cursor: 'pointer' }
  const railLink = { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 8, background: 'transparent', color: '#57534C', cursor: 'pointer' }

  return (
    <div ref={rootRef} className="hn-li" style={{ height: '100vh', width: '100%', display: 'flex', overflow: 'hidden', position: 'relative', background: '#F8F7F4', fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif", color: '#1C1A17' }}>
      <style>{`
        .hn-li { -webkit-font-smoothing: antialiased; }
        .hn-li * { box-sizing: border-box; }
        .hn-li button { font: inherit; color: inherit; }
        .hn-li textarea::placeholder, .hn-li input::placeholder { color: #9A958C; }
        @keyframes hn-li-spin { to { transform: rotate(360deg); } }
        @keyframes hn-li-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes hn-li-shim { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
        @keyframes hn-li-pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
        .hn-li-ghost:hover { background: rgba(28,26,23,.06) !important; color: #1C1A17 !important; }
        .hn-li-hist:hover { background: rgba(28,26,23,.05) !important; color: #1C1A17 !important; }
        .hn-li-newchat:hover { border-color: rgba(28,26,23,.2) !important; }
        .hn-li-sug:hover { border-color: rgba(240,102,42,.4) !important; background: #FFFFFF !important; }
        .hn-li-img:hover { border-color: #0A66C2 !important; color: #0A66C2 !important; background: #F3F8FD !important; }
        .hn-li-sched:hover { background: rgba(0,0,0,.04) !important; border-color: rgba(0,0,0,.9) !important; }
        .hn-li-cancel:hover { background: rgba(0,0,0,.05) !important; }
        .hn-li-confirm:hover { background: #004182 !important; }
      `}</style>

      {/* Rail */}
      <aside style={{ width: 56, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 0', background: '#F2F0EC', borderRight: '1px solid rgba(28,26,23,.07)', zIndex: 5 }}>
        <button onClick={() => navigate('/home')} title="Honne home" style={{ ...railLink, marginBottom: 12 }}>
          <span style={{ position: 'relative', width: 22, height: 22, borderRadius: 6, background: '#1C1A17', display: 'block' }}>
            <span style={{ position: 'absolute', right: 4, bottom: 4, width: 7, height: 7, borderRadius: '50%', background: '#F0662A', display: 'block' }} />
          </span>
        </button>
        <button onClick={() => navigate('/home')} title="Home" className="hn-li-ghost" style={railLink}>
          <Icon size={17}><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Icon>
        </button>
        <button onClick={() => navigate('/home')} title="Sources" className="hn-li-ghost" style={railLink}>
          <DbIcon />
        </button>
        <div style={{ width: 24, height: 1, background: 'rgba(28,26,23,.1)', margin: '10px 0' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '4px 0' }}>
          <motion.button title="LinkedIn" onClick={() => navigate('/linkedin')} {...tileProps('li', true)}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="#FFFFFF" style={{ display: 'block' }}><path d={LI_PATH} /></svg>
          </motion.button>
          <motion.button title="X" onClick={() => navigate('/x')} {...tileProps('x', false)}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="#FFFFFF" style={{ display: 'block' }}><path d={X_PATH} /></svg>
          </motion.button>
          <motion.button title="Reddit" onClick={() => navigate('/reddit')} {...tileProps('rd', false)}>
            <RedditGlyph size={26} />
          </motion.button>
        </div>
        <div style={{ flex: 1 }} />
        <div title={userName} style={{ width: 30, height: 30, borderRadius: '50%', background: '#E4DFD6', color: '#3D3933', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>{initials}</div>
      </aside>

      {!wide && histOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }} onClick={() => setHistOpen(false)}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 56, background: 'rgba(20,18,15,.24)', zIndex: 8 }} />
      )}

      {/* Chat history */}
      <motion.div
        initial={false} animate={{ opacity: histVisible ? 1 : 0 }} transition={{ opacity: { duration: 0.2 } }}
        style={{ width: histVisible ? 252 : 0, minWidth: 0, transition: 'width .32s cubic-bezier(.32,.72,0,1)', position: wide ? 'relative' : 'absolute', left: wide ? 'auto' : 56, top: 0, bottom: 0, height: '100%', zIndex: 9, flex: 'none', overflow: 'hidden', boxShadow: !wide && histVisible ? '0 20px 50px -10px rgba(20,18,15,.3)' : 'none' }}
      >
        <nav style={{ width: 252, height: '100%', display: 'flex', flexDirection: 'column', background: '#F5F3EF', borderRight: '1px solid rgba(28,26,23,.07)' }}>
          <div style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, background: '#0A66C2', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.18), 0 3px 12px rgba(10,102,194,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="#FFFFFF"><path d={LI_PATH} /></svg>
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{CFG.name}</span>
            <span style={{ fontSize: 12, color: '#8A857C', whiteSpace: 'nowrap' }}>Studio</span>
            <span style={{ flex: 1 }} />
            <button onClick={toggleHist} title="Close sidebar" className="hn-li-ghost" style={{ ...iconBtn, width: 30, height: 30 }}>
              <Icon><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m16 15-3-3 3-3" /></Icon>
            </button>
          </div>
          <div style={{ padding: '0 10px 10px' }}>
            <motion.div {...MO.btn}>
              <button onClick={newChat} className="hn-li-newchat" style={{ width: '100%', height: 36, display: 'flex', alignItems: 'center', gap: 9, padding: '0 11px', border: '1px solid rgba(28,26,23,.1)', borderRadius: 9, background: '#FFFFFF', cursor: 'pointer', fontSize: 13, fontWeight: 500, boxShadow: '0 1px 2px rgba(28,26,23,.05)' }}>
                <Icon size={15}><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" /></Icon>
                New chat
              </button>
            </motion.div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {groups.map(g => (
              <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, color: '#8A857C', padding: '0 8px 6px' }}>{g.label}</div>
                {g.items.map(x => {
                  const a = x.id === activeId
                  return (
                    <button key={x.id} data-testid="li-history-item" onClick={() => openChat(x.id)} className="hn-li-hist"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 32, padding: '0 9px', border: 0, borderRadius: 7, cursor: 'pointer', textAlign: 'left', fontSize: 13, background: a ? '#FFFFFF' : 'transparent', boxShadow: a ? '0 1px 2px rgba(28,26,23,.07), 0 0 0 1px rgba(28,26,23,.05)' : 'none', color: a ? '#1C1A17' : '#57534C' }}>
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title}</span>
                      {x.busy && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F0662A', animation: 'hn-li-pulse 1s ease-in-out infinite', flex: 'none' }} />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderTop: '1px solid rgba(28,26,23,.07)', fontSize: 11.5, color: '#8A857C' }}>
            <Icon size={13}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
            Chats are kept for 7 days
          </div>
        </nav>
      </motion.div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {narrow && (
          <div style={{ height: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', borderBottom: '1px solid rgba(28,26,23,.07)', background: '#F8F7F4' }}>
            <button onClick={toggleHist} title="History" style={{ ...iconBtn, width: 36, height: 36, borderRadius: 8, color: '#57534C' }}>
              <Icon><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></Icon>
            </button>
            <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 9, background: 'rgba(28,26,23,.06)' }}>
              {['chat', 'post'].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{ height: 30, padding: '0 14px', border: 0, borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: tab === t ? '#FFFFFF' : 'transparent', boxShadow: tab === t ? '0 1px 2px rgba(28,26,23,.1)' : 'none' }}>
                  {t === 'chat' ? 'Chat' : 'Post'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* Chat panel */}
          <div style={{ display: narrow && tab === 'post' ? 'none' : 'flex', width: chatW, flex: narrow ? 1 : 'none', minWidth: 0, flexDirection: 'column', background: '#FBFAF8', borderRight: '1px solid rgba(28,26,23,.07)' }}>
            <div style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px 0 12px', borderBottom: '1px solid rgba(28,26,23,.06)' }}>
              {!narrow && !histVisible && (
                <button onClick={toggleHist} title="Toggle history" className="hn-li-ghost" style={iconBtn}><SidebarIcon /></button>
              )}
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c ? c.title : 'New chat'}</span>
              {c && !c.id.startsWith('new-') && (
                <button onClick={deleteChat} data-testid="li-delete" title="Delete chat" className="hn-li-ghost" style={iconBtn}>
                  <Icon><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Icon>
                </button>
              )}
              <button onClick={newChat} title="New chat" className="hn-li-ghost" style={iconBtn}>
                <Icon><path d="M12 5v14" /><path d="M5 12h14" /></Icon>
              </button>
            </div>

            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!c && (
                <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: 18, padding: '8px 4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, lineHeight: 1.08, letterSpacing: '-0.01em', textWrap: 'pretty' }}>{CFG.greeting}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.5, color: '#77726A', textWrap: 'pretty' }}>Honne drafts from your connected knowledge and writes in your voice.</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {CFG.suggestions.map((t, i) => (
                      <motion.div key={t} {...sugMo(i)}>
                        <button onClick={() => send(t)} className="hn-li-sug" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', border: '1px solid rgba(28,26,23,.09)', borderRadius: 11, background: 'rgba(255,255,255,.7)', cursor: 'pointer', textAlign: 'left', fontSize: 13, lineHeight: 1.4, color: '#2E2B27' }}>
                          <span style={{ flex: 1, textWrap: 'pretty' }}>{t}</span>
                          <Icon size={14} sw={2} style={{ stroke: '#B5B0A7' }}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Icon>
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {c && c.msgs.map((m, i) => (
                <motion.div key={i} {...MO.msg}>
                  {m.k === 'user' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{ maxWidth: '86%', padding: '10px 13px', borderRadius: '14px 14px 4px 14px', background: '#EEEAE3', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>{m.text}</div>
                    </div>
                  )}
                  {m.k === 'text' && (
                    <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#2E2B27', whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>
                      {m.text}
                      {m.caret && <span style={{ display: 'inline-block', width: 7, height: 14, marginLeft: 2, verticalAlign: -2, borderRadius: 1, background: '#F0662A', animation: 'hn-li-blink 1s steps(2) infinite' }} />}
                    </div>
                  )}
                  {m.k === 'card' && (
                    <div style={{ border: '1px solid rgba(28,26,23,.08)', borderRadius: 12, background: '#FFFFFF', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '13px 14px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 22, height: 22, borderRadius: 6, background: CFG.accent, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                            <Icon size={12} sw={2}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></Icon>
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{CFG.kind}</span>
                        </div>
                        <div style={{ fontSize: 12, lineHeight: 1.45, color: '#77726A' }}>{CFG.cardDesc}</div>
                      </div>
                      <div style={{ height: 38, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 14px', borderTop: '1px solid rgba(28,26,23,.06)', background: '#FBFAF8' }}>
                        {m.st === 'writing' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F0662A', animation: 'hn-li-pulse 1s ease-in-out infinite' }} />}
                        <span style={{ flex: 1, fontSize: 12, color: '#57534C' }}>{m.st === 'writing' ? 'Writing in the editor…' : 'Content generated'}</span>
                        <button onClick={() => { setTab('post'); setTimeout(() => postRef.current && postRef.current.focus(), 0) }} className="hn-li-ghost" style={{ height: 28, display: 'flex', alignItems: 'center', gap: 6, padding: '0 9px', border: 0, borderRadius: 7, background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#1C1A17' }}>
                          Open in editor
                          <Icon size={12} sw={2}><path d="M7 17 17 7" /><path d="M7 7h10v10" /></Icon>
                        </button>
                      </div>
                    </div>
                  )}
                  {m.k === 'actions' && (
                    <div style={{ display: 'flex', gap: 2, marginTop: -6 }}>
                      <button onClick={copyPost} title="Copy post" className="hn-li-ghost" style={actBtn}>
                        <Icon size={14}><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></Icon>
                      </button>
                      <button onClick={() => send('Try a different angle')} title="Regenerate" className="hn-li-ghost" style={actBtn}>
                        <Icon size={14}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></Icon>
                      </button>
                      <button title="Good response" className="hn-li-ghost" style={actBtn}>
                        <Icon size={14}><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></Icon>
                      </button>
                      <button title="Bad response" className="hn-li-ghost" style={actBtn}>
                        <Icon size={14}><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></Icon>
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            <div style={{ flex: 'none', padding: '0 14px 14px' }}>
              {error && (
                <div data-testid="li-error" role="alert" style={{ marginBottom: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(196,80,30,.08)', color: '#9C3F17', fontSize: 12.5, lineHeight: 1.45 }}>{error}</div>
              )}
              {c && c.limit && (
                <div data-testid="li-limit-notice" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(10,102,194,.07)', color: '#0A4A8A', fontSize: 12.5, lineHeight: 1.45 }}>
                  <span style={{ flex: 1 }}>This chat has reached its message limit. Start a new chat to keep going.</span>
                  <button onClick={newChat} style={{ height: 28, padding: '0 11px', border: 0, borderRadius: 999, background: '#0A66C2', color: '#FFFFFF', cursor: 'pointer', fontSize: 12, fontWeight: 600, flex: 'none' }}>New chat</button>
                </div>
              )}
              <div style={{ border: '1px solid rgba(28,26,23,.1)', borderRadius: 14, background: '#FFFFFF', boxShadow: '0 1px 2px rgba(28,26,23,.04), 0 8px 24px -16px rgba(28,26,23,.2)' }}>
                <textarea
                  data-testid="li-input" disabled={!!(c && c.limit)}
                  value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder={CFG.placeholder} rows={2}
                  style={{ display: 'block', width: '100%', border: 0, outline: 'none', resize: 'none', background: 'transparent', padding: '12px 14px 4px', font: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: '#1C1A17', maxHeight: 140 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 8px 10px' }}>
                  <div style={{ height: 28, display: 'flex', alignItems: 'center', gap: 6, padding: '0 9px', borderRadius: 999, background: '#F5F3EF', fontSize: 12, color: '#57534C' }}>
                    <DbIcon size={12} />
                    Honne Knowledge · 3
                  </div>
                  <div style={{ flex: 1 }} />
                  <motion.div {...MO.btn}>
                    <button onClick={() => send()} data-testid="li-send" title="Send" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: '50%', background: input.trim() && !(c && c.busy) ? '#1C1A17' : '#D3CEC6', color: '#FFFFFF', cursor: 'pointer', transition: 'background .2s' }}>
                      <Icon size={15} sw={2.2}><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></Icon>
                    </button>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>

          {/* Post canvas */}
          <section style={{ flex: 1, minWidth: 0, display: narrow && tab === 'chat' ? 'none' : 'flex', flexDirection: 'column', position: 'relative', backgroundColor: '#F4F2EE', backgroundImage: 'radial-gradient(rgba(0,0,0,.07) 1px, transparent 1px)', backgroundSize: '18px 18px', fontFamily: "-apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" }}>
            <div style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', background: 'rgba(244,242,238,.85)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(0,0,0,.9)' }}>LinkedIn post</span>
              <span style={{ height: 22, display: 'flex', alignItems: 'center', gap: 6, padding: '0 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', flex: 'none', background: pill.bg, color: pill.fg }}>{pill.label}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '36px 20px 60px' }}>
              <div style={{ maxWidth: 555, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <motion.div {...MO.card}>
                  <div style={{ background: '#FFFFFF', borderRadius: 10, boxShadow: '0 0 0 1px rgba(0,0,0,.08), 0 18px 40px -28px rgba(0,0,0,.35)' }}>
                    <div style={{ display: 'flex', gap: 10, padding: '14px 16px 0' }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#D9E6F2', color: '#0A4A8A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, flex: 'none' }}>{initials}</div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, color: 'rgba(0,0,0,.9)' }}>{userName} <span style={{ fontWeight: 400, color: 'rgba(0,0,0,.6)' }}>· You</span></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(0,0,0,.6)' }}>
                          {whenLabel} ·
                          <svg viewBox="0 0 16 16" width="12" height="12" fill="rgba(0,0,0,.6)"><path d="M8 1a7 7 0 1 0 7 7 7 7 0 0 0-7-7zM3 8a5 5 0 0 1 1-3l.55.55A1.5 1.5 0 0 1 5 6.62v1.07a.75.75 0 0 0 .22.53l.56.56a.75.75 0 0 0 .53.22H7v.69a.75.75 0 0 0 .22.53l.56.56a.75.75 0 0 1 .22.53V13a5 5 0 0 1-5-5zm6.24 4.83l2-2.46a.75.75 0 0 0 .09-.8l-.58-1.16A.76.76 0 0 0 10 8H7v-.19a.51.51 0 0 1 .28-.45l.38-.19a.74.74 0 0 1 .68 0L9 7.5l.38-.7a1 1 0 0 0 .12-.48v-.85a.78.78 0 0 1 .21-.53l1.07-1.09a5 5 0 0 1-1.54 9z" /></svg>
                        </div>
                      </div>
                    </div>

                    {!hasPost ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '18px 16px 20px' }}>
                        {['92%', '78%', '64%'].map(wd => (
                          <div key={wd} style={{ height: 10, width: wd, borderRadius: 5, background: 'linear-gradient(90deg,#EEEDEA 0,#F7F6F3 50%,#EEEDEA 100%)', backgroundSize: '600px 100%', animation: 'hn-li-shim 1.6s linear infinite' }} />
                        ))}
                        <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(0,0,0,.5)' }}>Your draft appears here as Honne writes it.</div>
                      </div>
                    ) : (
                      <>
                        <div style={{ padding: '12px 16px 8px' }}>
                          <textarea
                            ref={postRef} data-testid="li-post-editor" value={c.post} readOnly={writing} spellCheck={false}
                            onChange={e => { const v = e.target.value; upd(c.id, x => ({ ...x, post: v })) }}
                            style={{ display: 'block', width: '100%', minHeight: 80, border: 0, outline: 'none', resize: 'none', overflow: 'hidden', background: 'transparent', padding: 0, font: 'inherit', fontSize: 14, lineHeight: 1.43, color: 'rgba(0,0,0,.9)', caretColor: '#0A66C2' }}
                          />
                        </div>
                        {c.img ? (
                          <div style={{ position: 'relative', marginTop: 6 }}>
                            <div role="img" style={{ display: 'block', width: '100%', height: 320, backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: `url(${c.img})` }} />
                            <button onClick={removeImg} title="Remove image" style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: '50%', background: 'rgba(0,0,0,.6)', color: '#FFFFFF', cursor: 'pointer' }}>
                              <Icon size={14} sw={2}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>
                            </button>
                          </div>
                        ) : !writing && (
                          <div style={{ padding: '4px 16px 8px' }}>
                            <button onClick={() => fileRef.current && fileRef.current.click()} className="hn-li-img" style={{ width: '100%', height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px dashed rgba(0,0,0,.18)', borderRadius: 8, background: '#FAFAF9', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,.6)' }}>
                              <Icon size={18}><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></Icon>
                              Add image
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 12px 16px', borderTop: '1px solid rgba(0,0,0,.08)', marginTop: 6 }}>
                      <span style={{ flex: 1, fontSize: 12, color: 'rgba(0,0,0,.55)' }}>{footNote}</span>
                      <div style={{ position: 'relative' }}>
                        <motion.div {...MO.btn}>
                          <button onClick={() => { if (canPub || pop) setPop(x => !x) }} className="hn-li-sched" style={{ height: 34, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', border: '1px solid rgba(0,0,0,.6)', borderRadius: 999, background: '#FFFFFF', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'rgba(0,0,0,.75)', opacity: canPub ? 1 : 0.45 }}>
                            <Icon size={15} sw={2}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
                            Schedule
                          </button>
                        </motion.div>
                        {pop && (
                          <motion.div {...MO.pop}>
                            <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 12, background: '#FFFFFF', boxShadow: '0 0 0 1px rgba(0,0,0,.08), 0 20px 44px -16px rgba(0,0,0,.35)' }}>
                              <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(0,0,0,.9)' }}>Schedule post</div>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,.6)' }}>Date
                                <input type="date" value={sd} onChange={e => setSd(e.target.value)} style={{ height: 36, padding: '0 10px', border: '1px solid rgba(0,0,0,.25)', borderRadius: 6, font: 'inherit', fontSize: 14, fontWeight: 400, color: 'rgba(0,0,0,.9)' }} />
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,.6)' }}>Time
                                <input type="time" value={stm} onChange={e => setStm(e.target.value)} style={{ height: 36, padding: '0 10px', border: '1px solid rgba(0,0,0,.25)', borderRadius: 6, font: 'inherit', fontSize: 14, fontWeight: 400, color: 'rgba(0,0,0,.9)' }} />
                              </label>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
                                <button onClick={() => setPop(false)} className="hn-li-cancel" style={{ height: 32, padding: '0 14px', border: 0, borderRadius: 999, background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'rgba(0,0,0,.6)' }}>Cancel</button>
                                <button onClick={confirmSched} className="hn-li-confirm" style={{ height: 32, padding: '0 16px', border: 0, borderRadius: 999, background: '#0A66C2', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Schedule</button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </div>
                      <motion.div {...MO.btn}>
                        <button onClick={publish} style={{ height: 34, display: 'flex', alignItems: 'center', gap: 7, padding: '0 18px', border: 0, borderRadius: 999, background: pubBg, cursor: canPub ? 'pointer' : 'default', fontSize: 14, fontWeight: 600, color: '#FFFFFF', transition: 'background .2s' }}>
                          {st === 'publishing' && <Spin size={13} w={2} ring="rgba(255,255,255,.35)" top="#FFFFFF" />}
                          {pubLabel}
                        </button>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
                <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(0,0,0,.45)' }}>Click the text to edit before you post.</div>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
            {toast && (
              <motion.div {...MO.toast}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 44, padding: '0 16px', borderRadius: 10, background: '#1D2226', color: '#FFFFFF', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 14px 34px -14px rgba(0,0,0,.5)' }}>
                  <CheckIcon size={16} color="#57C27D" sw={2.4} />
                  {toast}
                </div>
              </motion.div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
