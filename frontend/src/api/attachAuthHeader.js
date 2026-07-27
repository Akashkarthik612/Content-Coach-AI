import { supabase } from '../lib/supabaseClient';

export function attachAuthHeader(axiosInstance) {
  axiosInstance.interceptors.request.use(async (config) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      config.headers['Authorization'] = `Bearer ${data.session.access_token}`;
    }
    return config;
  });
}
