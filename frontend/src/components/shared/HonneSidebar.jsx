import { Plus, Search, Trash2, Settings, PanelLeft } from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────────
   Honne sidebar — the green/cream chat-history rail shared by ChatPage and
   SchedulePage (both ported from the same "Honne" Claude Design project,
   ff122375-c3bc-4438-aece-706b0bd557b0). Extracted out of ChatPage.jsx so a
   second page (Schedule) doesn't have to duplicate ~150 lines of nav/list/
   footer markup — deliberately distinct from AppSidebar (blue/indigo, used
   by MyWorkPage/AgentsPage), see CLAUDE.md.
   ──────────────────────────────────────────────────────────────────────── */
const SIDEBAR_BG = '#EFEDE3';
const ACCENT     = '#14663B';
const ACCENT_TINT = 'rgba(20,102,59,.09)';
const INK        = '#1B1C14';
const BG         = '#F4F2EA';
const MUTED_2    = '#8A8C7C';
const MUTED_3    = '#A6A895';
const FONT = "'Geist', system-ui, sans-serif";
const SANS = FONT;
const MONO = "'JetBrains Mono', monospace";

export const iconBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, flex: '0 0 28px', border: 'none', background: 'none', borderRadius: 8, color: MUTED_2, cursor: 'pointer' };

/* Icon path data copied verbatim from the source .dc.html files' NAV arrays
   (multi-path icons are '|'-joined there). `path` is the in-app route each
   enabled item navigates to. */
export const SIDE_NAV = [
  { id: 'chat',      label: 'Chats',     icon: 'M21 11.5a8.4 8.4 0 0 1-11.8 7.7L3 21l1.9-6.1A8.4 8.4 0 1 1 21 11.5z', path: '/chat',      enabled: true },
  { id: 'vault',     label: 'Vault',     icon: 'M12 2l8 4.5v5c0 5-3.4 8.6-8 10.5-4.6-1.9-8-5.5-8-10.5v-5L12 2z',      path: '/my-work',   enabled: true },
  { id: 'templates', label: 'Templates', icon: 'M4 4h7v7H4z|M13 4h7v4h-7z|M13 11h7v9h-7z|M4 14h7v6H4z',               path: '/templates', enabled: true },
  { id: 'analytics', label: 'Analytics', icon: 'M3 3v18h18|M7 15l3-4 3 3 5-6',                                        path: '/analytics', enabled: true },
  { id: 'scheduled', label: 'Scheduled', icon: 'M4 5h16v16H4z|M4 9h16|M8 3v4|M16 3v4',                                path: '/schedule',  enabled: true },
];

function NavIcon({ d, size = 17, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {d.split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

/**
 * @param {string} activeNav - which SIDE_NAV id is the current page ('chat' | 'scheduled' | ...)
 * @param {function} navigate - react-router navigate() from the calling page
 */
export default function HonneSidebar({ open, onToggle, chats, activeIndex, onSelect, onDelete, onNewChat, search, onSearch, userName, navigate, activeNav = 'chat' }) {
  const filtered = chats.filter(c => c.title.toLowerCase().includes(search.toLowerCase()));
  return (
    <aside style={{
      flex: `0 0 ${open ? '256px' : '58px'}`, minWidth: open ? 256 : 58, width: open ? 256 : 58,
      display: 'flex', flexDirection: 'column', background: SIDEBAR_BG, borderRight: '1px solid rgba(27,28,20,.07)', overflow: 'hidden',
      transition: 'flex-basis .36s cubic-bezier(.22,1,.36,1), min-width .36s cubic-bezier(.22,1,.36,1), width .36s cubic-bezier(.22,1,.36,1)',
    }}>
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '15px 13px 11px', justifyContent: open ? 'flex-start' : 'center' }}>
        <button onClick={onToggle} title={open ? 'Collapse sidebar' : 'Expand sidebar'} style={iconBtn}>
          <PanelLeft size={16} strokeWidth={1.9} />
        </button>
        {open && (
          <span style={{ flex: 1, fontFamily: FONT, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em', color: ACCENT }}>Honne</span>
        )}
      </div>

      <div style={{ flex: '0 0 auto', padding: '2px 9px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button
          onClick={onNewChat} title="New chat"
          style={{
            display: 'flex', alignItems: 'center', gap: 11, width: '100%',
            justifyContent: open ? 'flex-start' : 'center', padding: open ? '9px 11px' : '9px',
            border: 'none', background: 'none', borderRadius: 10, cursor: 'pointer',
            color: ACCENT, fontFamily: FONT, fontSize: 14, fontWeight: 600, letterSpacing: '-.005em',
          }}
        >
          <span style={{ width: 20, height: 20, flex: '0 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={17} strokeWidth={2.2} />
          </span>
          {open && <span>New chat</span>}
        </button>
        {SIDE_NAV.map(n => {
          const active = n.id === activeNav;
          const disabled = !n.enabled;
          const clickable = !disabled && !active;
          return (
            <button
              key={n.id}
              onClick={clickable ? () => navigate(n.path) : undefined}
              disabled={disabled}
              title={disabled ? `${n.label} (not available)` : n.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                justifyContent: open ? 'flex-start' : 'center', padding: open ? '9px 11px' : '9px',
                border: 'none', borderRadius: 10, cursor: disabled ? 'default' : (clickable ? 'pointer' : 'default'),
                background: active ? 'rgba(20,102,59,.10)' : 'transparent',
                color: disabled ? '#B0B2A2' : (active ? ACCENT : '#3A3C30'),
                fontFamily: FONT, fontWeight: active ? 600 : 500, opacity: disabled ? .5 : 1,
                transition: 'background .18s ease, color .18s ease',
              }}
            >
              <span style={{ width: 20, height: 20, flex: '0 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <NavIcon d={n.icon} color={disabled ? '#B0B2A2' : (active ? ACCENT : MUTED_2)} />
              </span>
              {open && <span style={{ fontSize: 14, letterSpacing: '-.005em' }}>{n.label}</span>}
            </button>
          );
        })}
      </div>

      {open && (
        <div style={{ flex: '0 0 auto', padding: '0 9px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F6F1E8', borderRadius: 10, padding: '7px 10px' }}>
            <Search size={13} color={MUTED_3} />
            <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search"
              style={{ border: 'none', background: 'none', fontSize: 12.5, flex: 1, color: INK, fontFamily: SANS }} />
          </div>
        </div>
      )}

      {open && (
        <div style={{ flex: '0 0 auto', padding: '12px 20px 6px' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: MUTED_3, fontWeight: 500 }}>Recent</span>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 9px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {open && filtered.map((c, i) => {
          const active = i === activeIndex;
          return (
            <div key={c.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => onSelect(i)}
                style={{
                  display: 'flex', flexDirection: 'column', width: '100%', textAlign: 'left', padding: '9px 11px', border: 'none',
                  borderRadius: 10, cursor: 'pointer', background: active ? ACCENT_TINT : 'transparent',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? ACCENT : '#3A3C30', lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.title}
                </span>
                <span style={{ fontSize: 11, color: MUTED_3, marginTop: 2 }}>{c.time}</span>
              </button>
              <button onClick={() => onDelete(i)} title="Delete" style={{ position: 'absolute', right: 6, border: 'none', background: 'none', color: MUTED_3, cursor: 'pointer', padding: 4 }}>
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ flex: '0 0 auto', borderTop: '1px solid rgba(27,28,20,.07)', padding: 10, display: 'flex', justifyContent: open ? 'stretch' : 'center' }}>
        {open ? (
          <button
            title="Settings" onClick={() => navigate('/settings')}
            style={{
              display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: 8, border: 'none',
              background: 'rgba(20,102,59,.10)', borderRadius: 11, cursor: 'pointer',
              boxShadow: activeNav === 'settings' ? 'inset 0 0 0 1.5px rgba(20,102,59,.4)' : 'none',
            }}
          >
            <span style={{ width: 32, height: 32, flex: '0 0 32px', borderRadius: 9, background: ACCENT, color: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 16, fontWeight: 600 }}>
              {userName.charAt(0).toUpperCase()}
            </span>
            <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</div>
              <div style={{ fontSize: 11, color: '#9A9C8C' }}>Settings</div>
            </div>
            <Settings size={15} color={MUTED_3} />
          </button>
        ) : (
          <button
            title={`${userName} · Settings`} onClick={() => navigate('/settings')}
            style={{
              width: 32, height: 32, flex: '0 0 32px', borderRadius: 9, background: ACCENT, color: BG, border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 16, fontWeight: 600, cursor: 'pointer',
              boxShadow: activeNav === 'settings' ? '0 0 0 2px rgba(20,102,59,.35)' : 'none',
            }}
          >
            {userName.charAt(0).toUpperCase()}
          </button>
        )}
      </div>
    </aside>
  );
}
