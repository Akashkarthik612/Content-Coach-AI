import styles from './Editor.module.css';

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function VersionMeta({ version }) {
  if (!version) return null;
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaItem}>
        <span className={styles.metaLabel}>Version</span>
        <span className={styles.metaMono}>v{version.version_number}</span>
      </span>
      <span className={styles.metaItem}>
        <span className={styles.metaLabel}>Saved</span>
        <span className={styles.metaMono}>{fmt(version.created_at)}</span>
      </span>
      <span className={styles.metaItem}>
        <span className={styles.metaLabel}>Chars</span>
        <span className={styles.metaMono}>{version.char_count ?? '—'}</span>
      </span>
      {version.version_label && (
        <span className={styles.metaItem}>
          <span className={styles.metaLabel}>Label</span>
          <span className={styles.metaNote}>{version.version_label}</span>
        </span>
      )}
    </div>
  );
}
