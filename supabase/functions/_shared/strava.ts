import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const STRAVA_OAUTH_URL = 'https://www.strava.com/oauth';
const STRAVA_API_URL = 'https://www.strava.com/api/v3';
const encoder = new TextEncoder();

export const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ismailsunni.id',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function options(): Response {
  return new Response('ok', { headers: corsHeaders });
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name} Edge Function secret.`);
  return value;
}

export function serviceClient() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(request: Request): Promise<User> {
  const authorization = request.headers.get('Authorization');
  if (!authorization) throw new Error('Sign in to use Strava.');
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Your sign-in session has expired. Please log in again.');
  return data.user;
}

function base64url(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(required('STRAVA_STATE_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

export async function createState(userId: string): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify({ userId, exp: Date.now() + 10 * 60 * 1000, nonce: crypto.randomUUID() })));
  return `${payload}.${await sign(payload)}`;
}

export async function verifyState(state: string): Promise<{ userId: string }> {
  const [payload, signature] = state.split('.');
  if (!payload || !signature || signature !== await sign(payload)) throw new Error('Invalid Strava connection state.');
  const decoded = JSON.parse(new TextDecoder().decode(base64urlBytes(payload)));
  if (!decoded?.userId || !decoded?.exp || decoded.exp < Date.now()) throw new Error('The Strava connection request expired. Try again.');
  return { userId: decoded.userId };
}

export function authorizationUrl(state: string): string {
  const url = new URL(`${STRAVA_OAUTH_URL}/authorize`);
  url.search = new URLSearchParams({
    client_id: required('STRAVA_CLIENT_ID'),
    redirect_uri: required('STRAVA_REDIRECT_URI'),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state,
  }).toString();
  return url.toString();
}

export async function exchangeAuthorizationCode(code: string) {
  const response = await fetch(`${STRAVA_OAUTH_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: required('STRAVA_CLIENT_ID'),
      client_secret: required('STRAVA_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) throw new Error(`Strava authorization failed: ${await response.text()}`);
  return response.json();
}

export async function accessTokenForUser(userId: string): Promise<string> {
  const db = serviceClient();
  const { data: token, error } = await db.from('strava_tokens').select('*').eq('user_id', userId).maybeSingle();
  if (error || !token) throw new Error('Connect your Strava account first.');
  if (new Date(token.expires_at).getTime() > Date.now() + 90_000) return token.access_token;

  const response = await fetch(`${STRAVA_OAUTH_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: required('STRAVA_CLIENT_ID'),
      client_secret: required('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
  });
  if (!response.ok) throw new Error('Strava session expired. Reconnect your Strava account.');
  const refreshed = await response.json();
  const { error: updateError } = await db.from('strava_tokens').update({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
  }).eq('user_id', userId);
  if (updateError) throw updateError;
  return refreshed.access_token;
}

export async function stravaGet(path: string, token: string): Promise<unknown> {
  const response = await fetch(`${STRAVA_API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Strava request failed: ${response.status} ${await response.text()}`);
  return response.json();
}

export function appUrl(path = '/settings'): string {
  const base = (Deno.env.get('XPITCH_APP_URL') || 'https://ismailsunni.id/xpitch').replace(/\/$/, '');
  return `${base}${path}`;
}
