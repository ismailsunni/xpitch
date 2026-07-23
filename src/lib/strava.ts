import { dateToFitTimestamp, type FitResult, type RecordSample, type SessionMessage } from './fit-parser';
import { supabase } from './supabase';
import { loadImportedStravaActivities } from '../store';

export interface StravaConnection {
  athlete_id: number;
  athlete_username: string | null;
  athlete_firstname: string | null;
  athlete_lastname: string | null;
  scopes: string[];
  connected_at: string;
  last_sync_at: string | null;
}

export interface StravaActivity {
  strava_activity_id: number;
  name: string | null;
  sport_type: string | null;
  start_date: string | null;
  distance_m: number | null;
  moving_time_s: number | null;
  elapsed_time_s: number | null;
  average_heartrate: number | null;
  has_heartrate: boolean | null;
  imported_match_id: string | null;
}

type StreamRecord = {
  time: number;
  lat: number;
  lon: number;
  distance: number | null;
  heartRate: number | null;
  speed: number | null;
  altitude: number | null;
};

type ImportedStravaActivity = {
  activity: { id: number; name: string | null; sportType: string | null; startDate: string | null };
  records: StreamRecord[];
};

function client() {
  if (!supabase) throw new Error('Cloud features are not configured.');
  return supabase;
}

async function invoke<T>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await client().functions.invoke(name, body === undefined ? undefined : { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function getStravaConnection(): Promise<StravaConnection | null> {
  const { data, error } = await client().from('strava_connections')
    .select('athlete_id, athlete_username, athlete_firstname, athlete_lastname, scopes, connected_at, last_sync_at')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listStravaActivities(): Promise<StravaActivity[]> {
  const { data, error } = await client().from('strava_activities')
    .select('strava_activity_id, name, sport_type, start_date, distance_m, moving_time_s, elapsed_time_s, average_heartrate, has_heartrate, imported_match_id')
    .order('start_date', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function beginStravaConnection(): Promise<void> {
  const { url } = await invoke<{ url: string }>('strava-connect', {});
  if (!url) throw new Error('Could not start Strava authorization.');
  window.location.assign(url);
}

export async function syncStravaActivities(): Promise<number> {
  const result = await invoke<{ imported: number }>('strava-sync', {});
  return result.imported || 0;
}

export async function disconnectStrava(): Promise<void> {
  await invoke<{ ok: boolean }>('strava-disconnect', {});
}

export async function adminDisconnectStrava(userId: string): Promise<void> {
  await invoke<{ ok: boolean }>('strava-admin-disconnect', { userId });
}

function xml(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char] || char));
}

export function importedToFit(data: ImportedStravaActivity): FitResult {
  const start = data.activity.startDate ? new Date(data.activity.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) throw new Error('Strava activity is missing a valid start date.');
  const records: RecordSample[] = data.records.map((record) => {
    const date = new Date(start.getTime() + record.time * 1000);
    return {
      timestamp: dateToFitTimestamp(date),
      date,
      position_lat: record.lat,
      position_long: record.lon,
      distance: record.distance ?? undefined,
      heart_rate: record.heartRate ?? undefined,
      speed: record.speed ?? undefined,
      altitude: record.altitude ?? undefined,
    };
  });
  const last = records[records.length - 1];
  const session: SessionMessage = {
    start_time: records[0].timestamp,
    timestamp: last.timestamp,
    start_date: records[0].date,
    date: last.date,
    sport: data.activity.sportType || 'running',
    total_elapsed_time: Math.max(0, (last.timestamp || 0) - (records[0].timestamp || 0)),
    total_timer_time: Math.max(0, (last.timestamp || 0) - (records[0].timestamp || 0)),
    total_distance: last.distance,
  };
  return { records, sessions: [session], laps: [], events: [], activity: null, file_id: null, other: {} };
}

function gpxSource(data: ImportedStravaActivity): ArrayBuffer {
  const points = data.records.map((record) => {
    const time = new Date(new Date(data.activity.startDate as string).getTime() + record.time * 1000).toISOString();
    const heartRate = record.heartRate == null ? '' : `<gpxtpx:TrackPointExtension><gpxtpx:hr>${xml(record.heartRate)}</gpxtpx:hr></gpxtpx:TrackPointExtension>`;
    return `<trkpt lat="${xml(record.lat)}" lon="${xml(record.lon)}"><ele>${xml(record.altitude)}</ele><time>${time}</time>${heartRate ? `<extensions>${heartRate}</extensions>` : ''}</trkpt>`;
  }).join('');
  const source = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="xPitch Strava import" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>${xml(data.activity.name || 'Strava activity')}</name><trkseg>${points}</trkseg></trk></gpx>`;
  return new TextEncoder().encode(source).buffer;
}

export async function importStravaActivities(activityIds: number[]): Promise<void> {
  const result = await invoke<{ activities: ImportedStravaActivity[] }>('strava-import', { activityIds });
  if (!result.activities?.length) throw new Error('No Strava activities were returned.');
  const activities = result.activities.map((imported) => ({
    fit: importedToFit(imported),
    name: `strava-${imported.activity.id}.gpx`,
    bytes: gpxSource(imported),
    activityId: String(imported.activity.id),
    title: imported.activity.name || 'Strava activity',
  }));
  loadImportedStravaActivities(activities);
}
