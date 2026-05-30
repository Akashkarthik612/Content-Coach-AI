import axios from 'axios';

const api = axios.create({ baseURL: '/api/auth' });

export const register = (username, email, password) =>
  api.post('/register', { username, email, password }).then(r => r.data);

export const login = (username, password) =>
  api.post('/login', { username, password }).then(r => r.data);
