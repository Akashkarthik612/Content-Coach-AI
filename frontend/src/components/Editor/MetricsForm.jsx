import { useState } from 'react';
import { upsertMetrics } from '../../api/vault';
import { Button } from '../shared/Button';
import styles from './Editor.module.css';

export function MetricsForm({ versionId }) {
  const [open, setOpen] = useState(false);
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');
  const [impressions, setImpressions] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await upsertMetrics(versionId, {
        likes: likes ? parseInt(likes, 10) : undefined,
        comments: comments ? parseInt(comments, 10) : undefined,
        impressions: impressions ? parseInt(impressions, 10) : undefined,
        published_at: publishedAt || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.metricsSection}>
      <button className={styles.metricsToggle} onClick={() => setOpen(o => !o)}>
        {open ? '▲' : '▼'} Engagement metrics
      </button>
      {open && (
        <form className={styles.metricsForm} onSubmit={handleSubmit}>
          <div className={styles.metricsRow}>
            <label className={styles.metricsLabel}>
              Likes
              <input type="number" min="0" value={likes} onChange={e => setLikes(e.target.value)} className={styles.metricsInput} />
            </label>
            <label className={styles.metricsLabel}>
              Comments
              <input type="number" min="0" value={comments} onChange={e => setComments(e.target.value)} className={styles.metricsInput} />
            </label>
            <label className={styles.metricsLabel}>
              Impressions
              <input type="number" min="0" value={impressions} onChange={e => setImpressions(e.target.value)} className={styles.metricsInput} />
            </label>
          </div>
          <label className={styles.metricsLabel}>
            Published at
            <input type="datetime-local" value={publishedAt} onChange={e => setPublishedAt(e.target.value)} className={styles.metricsInput} />
          </label>
          <Button type="submit" variant="ghost" size="sm" disabled={submitting}>
            {saved ? 'Saved!' : submitting ? 'Saving…' : 'Update metrics'}
          </Button>
        </form>
      )}
    </div>
  );
}
