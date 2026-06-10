import { useState, useEffect, useCallback } from 'react';
import { getPost } from '../api/vault';

export function usePost(id) {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(() => {
    if (!id) { setPost(null); return; }
    setLoading(true);
    getPost(id)
      .then(data => { setPost(data); setError(null); })
      .catch(err => setError(err))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!id) { setPost(null); return; }
    setLoading(true);
    getPost(id)
      .then(data => { setPost(data); setError(null); })
      .catch(err => setError(err))
      .finally(() => setLoading(false));
  }, [id]);

  return { post, loading, error, refetch: fetch };
}
