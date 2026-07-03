import { useState, useEffect } from 'react';
import { getAnalyticsSummary } from '../api/vault';

// Fallback shown for accounts with no analytics data yet
const MOCK_ANALYTICS = {
  impressions: 0,
  avgLikes: 0,
  topPlatform: null,
  weeklyTrend: [],
  byPlatform: {},
};

export function useAnalytics() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalyticsSummary()
      .then(summary => setData({
        impressions:  summary.total_impressions,
        avgLikes:     Math.round(summary.avg_reactions),
        topPlatform:  summary.top_platform,
        weeklyTrend:  summary.monthly_trend,  // [{month, impressions, reactions}]
        byPlatform:   {},                     // TODO: per-platform breakdown endpoint
      }))
      .catch(() => setData(MOCK_ANALYTICS))   // new accounts with no data yet
      .finally(() => setLoading(false));
  }, []);

  // TODO: replace stub with real PATCH /posts/{id}/analytics call
  const updatePostMetrics = async (postId, { impressions, reactions }) => {
    console.info('[analytics] updatePostMetrics stub', postId, { impressions, reactions });
  };

  return { data, loading, updatePostMetrics };
}
