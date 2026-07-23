import { appUrl, exchangeAuthorizationCode, serviceClient, verifyState } from '../_shared/strava.ts';

function redirect(status: 'connected' | 'denied' | 'error', message?: string): Response {
  const url = new URL(appUrl('/settings'));
  url.searchParams.set('strava', status);
  if (message) url.searchParams.set('stravaMessage', message.slice(0, 180));
  return Response.redirect(url.toString(), 302);
}

Deno.serve(async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405 });
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return redirect('denied', 'Strava connection was cancelled.');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return redirect('error', 'Missing Strava authorization details.');

  try {
    const { userId } = await verifyState(state);
    const token = await exchangeAuthorizationCode(code);
    const scopes = (url.searchParams.get('scope') || '').split(/[ ,]+/).filter(Boolean);
    if (!scopes.includes('activity:read') && !scopes.includes('activity:read_all')) {
      return redirect('error', 'xPitch needs activity reading permission to import activities.');
    }
    const athlete = token.athlete || {};
    const db = serviceClient();
    const { error: connectionError } = await db.from('strava_connections').upsert({
      user_id: userId,
      athlete_id: athlete.id,
      athlete_username: athlete.username || null,
      athlete_firstname: athlete.firstname || null,
      athlete_lastname: athlete.lastname || null,
      scopes,
      connected_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (connectionError) throw connectionError;
    const { error: tokenError } = await db.from('strava_tokens').upsert({
      user_id: userId,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: new Date(token.expires_at * 1000).toISOString(),
    }, { onConflict: 'user_id' });
    if (tokenError) throw tokenError;
    return redirect('connected');
  } catch (error) {
    return redirect('error', error instanceof Error ? error.message : 'Could not connect Strava.');
  }
});
