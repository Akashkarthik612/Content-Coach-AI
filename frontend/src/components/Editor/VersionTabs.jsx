import { useState, useRef } from 'react';
import { ContextMenu } from '../shared/ContextMenu';
import { renameVersion, deleteVersion } from '../../api/vault';
import styles from './Editor.module.css';

export function VersionTabs({ versions, activeIndex, onSelect, onRefresh }) {
  const [menu, setMenu]           = useState(null); // { x, y, version, idx }
  const [renamingId, setRenamingId]   = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef(null);

  if (!versions?.length) return null;
  const lastIdx = versions.length - 1;

  function handleContextMenu(e, version, idx) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, version, idx });
  }

  function startRename(version) {
    setRenamingId(version.id);
    setRenameValue(version.version_label ?? '');
    setTimeout(() => renameRef.current?.select(), 0);
  }

  async function commitRename(versionId) {
    const trimmed = renameValue.trim();
    if (trimmed) await renameVersion(versionId, trimmed);
    setRenamingId(null);
    onRefresh();
  }

  function handleRenameKey(e, versionId) {
    if (e.key === 'Enter') commitRename(versionId);
    if (e.key === 'Escape') setRenamingId(null);
  }

  async function handleDelete(version, idx) {
    const label = version.version_label ? `"${version.version_label}"` : `v${version.version_number}`;
    if (!window.confirm(`Delete version ${label}?`)) return;
    await deleteVersion(version.id);
    onRefresh(Math.max(0, idx - 1));
  }

  const menuItems = menu ? [
    { label: 'Rename label', onClick: () => startRename(menu.version) },
    { label: 'Delete version', danger: true, onClick: () => handleDelete(menu.version, menu.idx) },
  ] : [];

  return (
    <>
      <div className={styles.tabBar}>
        {versions.map((v, i) => (
          <button
            key={v.id}
            className={`${styles.tab} ${activeIndex === i ? styles.tabActive : ''}`}
            onClick={() => renamingId !== v.id && onSelect(i)}
            onContextMenu={e => handleContextMenu(e, v, i)}
          >
            {renamingId === v.id ? (
              <input
                ref={renameRef}
                className={styles.tabRenameInput}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => commitRename(v.id)}
                onKeyDown={e => handleRenameKey(e, v.id)}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <>
                <span>v{v.version_number}</span>
                {v.version_label && (
                  <span className={styles.tabLabel}>
                    {v.version_label.length > 12 ? v.version_label.slice(0, 12) + '…' : v.version_label}
                  </span>
                )}
                {i === lastIdx && <span className={styles.latestDot} title="Latest" />}
              </>
            )}
          </button>
        ))}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}
