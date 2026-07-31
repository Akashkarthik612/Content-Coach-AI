import { createClient } from '@supabase/supabase-js';

// In VITE_AUTH_MODE=local (dev-only), no real Supabase project is configured — fall
// back to placeholders so createClient() never throws at module load. Safe because
// no supabase.auth.* call is ever made on the local-auth code path.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
