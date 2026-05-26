import axios from 'axios';

const BASE = 'http://localhost:8000/api/vault';

const api = axios.create({ baseURL: BASE });

api.interceptors.request.use(config => {
  const userId = localStorage.getItem('user_id');
  if (userId) config.headers['X-User-Id'] = userId;
  return config;
});

// ── Folders ──────────────────────────────────────────────────
export const getFolders = () =>
  api.get('/folders').then(r => r.data);

export const createFolder = (name, description) =>
  api.post('/folders', { name, description }).then(r => r.data);

export const renameFolder = (id, name) =>
  api.patch(`/folders/${id}`, { name }).then(r => r.data);

export const deleteFolder = (id) =>
  api.delete(`/folders/${id}`).then(r => r.data);

// ── Posts (folder-scoped) ─────────────────────────────────────
export const getPostsInFolder = (folderId) =>
  api.get(`/folders/${folderId}/posts`).then(r => r.data);

export const createPost = (folderId, title) =>
  api.post(`/folders/${folderId}/posts`, { title }).then(r => r.data);

// ── Posts ─────────────────────────────────────────────────────
export const getPost = (id) =>
  api.get(`/posts/${id}`).then(r => r.data);

export const renamePost = (id, title) =>
  api.patch(`/posts/${id}`, { title }).then(r => r.data);

export const deletePost = (id) =>
  api.delete(`/posts/${id}`).then(r => r.data);

export const pinPost = (id, is_pinned) =>
  api.patch(`/posts/${id}/pin`, { is_pinned }).then(r => r.data);

// ── Versions ──────────────────────────────────────────────────
export const saveVersion = (postId, content, versionLabel) =>
  api.post(`/posts/${postId}/versions`, {
    content,
    version_label: versionLabel || null,
    source: 'manual',
  }).then(r => r.data);

export const getVersions = (postId) =>
  api.get(`/posts/${postId}/versions`).then(r => r.data);

export const getVersion = (versionId) =>
  api.get(`/versions/${versionId}`).then(r => r.data);

export const renameVersion = (versionId, versionLabel) =>
  api.patch(`/versions/${versionId}`, { version_label: versionLabel }).then(r => r.data);

export const deleteVersion = (versionId) =>
  api.delete(`/versions/${versionId}`).then(r => r.data);

// ── Search ────────────────────────────────────────────────────
export const search = (query) =>
  api.get('/search', { params: { q: query } }).then(r => r.data);
