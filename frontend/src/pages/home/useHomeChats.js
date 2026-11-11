import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import {
  agentErrorMessage, generateRedditPost, generateXPost, getLinkedInThread, listLinkedInThreads, sendLinkedInMessage,
} from '../../api/independentAgents'

/* ─── Home chat store ("Honne Chat" design) ──────────────────────────────────
   One chat can hand off between agents with @. Each turn goes to a real
   independent-agent endpoint:
   - @linkedin is threaded: the chat keeps the LinkedIn thread id (`liThread`)
     and the server holds the conversation. Those threads are the recent chats
     listed after a reload.
   - @reddit and @x are stateless: the latest draft in the chat goes along as
     `extra_context`, so follow-ups revise it and hand-offs adapt it.
   Nothing is saved to posts. */

const EXTRA_MAX = { reddit: 40_800, x: 8_000 } // backend Field limits on extra_context
const LI_MESSAGE_MAX = 8_000
const LABEL = { linkedin: 'LinkedIn', reddit: 'Reddit', x: 'X' }

let seq = 0
const uid = p => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`
const fmtTime = d => (d ? new Date(d) : new Date()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const titleOf = t => (t.length > 40 ? t.slice(0, 38).trimEnd() + '…' : t)

/** Plain text of a draft, for copying and for handing to another agent. */
export const draftText = p => {
  if (!p) return ''
  if (p.platform === 'x') return p.posts.join('\n\n')
  if (p.platform === 'reddit') return `${p.title}\n\n${p.body}`
  return p.body
}

/** The newest draft in a chat, before `beforeId` when given. */
function lastDraft(chat, beforeId) {
  const end = beforeId ? chat.msgs.findIndex(m => m.id === beforeId) : chat.msgs.length
  for (let i = (end < 0 ? chat.msgs.length : end) - 1; i >= 0; i--) {
    const m = chat.msgs[i]
    if (m.role === 'agent' && m.post) return m.post
  }
  return null
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) : s)

async function runAgent(agent, text, chat, prior, signal) {
  if (agent === 'linkedin') {
    // The thread already holds LinkedIn's own drafts; anything else (another
    // agent's draft, or the user's edits) has to travel with the message.
    const handoff = prior && (prior.platform !== 'linkedin' || prior.edited)
      ? `\n\nCurrent draft${prior.platform === 'linkedin' ? ' (edited by me)' : ` (from ${LABEL[prior.platform]})`}:\n${draftText(prior)}`
      : ''
    const res = await sendLinkedInMessage({ message: clip(text + handoff, LI_MESSAGE_MAX), thread_id: chat.liThread }, { signal })
    return { post: { platform: 'linkedin', body: res.content }, note: res.note, sources: res.sources || [], thread: res.thread }
  }
  if (agent === 'reddit') {
    const req = { topic: text }
    if (prior?.platform === 'reddit') {
      req.subreddit = prior.sub
      req.extra_context = `Revise this current draft according to the request above.\n\nTitle: ${prior.title}\n\n${prior.body}`
    } else if (prior) {
      req.extra_context = `Adapt this ${LABEL[prior.platform]} draft for Reddit according to the request above.\n\n${draftText(prior)}`
    }
    if (req.extra_context) req.extra_context = clip(req.extra_context, EXTRA_MAX.reddit)
    const res = await generateRedditPost(req, { signal })
    const sub = (res.suggested_subreddit || prior?.sub || '').replace(/^r\//, '')
    return { post: { platform: 'reddit', title: res.title, body: res.content, sub }, note: res.note, sources: res.sources || [] }
  }
  const req = { topic: text, thread: /\bthread\b/i.test(text) || (prior?.platform === 'x' && prior.posts.length > 1) }
  if (prior) {
    req.extra_context = clip(prior.platform === 'x'
      ? `Revise this current draft according to the request above.\n\n${prior.posts.join('\n\n')}`
      : `Adapt this ${LABEL[prior.platform]} draft for X according to the request above.\n\n${draftText(prior)}`, EXTRA_MAX.x)
  }
  const res = await generateXPost(req, { signal })
  return { post: { platform: 'x', posts: res.posts }, note: res.note, sources: res.sources || [] }
}

const remoteChat = t => ({
  id: 'li-' + t.id, liThread: t.id, agent: 'linkedin', title: t.title || 'Untitled chat',
  msgs: [], loaded: false, loading: false, limit: false, lastAt: t.last_message_at,
})

export function useHomeChats() {
  const [chats, setChats] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [historyError, setHistoryError] = useState(null)
  const chatsRef = useRef(chats)
  const ctrls = useRef(new Map()) // agent message id → AbortController
  const alive = useRef(true)

  useEffect(() => { chatsRef.current = chats })
  useEffect(() => {
    alive.current = true
    const live = ctrls.current
    return () => { alive.current = false; live.forEach(c => c.abort()) }
  }, [])

  const upd = useCallback((id, fn) => setChats(cs => cs.map(c => (c.id === id ? fn(c) : c))), [])
  const patchMsg = useCallback((chatId, msgId, o) => upd(chatId, c => ({
    ...c, msgs: c.msgs.map(m => (m.id === msgId ? { ...m, ...(typeof o === 'function' ? o(m) : o) } : m)),
  })), [upd])

  // LinkedIn threads are the only chats the backend keeps. Chats started
  // before the list arrives stay on top, and a thread already open isn't listed twice.
  useEffect(() => {
    listLinkedInThreads()
      .then(ts => {
        if (!alive.current) return
        setChats(cs => {
          const have = new Set(cs.map(c => c.liThread).filter(Boolean))
          return [...cs, ...ts.filter(t => !have.has(t.id)).map(remoteChat)]
        })
      })
      .catch(err => { if (alive.current) setHistoryError(agentErrorMessage(err)) })
  }, [])

  const open = useCallback(id => {
    setActiveId(id)
    const chat = chatsRef.current.find(c => c.id === id)
    if (!chat || chat.loaded || chat.loading) return
    upd(id, c => ({ ...c, loading: true }))
    getLinkedInThread(chat.liThread)
      .then(d => {
        const msgs = d.messages.map(m => (m.role === 'user'
          ? { id: uid('u'), role: 'user', agent: null, text: m.content }
          : { id: uid('a'), role: 'agent', agent: 'linkedin', status: 'done', time: null, note: m.note, sources: [], post: { platform: 'linkedin', body: m.content } }))
        upd(id, c => ({ ...c, msgs, title: d.title || c.title, loaded: true, loading: false, limit: d.thread.limit_reached }))
      })
      .catch(err => upd(id, c => ({ ...c, loading: false, loadError: agentErrorMessage(err) })))
  }, [upd])

  const newChat = useCallback(() => setActiveId(null), [])

  // Runs one agent turn into an agent message (new, or a retry). `chat` is a
  // snapshot that already contains that message.
  const run = useCallback(async (chat, msgId) => {
    const chatId = chat.id
    const msg = chat.msgs.find(m => m.id === msgId)
    if (!msg) return
    const ctrl = new AbortController()
    ctrls.current.set(msgId, ctrl)
    try {
      const out = await runAgent(msg.agent, msg.request, chat, lastDraft(chat, msgId), ctrl.signal)
      if (!alive.current) return
      patchMsg(chatId, msgId, { status: 'done', time: fmtTime(), post: out.post, note: out.note, sources: out.sources, error: null })
      upd(chatId, c => ({
        ...c, agent: msg.agent, lastAt: new Date().toISOString(),
        ...(out.thread ? { liThread: out.thread.thread_id, limit: out.thread.limit_reached } : {}),
      }))
    } catch (err) {
      if (!alive.current) return
      if (axios.isCancel(err)) patchMsg(chatId, msgId, { status: 'stopped' })
      else patchMsg(chatId, msgId, { status: 'error', error: agentErrorMessage(err) })
    } finally {
      ctrls.current.delete(msgId)
    }
  }, [patchMsg, upd])

  /** Sends one message. `pill` is the agent picked with @ (null for Auto). */
  const send = useCallback(({ text, pill }) => {
    const cur = chatsRef.current.find(c => c.id === activeId)
    if (cur && (cur.limit || cur.msgs.some(m => m.status === 'working'))) return false
    const agent = pill || cur?.agent || 'linkedin'
    const u = { id: uid('u'), role: 'user', agent: pill, text }
    const a = { id: uid('a'), role: 'agent', agent, status: 'working', time: fmtTime(), request: text, sources: [] }
    let snap
    if (cur) {
      snap = { ...cur, msgs: [...cur.msgs, u, a] }
      upd(cur.id, c => ({ ...c, msgs: [...c.msgs, u, a] }))
    } else {
      snap = { id: uid('c'), liThread: null, agent, title: titleOf(text), msgs: [u, a], loaded: true, loading: false, limit: false, lastAt: new Date().toISOString() }
      setChats(cs => [snap, ...cs])
      setActiveId(snap.id)
    }
    run(snap, a.id)
    return true
  }, [activeId, run, upd])

  const stop = useCallback(() => {
    const cur = chatsRef.current.find(c => c.id === activeId)
    const m = cur?.msgs.find(x => x.status === 'working')
    if (m) ctrls.current.get(m.id)?.abort()
  }, [activeId])

  const retry = useCallback(msgId => {
    const cur = chatsRef.current.find(c => c.id === activeId)
    if (!cur || cur.limit || cur.msgs.some(m => m.status === 'working')) return
    patchMsg(cur.id, msgId, { status: 'working', time: fmtTime(), error: null })
    run(cur, msgId)
  }, [activeId, patchMsg, run])

  const active = chats.find(c => c.id === activeId) || null
  const recent = [...chats].sort((x, y) => (y.lastAt || '').localeCompare(x.lastAt || ''))
  return { chats: recent, active, activeId, historyError, open, newChat, send, stop, retry, patchMsg }
}
