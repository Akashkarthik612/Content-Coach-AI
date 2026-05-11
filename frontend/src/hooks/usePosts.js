import { useState, useEffect, useCallback } from 'react';
import { getPostsInFolder } from '../api/vault';

export function usePosts(folderId) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(() => {
    if (!folderId) { setPosts([]); return; }
    setLoading(true);
    getPostsInFolder(folderId)
      .then(data => setPosts(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [folderId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { posts, loading, refetch };
}
