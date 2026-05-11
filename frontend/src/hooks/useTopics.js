import { useState, useEffect } from 'react';
import { getTopics } from '../api/vault';

export function useTopics() {
  const [topics, setTopics] = useState([]);

  useEffect(() => {
    getTopics()
      .then(data => setTopics(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  return topics;
}
