// Absolute origin of the backend API (e.g. https://your-app.onrender.com).
// Empty by default so local dev keeps using Vite's `/api` proxy (vite.config.js)
// unchanged. Set VITE_API_BASE_URL in Vercel once the frontend and backend are
// on different origins.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
