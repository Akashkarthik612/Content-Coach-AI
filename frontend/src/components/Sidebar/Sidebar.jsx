import { useContext, useState, useRef } from 'react';
import { AppContext } from '../../App';
import { Button } from '../shared/Button';
import { ContextMenu } from '../shared/ContextMenu';
import { renameFolder, deleteFolder } from '../../api/vault';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const { folders, refetchFolders, selectedFolderId, selectFolder, openNewFolder, setMode } = useContext(AppContext);

  // Context menu state
  const [menu, setMenu] = useState(null); // { x, y, folderId, folderName }

  // Inline rename state
  const [renamingId, setRenamingId]   = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef(null);

  function handleContextMenu(e, folder) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, folderId: folder.id, folderName: folder.name });
  }

  function startRename(folderId, currentName) {
    setRenamingId(folderId);
    setRenameValue(currentName);
    setTimeout(() => renameRef.current?.select(), 0);
  }

  async function commitRename(folderId) {
    const trimmed = renameValue.trim();
    if (trimmed) await renameFolder(folderId, trimmed);
    setRenamingId(null);
    refetchFolders();
  }

  function handleRenameKey(e, folderId) {
    if (e.key === 'Enter') commitRename(folderId);
    if (e.key === 'Escape') setRenamingId(null);
  }

  async function handleDelete(folderId) {
    if (!window.confirm('Delete this folder and all its posts?')) return;
    await deleteFolder(folderId);
    if (selectedFolderId === folderId) setMode('idle');
    refetchFolders();
  }

  const menuItems = menu ? [
    {
      label: 'Rename',
      onClick: () => startRename(menu.folderId, menu.folderName),
    },
    {
      label: 'Delete folder',
      danger: true,
      onClick: () => handleDelete(menu.folderId),
    },
  ] : [];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.wordmark}>Content Coach</div>

      <Button variant="primary" onClick={openNewFolder}>
        + New Folder
      </Button>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Folders</p>
        {folders.length === 0 && (
          <p className={styles.empty}>No folders yet</p>
        )}
        {folders.map(f => (
          <div
            key={f.id}
            className={`${styles.folderItem} ${selectedFolderId === f.id ? styles.active : ''}`}
            onClick={() => renamingId !== f.id && selectFolder(f.id)}
            onContextMenu={e => handleContextMenu(e, f)}
          >
            <span className={styles.folderIcon}>📁</span>

            {renamingId === f.id ? (
              <input
                ref={renameRef}
                className={styles.renameInput}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => commitRename(f.id)}
                onKeyDown={e => handleRenameKey(e, f.id)}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className={styles.folderName}>{f.name}</span>
            )}
          </div>
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
    </aside>
  );
}
