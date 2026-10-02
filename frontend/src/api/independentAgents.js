import axios from 'axios';
import { attachAuthHeader } from './attachAuthHeader';
import { API_BASE } from './apiBase';

const api = axios.create({ baseURL: `${API_BASE}/api/independent-agents` });
attachAuthHeader(api);

/**
 * One stateless Reddit draft. Nothing is saved server-side; to revise a
 * draft, send the current one back as `extra_context`.
 *
 * @param {{topic: string, subreddit?: string, tone?: string, extra_context?: string}} req
 * @returns {Promise<{title: string, content: string, suggested_subreddit: string}>}
 */
export const generateRedditPost = (req) =>
  api.post('/reddit', req).then(r => r.data);
