import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './ContextMenu.module.css';

export function ContextMenu({ x, y, items, onClose, variant }) {
  const ref = useRef(null);

  useEffect(() => {
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function onContextMenu(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    // Skip the opening right-click's own bubbled event (it already fired before this effect attaches).
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const menuClass = variant === 'dashboard'
    ? `${styles.menu} ${styles.menuDashboard}`
    : styles.menu;

  return createPortal(
    <div ref={ref} className={menuClass} style={{ top: y, left: x }}>
      {items.map((item, i) => (
        <button
          key={i}
          className={`${styles.item} ${variant === 'dashboard' ? styles.itemDashboard : ''} ${item.danger ? styles.danger : ''}`}
          onClick={(e) => { e.stopPropagation(); item.onClick(); onClose(); }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
