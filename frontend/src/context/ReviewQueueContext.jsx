import { createContext, useContext, useState } from 'react';

const ReviewQueueContext = createContext(null);

const MOCK_QUEUE = [
  { id: 'r1', title: 'Why voice matters more than SEO in 2025', platform: 'linkedin', status: 'needs_review' },
  { id: 'r2', title: 'Thread: 5 things I stopped doing as a writer', platform: 'x',        status: 'needs_review' },
  { id: 'r3', title: 'How I use AI as a thinking partner, not a ghostwriter', platform: 'reddit', status: 'needs_review' },
];

export function ReviewQueueProvider({ children }) {
  const [queue, setQueue] = useState(MOCK_QUEUE);

  const removeFromQueue = (id) => setQueue(q => q.filter(item => item.id !== id));
  const addToQueue      = (item) => setQueue(q => [item, ...q]);

  return (
    <ReviewQueueContext.Provider value={{ queue, removeFromQueue, addToQueue }}>
      {children}
    </ReviewQueueContext.Provider>
  );
}

export function useReviewQueue() {
  const ctx = useContext(ReviewQueueContext);
  if (!ctx) throw new Error('useReviewQueue must be used inside ReviewQueueProvider');
  return ctx;
}
