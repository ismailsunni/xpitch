/*
 * auth.ts — reactive auth/session/profile state, separate from the match store.
 * No-ops gracefully when Supabase is not configured.
 */
import { reactive } from 'vue';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseEnabled, appRedirectUrl } from './supabase';

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  birth_date: string | null;
  max_hr: number | null;
  rest_hr: number | null;
}

export interface UserPrivilege {
  user_id: string;
  level: 'user' | 'admin';
}

export const auth = reactive<{
  enabled: boolean;
  ready: boolean;
  user: User | null;
  profile: Profile | null;
  privilege: UserPrivilege | null;
}>({
  enabled: supabaseEnabled,
  ready: false,
  user: null,
  profile: null,
  privilege: null,
});

// Keep profile handles from colliding with any top-level application route.
const RESERVED = new Set([
  'admin',
  'analyze',
  'api',
  'auth',
  'field',
  'fields',
  'help',
  'history',
  'login',
  'match',
  'me',
  'settings',
]);

async function loadProfile(): Promise<void> {
  if (!supabase || !auth.user) {
    auth.profile = null;
    auth.privilege = null;
    return;
  }
  const [{ data: profile }, { data: defaults }, { data: privilege }] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name, avatar_url, bio').eq('id', auth.user.id).maybeSingle(),
    supabase.from('profile_analysis_defaults').select('birth_date, max_hr, rest_hr').eq('user_id', auth.user.id).maybeSingle(),
    supabase.from('user_privileges').select('user_id, level').eq('user_id', auth.user.id).maybeSingle(),
  ]);
  const publicProfile =
    (profile as Profile) ??
    { id: auth.user.id, username: null, display_name: null, avatar_url: null, bio: null };
  auth.profile = {
    ...publicProfile,
    birth_date: defaults?.birth_date ?? null,
    max_hr: defaults?.max_hr ?? null,
    rest_hr: defaults?.rest_hr ?? null,
  };
  auth.privilege = (privilege as UserPrivilege | null) ?? { user_id: auth.user.id, level: 'user' };
}

async function applySession(session: Session | null): Promise<void> {
  auth.user = session?.user ?? null;
  if (auth.user) await loadProfile();
  else auth.profile = null;
}

export async function initAuth(): Promise<void> {
  if (!supabase) {
    auth.ready = true;
    return;
  }
  const { data } = await supabase.auth.getSession();
  await applySession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => {
    void applySession(session);
  });
  auth.ready = true;
}

export function signInWithEmail(email: string, redirectTo?: string) {
  return supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo || appRedirectUrl() } });
}

export function signInWithGoogle(redirectTo?: string) {
  return supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo || appRedirectUrl() } });
}

export async function signOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
  auth.user = null;
  auth.profile = null;
  auth.privilege = null;
}

export async function reloadProfile(): Promise<void> {
  await loadProfile();
}

export function isLoggedIn(): boolean {
  return !!auth.user;
}

export function isAdmin(): boolean {
  return auth.privilege?.level === 'admin';
}

// True when signed in but no username yet (first-login gate).
export function needsUsername(): boolean {
  return !!auth.user && (!auth.profile || !auth.profile.username);
}

export function usernameError(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/.test(n)) return '3–30 chars: letters, numbers, - or _';
  if (RESERVED.has(n)) return 'That name is reserved';
  return null;
}

// Claim a username; returns an error string or null on success.
export async function setUsername(name: string): Promise<string | null> {
  const n = name.trim().toLowerCase();
  const err = usernameError(n);
  if (err) return err;
  if (!supabase || !auth.user) return 'Not signed in';
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: auth.user.id, username: n }, { onConflict: 'id' });
  if (error) {
    if (error.code === '23505') return 'That username is taken';
    return error.message;
  }
  await loadProfile();
  return null;
}
