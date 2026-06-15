import { useState, useEffect } from 'react';

// TODO: connect HN + Google News feeds for live idea sourcing
const MOCK_IDEAS = [
  { id: 1, title: 'Why most AI writing tools make you sound generic', source: 'HN', saves: 312 },
  { id: 2, title: '10 lessons from building in public for 90 days',   source: 'HN', saves: 187 },
  { id: 3, title: 'The real reason LinkedIn reach dropped in 2025',    source: 'News', saves: 94 },
  { id: 4, title: 'Thread formats that grew my audience by 3×',        source: 'HN', saves: 76  },
];

export function useIdeas() {
  const [ideas, setIdeas]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setIdeas(MOCK_IDEAS); setLoading(false); }, 300);
    return () => clearTimeout(t);
  }, []);

  return { ideas, loading };
}
