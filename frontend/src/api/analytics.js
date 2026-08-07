import axios from 'axios';
import { attachAuthHeader } from './attachAuthHeader';

const BASE = '/api/analytics';

const api = axios.create({ baseURL: BASE });
attachAuthHeader(api);

export const getKpis = (period) =>
  api.get('/kpis', { params: { period } }).then(r => r.data);

export const getRankings = (period, limit = 10) =>
  api.get('/rankings', { params: { period, limit } }).then(r => r.data);

export const getLoggablePosts = () =>
  api.get('/loggable-posts').then(r => r.data);

export const logExternalPost = (payload) =>
  api.post('/external-posts', payload).then(r => r.data);
