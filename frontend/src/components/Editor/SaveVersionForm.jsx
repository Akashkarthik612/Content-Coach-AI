import { useState } from 'react';
import { Button } from '../shared/Button';
import styles from './Editor.module.css';

export function SaveVersionForm({ onSave }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(notes);
      setNotes('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.saveSection}>
      <p className={styles.saveSectionLabel}>Save as new version</p>
      <textarea
        className={styles.notesTextarea}
        placeholder="What changed in this version? (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
      />
      <Button variant="primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save version'}
      </Button>
    </div>
  );
}
