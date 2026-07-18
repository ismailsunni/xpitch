/*
 * supabase.ts — the single Supabase client.
 *
 * Gracefully degrades: if the VITE_SUPABASE_* env vars are absent (e.g. a build
 * without keys, or a fork), `supabase` is null and `supabaseEnabled` is false —
 * the app then runs exactly as the anonymous local analyzer, with login/save
 * hidden. The anon key is public by design; all security is Postgres RLS.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = !!(url && key);

export const supabase: SupabaseClient<Database> | null = supabaseEnabled
  ? createClient<Database>(url as string, key as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null;

// Used only while resolving a capability-style unlisted share link. Keeping
// the token on this short-lived client avoids attaching it to normal queries.
export function sharedSupabase(shareToken: string | null | undefined): SupabaseClient<Database> | null {
  if (!supabaseEnabled || !shareToken) return null;
  return createClient<Database>(url as string, key as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-xpitch-share': shareToken } },
  });
}

// The app's own base URL (https://ismailsunni.id/xpitch/) for OAuth redirects.
export function appRedirectUrl(): string {
  return window.location.origin + import.meta.env.BASE_URL;
}
