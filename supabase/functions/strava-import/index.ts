import { accessTokenForUser, json, options, requireUser, serviceClient, stravaGet } from '../_shared/strava.ts';

function streamData(streams: Record<string, { data?: unknown[] }>, key: string): unknown[] {
  return Array.isArray(streams[key]?.data) ? streams[key].data! : [];
}

async function importActivity(userId: string, id: number, token: string, db: ReturnType<typeof serviceClient>) {
  const { data: activity, error: activityError } = await db.from('strava_activities').select('*').eq('user_id', userId).eq('strava_activity_id', id).maybeSingle();
  if (activityError || !activity) throw new Error('Sync your Strava activities before importing one.');
  const streams = await stravaGet(`/activities/${id}/streams?keys=time,latlng,distance,heartrate,velocity_smooth,altitude&key_by_type=true`, token) as Record<string, { data?: unknown[] }>;
  const times = streamData(streams, 'time');
  const latlng = streamData(streams, 'latlng');
  const distance = streamData(streams, 'distance');
  const heartrate = streamData(streams, 'heartrate');
  const speed = streamData(streams, 'velocity_smooth');
  const altitude = streamData(streams, 'altitude');
  const records = times.map((time, index) => {
    const point = Array.isArray(latlng[index]) ? latlng[index] : [];
    return {
      time,
      lat: point[0] ?? null,
      lon: point[1] ?? null,
      distance: distance[index] ?? null,
      heartRate: heartrate[index] ?? null,
      speed: speed[index] ?? null,
      altitude: altitude[index] ?? null,
    };
  }).filter((record) => Number.isFinite(record.time) && Number.isFinite(record.lat) && Number.isFinite(record.lon));
  if (!records.length) throw new Error(`${activity.name || 'This Strava activity'} has no timestamped GPS stream.`);
  return {
    activity: { id, name: activity.name, sportType: activity.sport_type, startDate: activity.start_date },
    records,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const user = await requireUser(request);
    const { activityIds } = await request.json();
    const ids = Array.isArray(activityIds) ? [...new Set(activityIds.map(Number))] : [];
    if (!ids.length || ids.length > 10 || ids.some((id) => !Number.isInteger(id) || id < 1)) throw new Error('Choose between one and ten Strava activities.');
    const db = serviceClient();
    const token = await accessTokenForUser(user.id);
    return json({ activities: await Promise.all(ids.map((id) => importActivity(user.id, id, token, db))) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not import the Strava activity.' }, 400);
  }
});
