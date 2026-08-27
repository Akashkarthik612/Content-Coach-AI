import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, MessageCircle, Repeat2 } from 'lucide-react';
import { getSessions, deleteSession } from '../api/ai';
import HonneSidebar from '../components/shared/HonneSidebar';
import { TEMPLATES, readSelectedTemplateId, writeSelectedTemplateId } from '../data/templates';

/* ────────────────────────────────────────────────────────────────────────
   Design tokens — ported 1:1 from the "Honne Chat v3" design's Templates
   tab (Claude Design project ff122375-c3bc-4438-aece-706b0bd557b0,
   `Honne Chat v3.dc.html`), split out into its own routed page here since
   this app uses real routing (HonneSidebar + React Router) rather than the
   source design's single-file page-switching shell.
   ──────────────────────────────────────────────────────────────────────── */
const PAGE_BG   = '#FFFFFF';
const INK       = '#1B1C14';
const ACCENT    = '#14663B';
const MUTED     = '#7A7C6C';
const MUTED_3   = '#9FA291';
const MUTED_6   = '#B0B2A2';
const FONT = "'Geist', system-ui, sans-serif";
const SERIF = "'EB Garamond', Georgia, serif";
const MONO = "'JetBrains Mono', monospace";

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
@keyframes tplRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { *{ animation-duration: .001ms !important; } }
.tpl-card { transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s ease, border-color .22s ease; }
.tpl-card:hover { transform: translateY(-2px); box-shadow: 0 22px 48px -26px rgba(20,60,30,.4); border-color: rgba(20,102,59,.3); }
`;

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

/* One block of a template's miniature LinkedIn-post preview — mirrors the
   source design's `sc-for list="{{ t.pv }}"` block-kind switch. */
function PreviewBlock({ block }) {
  const { kind, text, top } = block;
  const style = { marginTop: top || 0 };
  if (kind === 'hook') {
    return <span style={{ ...style, display: 'block', fontFamily: FONT, fontSize: 9.5, fontWeight: 600, lineHeight: 1.42, letterSpacing: '-.005em', color: INK, flex: 'none' }}>{text}</span>;
  }
  if (kind === 'para') {
    return <span style={{ ...style, display: 'block', fontFamily: FONT, fontSize: 8.5, lineHeight: 1.62, color: '#8A8C7C', flex: 'none' }}>{text}</span>;
  }
  if (kind === 'bullet') {
    return (
      <span style={{ ...style, display: 'flex', alignItems: 'baseline', gap: 5, flex: 'none' }}>
        <span style={{ flex: '0 0 auto', fontFamily: FONT, fontSize: 8.5, lineHeight: 1.62, color: MUTED_6 }}>—</span>
        <span style={{ fontFamily: FONT, fontSize: 8.5, lineHeight: 1.62, color: '#8A8C7C' }}>{text}</span>
      </span>
    );
  }
  if (kind === 'label') {
    return <span style={{ ...style, display: 'block', fontFamily: MONO, fontSize: 6.5, letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 500, color: MUTED_6, flex: 'none' }}>{text}</span>;
  }
  if (kind === 'lesson') {
    return <span style={{ ...style, display: 'block', fontFamily: SERIF, fontSize: 11, fontStyle: 'italic', lineHeight: 1.4, color: ACCENT, flex: 'none' }}>{text}</span>;
  }
  if (kind === 'statement') {
    return <span style={{ ...style, display: 'block', fontFamily: SERIF, fontSize: 14, fontWeight: 600, lineHeight: 1.24, color: INK, flex: 'none' }}>{text}</span>;
  }
  if (kind === 'rule') {
    return (
      <span style={{ ...style, display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
        <span style={{ flex: 1, height: 1, background: 'rgba(27,28,20,.09)' }} />
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.4" style={{ flex: '0 0 8px' }}><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></svg>
        <span style={{ flex: 1, height: 1, background: 'rgba(27,28,20,.09)' }} />
      </span>
    );
  }
  return null;
}

function TemplateCard({ t, active, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className="tpl-card"
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left', border: 'none', background: 'none', padding: 0, cursor: 'pointer',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', height: 230, padding: 0, background: '#fff', borderRadius: 11, border: `1px solid ${active ? ACCENT : 'rgba(27,28,20,.1)'}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(27,28,20,.04)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 13px 9px', borderBottom: '1px solid rgba(27,28,20,.055)' }}>
          <span style={{ flex: '0 0 22px', width: 22, height: 22, borderRadius: 999, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: '#F4F2EA', lineHeight: 1 }}>H</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontFamily: FONT, fontSize: 8.5, fontWeight: 600, color: INK, lineHeight: 1 }}>Maya Sharma</span>
            <span style={{ fontFamily: FONT, fontSize: 7, color: '#A6A895', lineHeight: 1 }}>Founder · 2h · <span style={{ color: MUTED_6 }}>Edited</span></span>
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 2.5 }}>
            {[0, 1, 2].map(i => <span key={i} style={{ width: 2.5, height: 2.5, borderRadius: 999, background: 'rgba(27,28,20,.22)' }} />)}
          </span>
        </span>
        <span style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px 13px', overflow: 'hidden', ...(t.center ? { justifyContent: 'center' } : {}) }}>
          {t.pv.map((p, i) => <PreviewBlock key={i} block={p} />)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 13px 10px', borderTop: '1px solid rgba(27,28,20,.055)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ThumbsUp size={8} color={MUTED_6} strokeWidth={2} /><span style={{ fontFamily: FONT, fontSize: 6.5, color: MUTED_6 }}>Like</span></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MessageCircle size={8} color={MUTED_6} strokeWidth={2} /><span style={{ fontFamily: FONT, fontSize: 6.5, color: MUTED_6 }}>Comment</span></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Repeat2 size={8} color={MUTED_6} strokeWidth={2} /><span style={{ fontFamily: FONT, fontSize: 6.5, color: MUTED_6 }}>Repost</span></span>
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 17 }}>
        <span style={{ fontFamily: FONT, fontSize: 16, fontWeight: 600, letterSpacing: '-.01em', color: INK }}>{t.name}</span>
        {active && (
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 500, color: ACCENT, background: 'rgba(20,102,59,.09)', borderRadius: 6, padding: '3px 7px' }}>In use</span>
        )}
      </span>
      <span style={{ fontSize: 14, lineHeight: 1.58, color: MUTED, marginTop: 7 }}>{t.desc}</span>
      <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: MUTED_6, marginTop: 10 }}>{t.bestFor}</span>
    </button>
  );
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const userName = localStorage.getItem('username') || 'there';

  const [sideOpen, setSideOpen] = useState(true);
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState(readSelectedTemplateId);

  // Sidebar's Recent list is the same persisted (7-day TTL) chat history
  // ChatPage's sidebar reads — kept independently here since this page has
  // no active chat/message state of its own to select into.
  useEffect(() => {
    getSessions()
      .then(({ sessions = [] }) => {
        setChats(sessions.map(s => ({ id: nextId(), sessionId: s.session_id, title: s.title, time: relativeTimeAgo(s.last_active_at) })));
      })
      .catch(() => { /* sidebar history unavailable — show an empty list */ });
  }, []);

  const handleDeleteChat = async (i) => {
    const chat = chats[i];
    if (!chat) return;
    setChats(prev => prev.filter((_, idx) => idx !== i));
    try {
      await deleteSession(chat.sessionId);
    } catch {
      setChats(prev => [...prev.slice(0, i), chat, ...prev.slice(i)]);
    }
  };

  const goToChat = (sessionId) => {
    if (sessionId) localStorage.setItem('lastSessionId', sessionId);
    else localStorage.removeItem('lastSessionId');
    navigate('/chat');
  };

  const selectTemplate = (id) => {
    setActiveId(id);
    writeSelectedTemplateId(id);
  };

  const active = TEMPLATES.find(t => t.id === activeId);

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: PAGE_BG, color: INK, fontFamily: FONT, display: 'flex' }}>
      <style>{STYLES}</style>

      <HonneSidebar
        open={sideOpen} onToggle={() => setSideOpen(o => !o)}
        chats={chats} activeIndex={-1}
        onSelect={(i) => goToChat(chats[i]?.sessionId)}
        onDelete={handleDeleteChat}
        onNewChat={() => goToChat(null)}
        search={search} onSearch={setSearch} userName={userName} navigate={navigate}
        activeNav="templates"
      />

      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 40px 64px', animation: 'tplRise .4s cubic-bezier(.22,1,.36,1) both' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 8 }}>
            <div>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>Post structure</span>
              <h1 style={{ fontFamily: FONT, fontSize: 28, fontWeight: 600, lineHeight: 1.28, letterSpacing: '-.02em', color: INK, margin: '6px 0 0' }}>Templates</h1>
            </div>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>{active?.name}</span>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: MUTED, margin: '0 0 30px', maxWidth: 520 }}>
            The writer follows the template you pick here. Change it any time — it applies to the next draft, not the ones already written.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
            {TEMPLATES.map(t => (
              <TemplateCard key={t.id} t={t} active={t.id === activeId} onSelect={() => selectTemplate(t.id)} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
