import axios from 'axios';
import { attachAuthHeader } from './attachAuthHeader';
import { API_BASE } from './apiBase';

const api = axios.create({ baseURL: `${API_BASE}/api/knowledge` });
attachAuthHeader(api);

// ── Google Drive connection ─────────────────────────────────────────────────
// Two calls, both signed in: connect returns Google's consent URL; after
// consent Google redirects to /connect/gdrive/callback, which posts the code
// and state back. The backend only accepts a state issued to this same user.

/** @returns {Promise<{auth_url: string}>} */
export const getDriveConnectUrl = () =>
  api.get('/sources/gdrive/connect').then(r => r.data);

/**
 * @param {{state: string, code?: string|null, error?: string|null}} req
 * @returns {Promise<{id: string, provider: string, display_name: string, status: string}>}
 */
export const completeDriveConnect = (req) =>
  api.post('/sources/gdrive/complete', req).then(r => r.data);

// ── sources and documents ───────────────────────────────────────────────────

/**
 * @returns {Promise<Array<{id: string, provider: 'gdrive'|'upload', display_name: string,
 *   status: 'active'|'paused'|'error'|'needs_reauth', config: {folder_ids?: string[], file_ids?: string[]},
 *   last_success_at: string|null, last_run_at: string|null, last_error: string|null,
 *   needs_reconnect: boolean, syncing: boolean}>>}
 */
export const listSources = () =>
  api.get('/sources').then(r => r.data);

/**
 * Metadata only (no chunk text).
 * @returns {Promise<Array<{id: string, source_id: string, title: string, mime_type: string,
 *   source_url: string|null, chunk_count: number, sync_status: 'synced'|'failed',
 *   last_error: string|null, updated_at: string}>>}
 */
export const listDocuments = () =>
  api.get('/documents').then(r => r.data);

/**
 * One Drive folder level for the picker ("root" = My Drive).
 * @returns {Promise<{parent_id: string, items: Array<{id: string, name: string, mime_type: string, is_folder: boolean}>}>}
 */
export const browseDrive = (sourceId, parentId = 'root') =>
  api.get(`/sources/${sourceId}/folders`, { params: { parent_id: parentId } }).then(r => r.data);

/** Replaces what the source syncs; the next run lists it from scratch. */
export const setSelection = (sourceId, selection) =>
  api.put(`/sources/${sourceId}/selection`, selection).then(r => r.data);

/** Starts a sync in the background (202); a run already going makes it a no-op. */
export const syncSource = (sourceId) =>
  api.post(`/sources/${sourceId}/sync`).then(r => r.data);

/** Removes the source with its documents, chunks and Google tokens. */
export const deleteSource = (sourceId) =>
  api.delete(`/sources/${sourceId}`);

/** Removes one document and its chunks; later syncs skip it. Drive is untouched. */
export const deleteDocument = (documentId) =>
  api.delete(`/documents/${documentId}`);

/** Why a knowledge call failed, as the backend's short reason code. */
export const knowledgeErrorReason = (err) =>
  err?.response?.data?.detail?.reason
  ?? (err?.response?.status === 422 ? 'invalid_request' : 'unknown');
