import { supabase } from '../lib/supabaseClient';

// Dev-only switch — see AUTH_PROVIDER on the backend (backend/auth_local/).
// Defaults to Supabase; never set VITE_AUTH_MODE=local outside local dev.
const IS_LOCAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'local';

export function attachAuthHeader(axiosInstance) {
  axiosInstance.interceptors.request.use(async (config) => {
    if (IS_LOCAL_AUTH) {
      const userId = localStorage.getItem('user_id');
      if (userId) config.headers['X-User-Id'] = userId;
      return config;
    }

    const { data } = await supabase.auth.getSession();
    if (data.session) {
      config.headers['Authorization'] = `Bearer ${data.session.access_token}`;
    }
    return config;
  });
}
