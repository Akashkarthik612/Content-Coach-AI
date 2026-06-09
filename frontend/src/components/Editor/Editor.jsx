import { useState, useEffect, useContext } from 'react';
import { AppContext } from '../../AppContext';
import { createFolder, createPost, saveVersion, getVersions, getVersion } from '../../api/vault';
import { VersionTabs } from './VersionTabs';
import { VersionMeta } from './VersionMeta';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';
import styles from './Editor.module.css';

// ── New Folder Form ──────────────────────────────────────────
function NewFolderForm() {
  const { refetchFolders, selectFolder, setMode } = useContext(AppContext);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const folder = await createFolder(name.trim(), desc.trim() || null);
      refetchFolders();
      selectFolder(folder.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.formPage}>
      <p className={styles.formHeading}>New Folder</p>
      <Input label="Folder name" id="folder-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Thought Leadership" />
      <Input label="Description (optional)" id="folder-desc" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What's this folder for?" />
      <div className={styles.formActions}>
        <Button variant="primary" onClick={handleCreate} disabled={!name.trim() || saving}>
          {saving ? 'Creating…' : 'Create Folder'}
        </Button>
        <Button variant="ghost" onClick={() => setMode('idle')}>Cancel</Button>
      </div>
    </div>
  );
}

// ── New Post Form ────────────────────────────────────────────
function NewPostForm() {
  const { selectedFolderId, openPost, refetchPosts, setMode } = useContext(AppContext);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [label, setLabel] = useState('v1');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const post = await createPost(selectedFolderId, title.trim());
      await saveVersion(post.id, content, label.trim() || 'v1');
      refetchPosts();
      openPost(post.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.formPage}>
      <p className={styles.formHeading}>New Post</p>
      <Input label="Post title (internal label)" id="post-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Why remote work changes leadership" />
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Content</label>
        <textarea
          className={styles.newPostTextarea}
          placeholder="Write your LinkedIn post here…"
          value={content}
          onChange={e => setContent(e.target.value)}
        />
      </div>
      <Input label="Version label" id="post-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="v1" />
      <div className={styles.formActions}>
        <Button variant="primary" onClick={handleCreate} disabled={!title.trim() || !content.trim() || saving}>
          {saving ? 'Saving…' : 'Create & Save as Version'}
        </Button>
        <Button variant="ghost" onClick={() => setMode('idle')}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Post Editor ──────────────────────────────────────────────
function PostEditor({ postId }) {
  const [versionList, setVersionList] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeVersion, setActiveVersion] = useState(null);
  const [draft, setDraft]   = useState('');
  const [loading, setLoading] = useState(true);
  const [savingVersion, setSavingVersion] = useState(false);
  const [newVersionLabel, setNewVersionLabel] = useState('');

  useEffect(() => {
    loadVersions();
  }, [postId]);

  async function loadVersions(forceIdx) {
    setLoading(true);
    try {
      const list = await getVersions(postId);
      setVersionList(list);
      if (list.length > 0) {
        const targetIdx = forceIdx !== undefined
          ? Math.min(forceIdx, list.length - 1)
          : list.length - 1;
        setActiveIdx(targetIdx);
        await loadVersionContent(list[targetIdx].id, targetIdx === list.length - 1);
      } else {
        setActiveVersion(null);
        setDraft('');
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadVersionContent(versionId, isLatest = false) {
    const v = await getVersion(versionId);
    setActiveVersion(v);
    if (isLatest) setDraft(v.content);
  }

  async function handleTabSelect(idx) {
    setActiveIdx(idx);
    const isLatest = idx === versionList.length - 1;
    await loadVersionContent(versionList[idx].id, isLatest);
  }

  async function handleSaveVersion() {
    if (!draft.trim()) return;
    setSavingVersion(true);
    try {
      await saveVersion(postId, draft, newVersionLabel.trim() || null);
      setNewVersionLabel('');
      await loadVersions();
    } finally {
      setSavingVersion(false);
    }
  }

  const isLatest = versionList.length === 0 || activeIdx === versionList.length - 1;
  const isReadOnly = !isLatest;
  const displayContent = isLatest ? draft : (activeVersion?.content ?? '');

  if (loading) {
    return <div className={styles.loadingState}>Loading…</div>;
  }

  return (
    <div className={styles.postEditorWrap}>
      {versionList.length > 0 && (
        <VersionTabs
          versions={versionList}
          activeIndex={activeIdx}
          onSelect={handleTabSelect}
          onRefresh={loadVersions}
        />
      )}

      <div className={styles.body}>
        <textarea
          className={styles.textarea}
          value={displayContent}
          onChange={e => setDraft(e.target.value)}
          readOnly={isReadOnly}
          placeholder={versionList.length === 0 ? 'Start writing…' : 'Write your post here…'}
        />

        {activeVersion && <VersionMeta version={activeVersion} />}

        {/* Save new version — always shown so user can save a new version at any time */}
        <div className={styles.saveSection}>
          <p className={styles.saveSectionLabel}>Save as new version</p>
          <div className={styles.saveRow}>
            <input
              className={styles.labelInput}
              placeholder={`v${(versionList.length) + 1} — e.g. "After feedback"`}
              value={newVersionLabel}
              onChange={e => setNewVersionLabel(e.target.value)}
            />
            <Button
              variant="primary"
              onClick={handleSaveVersion}
              disabled={!draft.trim() || savingVersion}
            >
              {savingVersion ? 'Saving…' : `Save as v${versionList.length + 1}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Editor Container ─────────────────────────────────────────
export function Editor() {
  const { mode, selectedPostId, selectedFolderId, posts } = useContext(AppContext);

  const selectedPost = posts.find(p => p.id === selectedPostId);

  if (mode === 'newFolder') {
    return <main className={styles.editor}><NewFolderForm /></main>;
  }

  if (mode === 'newPost') {
    return <main className={styles.editor}><NewPostForm /></main>;
  }

  if (mode === 'post' && selectedPostId) {
    return (
      <main className={styles.editor}>
        <div className={styles.postHeader}>
          <p className={styles.postTitle}>{selectedPost?.title ?? '…'}</p>
          <span className={`${styles.statusChip} ${styles[`status_${selectedPost?.status}`]}`}>
            {selectedPost?.status}
          </span>
        </div>
        <PostEditor key={selectedPostId} postId={selectedPostId} />
      </main>
    );
  }

  // idle
  return (
    <main className={styles.editor}>
      <div className={styles.emptyState}>
        {!selectedFolderId
          ? <p className={styles.emptyTitle}>Open a folder from the sidebar</p>
          : <p className={styles.emptyTitle}>Select a post or create a new one</p>
        }
      </div>
    </main>
  );
}
