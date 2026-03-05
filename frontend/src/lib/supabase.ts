import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined);
const configuredStorageKey = (import.meta.env.VITE_SUPABASE_AUTH_STORAGE_KEY as string | undefined)?.trim();

function getProjectRef(url: string | undefined) {
  const value = (url || '').trim();
  if (!value) return '';
  try {
    const host = new URL(value).hostname;
    const projectRef = host.split('.')[0] || '';
    return projectRef.trim();
  } catch {
    return '';
  }
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
const projectRef = getProjectRef(supabaseUrl);
const storageKey = configuredStorageKey || `sb-${projectRef || 'local'}-auth-token-ezyaiagent`;

if (!isSupabaseConfigured) {
  console.warn(
    '[Auth] Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  );
}

export const supabase = createClient(supabaseUrl ?? 'https://invalid.localhost', supabasePublishableKey ?? 'invalid-key', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey
  }
});
