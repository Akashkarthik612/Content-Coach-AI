import { useContext, useState, useRef } from 'react';
import { AppContext } from '../../AppContext';
import { ContextMenu } from '../shared/ContextMenu';
import { deletePost, renamePost } from '../../api/vault';
import styles from './PostList.module.css';

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function PostListItem({ post, expanded, onToggleExpand }) {
  const { selectedPostId, openPost, refetchPosts, setMode } = useContext(AppContext);
  const isSelected = selectedPostId === post.id;

  const [menu, setMenu]           = useState(null);
  const [renaming, setRenaming]   = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef(null);

  function handleContextMenu(e) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  function startRename() {
    setRenaming(true);
    setRenameValue(post.title);
    setTimeout(() => renameRef.current?.select(), 0);
  }

  async function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== post.title) {
      await renamePost(post.id, trimmed);
      refetchPosts();
    }
    setRenaming(false);
  }

  function handleRenameKey(e) {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') setRenaming(false);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    await deletePost(post.id);
    if (isSelected) setMode('idle');
    refetchPosts();
  }

  const menuItems = [
    { label: 'Rename', onClick: startRename },
    { label: 'Delete post', danger: true, onClick: handleDelete },
  ];

  return (
    <>
      <tr
        className={`${styles.row} ${isSelected ? styles.selected : ''}`}
        onClick={() => !renaming && openPost(post.id)}
        onContextMenu={handleContextMenu}
      >
        <td className={styles.tdTitle}>
          {renaming ? (
            <input
              ref={renameRef}
              className={styles.renameInput}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKey}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className={styles.titleText}>{post.title}</span>
          )}
        </td>
        <td>
          <span className={`${styles.status} ${styles[`status_${post.status}`]}`}>
            {post.status}
          </span>
        </td>
        <td>
          <span className={styles.mono}>{post.current_version}</span>
        </td>
        <td>
          <span className={styles.mono}>{fmt(post.updated_at)}</span>
        </td>
        <td className={styles.tdActions} onClick={e => e.stopPropagation()}>
          <button
            className={styles.expandBtn}
            onClick={() => onToggleExpand(post.id)}
            title="Toggle details"
          >
            {expanded ? '▲' : '▼'}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className={styles.expandedRow}>
          <td colSpan={5}>
            <div className={styles.expandedInfo}>
              <span className={styles.mono}>Status: {post.status}</span>
              <span className={styles.mono}>Created: {fmt(post.created_at)}</span>
              <span className={styles.mono}>Versions: {post.current_version}</span>
            </div>
          </td>
        </tr>
      )}

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
