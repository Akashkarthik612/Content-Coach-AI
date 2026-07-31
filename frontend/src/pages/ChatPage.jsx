import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, ChevronDown, Check, Copy, RotateCcw,
  ArrowLeft, Clock, Send, X, ThumbsUp, MessageCircle, Repeat2, PanelLeft, ExternalLink,
} from 'lucide-react';
import { streamQuery, resumeAI, refineAI, getSessionThreads, getSessions } from '../api/ai';
import { publishToLinkedIn, getLinkedInStatus, getLinkedInAuthUrl } from '../api/linkedin';
import { getVersions } from '../api/vault';
import { getProfile } from '../api/profile';
import HonneSidebar, { iconBtn } from '../components/shared/HonneSidebar';

/* ────────────────────────────────────────────────────────────────────────
   Design tokens — ported 1:1 from the "Honne Chat v3" design (Claude Design
   project ff122375-c3bc-4438-aece-706b0bd557b0, `Honne Chat v3.dc.html`).
   Colors/fonts/sizes/radii match the source file's own inline styles; the
   trace/steps mechanism there was driven by a fake timer and raw agent/tool
   names — here it's driven by the real `activity` SSE events from
   backend/ai/activity.py, which already carry only user-facing semantic
   labels (never a node or tool name, never a URL).
   ──────────────────────────────────────────────────────────────────────── */
const BG        = '#F4F2EA';
const SIDEBAR_BG = '#EFEDE3';
const INK       = '#1B1C14';
const ACCENT    = '#14663B';
const MUTED     = '#6C7064';
const MUTED_2   = '#8A8C7C';
const MUTED_3   = '#A6A895';
const HAIRLINE  = 'rgba(27,28,20,.09)';
const DANGER    = '#B42318';
const LI_BLUE   = '#0A66C2';
const FONT   = "'Geist', system-ui, sans-serif";
const SANS   = FONT;
const MONO   = "'JetBrains Mono', monospace";

const KEYFRAMES = `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
@keyframes ccRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ccFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ccBreathe { 0%,100% { opacity: .55; transform: scale(.82); } 50% { opacity: 1; transform: scale(1); } }
@keyframes ccCaret { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { *{ animation-duration: .001ms !important; } }
`;

/* Inline LinkedIn glyph — used on the angle card's primary action, matching
   the design's brand-colored draft button (no icon package ships this mark). */
function LinkedInGlyph({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.44-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function greetingPeriod() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function humanizeProvokes(type) {
  if (type === 'long-dwell') return 'Long dwell';
  if (type === 'comment') return 'Comment';
  if (type === 'share') return 'Share';
  return type || '';
}

let _seq = 1;
const nextId = () => _seq++;

function relativeTimeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ────────────────────────────────────────────────────────────────────────
   Rehydration — maps one backend ThreadStateResponse (GET /sessions/{id}/threads)
   back into the [userMsg, aiMsg] pair MessageBubble already knows how to
   render. Mirrors send()'s onDone branching (angles / draft / direct), plus
   approval_status so an already-approved/edited/declined draft shows the
   right decision badge instead of live Approve/Decline buttons.
   ──────────────────────────────────────────────────────────────────────── */
function threadToMessages(t) {
  const userMsg = { id: nextId(), role: 'user', text: t.user_prompt };
  const aiId = nextId();
  const base = {
    id: aiId, role: 'ai', phase: 'done', text: '', activities: [], traceOpen: false,
    angles: [], summary: '', expandingIndex: -1, pickingIndex: -1, modifyingIndex: -1, expandedSections: {},
    decision: null, postId: t.post_id || '', threadId: t.thread_id,
    copied: false, error: '', userPrompt: t.user_prompt,
    answerNote: '',
  };

  if (t.status === 'awaiting_angle_selection') {
    // Only the LATEST expand/modify revision survives a reload (thread_state.py
    // surfaces the current interrupt payload, not a full edit history) — same
    // limitation as human_approval_node's draft editing having no version history.
    const expandedSections = t.expanded_angle_id != null && t.expanded_sections?.length
      ? { [t.expanded_angle_id]: t.expanded_sections }
      : {};
    return [userMsg, { ...base, kind: 'angles', angles: t.angles || [], summary: t.summary || '', expandedSections }];
  }
  if (t.status === 'awaiting_approval') {
    return [userMsg, { ...base, kind: 'draft', text: t.draft || '' }];
  }
  // complete
  if (t.draft) {
    const decisionMap = { approved: 'approved', edited: 'edited', rejected: 'declined' };
    return [userMsg, { ...base, kind: 'draft', text: t.draft, decision: decisionMap[t.approval_status] || null }];
  }
  return [userMsg, { ...base, kind: 'direct', text: t.answer || '' }];
}

/* ────────────────────────────────────────────────────────────────────────
   Activity timeline — the only place that turns backend `activity` events
   into UI. Flat, id-keyed, upserted in place; nested via parentId. Never
   renders a node/tool/agent name — only whatever title the backend sent.
   ──────────────────────────────────────────────────────────────────────── */
function upsertActivity(activities, evt) {
  const idx = activities.findIndex(a => a.id === evt.id);
  if (idx === -1) return [...activities, evt];
  const next = activities.slice();
  next[idx] = { ...next[idx], ...evt };
  return next;
}

function ActivityRow({ activity, nested }) {
  const running = activity.status === 'running';
  const done = activity.status === 'completed';
  const failed = activity.status === 'failed';
  return (
    <div style={{ display: 'flex', gap: 10, paddingLeft: nested ? 22 : 0, animation: 'ccRise .3s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 14px', paddingTop: 3 }}>
        {running && (
          <span style={{ position: 'relative', width: 8, height: 8, flex: '0 0 8px' }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: ACCENT, animation: 'ccBreathe 1.3s ease-in-out infinite' }} />
          </span>
        )}
        {done && <Check size={13} color="#2FA35B" strokeWidth={2.6} />}
        {failed && <X size={13} color={DANGER} strokeWidth={2.4} />}
        {!running && !done && !failed && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'rgba(27,28,20,.15)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: nested ? 500 : 600, color: INK, letterSpacing: '-.005em' }}>{activity.title}</span>
        {activity.description && (
          <div style={{ fontSize: 12, color: MUTED_2, marginTop: 2 }}>{activity.description}</div>
        )}
      </div>
    </div>
  );
}

function ActivityTimeline({ activities, expanded, onToggle, phaseDone }) {
  if (activities.length === 0) return null;
  const roots = activities.filter(a => !a.parentId);
  const childrenOf = (id) => activities.filter(a => a.parentId === id);
  const anyRunning = activities.some(a => a.status === 'running');
  const doneCount = roots.filter(a => a.status === 'completed').length;
  const title = phaseDone
    ? `Done · ${roots.length} step${roots.length === 1 ? '' : 's'}`
    : 'Working';
  const hint = phaseDone ? '' : `step ${Math.min(doneCount + 1, roots.length || 1)}/${roots.length || 1}`;

  return (
    <div style={{ background: anyRunning ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.32)', border: '1px solid rgba(27,28,20,.08)', borderRadius: 14, overflow: 'hidden', marginBottom: expanded ? 18 : 0, transition: 'background .4s ease, margin-bottom .4s ease' }}>
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '13px 15px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
        {anyRunning ? (
          <span style={{ position: 'relative', width: 8, height: 8, flex: '0 0 8px' }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: ACCENT, animation: 'ccBreathe 1.4s ease-in-out infinite' }} />
          </span>
        ) : (
          <span style={{ width: 8, height: 8, flex: '0 0 8px', borderRadius: 999, background: '#2FA35B' }} />
        )}
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#3A3C30', letterSpacing: '-.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        {hint && <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.06em', color: MUTED_3 }}>{hint}</span>}
        <ChevronDown size={14} color={MUTED_3} style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .32s cubic-bezier(.22,1,.36,1)' }} />
      </button>
      {expanded && (
        <div style={{ padding: '0 15px 6px' }}>
          {roots.map(r => (
            <div key={r.id}>
              <ActivityRow activity={r} nested={false} />
              {childrenOf(r.id).map(c => <ActivityRow key={c.id} activity={c} nested />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Angle cards
   ──────────────────────────────────────────────────────────────────────── */
function AngleCard({ angle, index, onPick, onExpand, onModify, expanding, picking, modifying, expandedSections }) {
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const hasSections = !!expandedSections && expandedSections.length > 0;
  const showLong = open && hasSections;

  const toggleExpand = () => {
    if (!hasSections) { onExpand(index); setOpen(true); return; }
    setOpen(o => !o);
  };

  const submitModify = () => {
    const text = instruction.trim();
    if (!text || modifying) return;
    onModify(index, text);
    setInstruction('');
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 16,
        padding: '19px 22px 17px', boxShadow: hover ? '0 22px 48px -26px rgba(20,60,30,.4)' : '0 1px 3px rgba(27,28,20,.05)',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)', transition: 'box-shadow .28s cubic-bezier(.22,1,.36,1), transform .28s cubic-bezier(.22,1,.36,1)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: '#B0B2A2' }}>
          {humanizeProvokes(angle.provokes_type)}
        </span>
      </div>
      <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em', color: INK, margin: '0 0 7px', lineHeight: 1.44 }}>
        {angle.title}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: INK, fontWeight: 600, marginBottom: 6 }}>{angle.argument}</div>
      {angle.glimpse && (
        <div style={{ fontSize: 14.5, lineHeight: 1.68, color: '#5C5E50', fontWeight: 400 }}>{angle.glimpse}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: '#B0B2A2' }}>
          For: {angle.audience}
        </span>
        {angle.source_url && (
          <a
            href={angle.source_url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: ACCENT, textDecoration: 'none' }}
          >
            <ExternalLink size={11} /> Source
          </a>
        )}
      </div>

      {showLong && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed rgba(27,28,20,.12)', animation: 'ccFade .4s ease both' }}>
          {expandedSections.map((s, si) => (
            <div key={si} style={{ marginBottom: si < expandedSections.length - 1 ? 12 : 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8A8C7C', marginBottom: 4 }}>
                {s.heading}
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.68, color: '#5C5E50', fontWeight: 400, whiteSpace: 'pre-wrap' }}>{s.body}</div>
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitModify(); } }}
              placeholder="Refine this angle — e.g. &quot;cut the part about X, add Y&quot;"
              disabled={modifying}
              style={{
                flex: 1, height: 32, padding: '0 11px', border: `1px solid ${HAIRLINE}`, borderRadius: 8,
                fontSize: 12.5, fontFamily: SANS, color: INK, background: '#FAF9F3', outline: 'none',
              }}
            />
            <button
              onClick={submitModify} disabled={modifying || !instruction.trim()}
              style={{
                flex: '0 0 auto', height: 32, padding: '0 12px', border: 'none', borderRadius: 8,
                background: instruction.trim() && !modifying ? INK : '#E4E2D6',
                color: instruction.trim() && !modifying ? BG : '#B0B2A2',
                fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: instruction.trim() && !modifying ? 'pointer' : 'default',
              }}
            >
              {modifying ? 'Refining…' : 'Refine'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <button
          onClick={() => onPick(index)} disabled={picking}
          style={{
            flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            height: 34, padding: '0 14px', border: 'none', borderRadius: 9,
            background: INK, color: BG, fontFamily: FONT, fontSize: 12.5, fontWeight: 600, letterSpacing: '-.005em',
            cursor: picking ? 'default' : 'pointer', boxShadow: '0 1px 2px rgba(27,28,20,.18)',
          }}
        >
          <LinkedInGlyph size={14} />
          <span>{picking ? 'Drafting…' : 'Draft for LinkedIn'}</span>
        </button>
        <button
          onClick={toggleExpand} disabled={expanding} title="Show more about this angle"
          style={{
            flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            height: 34, padding: '0 13px', border: '1px solid rgba(27,28,20,.14)', borderRadius: 9, background: '#fff',
            color: '#3A3C30', fontFamily: FONT, fontSize: 12.5, fontWeight: 600, letterSpacing: '-.005em',
            cursor: expanding ? 'default' : 'pointer',
          }}
        >
          <span>{expanding ? 'Expanding…' : (showLong ? 'Collapse' : 'Expand')}</span>
          <ChevronDown size={14} style={{ transform: showLong ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .32s cubic-bezier(.22,1,.36,1)' }} />
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   One AI / user message
   ──────────────────────────────────────────────────────────────────────── */
function MessageBubble({ msg, onToggleTrace, onToggleAngles, onPick, onExpandAngle, onModifyAngle, onCopy, onOpenWorkspace, onRegenerate }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', animation: 'ccRise .5s cubic-bezier(.22,1,.36,1) both' }}>
        <div style={{ maxWidth: '78%', padding: '12px 17px', borderRadius: '16px 16px 5px 16px', background: ACCENT, color: BG, fontSize: 14.5, lineHeight: 1.6, letterSpacing: '-.005em', boxShadow: '0 10px 24px -16px rgba(20,102,59,.7)', whiteSpace: 'pre-wrap' }}>
          {msg.text}
        </div>
      </div>
    );
  }

  const phaseDone = msg.phase === 'done';
  const expanded = msg.traceOpen != null ? msg.traceOpen : !phaseDone;

  return (
    <div style={{ display: 'flex', gap: 13, animation: 'ccFade .5s ease both' }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: '#fff', border: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 30px', marginTop: 1, boxShadow: '0 1px 3px rgba(27,28,20,.05)' }}>
        <span style={{ fontFamily: FONT, fontSize: 17, color: ACCENT, fontWeight: 500 }}>H</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {msg.activities.length > 0 && (
          <ActivityTimeline activities={msg.activities} expanded={expanded} onToggle={() => onToggleTrace(msg.id)} phaseDone={phaseDone} />
        )}

        {msg.error && (
          <div style={{ color: DANGER, fontSize: 13.5, marginBottom: 8 }}>{msg.error}</div>
        )}

        {(msg.phase === 'streaming' || (phaseDone && msg.text)) && (
          <div style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.75, color: '#26281C', whiteSpace: 'pre-wrap', letterSpacing: '-.005em', animation: 'ccFade .5s ease both' }}>
            {msg.text}
            {msg.phase === 'streaming' && (
              <span style={{ display: 'inline-block', width: 2, height: 15, marginLeft: 2, borderRadius: 2, background: ACCENT, verticalAlign: -2, animation: 'ccCaret .9s step-end infinite' }} />
            )}
          </div>
        )}

        {msg.kind === 'angles' && phaseDone && (
          <div style={{ marginTop: 20, animation: 'ccFade .5s ease both' }}>
            {msg.summary && (
              <div style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.75, letterSpacing: '-.005em', color: '#26281C', marginBottom: 16 }}>
                {msg.summary}
              </div>
            )}
            <button
              onClick={() => onToggleAngles(msg.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: 0, cursor: 'pointer', marginBottom: 16 }}
            >
              <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 600, letterSpacing: '-.015em', color: INK }}>
                {msg.angles.length} possible angle{msg.angles.length === 1 ? '' : 's'}
              </span>
              <span style={{ fontSize: 12.5, color: MUTED_3, fontWeight: 500 }}>
                {msg.anglesOpen !== false ? 'Draft any angle straight to LinkedIn' : 'Collapsed · tap a chip to draft'}
              </span>
              <span style={{ flex: 1 }} />
              <ChevronDown size={17} color={MUTED_3} style={{ transform: msg.anglesOpen !== false ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .34s cubic-bezier(.22,1,.36,1)' }} />
            </button>

            {msg.anglesOpen !== false ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {msg.angles.map((a, i) => (
                  <AngleCard
                    key={i}
                    angle={a} index={i}
                    onPick={onPick} onExpand={onExpandAngle} onModify={onModifyAngle}
                    expanding={msg.expandingIndex === i} picking={msg.pickingIndex === i}
                    modifying={msg.modifyingIndex === i}
                    expandedSections={msg.expandedSections?.[i]}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {msg.angles.map((a, i) => (
                  <button
                    key={i} onClick={() => onPick(i)} disabled={msg.pickingIndex === i}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${HAIRLINE}`,
                      background: '#fff', borderRadius: 999, padding: '8px 14px', fontSize: 12.5, fontWeight: 600,
                      color: '#3A3C30', cursor: msg.pickingIndex === i ? 'default' : 'pointer',
                    }}
                  >
                    <LinkedInGlyph size={13} color="#0A66C2" />
                    {msg.pickingIndex === i ? 'Drafting…' : a.title}
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, color: MUTED_3, marginTop: 14 }}>None of these fit? Just type what you'd rather see below.</div>
          </div>
        )}

        {msg.kind === 'draft' && phaseDone && !msg.decision && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 16, flexWrap: 'wrap', animation: 'ccFade .4s ease both' }}>
            <button onClick={() => onOpenWorkspace(msg.id)} style={pillBtn(ACCENT, '#fff')}>Open Workspace →</button>
            <span style={{ flex: 1 }} />
            <button onClick={onCopy} style={pillBtn('transparent', MUTED_2)}><Copy size={13} /> {msg.copied ? 'Copied' : 'Copy'}</button>
          </div>
        )}

        {msg.kind === 'draft' && msg.decision && (
          <div style={{ marginTop: 16, animation: 'ccFade .4s ease both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {msg.decision === 'approved' && <span style={pillTag('#DCFCE7', '#15803D')}>Approved · saved to your vault</span>}
              {msg.decision === 'edited' && <span style={pillTag('#DCFCE7', '#15803D')}>Saved with your edits</span>}
              {msg.decision === 'declined' && (
                <>
                  <span style={pillTag('#FEE2E2', DANGER)}>Declined</span>
                  <button onClick={onRegenerate} style={pillBtn('#F6F1E8', '#3A3C30')}><RotateCcw size={13} /> Regenerate</button>
                </>
              )}
              {msg.postId && (msg.decision === 'approved' || msg.decision === 'edited') && (
                <button onClick={() => onOpenWorkspace(msg.id)} style={pillBtn(ACCENT, '#fff')}>Open Workspace →</button>
              )}
            </div>
            {msg.answerNote && <div style={{ fontSize: 12, color: MUTED_2, marginTop: 6 }}>{msg.answerNote}</div>}
          </div>
        )}

        {msg.kind === 'direct' && phaseDone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12 }}>
            <button onClick={onCopy} style={pillBtn('transparent', MUTED_2)}><Copy size={13} /> {msg.copied ? 'Copied' : 'Copy'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function pillBtn(bg, color) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', border: 'none',
    background: bg, borderRadius: 8, fontSize: 12.5, fontWeight: 600, color, cursor: 'pointer',
  };
}
function pillTag(bg, color) {
  return { display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 12px', borderRadius: 999, background: bg, color, fontSize: 12.5, fontWeight: 600 };
}

/* ────────────────────────────────────────────────────────────────────────
   Composer
   ──────────────────────────────────────────────────────────────────────── */
function Composer({ draft, onDraft, onSend, disabled, taRef }) {
  const [focused, setFocused] = useState(false);
  const canSend = !!draft.trim() && !disabled;

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };
  const autosize = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(172, el.scrollHeight) + 'px';
  };

  return (
    <div style={{ flex: '0 0 auto', padding: '6px 28px 22px', background: `linear-gradient(to top, ${BG} 62%, rgba(244,242,234,0))` }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        <div style={{
          background: '#fff', border: `1px solid ${focused ? 'rgba(20,102,59,.5)' : 'rgba(27,28,20,.12)'}`, borderRadius: 18,
          boxShadow: focused ? '0 0 0 4px rgba(20,102,59,.08), 0 18px 42px -28px rgba(20,60,30,.5)' : '0 12px 30px -24px rgba(20,60,30,.4)',
          transition: 'border-color .28s cubic-bezier(.22,1,.36,1), box-shadow .28s cubic-bezier(.22,1,.36,1)',
        }}>
          <textarea
            ref={(el) => { taRef.current = el; autosize(el); }}
            value={draft}
            onChange={(e) => { onDraft(e.target.value); autosize(e.target); }}
            onKeyDown={onKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            rows={1}
            placeholder="Drop a thought, or ask to research and write…"
            style={{ display: 'block', width: '100%', border: 'none', outline: 'none', background: 'none', fontSize: 15, lineHeight: 1.6, color: INK, letterSpacing: '-.005em', padding: '15px 18px 4px', resize: 'none', maxHeight: 172, overflowY: 'auto', fontFamily: SANS }}
          />
          <div style={{ display: 'flex', alignItems: 'center', padding: '7px 10px 10px 16px' }}>
            <span style={{ flex: 1 }} />
            <button
              onClick={onSend}
              disabled={!canSend}
              title="Send"
              style={{
                flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
                border: 'none', borderRadius: 11, cursor: canSend ? 'pointer' : 'default',
                background: canSend ? ACCENT : '#E4E2D6', boxShadow: canSend ? '0 10px 22px -12px rgba(20,102,59,.7)' : 'none',
              }}
            >
              <Send size={16} color={canSend ? BG : '#B0B2A2'} />
            </button>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#B7B9A9', margin: '11px 0 0', fontWeight: 500 }}>
          Agents can make mistakes. Review drafts before publishing.
        </p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Workspace view — post-approval redraft/publish surface
   ──────────────────────────────────────────────────────────────────────── */
function WorkspaceView({ ws, onBack, onModeChange, onDocChange, onCmdInput, onCmdKey, onSubmitCmd, onChip, onCopy, onPublish, onConnectLinkedIn, onHistory, onToggleCmd, onApprove, onDecline, publishing, connecting, publishResult, linkedinConnected, versions, showVersions, userName, professionLine }) {
  const words = ws.docText.trim() ? ws.docText.trim().split(/\s+/).length : 0;
  const readTime = Math.max(1, Math.ceil(words / 200)) + ' min read';
  const isEdit = ws.mode === 'edit';
  const cmdCan = !!ws.cmdInput.trim();
  const userInitial = (userName || '?').charAt(0).toUpperCase();
  const cmdOpen = ws.cmdOpen !== false;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'ccFade .4s ease both' }}>
      <header style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 24px', background: 'rgba(244,242,234,.85)', backdropFilter: 'blur(14px)', borderBottom: `1px solid ${HAIRLINE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 12px 0 10px', border: `1px solid ${HAIRLINE}`, background: '#fff', borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: '#3A3C30', cursor: 'pointer' }}>
            <ArrowLeft size={15} /> Chat
          </button>
          <span style={{ width: 1, height: 18, background: HAIRLINE }} />
          <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 500, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ws.title}</div>
          <span style={pillTag('rgba(27,28,20,.05)', '#7A7C6C')}>LinkedIn Post</span>
          <span style={pillTag('rgba(27,28,20,.05)', '#7A7C6C')}>{readTime}</span>
          <span style={pillTag('rgba(27,28,20,.05)', '#7A7C6C')}>{words} words</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!ws.decision && (
            <>
              <button onClick={onApprove} style={pillBtn('#DCFCE7', '#15803D')}><Check size={13} /> Approve</button>
              <button onClick={onDecline} style={pillBtn('#FEE2E2', DANGER)}>Decline</button>
              <span style={{ width: 1, height: 18, background: HAIRLINE }} />
            </>
          )}
          {ws.decision === 'approved' && <span style={pillTag('#DCFCE7', '#15803D')}>Approved · saved to your vault</span>}
          {ws.decision === 'edited' && <span style={pillTag('#DCFCE7', '#15803D')}>Saved with your edits</span>}
          <button onClick={onCopy} style={pillBtn('transparent', MUTED_2)}><Copy size={13} /> {ws.copied ? 'Copied' : 'Copy'}</button>
          <button onClick={onHistory} style={pillBtn('transparent', MUTED_2)}><Clock size={13} /> History</button>
          {linkedinConnected ? (
            <button onClick={onPublish} disabled={publishing} style={pillBtn(LI_BLUE, '#fff')}>
              <LinkedInGlyph size={13} color="#fff" /> {publishing ? 'Publishing…' : 'Publish to LinkedIn'}
            </button>
          ) : (
            <button onClick={onConnectLinkedIn} disabled={connecting} style={pillBtn(LI_BLUE, '#fff')}>
              <LinkedInGlyph size={13} color="#fff" /> {connecting ? 'Connecting…' : 'Connect LinkedIn'}
            </button>
          )}
        </div>
      </header>

      {ws.error && (
        <div style={{ padding: '8px 24px', fontSize: 12.5, color: DANGER, background: '#FEE2E2' }}>
          {ws.error}
        </div>
      )}

      {publishResult && (
        <div style={{ padding: '8px 24px', fontSize: 12.5, color: publishResult.ok ? '#15803D' : DANGER, background: publishResult.ok ? '#DCFCE7' : '#FEE2E2' }}>
          {publishResult.message}
        </div>
      )}

      {showVersions && (
        <div style={{ padding: '10px 24px', borderBottom: `1px solid ${HAIRLINE}`, background: '#fff' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: MUTED_2, marginBottom: 6 }}>VERSION HISTORY</div>
          {versions.length === 0 && <div style={{ fontSize: 12.5, color: MUTED_3 }}>No saved versions yet.</div>}
          {versions.map(v => (
            <div key={v.id} style={{ fontSize: 12.5, color: '#3A3C30', padding: '4px 0' }}>
              v{v.version_number} {v.change_summary ? `— ${v.change_summary}` : ''}
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: command assistant */}
        <div style={{
          flex: `0 0 ${cmdOpen ? '300px' : '56px'}`, minWidth: cmdOpen ? 300 : 56, display: 'flex', flexDirection: 'column',
          background: SIDEBAR_BG, borderRight: `1px solid ${HAIRLINE}`, overflow: 'hidden',
          transition: 'flex-basis .36s cubic-bezier(.22,1,.36,1), min-width .36s cubic-bezier(.22,1,.36,1)',
        }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-start', gap: 8, padding: '16px 14px 12px', justifyContent: cmdOpen ? 'flex-start' : 'center' }}>
            <button onClick={onToggleCmd} title={cmdOpen ? 'Collapse writer agent' : 'Expand writer agent'} style={iconBtn}>
              <PanelLeft size={16} strokeWidth={1.9} />
            </button>
            {cmdOpen && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>Refine</span>
                <p style={{ fontSize: 13, color: '#7A7C6C', margin: '6px 0 0', lineHeight: 1.5 }}>Direct the draft. No pleasantries needed — just tell it what to change.</p>
              </div>
            )}
          </div>
          {cmdOpen && (
            <>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {ws.commands.map(c => (
                  <div key={c.id} style={{ animation: 'ccRise .3s cubic-bezier(.22,1,.36,1) both' }}>
                    <div style={{ background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: '11px 11px 11px 4px', padding: '9px 12px' }}>
                      <span style={{ fontSize: 13, color: INK, lineHeight: 1.5 }}>{c.text}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingLeft: 2 }}>
                      <Check size={12} color="#2FA35B" />
                      <span style={{ fontSize: 11.5, color: MUTED_2 }}>{c.response}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ flex: '0 0 auto', padding: '6px 12px 6px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['Make the hook stronger', 'Add statistics', 'Shorten this'].map(label => (
                    <button key={label} onClick={() => onChip(label)} style={{ border: `1px solid ${HAIRLINE}`, background: '#fff', borderRadius: 999, padding: '5px 11px', fontSize: 11.5, color: '#7A7C6C', fontWeight: 500, cursor: 'pointer' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: '0 0 auto', padding: '8px 12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: '4px 4px 4px 13px' }}>
                  <input value={ws.cmdInput} onChange={(e) => onCmdInput(e.target.value)} onKeyDown={onCmdKey}
                    placeholder="Refine the draft…" style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', fontSize: 13, color: INK, padding: '7px 0', fontFamily: SANS }} />
                  <button onClick={onSubmitCmd} disabled={!cmdCan} title="Send" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: 'none', borderRadius: 9, cursor: cmdCan ? 'pointer' : 'default', background: cmdCan ? ACCENT : '#E4E2D6' }}>
                    <Send size={14} color={cmdCan ? BG : '#B0B2A2'} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT: document */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FAF9F3' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 28px', borderBottom: `1px solid ${HAIRLINE}` }}>
            <div style={{ display: 'inline-flex', background: 'rgba(27,28,20,.05)', borderRadius: 10, padding: 3 }}>
              <button onClick={() => onModeChange('edit')} style={{ height: 28, padding: '0 13px', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: isEdit ? '#fff' : 'transparent', color: isEdit ? ACCENT : MUTED_2 }}>Edit</button>
              <button onClick={() => onModeChange('view')} style={{ height: 28, padding: '0 13px', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: !isEdit ? '#fff' : 'transparent', color: !isEdit ? ACCENT : MUTED_2 }}>Preview</button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <div style={{ minHeight: '100%', display: 'flex', justifyContent: 'center', padding: isEdit ? '36px 28px 72px' : '44px 28px 64px', background: 'radial-gradient(120% 90% at 50% 0%, rgba(20,102,59,.05), transparent 60%)' }}>
              <div style={{ width: '100%', maxWidth: 540, height: 'fit-content', background: '#fff', border: `1px solid ${HAIRLINE}`, borderRadius: 16, boxShadow: isEdit ? '0 30px 70px -46px rgba(20,60,30,.45), 0 6px 20px -14px rgba(27,28,20,.18)' : '0 40px 90px -50px rgba(20,60,30,.5), 0 8px 24px -16px rgba(27,28,20,.2)', overflow: 'hidden', animation: 'ccRise .4s cubic-bezier(.22,1,.36,1) both' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '18px 20px 12px' }}>
                  <span style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: 999, background: ACCENT, color: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 20, fontWeight: 600 }}>
                    {userInitial}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: INK }}>{userName}</div>
                    <div style={{ fontSize: 12, color: '#9A9C8C', marginTop: 1 }}>{professionLine}</div>
                    <div style={{ fontSize: 11.5, color: '#9A9C8C', marginTop: 1 }}>Draft preview · 🌐</div>
                  </div>
                  {isEdit && (
                    <>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#B0B2A2', border: `1px solid ${HAIRLINE}`, borderRadius: 999, padding: '4px 9px' }}>Editable</span>
                    </>
                  )}
                </div>

                {isEdit ? (
                  <textarea
                    value={ws.docText}
                    onChange={(e) => { onDocChange(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                    ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                    placeholder="Write your post…"
                    style={{ display: 'block', width: '100%', border: 'none', background: 'none', padding: '0 20px 20px', fontFamily: SANS, fontSize: 14.5, lineHeight: 1.7, color: INK, letterSpacing: '-.003em', resize: 'none', overflow: 'hidden', minHeight: 220 }}
                  />
                ) : (
                  <>
                    <div style={{ padding: '0 20px 16px', fontSize: 14.5, lineHeight: 1.7, color: INK, whiteSpace: 'pre-wrap', letterSpacing: '-.003em' }}>{ws.docText}</div>
                    <div style={{ display: 'flex', gap: 26, padding: '11px 20px', borderTop: `1px solid ${HAIRLINE}`, color: '#9A9C8C', fontSize: 13, fontWeight: 500 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ThumbsUp size={15} strokeWidth={1.8} />Like</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MessageCircle size={15} strokeWidth={1.8} />Comment</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Repeat2 size={15} strokeWidth={1.8} />Repost</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Send size={15} strokeWidth={1.8} />Send</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Main page
   ──────────────────────────────────────────────────────────────────────── */
export default function ChatPage() {
  const navigate = useNavigate();
  const userName = localStorage.getItem('username') || 'there';

  const [sideOpen, setSideOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [chats, setChats] = useState([]);          // in-memory session history only
  const [activeChat, setActiveChat] = useState(-1);
  const [currentSessionId, setCurrentSessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('chat');
  const [ws, setWs] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState([]);
  const [profile, setProfile] = useState(null);
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [connectingLinkedIn, setConnectingLinkedIn] = useState(false);

  const taRef = useRef(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  // Real name/profession for the workspace's LinkedIn preview card — scoped
  // to the logged-in user via X-User-Id (see api/profile.js). null until
  // loaded, or if the user skipped onboarding and has no profile row yet.
  useEffect(() => {
    let cancelled = false;
    getProfile().then(p => { if (!cancelled) setProfile(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const professionLine = profile?.profession || profile?.role || 'Creator on Honne';

  // Real LinkedIn connection state — drives the workspace header's
  // Connect LinkedIn / Publish to LinkedIn button (matches the "Honne Chat
  // v3" design's LinkedIn-branded CTA, previously missing from this page).
  useEffect(() => {
    let cancelled = false;
    getLinkedInStatus().then(s => { if (!cancelled) setLinkedinConnected(!!s?.connected); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const connectLinkedIn = async () => {
    setConnectingLinkedIn(true);
    try {
      const { auth_url } = await getLinkedInAuthUrl();
      window.location.href = auth_url;
    } catch {
      setPublishResult({ ok: false, message: 'Could not start LinkedIn connection. Please try again.' });
      setConnectingLinkedIn(false);
    }
  };

  // Populate the sidebar from the user's persisted (7-day TTL) chat history,
  // then restore whichever chat was last open — same read path
  // (GET /sessions/{id}/threads) selectChat() below uses for sidebar switching.
  useEffect(() => {
    getSessions()
      .then(({ sessions = [] }) => {
        const fetchedChats = sessions.map(s => ({
          id: nextId(),
          sessionId: s.session_id,
          title: s.title,
          time: relativeTimeAgo(s.last_active_at),
        }));
        setChats(fetchedChats);

        const lastSessionId = localStorage.getItem('lastSessionId');
        const idx = fetchedChats.findIndex(c => c.sessionId === lastSessionId);
        if (idx === -1) return; // expired or first visit — start fresh, empty chat

        setActiveChat(idx);
        setCurrentSessionId(lastSessionId);
        getSessionThreads(lastSessionId)
          .then(data => {
            const rehydrated = (data.threads || []).flatMap(threadToMessages);
            if (rehydrated.length > 0) setMessages(rehydrated);
          })
          .catch(() => { /* thread read-back failed — leave chat empty */ });
      })
      .catch(() => { /* sidebar history unavailable — start fresh */ });
  }, []);

  useEffect(() => {
    localStorage.setItem('lastSessionId', currentSessionId);
  }, [currentSessionId]);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  const patchMessage = (id, fields) => {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...(typeof fields === 'function' ? fields(m) : fields) } : m)));
  };

  const newChat = () => {
    abortRef.current?.();
    if (messages.length > 0) {
      const firstUser = messages.find(m => m.role === 'user');
      setChats(prev => [{ id: nextId(), sessionId: currentSessionId, title: firstUser ? firstUser.text.slice(0, 60) : 'New chat', time: 'Just now' }, ...prev]);
    }
    setCurrentSessionId(crypto.randomUUID());
    setActiveChat(-1);
    setMessages([]);
    setDraft('');
    setBusy(false);
    setView('chat');
    setWs(null);
  };

  const selectChat = async (i) => {
    const chat = chats[i];
    if (!chat) return;
    abortRef.current?.();
    setActiveChat(i);
    setCurrentSessionId(chat.sessionId);
    setBusy(false);
    setView('chat');
    setWs(null);
    try {
      const data = await getSessionThreads(chat.sessionId);
      setMessages((data.threads || []).flatMap(threadToMessages));
    } catch {
      setMessages([]);
    }
  };

  // While the most recent AI turn is still an open angle-selection (cards
  // showing, nothing picked yet), plain chat text resumes that SAME paused
  // thread instead of starting a brand-new one — same checkpoint, same
  // mechanism the "none_fit" resume action already is. This is what lets
  // "none of these work, try other sources" just be typed normally: the
  // resume loops back through supervisor_node for a fresh classification
  // (see angle_review_node.py), which already knows how to route
  // "research" (fresh angles) vs "direct" (answer something else instead).
  const sendAsAngleGuidance = async (priorMsg, text) => {
    const userMsg = { id: nextId(), role: 'user', text };
    const aiId = nextId();
    const aiMsg = {
      id: aiId, role: 'ai', phase: 'working', kind: '', text: '',
      activities: [], traceOpen: null, angles: [], summary: '', expandingIndex: -1, pickingIndex: -1, modifyingIndex: -1,
      expandedSections: {}, decision: null, postId: '', threadId: priorMsg.threadId,
      copied: false, error: '', userPrompt: text,
    };
    setMessages(prev => [...prev, userMsg, aiMsg]);
    setDraft('');
    setBusy(true);
    scrollDown();
    try {
      const data = await resumeAI(priorMsg.threadId, 'none_fit', text);
      if (data.status === 'awaiting_angle_selection') {
        patchMessage(aiId, { phase: 'done', kind: 'angles', angles: data.angles || [], summary: data.summary || '' });
      } else {
        patchMessage(aiId, { phase: 'done', kind: 'direct', text: data.answer || '' });
      }
    } catch {
      patchMessage(aiId, { phase: 'done', error: 'Something went wrong.' });
    } finally {
      setBusy(false);
      scrollDown();
    }
  };

  const send = (overrideText) => {
    const text = (overrideText ?? draft).trim();
    if (!text || busy) return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'ai' && lastMsg.kind === 'angles' && lastMsg.threadId) {
      sendAsAngleGuidance(lastMsg, text);
      return;
    }

    const userMsg = { id: nextId(), role: 'user', text };
    const aiId = nextId();
    const aiMsg = {
      id: aiId, role: 'ai', phase: 'working', kind: '', text: '',
      activities: [], traceOpen: null, angles: [], summary: '', expandingIndex: -1, pickingIndex: -1, modifyingIndex: -1,
      expandedSections: {}, decision: null, postId: '', threadId: '',
      copied: false, error: '', userPrompt: text,
    };
    setMessages(prev => [...prev, userMsg, aiMsg]);
    setDraft('');
    setBusy(true);
    scrollDown();

    let draftText = '';
    const onToken = (chunk) => {
      draftText += chunk;
      patchMessage(aiId, (m) => ({ phase: 'streaming', kind: m.kind || 'draft', text: m.text + chunk }));
      scrollDown();
    };
    const onActivity = (evt) => {
      patchMessage(aiId, (m) => ({ activities: upsertActivity(m.activities, evt) }));
    };
    const onDone = (data) => {
      setBusy(false);
      if (data.session_id) setCurrentSessionId(data.session_id);
      if (data.status === 'awaiting_angle_selection') {
        patchMessage(aiId, { phase: 'done', kind: 'angles', angles: data.angles || [], summary: data.summary || '', threadId: data.thread_id });
      } else if (data.status === 'awaiting_approval') {
        patchMessage(aiId, { phase: 'done', kind: 'draft', threadId: data.thread_id, postId: data.post_id || '' });
        setWs({
          messageId: aiId, threadId: data.thread_id, title: text.slice(0, 60) || 'Untitled draft',
          docText: draftText, originalDraft: draftText, decision: null,
          mode: 'edit', commands: [], cmdInput: '', postId: data.post_id || '', copied: false, error: '',
        });
        setPublishResult(null);
        setShowVersions(false);
        setView('workspace');
      } else {
        patchMessage(aiId, (m) => ({ phase: 'done', kind: 'direct', text: m.text || data.answer || '' }));
      }
      scrollDown();
    };
    const onError = (message) => {
      setBusy(false);
      patchMessage(aiId, { phase: 'done', error: message });
    };

    abortRef.current = streamQuery(text, currentSessionId, onToken, onDone, onError, onActivity);
  };

  const toggleTrace = (id) => {
    patchMessage(id, (m) => ({ traceOpen: !(m.traceOpen != null ? m.traceOpen : m.phase !== 'done') }));
  };

  const toggleAngles = (id) => {
    patchMessage(id, (m) => ({ anglesOpen: !(m.anglesOpen !== false) }));
  };

  const pickAngle = async (aiId, index) => {
    const msg = messages.find(m => m.id === aiId);
    if (!msg) return;
    patchMessage(aiId, { pickingIndex: index });
    try {
      const data = await resumeAI(msg.threadId, 'pick', '', index);
      if (data.status === 'awaiting_angle_selection') {
        patchMessage(aiId, { pickingIndex: -1, angles: data.angles || [], summary: data.summary || '', error: data.error || '' });
      } else if (data.status === 'awaiting_approval') {
        // Drafted from the picked angle — this same message now carries the draft.
        const draftText = data.draft || data.answer || '';
        patchMessage(aiId, {
          pickingIndex: -1, kind: 'draft', text: draftText,
          phase: 'done', postId: data.post_id || '', decision: null,
        });
        setWs({
          messageId: aiId, threadId: msg.threadId, title: msg.userPrompt?.slice(0, 60) || 'Untitled draft',
          docText: draftText, originalDraft: draftText, decision: null,
          mode: 'edit', commands: [], cmdInput: '', postId: data.post_id || '', copied: false, error: '',
        });
        setPublishResult(null);
        setShowVersions(false);
        setView('workspace');
      }
    } catch {
      patchMessage(aiId, { pickingIndex: -1, error: 'Something went wrong drafting this angle.' });
    }
  };

  const expandAngle = async (aiId, index) => {
    const msg = messages.find(m => m.id === aiId);
    if (!msg) return;
    patchMessage(aiId, { expandingIndex: index });
    try {
      const data = await resumeAI(msg.threadId, 'expand', '', index);
      patchMessage(aiId, (m) => ({
        expandingIndex: -1,
        expandedSections: { ...m.expandedSections, [index]: data.expanded_sections || [] },
        error: data.error || '',
      }));
    } catch {
      patchMessage(aiId, { expandingIndex: -1, error: 'Something went wrong expanding this angle.' });
    }
  };

  // Re-invokable as many times as the user wants — each call revises the
  // SAME angle in place, building on whatever it currently shows (the
  // backend, not this handler, tracks "current version"; see
  // angle_review_node.py's working_sections).
  const modifyAngle = async (aiId, index, instructionText) => {
    const msg = messages.find(m => m.id === aiId);
    if (!msg) return;
    patchMessage(aiId, { modifyingIndex: index });
    try {
      const data = await resumeAI(msg.threadId, 'modify', instructionText, index);
      patchMessage(aiId, (m) => ({
        modifyingIndex: -1,
        // On failure the backend still echoes back the previous good
        // sections under expanded_sections — never overwritten with blank.
        expandedSections: { ...m.expandedSections, [index]: data.expanded_sections || m.expandedSections?.[index] || [] },
        error: data.error || '',
      }));
    } catch {
      patchMessage(aiId, { modifyingIndex: -1, error: "Couldn't apply that edit — try again." });
    }
  };

  const regenerate = (aiId) => {
    const msg = messages.find(m => m.id === aiId);
    if (!msg) return;
    send(msg.userPrompt);
  };

  const copyMsg = (aiId) => {
    const msg = messages.find(m => m.id === aiId);
    if (!msg) return;
    try { navigator.clipboard.writeText(msg.text); } catch { /* clipboard unavailable */ }
    patchMessage(aiId, { copied: true });
    setTimeout(() => patchMessage(aiId, { copied: false }), 1600);
  };

  const openWorkspace = (aiId) => {
    const msg = messages.find(m => m.id === aiId);
    if (!msg) return;
    setWs({
      messageId: aiId, threadId: msg.threadId, title: msg.userPrompt.slice(0, 60) || 'Untitled draft',
      docText: msg.text, originalDraft: msg.text, decision: msg.decision || null,
      mode: 'edit', commands: [], cmdInput: '', postId: msg.postId, copied: false, error: '',
    });
    setPublishResult(null);
    setShowVersions(false);
    setView('workspace');
  };
  const backToChat = () => setView('chat');

  const patchWs = (fields) => setWs(prev => (prev ? { ...prev, ...(typeof fields === 'function' ? fields(prev) : fields) } : prev));

  const wsApprove = async () => {
    if (!ws) return;
    const edited = ws.docText !== ws.originalDraft;
    try {
      const data = edited
        ? await resumeAI(ws.threadId, 'edited', ws.docText)
        : await resumeAI(ws.threadId, 'approved');
      const decision = edited ? 'edited' : 'approved';
      const postId = data.post_id || ws.postId;
      patchWs({ decision, postId, error: '' });
      if (ws.messageId) patchMessage(ws.messageId, { decision, postId, text: ws.docText, answerNote: data.answer });
    } catch {
      patchWs({ error: 'Could not save the draft. Please try again.' });
    }
  };

  const wsDecline = async () => {
    if (!ws) return;
    try {
      await resumeAI(ws.threadId, 'rejected');
      if (ws.messageId) patchMessage(ws.messageId, { decision: 'declined' });
      backToChat();
    } catch {
      patchWs({ error: 'Something went wrong declining this draft.' });
    }
  };

  const submitWsCmd = async (text) => {
    const note = (text ?? ws?.cmdInput ?? '').trim();
    if (!note || !ws) return;
    patchWs({ cmdInput: '' });
    try {
      const data = await refineAI(ws.docText, note);
      patchWs((w) => ({ docText: data.refined_draft || w.docText, commands: [...w.commands, { id: nextId(), text: note, response: 'Applied to the draft.' }] }));
    } catch {
      patchWs((w) => ({ commands: [...w.commands, { id: nextId(), text: note, response: 'Could not apply this change.' }] }));
    }
  };

  const wsPublish = async () => {
    if (!ws?.postId) {
      setPublishResult({ ok: false, message: 'Approve the draft first — there is nothing saved to publish yet.' });
      return;
    }
    setPublishing(true);
    setPublishResult(null);
    try {
      const result = await publishToLinkedIn(ws.postId);
      if (result.needs_auth && result.auth_url) {
        window.location.href = result.auth_url;
        return;
      }
      setPublishResult(result.published
        ? { ok: true, message: 'Published to LinkedIn.' }
        : { ok: false, message: result.reason || 'Publish failed.' });
    } catch {
      setPublishResult({ ok: false, message: 'Something went wrong publishing this post.' });
    } finally {
      setPublishing(false);
    }
  };

  const wsHistory = async () => {
    if (!ws?.postId) return;
    setShowVersions(v => !v);
    if (!showVersions) {
      try { setVersions(await getVersions(ws.postId)); } catch { setVersions([]); }
    }
  };

  const wsCopy = () => {
    if (!ws) return;
    try { navigator.clipboard.writeText(ws.docText); } catch { /* clipboard unavailable */ }
    patchWs({ copied: true });
    setTimeout(() => patchWs({ copied: false }), 1600);
  };

  useEffect(() => () => abortRef.current?.(), []);

  const isEmpty = messages.length === 0;
  const anyWorking = messages.some(m => m.role === 'ai' && m.phase !== 'done');

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: BG, color: INK, fontFamily: SANS }}>
      <style>{KEYFRAMES}</style>

      {view === 'workspace' && ws ? (
        <WorkspaceView
          ws={ws}
          onBack={backToChat}
          onModeChange={(mode) => patchWs({ mode })}
          onDocChange={(v) => patchWs({ docText: v })}
          onCmdInput={(v) => patchWs({ cmdInput: v })}
          onCmdKey={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitWsCmd(); } }}
          onSubmitCmd={() => submitWsCmd()}
          onChip={(label) => submitWsCmd(label)}
          onCopy={wsCopy}
          onPublish={wsPublish}
          onConnectLinkedIn={connectLinkedIn}
          onHistory={wsHistory}
          onToggleCmd={() => patchWs((w) => ({ cmdOpen: !(w.cmdOpen !== false) }))}
          onApprove={wsApprove}
          onDecline={wsDecline}
          publishing={publishing}
          connecting={connectingLinkedIn}
          publishResult={publishResult}
          linkedinConnected={linkedinConnected}
          versions={versions}
          showVersions={showVersions}
          userName={userName}
          professionLine={professionLine}
        />
      ) : (
        <div style={{ height: '100%', display: 'flex', animation: 'ccFade .35s ease both' }}>
          <HonneSidebar
            open={sideOpen} onToggle={() => setSideOpen(o => !o)}
            chats={chats} activeIndex={activeChat}
            onSelect={selectChat}
            // Local-list-only: hides the entry from this browser session but does not
            // delete the backend chat_sessions record — deletion is exclusively the
            // 7-day TTL sweep (no DELETE /api/ai/sessions/{id} endpoint exists).
            onDelete={(i) => setChats(prev => prev.filter((_, idx) => idx !== i))}
            onNewChat={newChat} search={search} onSearch={setSearch} userName={userName} navigate={navigate}
            activeNav="chat"
          />

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <header style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px', background: 'rgba(244,242,234,.72)', backdropFilter: 'saturate(140%) blur(14px)', borderBottom: '1px solid rgba(27,28,20,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 22, letterSpacing: '-.01em', color: ACCENT }}>Honne</span>
                <span style={{ width: 1, height: 16, background: 'rgba(27,28,20,.12)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ position: 'relative', width: 8, height: 8, flex: '0 0 8px' }}>
                    <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: anyWorking ? ACCENT : '#2FA35B' }} />
                    {anyWorking && <span style={{ position: 'absolute', inset: -3, borderRadius: 999, background: ACCENT, opacity: .28, animation: 'ccBreathe 2.4s ease-in-out infinite' }} />}
                  </span>
                  <span style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>{anyWorking ? 'Working on it…' : (isEmpty ? 'Ready when you are' : 'Ready')}</span>
                </div>
              </div>
              <button onClick={newChat} title="New conversation" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 14px', border: '1px solid rgba(27,28,20,.12)', background: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#3A3C30', cursor: 'pointer', boxShadow: '0 1px 2px rgba(27,28,20,.04)' }}>
                <Plus size={14} /> New
              </button>
            </header>

            {isEmpty ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                <div style={{ width: '100%', maxWidth: 600, textAlign: 'center', animation: 'ccRise .6s cubic-bezier(.22,1,.36,1) both' }}>
                  <h1 style={{ fontFamily: FONT, fontWeight: 600, fontSize: 36, lineHeight: 1.16, letterSpacing: '-.02em', margin: '0 0 12px', color: INK }}>
                    Good <span style={{ color: '#7A2230' }}>{greetingPeriod()}</span>, {userName}.
                  </h1>
                  <p style={{ fontFamily: FONT, fontSize: 20, fontWeight: 400, letterSpacing: '-.01em', color: '#9A9C8C', margin: 0 }}>What should we work on?</p>
                </div>
              </div>
            ) : (
              <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                <div style={{ maxWidth: 840, margin: '0 auto', padding: '36px 40px 24px', display: 'flex', flexDirection: 'column', gap: 30 }}>
                  {messages.map(m => (
                    <div key={m.id}>
                      <MessageBubble
                        msg={m}
                        onToggleTrace={toggleTrace}
                        onToggleAngles={toggleAngles}
                        onPick={(i) => pickAngle(m.id, i)}
                        onExpandAngle={(i) => expandAngle(m.id, i)}
                        onModifyAngle={(i, text) => modifyAngle(m.id, i, text)}
                        onCopy={() => copyMsg(m.id)}
                        onOpenWorkspace={openWorkspace}
                        onRegenerate={() => regenerate(m.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Composer draft={draft} onDraft={setDraft} onSend={() => send()} disabled={busy} taRef={taRef} />
          </div>
        </div>
      )}
    </div>
  );
}
