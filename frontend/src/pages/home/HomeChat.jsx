import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { draftText } from './useHomeChats'

/* ─── Home chat window ("Honne Chat" design) ─────────────────────────────────
   One surface with three layouts: home (greeting, composer, suggestions),
   compose (the composer grows to the middle of the page while you type) and
   chat (the thread fills the page, the composer docks at the bottom). The
   composer is a contenteditable so `@agent` can sit in it as a pill; the
   pill picks which agent answers. Turns run through useHomeChats. */

const svgUri = s => 'data:image/svg+xml,' + encodeURIComponent(s).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29')
const W3 = "xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'"
const LI_P = 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452z'
const X_P = 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'
const AG = {
  auto: { id: 'auto', handle: 'auto', name: 'Auto', desc: 'Honne picks the right agent', src: svgUri(`<svg ${W3}><rect width='24' height='24' rx='6' fill='#1C1A17'/><circle cx='16.5' cy='16.5' r='3.2' fill='#F0662A'/></svg>`) },
  linkedin: { id: 'linkedin', handle: 'linkedin', name: 'LinkedIn', desc: 'LinkedIn Post & Marketing', tag: 'Built-in', src: svgUri(`<svg ${W3}><rect width='24' height='24' rx='6' fill='#0A66C2'/><g transform='translate(5.5 5.5) scale(.54)'><path fill='#fff' d='${LI_P}'/></g></svg>`), tint: 'rgba(10,102,194,.10)', ink: '#0A5AAB' },
  reddit: { id: 'reddit', handle: 'reddit', name: 'Reddit', desc: 'Reddit Post & Marketing', tag: 'Built-in', src: svgUri(`<svg ${W3}><rect width='24' height='24' rx='6' fill='#FF4500'/><g transform='translate(3.6 3.6) scale(.7)'><circle cx='18.5' cy='4.5' r='1.6' fill='#fff'/><path d='M12 8.5 13.2 3.6l5.3 1' fill='none' stroke='#fff' stroke-width='1.3' stroke-linecap='round'/><ellipse cx='12' cy='14.5' rx='8' ry='5.6' fill='#fff'/><circle cx='4.6' cy='10.6' r='1.9' fill='#fff'/><circle cx='19.4' cy='10.6' r='1.9' fill='#fff'/><circle cx='9' cy='13.6' r='1.25' fill='#FF4500'/><circle cx='15' cy='13.6' r='1.25' fill='#FF4500'/></g></svg>`), tint: 'rgba(255,69,0,.10)', ink: '#C73800' },
  x: { id: 'x', handle: 'x', name: 'X', desc: 'X Post & Marketing', tag: 'Built-in', src: svgUri(`<svg ${W3}><rect width='24' height='24' rx='6' fill='#1C1A17'/><g transform='translate(6.5 6.5) scale(.46)'><path fill='#fff' d='${X_P}'/></g></svg>`), tint: 'rgba(28,26,23,.07)', ink: '#1C1A17' },
}
const ORDER = ['linkedin', 'reddit', 'x']
const IC = {
  search: 'M11 3a8 8 0 1 0 0 16a8 8 0 1 0 0-16M21 21l-4.3-4.3',
  pen: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  alert: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20M12 8v4M12 16h.01',
  stop: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20M9 9h6v6H9z',
  doc: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4',
  copy: 'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  regen: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  up: 'M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z',
  down: 'M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z',
  clock: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20M12 6v6l4 2',
}
const CHIPS = [
  { label: 'Find content ideas', d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4', text: 'Find content ideas in what I wrote this month' },
  { label: 'Turn my knowledge into a content series', d: 'm12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83ZM22 17.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65M22 12.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65', text: 'Turn my notes into a 5-post series for this week' },
  { label: 'Research a topic', d: IC.search, text: 'Research what people are saying about ' },
  { label: 'Repurpose existing content', d: 'm17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3', text: 'Repurpose my latest notes as a LinkedIn post' },
]
const PLATS = [
  { id: 'linkedin', title: 'LinkedIn Post & Marketing', desc: 'Thought leadership and launch posts in your voice.' },
  { id: 'reddit', title: 'Reddit Post & Marketing', desc: 'Community-first posts that read native to the subreddit.' },
  { id: 'x', title: 'X Post & Marketing', desc: 'Sharp posts and threads built from your notes.' },
]
const MONO = "'Geist Mono', ui-monospace, monospace"
const SERIF = "'Instrument Serif', Georgia, serif"
const KIND = { linkedin: 'LinkedIn post', reddit: 'Reddit post', x: 'X post' }
const aKind = k => (k.startsWith('X') ? 'an ' : 'a ') + k

const hl = (str, q) => {
  const i = q ? str.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (i < 0) return [{ t: str, on: false }]
  return [{ t: str.slice(0, i), on: false }, { t: str.slice(i, i + q.length), on: true }, { t: str.slice(i + q.length), on: false }].filter(x => x.t)
}
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function Svg({ d, size = 14, sw = 1.75, color = 'currentColor', fill = 'none', style }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={{ flex: 'none', ...style }} fill={fill} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
}
const Logo = ({ src, size, r }) => <span style={{ width: size, height: size, borderRadius: r, display: 'block', flex: 'none', background: `center / cover no-repeat url("${src}")` }} />
const Spin = ({ size = 12, light }) => <span style={{ width: size, height: size, borderRadius: '50%', border: `1.5px solid ${light ? 'rgba(255,255,255,.3)' : 'rgba(28,26,23,.16)'}`, borderTopColor: light ? '#FFFFFF' : '#F0662A', animation: 'hc-spin .7s linear infinite', display: 'block', flex: 'none' }} />

/* ─── Draft card ─────────────────────────────────────────────────────────── */
function PostCard({ post, displayName, initials, edit, onEdit, onEditChange, onCopy, copied, onRegen, canRegen }) {
  const pf = post.platform
  const shown = edit || post
  const kind = pf === 'x' && post.posts.length > 1 ? `X thread · ${post.posts.length} posts` : KIND[pf]
  const meta = pf === 'x' ? (post.posts.length > 1 ? `${post.posts.length} posts` : `${post.posts[0].length}/280`) : pf === 'reddit' ? `r/${post.sub || 'subreddit'}` : `${post.body.length.toLocaleString()} characters`
  const field = { display: 'block', width: '100%', padding: '10px 12px', border: '1px solid rgba(240,102,42,.45)', borderRadius: 10, outline: 0, boxShadow: '0 0 0 4px rgba(240,102,42,.10)', fontFamily: 'inherit', fontSize: 14.5, lineHeight: 1.55, color: '#1C1A17', resize: 'vertical', background: '#FFFFFF' }
  const body = { fontSize: 14.5, lineHeight: 1.55, color: '#1C1A17', whiteSpace: 'pre-wrap', textWrap: 'pretty', overflowWrap: 'anywhere' }
  const btn = { display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', border: 0, borderRadius: 8, background: 'transparent', fontSize: 12.5, fontWeight: 500, color: '#3D3933', cursor: 'pointer' }
  return (
    <div data-testid="hc-post" style={{ maxWidth: 560, border: '1px solid rgba(28,26,23,.10)', borderRadius: 14, background: '#FFFFFF', overflow: 'hidden', boxShadow: '0 1px 2px rgba(28,26,23,.04), 0 14px 34px -24px rgba(28,26,23,.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: '1px solid rgba(28,26,23,.07)', background: '#FBFAF8', fontSize: 12, color: '#6B665E' }}>
        <Logo src={AG[pf].src} size={16} r={4} />
        <span style={{ fontWeight: 500, color: '#3D3933' }}>{kind}</span>
        <span>· Draft</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 11 }}>{meta}</span>
      </div>
      <div style={{ padding: '16px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: pf === 'reddit' ? '#FFE3D6' : '#E4DFD6', color: pf === 'reddit' ? '#C73800' : '#3D3933', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flex: 'none' }}>{pf === 'reddit' ? 'r/' : initials}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{pf === 'reddit' ? `r/${post.sub || 'subreddit'}` : displayName}</div>
            <div style={{ fontSize: 12, color: '#77726A' }}>{pf === 'reddit' ? 'Posted by you · Draft' : 'Draft · Now'}</div>
          </div>
        </div>
        {pf === 'reddit' && (edit
          ? <input value={shown.title} onChange={e => onEditChange({ ...edit, title: e.target.value })} style={{ ...field, fontSize: 15, fontWeight: 600, marginBottom: 8 }} />
          : <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35, marginBottom: 8, textWrap: 'pretty' }}>{post.title}</div>)}
        {pf === 'x' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shown.posts.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                {shown.posts.length > 1 && <span style={{ fontFamily: MONO, fontSize: 11, color: '#9A958C', paddingTop: edit ? 12 : 3, flex: 'none', width: 22 }}>{i + 1}/{shown.posts.length}</span>}
                {edit
                  ? <textarea value={p} onChange={e => onEditChange({ ...edit, posts: edit.posts.map((q, j) => (j === i ? e.target.value : q)) })} style={{ ...field, minHeight: 96 }} />
                  : <div data-testid="hc-post-body" style={{ ...body, flex: 1, minWidth: 0 }}>{p}</div>}
              </div>
            ))}
          </div>
        ) : edit ? (
          <textarea value={shown.body} onChange={e => onEditChange({ ...edit, body: e.target.value })} style={{ ...field, minHeight: 260 }} />
        ) : (
          <div data-testid="hc-post-body" style={body}>{post.body}</div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: '8px 10px', borderTop: '1px solid rgba(28,26,23,.07)' }}>
        <button onClick={onCopy} className="hc-tb" style={btn}><Svg d={IC.copy} />{copied ? 'Copied' : 'Copy'}</button>
        <button onClick={onEdit} className="hc-tb" style={btn}><Svg d={IC.edit} />{edit ? 'Done' : 'Edit'}</button>
        <span style={{ flex: 1 }} />
        <button onClick={onRegen} disabled={!canRegen} className="hc-tb" style={{ ...btn, opacity: canRegen ? 1 : 0.45, cursor: canRegen ? 'pointer' : 'default' }}><Svg d={IC.regen} />Regenerate</button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
export default function HomeChat({ store, mobile, displayName, initials, kb, onOpenKnowledge, focusSignal }) {
  const { active: chat } = store
  const [mode, setMode] = useState('home') // 'home' | 'compose' while no chat is open
  const view = chat ? 'chat' : mode
  const chatMode = view === 'chat', home = view === 'home'

  const [empty, setEmpty] = useState(true)
  const [pill, setPill] = useState(null) // agent id of the @ pill in the composer
  const [edFocus, setEdFocus] = useState(false)
  const [pk, setPk] = useState({ open: false, q: '', left: 0, y: 0, yTop: 0, wW: 600 })
  const [pkHi, setPkHi] = useState(0)
  const [menu, setMenu] = useState(false) // agent dropdown
  const [toast, setToast] = useState(null)
  const [hoverMsg, setHoverMsg] = useState(null)
  const [stepsOpen, setStepsOpen] = useState({}) // msg id → bool, overrides the default
  const [edits, setEdits] = useState({}) // msg id → draft being edited
  const [copied, setCopied] = useState(null)
  const [fb, setFb] = useState({}) // msg id → 'up' | 'down'; not sent anywhere yet
  const [dims, setDims] = useState({ stageH: 760, cmpH: 140, hdrH: 0 })

  const stageRef = useRef(null), threadRef = useRef(null), colRef = useRef(null), hdrRef = useRef(null), wrapRef = useRef(null), edRef = useRef(null)
  const trig = useRef(null) // the "@query" text range the picker would replace
  const stick = useRef(true)
  const toastTimer = useRef(null)
  const rm = reducedMotion()

  const busy = !!chat && chat.msgs.some(m => m.status === 'working')
  const locked = !!chat && (chat.limit || chat.loading)

  /* ── measuring ── */
  const measure = useCallback(() => {
    const st = stageRef.current, w = wrapRef.current, h = hdrRef.current
    setDims(d => {
      const n = { stageH: st ? st.clientHeight : d.stageH, cmpH: w ? w.offsetHeight : d.cmpH, hdrH: h ? h.offsetHeight : d.hdrH }
      return n.stageH === d.stageH && n.cmpH === d.cmpH && n.hdrH === d.hdrH ? d : n
    })
  }, [])
  useLayoutEffect(() => {
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro) [stageRef, wrapRef, hdrRef].forEach(r => r.current && ro.observe(r.current))
    return () => { ro && ro.disconnect(); clearTimeout(toastTimer.current) }
  }, [measure])

  const showToast = useCallback(t => {
    clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  /* ── editor ── */
  const makePill = id => {
    const a = AG[id], sp = document.createElement('span')
    sp.contentEditable = 'false'; sp.dataset.agent = id
    sp.setAttribute('style', `display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px 0 3px;margin:0 1px;border-radius:7px;background:${a.tint};color:${a.ink};font-weight:500;font-size:14px;line-height:1;vertical-align:-5px;white-space:nowrap;user-select:none;cursor:default`)
    const im = document.createElement('img'); im.src = a.src; im.alt = ''
    im.setAttribute('style', 'width:18px;height:18px;border-radius:5px;display:block')
    sp.appendChild(im); sp.appendChild(document.createTextNode('@' + a.handle))
    return sp
  }
  const readEditor = () => {
    const e = edRef.current
    if (!e) return { text: '', agent: null }
    let text = '', agent = null
    const walk = n => n.childNodes.forEach(c => {
      if (c.nodeType === 3) text += c.textContent
      else if (c.dataset && c.dataset.agent) agent = c.dataset.agent
      else if (c.nodeName === 'BR') text += '\n'
      else { if (c.nodeName === 'DIV' && text) text += '\n'; walk(c) }
    })
    walk(e)
    return { text: text.replace(/\u00a0/g, ' '), agent }
  }
  const closePk = () => { setPk(p => (p.open ? { ...p, open: false } : p)); trig.current = null }
  const pkItems = q => {
    q = (q || '').toLowerCase()
    return ORDER.map(id => AG[id]).filter(a => !q || a.handle.includes(q) || a.desc.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
  }
  const detectAt = (node, off) => {
    if (!node || node.nodeType !== 3) { closePk(); return }
    const m = node.textContent.slice(0, off).match(/(^|[\s\u00a0])@([\w-]*)$/)
    if (!m) { closePk(); return }
    const q = m[2], start = off - q.length - 1
    trig.current = { node, start, end: off }
    const w = wrapRef.current
    if (!w) return
    const rr = document.createRange(); rr.setStart(node, start); rr.setEnd(node, start + 1)
    const rc = rr.getBoundingClientRect(), wr = w.getBoundingClientRect()
    setPk(p => {
      if (!p.open || p.q !== q) setPkHi(0)
      return { open: true, q, left: rc.left - wr.left, y: rc.bottom - wr.top, yTop: rc.top - wr.top, wW: wr.width }
    })
    setMenu(false)
  }
  const detect = () => {
    const e = edRef.current, sel = window.getSelection()
    if (!e || !sel || !sel.rangeCount) { closePk(); return }
    const r = sel.getRangeAt(0)
    if (!r.collapsed || !e.contains(r.startContainer)) { closePk(); return }
    detectAt(r.startContainer, r.startOffset)
  }
  const sync = () => {
    const { text, agent } = readEditor(), e = edRef.current
    const isEmpty = !text.trim() && !agent
    if (isEmpty && e && !text.length && e.innerHTML) e.innerHTML = ''
    setEmpty(isEmpty); setPill(agent)
    if (!chat) {
      if (!isEmpty && mode === 'home') { if (colRef.current) colRef.current.scrollTop = 0; setMode('compose') }
      else if (isEmpty && mode === 'compose') setMode('home')
    }
    detect()
  }
  const setParts = parts => {
    const e = edRef.current
    if (!e) return
    e.innerHTML = ''
    parts.forEach(p => e.appendChild(p.pill ? makePill(p.pill) : document.createTextNode(p.t)))
  }
  const caretEnd = () => {
    const e = edRef.current
    if (!e) return
    e.focus()
    const sel = window.getSelection(), r = document.createRange()
    const last = e.lastChild
    if (last && last.nodeType === 3) r.setStart(last, last.textContent.length)
    else { r.selectNodeContents(e); r.collapse(false) }
    r.collapse(true); sel.removeAllRanges(); sel.addRange(r)
  }
  const clearEditor = () => { const e = edRef.current; if (e) e.innerHTML = ''; setEmpty(true); setPill(null); closePk(); setMenu(false) }
  const selectAgent = (id, atEnd) => {
    const e = edRef.current
    if (!e) return
    e.querySelectorAll('[data-agent]').forEach(n => n.remove())
    let after = null
    if (id !== 'auto') {
      const pl = makePill(id), sp = document.createTextNode('\u00a0'), t = trig.current
      if (pk.open && t && e.contains(t.node)) {
        const r = document.createRange()
        r.setStart(t.node, Math.min(t.start, t.node.textContent.length)); r.setEnd(t.node, Math.min(t.end, t.node.textContent.length))
        r.deleteContents(); r.insertNode(sp); r.insertNode(pl)
      } else { e.insertBefore(sp, e.firstChild); e.insertBefore(pl, sp) }
      after = sp
    }
    trig.current = null
    setPk(p => ({ ...p, open: false })); setMenu(false)
    e.focus()
    if (after && !atEnd) { const sel = window.getSelection(), r2 = document.createRange(); r2.setStartAfter(after); r2.collapse(true); sel.removeAllRanges(); sel.addRange(r2) }
    else caretEnd()
    sync()
  }
  const prevNode = r => {
    const e = edRef.current
    let n = r.startContainer, p = null
    if (n.nodeType === 3) { if (r.startOffset > 0) return null; p = n.previousSibling }
    else if (n === e || n.nodeType === 1) p = n.childNodes[r.startOffset - 1]
    while (p && p.nodeType === 3 && !p.textContent.length) p = p.previousSibling
    return p
  }

  const send = () => {
    if (busy || locked) return
    const { text, agent } = readEditor()
    const t = text.trim()
    if (!t) { caretEnd(); return } // a pill alone isn't a request
    stick.current = true
    if (store.send({ text: t, pill: agent })) clearEditor()
  }

  const onEdKey = e => {
    if (pk.open) {
      const its = pkItems(pk.q)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (its.length) setPkHi(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + its.length) % its.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const it = its[pkHi]
        if (it) selectAgent(it.id); else closePk()
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); e.nativeEvent.stopPropagation(); closePk(); return }
    }
    if (e.key === 'Backspace') {
      const sel = window.getSelection()
      if (sel.rangeCount && sel.isCollapsed) {
        const prev = prevNode(sel.getRangeAt(0))
        if (prev && prev.dataset && prev.dataset.agent) { e.preventDefault(); prev.remove(); sync(); return }
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return }
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertText', false, '\n'); return }
    if (e.key === 'Escape' && view === 'compose') { e.preventDefault(); e.nativeEvent.stopPropagation(); setMode('home'); edRef.current.blur() }
  }

  /* ── effects ── */
  // A new chat starts from the home layout with an empty composer.
  const chatId = chat?.id ?? null
  const [prevChatId, setPrevChatId] = useState(chatId)
  if (prevChatId !== chatId) {
    setPrevChatId(chatId)
    if (!chatId) { setMode('home'); setEmpty(true); setPill(null) }
  }
  useEffect(() => {
    stick.current = true
    if (!chatId && edRef.current) edRef.current.innerHTML = ''
  }, [chatId])
  // The sidebar's Create (and ⌘K) bumps focusSignal to put the caret in the composer.
  useEffect(() => {
    const e = edRef.current
    if (!focusSignal || !e) return
    e.focus()
    const r = document.createRange(); r.selectNodeContents(e); r.collapse(false)
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r)
  }, [focusSignal])
  // Keep the thread pinned to the bottom unless the user scrolled up.
  useEffect(() => {
    const t = threadRef.current
    if (t && stick.current) t.scrollTop = t.scrollHeight
  }, [chat?.msgs, dims.cmpH])
  useEffect(() => {
    const onDoc = e => {
      const p = e.target.closest && e.target.closest('[data-pop]')
      if (!(p && p.dataset.pop === 'am')) setMenu(false)
      if (!(p && p.dataset.pop === 'cmp')) setPk(x => (x.open ? { ...x, open: false } : x))
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  /* ── layout (ported from the design's renderVals) ── */
  const H = dims.stageH, cH = dims.cmpH
  const homePad = mobile ? 28 : Math.round(Math.min(128, Math.max(56, H * 0.12)))
  const bp = mobile ? 10 : 18
  const padTop = home ? homePad : view === 'compose' ? Math.max(mobile ? 16 : 24, Math.round((H - cH) / 2 - (mobile ? 12 : 32))) : Math.max(8, H - cH - bp)
  const padX = mobile ? 16 : 40
  const dur = rm ? '0s' : '.34s cubic-bezier(.2,.7,.2,1)'
  const fast = rm ? '0s' : '.2s ease-out'
  const trA = rm ? 'none' : `opacity .2s ease-out ${home ? '.14s' : '.03s'}, transform .2s ease-out ${home ? '.14s' : '.03s'}`
  const trB = rm ? 'none' : `opacity .2s ease-out ${home ? '.2s' : '.07s'}, transform .2s ease-out ${home ? '.2s' : '.07s'}`
  const focused = edFocus
  const cmp = {
    border: focused ? 'rgba(240,102,42,.45)' : 'rgba(28,26,23,.10)',
    shadow: view === 'compose' ? '0 0 0 4px rgba(240,102,42,.08), 0 30px 70px -30px rgba(196,80,30,.38), 0 1px 2px rgba(28,26,23,.04)' : focused ? '0 0 0 4px rgba(240,102,42,.10), 0 1px 2px rgba(28,26,23,.04), 0 24px 48px -24px rgba(196,80,30,.35)' : '0 1px 2px rgba(28,26,23,.04), 0 12px 32px -18px rgba(28,26,23,.18)',
    minH: view === 'compose' ? (mobile ? 140 : 160) : chatMode ? 48 : (mobile ? 76 : 88),
    maxH: view === 'compose' ? Math.round(H * 0.45) : chatMode ? 200 : 340,
    edPad: view === 'compose' ? '10px 18px 6px' : chatMode ? '12px 18px 4px' : '18px 18px 6px',
    phTop: view === 'compose' ? 10 : chatMode ? 12 : 18,
    ph: chat?.limit ? 'This chat has reached its limit' : chatMode ? (mobile ? 'Reply or type @' : 'Reply, or type @ to hand off to another agent') : (mobile ? 'Ask Honne, or type @' : 'Ask Honne what to create. Type @ to pick an agent'),
    hint: view === 'compose' ? '@ agents · ↵ send · esc back' : '↵ send · ⇧↵ new line',
  }
  const cur = pill ? AG[pill] : AG.auto
  const pkIt = pk.open ? pkItems(pk.q) : []
  const pw = Math.min(340, (pk.wW || 600) - 16)
  const pkLeft = Math.max(8, Math.min((pk.wW || 600) - pw - 8, Math.round(pk.left - 16)))
  const greetH = new Date().getHours()
  const greeting = greetH < 12 ? 'Good morning' : greetH < 18 ? 'Good afternoon' : 'Good evening'

  const copy = (text, key) => {
    try { navigator.clipboard.writeText(text) } catch { /* clipboard unavailable */ }
    if (key) { setCopied(key); setTimeout(() => setCopied(c => (c === key ? null : c)), 1500) } else showToast('Copied to clipboard')
  }

  /* ── messages ── */
  const renderMsg = m => {
    if (m.role === 'user') {
      const a = m.agent ? AG[m.agent] : null
      return (
        <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ maxWidth: 'min(560px, 86%)', padding: '11px 15px', borderRadius: '18px 18px 6px 18px', background: '#F6ECE4', border: '1px solid rgba(240,102,42,.13)', fontSize: 15, lineHeight: 1.6, color: '#1C1A17', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {a && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 8px 0 3px', marginRight: 4, borderRadius: 7, background: a.tint, color: a.ink, fontWeight: 500, fontSize: 14, verticalAlign: -5, whiteSpace: 'nowrap' }}>
                <Logo src={a.src} size={18} r={5} /><span>@{a.handle}</span>
              </span>
            )}
            {m.text}
          </div>
        </div>
      )
    }
    const a = AG[m.agent]
    const working = m.status === 'working', done = m.status === 'done', err = m.status === 'error', stopped = m.status === 'stopped'
    const fromHistory = done && !m.time // loaded from the backend: no step details were kept
    const nSrc = m.sources.length
    const kind = m.post ? (m.post.platform === 'x' && m.post.posts.length > 1 ? 'X thread' : KIND[m.post.platform]) : KIND[m.agent]
    const steps = working ? [{ d: IC.pen, label: `Searching your knowledge and drafting ${aKind(KIND[m.agent])}`, active: true }]
      : done ? [...(nSrc ? [{ d: IC.search, label: `Searched your knowledge · ${nSrc} ${nSrc === 1 ? 'doc' : 'docs'} found`, done: true }] : []), { d: IC.pen, label: `Drafted ${aKind(kind)}`, done: true }]
        : [{ d: IC.pen, label: `Drafting ${aKind(KIND[m.agent])}`, failed: err }]
    const open = stepsOpen[m.id] ?? working
    const label = working ? 'Working…' : err ? 'Failed' : stopped ? 'Stopped' : `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`
    const edit = edits[m.id]
    const hov = hoverMsg === m.id
    const iconBtn = { width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 7, background: 'transparent', color: '#77726A', cursor: 'pointer' }
    return (
      <div key={m.id} data-testid="hc-agent-msg" onMouseEnter={() => setHoverMsg(m.id)} onMouseLeave={() => setHoverMsg(h => (h === m.id ? null : h))} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Logo src={a.src} size={24} r={7} />
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>@{a.handle}</span>
          {m.time && <span style={{ fontFamily: MONO, fontSize: 11, color: '#9A958C' }}>{m.time}</span>}
        </div>

        {!fromHistory && (
          <div style={{ maxWidth: 460, border: '1px solid rgba(28,26,23,.08)', borderRadius: 12, background: 'rgba(255,255,255,.65)', overflow: 'hidden' }}>
            <button onClick={() => setStepsOpen(s => ({ ...s, [m.id]: !open }))} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 36, padding: '0 12px', border: 0, background: 'transparent', fontSize: 12.5, color: '#57534C', cursor: 'pointer', textAlign: 'left' }}>
              {working ? <Spin /> : <Svg d={err ? IC.alert : stopped ? IC.stop : IC.check} sw={1.9} color={err ? '#B4441C' : stopped ? '#8A857C' : '#4A8A62'} />}
              <span style={{ fontWeight: 500, whiteSpace: 'nowrap', flex: 'none' }}>{label}</span>
              <span style={{ flex: 1 }} />
              <Svg d="m6 9 6 6 6-6" sw={2} color="#8A857C" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
            </button>
            {open && (
              <div style={{ padding: '2px 12px 12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {steps.map((r, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 7, background: '#F4F1EC', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Svg d={r.d} size={13} sw={1.8} color="#6B665E" /></span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: r.failed ? '#B4441C' : r.active ? '#1C1A17' : '#57534C' }}>{r.label}</span>
                    {r.done && <Svg d="M20 6 9 17l-5-5" sw={2.2} color="#4A8A62" />}
                    {r.active && <Spin />}
                    {r.failed && <Svg d="M18 6 6 18M6 6l12 12" sw={2.2} color="#B4441C" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {done && m.note && <div data-testid="hc-note" style={{ fontSize: 15, lineHeight: 1.68, color: '#2A2723', textWrap: 'pretty', maxWidth: 680, whiteSpace: 'pre-wrap' }}>{m.note}</div>}
        {stopped && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#8A857C' }}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="#8A857C"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            Stopped. Send a message to continue, or retry.
          </div>
        )}

        {done && nSrc > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {m.sources.map((s, i) => {
              const Tag = s.url ? 'a' : 'div'
              return (
                <Tag key={s.document_id} {...(s.url ? { href: s.url, target: '_blank', rel: 'noreferrer' } : {})} data-testid="hc-source" className="hc-src" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 260, padding: '8px 12px 8px 8px', border: '1px solid rgba(28,26,23,.09)', borderRadius: 10, background: '#FFFFFF', transition: 'border-color .15s', textDecoration: 'none', color: '#1C1A17' }}>
                  <span style={{ width: 28, height: 28, borderRadius: 7, background: '#F4F1EC', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: '#6B665E' }}><Svg d={IC.doc} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#8A857C' }}>{s.url && s.url.includes('google.com') ? 'Google Drive' : 'Your knowledge'}</span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: '#8A857C', marginLeft: 2 }}>{i + 1}</span>
                </Tag>
              )
            })}
          </div>
        )}

        {done && m.post && (
          <PostCard
            post={m.post} displayName={displayName} initials={initials} edit={edit}
            onEditChange={d => setEdits(x => ({ ...x, [m.id]: d }))}
            onEdit={() => {
              if (!edit) { setEdits(x => ({ ...x, [m.id]: { ...m.post } })); return }
              const changed = draftText(edit) !== draftText(m.post)
              if (changed) store.patchMsg(chat.id, m.id, { post: { ...edit, edited: true } })
              setEdits(x => { const n = { ...x }; delete n[m.id]; return n })
            }}
            onCopy={() => copy(draftText(edit || m.post), m.id)} copied={copied === m.id}
            canRegen={!busy && !locked}
            onRegen={() => { if (!busy && !locked) { stick.current = true; store.send({ text: 'Try a different angle', pill: m.agent }) } }}
          />
        )}

        {err && (
          <div data-testid="hc-error" role="alert" style={{ maxWidth: 560, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px 12px', padding: '12px 12px 12px 14px', borderRadius: 12, background: '#FBF0EA', border: '1px solid rgba(196,80,30,.2)' }}>
            <Svg d={IC.alert} size={16} sw={1.9} color="#B4441C" />
            <span style={{ flex: '1 1 260px', fontSize: 13.5, lineHeight: 1.5, color: '#5A2A16', textWrap: 'pretty' }}>{m.error} Nothing was posted.</span>
            <button data-testid="hc-retry" onClick={() => store.retry(m.id)} className="hc-warm" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', border: '1px solid rgba(196,80,30,.25)', borderRadius: 8, background: '#FFFFFF', fontSize: 12.5, fontWeight: 500, color: '#1C1A17', cursor: 'pointer' }}>
              <Svg d={IC.regen} size={13} sw={2} />Retry
            </button>
          </div>
        )}

        {(done || err || stopped) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 28, marginTop: -4, opacity: hov || mobile ? 1 : 0, transition: 'opacity .15s' }}>
            <button onClick={() => copy([m.note, draftText(m.post)].filter(Boolean).join('\n\n') || m.error || '')} title="Copy" className="hc-ib" style={iconBtn}><Svg d={IC.copy} /></button>
            {done && <>
              <button onClick={() => setFb(f => ({ ...f, [m.id]: f[m.id] === 'up' ? null : 'up' }))} title="Good response" className="hc-ib" style={{ ...iconBtn, color: fb[m.id] === 'up' ? '#F0662A' : '#77726A' }}><Svg d={IC.up} fill={fb[m.id] === 'up' ? 'rgba(240,102,42,.18)' : 'none'} /></button>
              <button onClick={() => setFb(f => ({ ...f, [m.id]: f[m.id] === 'down' ? null : 'down' }))} title="Bad response" className="hc-ib" style={{ ...iconBtn, color: fb[m.id] === 'down' ? '#1C1A17' : '#77726A' }}><Svg d={IC.down} fill={fb[m.id] === 'down' ? 'rgba(28,26,23,.12)' : 'none'} /></button>
            </>}
            {stopped && <button onClick={() => store.retry(m.id)} title="Retry" className="hc-ib" style={iconBtn}><Svg d={IC.regen} /></button>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={stageRef} className="hc" style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      <style>{`
        @keyframes hc-spin { to { transform: rotate(360deg); } }
        .hc .hc-ib:hover { background: rgba(28,26,23,.06) !important; color: #1C1A17 !important; }
        .hc .hc-tb:hover:not(:disabled) { background: rgba(28,26,23,.05) !important; }
        .hc .hc-chip:hover { background: #FFFFFF !important; border-color: rgba(28,26,23,.18) !important; }
        .hc .hc-plat:hover { transform: translateY(-3px); box-shadow: 0 22px 48px -26px rgba(28,26,23,.35) !important; }
        .hc .hc-row:hover { background: #F5F3EF !important; }
        .hc .hc-dark:hover { background: #35312B !important; }
        .hc .hc-src:hover { border-color: rgba(240,102,42,.5) !important; }
        .hc .hc-warm:hover { background: #FFF8F4 !important; }
      `}</style>

      {/* aura */}
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 560, overflow: 'hidden', pointerEvents: 'none', opacity: home ? 1 : view === 'compose' ? 0.4 : 0.28, transition: 'opacity .45s ease' }}>
        <div style={{ position: 'absolute', left: '50%', top: -220, width: 720, height: 520, marginLeft: -520, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(246,161,91,.42), rgba(246,161,91,0))', filter: 'blur(20px)' }} />
        <div style={{ position: 'absolute', left: '50%', top: -260, width: 680, height: 520, marginLeft: -80, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(111,167,179,.34), rgba(111,167,179,0))', filter: 'blur(20px)' }} />
        <div style={{ position: 'absolute', left: '50%', top: -120, width: 420, height: 320, marginLeft: -260, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(240,102,42,.22), rgba(240,102,42,0))', filter: 'blur(24px)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(248,247,244,0) 40%, #F8F7F4 100%)' }} />
      </div>

      {/* thread */}
      <div ref={threadRef} onScroll={e => { const t = e.currentTarget; stick.current = t.scrollHeight - t.scrollTop - t.clientHeight < 80 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: cH + bp, overflowY: 'auto', zIndex: 2, opacity: chatMode ? 1 : 0, pointerEvents: chatMode ? 'auto' : 'none', transition: 'opacity .3s ease .1s' }}>
        <div style={{ maxWidth: 760 + padX * 2, margin: '0 auto', padding: `32px ${padX}px 28px`, display: 'flex', flexDirection: 'column', gap: 28 }}>
          {chat?.loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#77726A' }}><Spin />Loading chat…</div>}
          {chat?.loadError && <div role="alert" style={{ fontSize: 13.5, color: '#9C3F17' }}>{chat.loadError}</div>}
          {chat && chat.msgs.map(renderMsg)}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: cH + bp, height: 28, background: 'linear-gradient(180deg, rgba(248,247,244,0), #F8F7F4)', pointerEvents: 'none', zIndex: 2, opacity: chatMode ? 1 : 0 }} />

      {/* column: header, composer, suggestions */}
      <div ref={colRef} style={{ position: 'absolute', inset: 0, overflowY: home ? 'auto' : 'hidden', overflowX: 'hidden', pointerEvents: home ? 'auto' : 'none', zIndex: 3 }}>
        <div style={{ position: 'relative', maxWidth: home ? 760 : 840, margin: '0 auto', padding: `${padTop}px ${padX}px 72px`, transition: `padding-top ${dur}, max-width ${dur}` }}>

          <div style={{ height: home ? (dims.hdrH ? dims.hdrH : 'auto') : 0, overflow: 'hidden', opacity: home ? 1 : 0, transform: home ? 'none' : 'translateY(-14px)', transition: `height ${dur}, opacity ${fast}, transform ${fast}` }}>
            <div ref={hdrRef} style={{ paddingBottom: 30 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 26, padding: '0 10px 0 8px', borderRadius: 999, background: 'rgba(255,255,255,.7)', border: '1px solid rgba(28,26,23,.07)', fontSize: 12, color: '#57534C', marginBottom: 18, whiteSpace: 'nowrap' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: kb.anyConnected ? '#4A8A62' : '#C9C3B8' }} />{kb.statusLine}
              </div>
              <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: mobile ? 38 : 52, lineHeight: 1.02, fontWeight: 400, letterSpacing: '-0.03em', color: '#1C1A17' }}>
                {greeting}, <span style={{ fontStyle: 'italic', color: '#C4501E' }}>{displayName}.</span>
              </h1>
              <p style={{ margin: '8px 0 0', fontSize: 16, lineHeight: 1.5, color: '#6B665E' }}>What are you creating today?</p>
            </div>
          </div>

          <div ref={wrapRef} data-pop="cmp" style={{ position: 'relative', zIndex: 6, pointerEvents: 'auto' }}>
            {chat?.limit && (
              <div data-testid="hc-limit" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 10px', marginBottom: 10, padding: '8px 8px 8px 14px', borderRadius: 12, background: '#FBF3EA', border: '1px solid rgba(240,102,42,.2)' }}>
                <Svg d={IC.clock} size={15} color="#C4501E" />
                <span style={{ flex: '1 1 240px', fontSize: 13, color: '#57534C', textWrap: 'pretty' }}>This chat has reached its message limit. Start a new chat to keep going.</span>
                <button onClick={store.newChat} className="hc-dark" style={{ height: 30, padding: '0 12px', border: 0, borderRadius: 8, background: '#1C1A17', color: '#FAF9F7', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>New chat</button>
              </div>
            )}

            <div onMouseDown={e => { if (locked || e.target.closest('button') || e.target.closest('[contenteditable="true"]')) return; e.preventDefault(); caretEnd() }}
              style={{ background: '#FFFFFF', border: `1px solid ${cmp.border}`, borderRadius: 18, boxShadow: cmp.shadow, transition: 'border-color .25s ease, box-shadow .3s ease', cursor: locked ? 'default' : 'text', opacity: locked ? 0.7 : 1 }}>
              <div style={{ height: view === 'compose' ? 34 : 0, overflow: 'hidden', transition: `height ${dur}` }}>
                <div style={{ padding: '12px 16px 0', display: 'flex' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 22, padding: '0 9px 0 7px', borderRadius: 999, background: '#F6F4F0', border: '1px solid rgba(28,26,23,.06)', fontSize: 11.5, color: '#57534C', whiteSpace: 'nowrap', opacity: view === 'compose' ? 1 : 0, transform: view === 'compose' ? 'none' : 'translateY(-26px) scale(1.12)', transformOrigin: 'left center', transition: `opacity .25s ease .1s, transform ${dur}` }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: kb.anyConnected ? '#4A8A62' : '#C9C3B8' }} />{kb.statusLine}
                  </span>
                </div>
              </div>
              <div style={{ position: 'relative' }}>
                <div
                  ref={edRef} data-testid="hc-input" contentEditable={!locked} suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Message Honne"
                  onInput={sync} onKeyDown={onEdKey}
                  onKeyUp={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) detect() }}
                  onClick={detect} onFocus={() => setEdFocus(true)} onBlur={() => setEdFocus(false)}
                  onPaste={e => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')) }}
                  style={{ minHeight: cmp.minH, maxHeight: cmp.maxH, overflowY: 'auto', padding: cmp.edPad, outline: 0, fontSize: 15, lineHeight: 1.6, color: '#1C1A17', whiteSpace: 'pre-wrap', wordBreak: 'break-word', transition: `min-height ${dur}, padding ${dur}` }}
                />
                {empty && (
                  <div style={{ position: 'absolute', left: 18, right: 18, top: cmp.phTop, pointerEvents: 'none', color: '#9A958C', fontSize: 15, lineHeight: 1.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cmp.ph}</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px 10px 10px' }}>
                <button onClick={onOpenKnowledge} title="Knowledge Honne uses" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 9px', border: '1px solid rgba(28,26,23,.09)', borderRadius: 8, background: '#FFFFFF', color: '#3D3933', fontSize: 12.5, cursor: 'pointer', flex: 'none', whiteSpace: 'nowrap' }} className="hc-chip">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: kb.anyConnected ? '#4A8A62' : '#C9C3B8', flex: 'none' }} />
                  {!mobile && <span style={{ color: '#77726A' }}>Knowledge</span>}
                  <span style={{ fontWeight: 500 }}>{kb.kLabel}</span>
                </button>
                <button data-pop="am" disabled={locked} onClick={() => { setMenu(x => !x); closePk() }} title="Agent" className="hc-tb" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 8px 0 6px', border: 0, borderRadius: 8, background: menu ? 'rgba(28,26,23,.05)' : 'transparent', color: '#3D3933', fontSize: 12.5, cursor: 'pointer', flex: 'none', whiteSpace: 'nowrap' }}>
                  <Logo src={cur.src} size={18} r={5} />
                  <span style={{ fontWeight: 500 }}>{pill ? '@' + cur.handle : 'Auto'}</span>
                  <Svg d="m6 9 6 6 6-6" size={13} sw={2} color="#8A857C" />
                </button>
                <div style={{ flex: 1 }} />
                {!mobile && <span style={{ fontFamily: MONO, fontSize: 11, color: '#9A958C', whiteSpace: 'nowrap', marginRight: 6 }}>{cmp.hint}</span>}
                {busy ? (
                  <button data-testid="hc-stop" onClick={store.stop} title="Stop" className="hc-dark" style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 9, background: '#1C1A17', color: '#FFFFFF', cursor: 'pointer', flex: 'none' }}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3" /></svg>
                  </button>
                ) : (
                  <button data-testid="hc-send" onClick={send} disabled={locked} title="Send (↵)" style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 9, background: empty || locked ? '#ECE9E3' : '#F0662A', color: empty || locked ? '#A8A298' : '#FFFFFF', cursor: empty || locked ? 'default' : 'pointer', flex: 'none', transition: 'background .15s,color .15s' }}>
                    <Svg d="m5 12 7-7 7 7M12 19V5" size={16} sw={2} />
                  </button>
                )}
              </div>
            </div>

            {pk.open && (
              <div onMouseDown={e => e.preventDefault()} style={{ position: 'absolute', left: pkLeft, top: chatMode ? 'auto' : Math.round(pk.y + 8), bottom: chatMode ? Math.round(cH - pk.yTop + 6) : 'auto', width: pw, background: '#FFFFFF', border: '1px solid rgba(28,26,23,.10)', borderRadius: 14, boxShadow: '0 18px 44px -18px rgba(28,26,23,.32), 0 2px 6px rgba(28,26,23,.05)', padding: 6, zIndex: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 6px 10px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#3D3933' }}>Agents</span>
                  {!mobile && <span style={{ fontFamily: MONO, fontSize: 10.5, color: '#9A958C' }}>↑↓ move · ↵ select · esc</span>}
                </div>
                {pkIt.map((a, i) => (
                  <div key={a.id} data-testid="hc-picker-item" onMouseEnter={() => setPkHi(i)} onClick={() => selectAgent(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 9, background: i === pkHi ? '#F4F1EC' : 'transparent', cursor: 'pointer', transition: 'background .08s' }}>
                    <Logo src={a.src} size={30} r={8} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>@{hl(a.handle, pk.q).map((h, k) => <span key={k} style={{ background: h.on ? 'rgba(240,102,42,.16)' : 'transparent', color: h.on ? '#B4441C' : 'inherit', borderRadius: 3 }}>{h.t}</span>)}</div>
                      <div style={{ fontSize: 12, color: '#77726A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{hl(a.desc, pk.q).map((h, k) => <span key={k} style={{ background: h.on ? 'rgba(240,102,42,.16)' : 'transparent', color: h.on ? '#B4441C' : 'inherit', borderRadius: 3 }}>{h.t}</span>)}</div>
                    </div>
                    <span style={{ height: 20, display: 'flex', alignItems: 'center', padding: '0 7px', borderRadius: 999, background: '#F1EEE9', color: '#6B665E', fontSize: 10.5, fontWeight: 500, flex: 'none' }}>{a.tag}</span>
                  </div>
                ))}
                {!pkIt.length && (
                  <div style={{ padding: '14px 10px 16px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>No agent called &lsquo;@{pk.q}&rsquo;</div>
                    <div style={{ fontSize: 12.5, color: '#77726A', marginTop: 3 }}>Honne has LinkedIn, Reddit and X agents for now.</div>
                  </div>
                )}
                <div style={{ margin: '4px 2px 0', padding: '4px 0 0', borderTop: '1px solid rgba(28,26,23,.07)' }}>
                  <button onClick={() => { closePk(); showToast('Custom agents are coming soon') }} className="hc-row" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 34, padding: '0 8px', border: 0, borderRadius: 8, background: 'transparent', fontSize: 13, fontWeight: 500, color: '#3D3933', cursor: 'pointer', textAlign: 'left' }}>
                    <Svg d="M12 5v14M5 12h14" sw={2} />Create an agent
                  </button>
                </div>
              </div>
            )}

            {menu && (
              <div data-pop="am" onMouseDown={e => e.preventDefault()} style={{ position: 'absolute', left: mobile ? 10 : 160, top: chatMode ? 'auto' : 'calc(100% + 8px)', bottom: chatMode ? 52 : 'auto', width: 300, maxWidth: 'calc(100% - 20px)', background: '#FFFFFF', border: '1px solid rgba(28,26,23,.10)', borderRadius: 12, boxShadow: '0 16px 40px -16px rgba(28,26,23,.28), 0 2px 6px rgba(28,26,23,.05)', padding: 6, zIndex: 30 }}>
                {['auto', ...ORDER].map(id => {
                  const a = AG[id], on = (pill || 'auto') === id
                  return (
                    <div key={id} onClick={() => selectAgent(id, true)} className="hc-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 8, background: on ? '#F7F5F1' : 'transparent', cursor: 'pointer' }}>
                      <Logo src={a.src} size={24} r={6} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{id === 'auto' ? 'Auto' : '@' + a.handle}</div>
                        <div style={{ fontSize: 11.5, color: '#77726A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{id === 'auto' ? (chat ? `Keeps @${chat.agent}` : 'Starts with @linkedin') : a.desc}</div>
                      </div>
                      <Svg d="M20 6 9 17l-5-5" sw={2.2} color="#F0662A" style={{ opacity: on ? 1 : 0 }} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <section style={{ marginTop: 26, opacity: home ? 1 : 0, transform: home ? 'none' : 'translateY(-16px)', pointerEvents: home ? 'auto' : 'none', transition: trA }}>
            <div style={{ fontSize: 12.5, color: '#77726A', marginBottom: 10 }}>Try asking Honne</div>
            <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', flexWrap: 'wrap', gap: 8 }}>
              {CHIPS.map(c => (
                <button key={c.label} onClick={() => { setParts([{ t: c.text }]); sync(); setTimeout(caretEnd, 30) }} className="hc-chip" style={{ display: 'flex', alignItems: 'center', gap: 8, height: mobile ? 44 : 34, padding: '0 12px 0 11px', border: '1px solid rgba(28,26,23,.10)', borderRadius: 9, background: 'rgba(255,255,255,.45)', fontSize: 13, color: '#3D3933', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <Svg d={c.d} size={15} color="#8A857C" />{c.label}
                </button>
              ))}
            </div>
          </section>

          <section style={{ marginTop: 36, opacity: home ? 1 : 0, transform: home ? 'none' : 'translateY(-22px)', pointerEvents: home ? 'auto' : 'none', transition: trB }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 13.5, fontWeight: 600 }}>Create for a platform</h2>
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: 12 }}>
              {PLATS.map(p => (
                <button key={p.id} onClick={() => selectAgent(p.id, true)} className="hc-plat" style={{ position: 'relative', minHeight: 168, display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 16, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', color: '#1C1A17', background: 'rgba(255,255,255,.55)', backdropFilter: 'blur(18px) saturate(160%)', WebkitBackdropFilter: 'blur(18px) saturate(160%)', border: '1px solid rgba(255,255,255,.75)', boxShadow: '0 1px 2px rgba(28,26,23,.04), 0 10px 28px -20px rgba(28,26,23,.25)', transition: 'transform .25s cubic-bezier(.2,.7,.2,1), box-shadow .3s' }}>
                  <Logo src={AG[p.id].src} size={38} r={11} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 22, lineHeight: 1.1, letterSpacing: '-0.01em' }}>{p.title}</div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.45, color: '#6B665E', textWrap: 'pretty' }}>{p.desc}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#77726A' }}>
                    <span>Start with @{AG[p.id].handle}</span><Svg d="M5 12h14m-7-7 7 7-7 7" size={13} sw={2} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {toast && (
        <div style={{ position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 80, display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 14px', borderRadius: 10, background: '#1C1A17', color: '#FAF9F7', fontSize: 13, boxShadow: '0 12px 30px -12px rgba(28,26,23,.5)', whiteSpace: 'nowrap' }}>
          <Svg d="M20 6 9 17l-5-5" sw={2.2} color="#F0662A" />{toast}
        </div>
      )}
    </div>
  )
}
