import { accessTokenForUser, json, options, requireAdmin, serviceClient } from '../_shared/strava.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    await requireAdmin(request);
    const { userId } = await request.json();
    if (typeof userId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(userId)) throw new Error('Invalid user.');

    // Best effort upstream revoke. Local token deletion still happens if the
    // Strava credential has already expired or was revoked elsewhere.
    try {
      const token = await accessTokenForUser(userId);
      await fetch('https://www.strava.com/oauth/deauthorize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Continue with local cleanup.
    }

    const db = serviceClient();
    const { error: activitiesError } = await db.from('strava_activities').delete().eq('user_id', userId);
    if (activitiesError) throw activitiesError;
    const { error: tokenError } = await db.from('strava_tokens').delete().eq('user_id', userId);
    if (tokenError) throw tokenError;
    const { error: connectionError } = await db.from('strava_connections').delete().eq('user_id', userId);
    if (connectionError) throw connectionError;
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not disconnect Strava.' }, 400);
  }
});
