import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase env vars. Create frontend/.env with:\n' +
    '  EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\n' +
    '  EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // No auth — disable auto session management to keep the bundle lean
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

export const STORAGE_BUCKET = 'audio-recordings';
