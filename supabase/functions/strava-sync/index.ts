import { accessTokenForUser, json, options, requireUser, serviceClient, stravaGet } from '../_shared/strava.ts';

function row(userId: string, activity: any) {
  return {
    user_id: userId,
    strava_activity_id: activity.id,
    name: activity.name || null,
    sport_type: activity.sport_type || activity.type || null,
    start_date: activity.start_date || null,
    timezone: activity.timezone || null,
    distance_m: activity.distance ?? null,
    moving_time_s: activity.moving_time ?? null,
    elapsed_time_s: activity.elapsed_time ?? null,
    average_speed_mps: activity.average_speed ?? null,
    max_speed_mps: activity.max_speed ?? null,
    average_heartrate: activity.average_heartrate ?? null,
    max_heartrate: activity.max_heartrate ?? null,
    has_heartrate: activity.has_heartrate ?? false,
    map_summary_polyline: activity.map?.summary_polyline ?? null,
    raw_summary: activity,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const user = await requireUser(request);
    const token = await accessTokenForUser(user.id);
    const activities = await stravaGet('/athlete/activities?per_page=100&page=1', token) as any[];
    const db = serviceClient();
    if (activities.length) {
      const { error } = await db.from('strava_activities').upsert(activities.map((activity) => row(user.id, activity)), { onConflict: 'user_id,strava_activity_id' });
      if (error) throw error;
    }
    const { error: connectionError } = await db.from('strava_connections').update({ last_sync_at: new Date().toISOString() }).eq('user_id', user.id);
    if (connectionError) throw connectionError;
    return json({ imported: activities.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not sync Strava activities.' }, 400);
  }
});
