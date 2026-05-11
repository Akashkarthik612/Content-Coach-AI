import { useState, useEffect, useCallback } from 'react';
import { getFolders } from '../api/vault';

export function useFolders() {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    getFolders()
      .then(data => setFolders(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { folders, loading, refetch };
}
