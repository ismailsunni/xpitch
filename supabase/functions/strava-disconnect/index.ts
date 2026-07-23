import { accessTokenForUser, json, options, requireUser, serviceClient } from '../_shared/strava.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const user = await requireUser(request);
    // Local removal is the important guarantee. A failed upstream revoke must
    // not leave xPitch holding credentials the user asked us to delete.
    try {
      const token = await accessTokenForUser(user.id);
      await fetch('https://www.strava.com/oauth/deauthorize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Token may already be expired or revoked; delete local records below.
    }
    const db = serviceClient();
    const { error: tokenError } = await db.from('strava_tokens').delete().eq('user_id', user.id);
    if (tokenError) throw tokenError;
    const { error: connectionError } = await db.from('strava_connections').delete().eq('user_id', user.id);
    if (connectionError) throw connectionError;
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not disconnect Strava.' }, 400);
  }
});
