import { useState, useContext, useCallback } from 'react';
import { AppContext } from '../../AppContext';
import { PostListItem } from './PostListItem';
import { Button } from '../shared/Button';
import styles from './PostList.module.css';

export function PostList() {
  const { posts, selectedFolderId, folders, openNewPost } = useContext(AppContext);
  const [expandedRowId, setExpandedRowId] = useState(null);

  const toggleExpand = useCallback((id) => {
    setExpandedRowId(prev => prev === id ? null : id);
  }, []);

  const selectedFolder = folders.find(f => f.id === selectedFolderId);

  if (!selectedFolderId) {
    return (
      <aside className={styles.panel}>
        <div className={styles.emptyPanel}>
          <p className={styles.emptyText}>Select a folder to see posts</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div>
          <p className={styles.folderLabel}>Folder</p>
          <p className={styles.folderName}>{selectedFolder?.name}</p>
        </div>
        <Button variant="primary" size="sm" onClick={openNewPost}>
          + New Post
        </Button>
      </div>

      {posts.length === 0 ? (
        <div className={styles.emptyPanel}>
          <p className={styles.emptyText}>No posts in this folder yet.</p>
          <p className={styles.emptyHint}>Click "New Post" to create one.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thTitle}>Title</th>
                <th>Status</th>
                <th className={styles.thNarrow}>Ver</th>
                <th className={styles.thNarrow}>Updated</th>
                <th className={styles.thNarrow}></th>
              </tr>
            </thead>
            <tbody>
              {posts.map(post => (
                <PostListItem
                  key={post.id}
                  post={post}
                  expanded={expandedRowId === post.id}
                  onToggleExpand={toggleExpand}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
}
