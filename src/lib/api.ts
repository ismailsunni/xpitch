/*
 * api.ts — typed Supabase data/storage access for saved matches.
 * Phase 1: create a match from the current in-memory analysis, and re-open a
 * saved match by its short id (download .fit(s) from Storage + rows).
 */
import { nanoid } from 'nanoid';
import { supabase } from './supabase';
import { auth } from './auth';
import { compute } from './analytics';
import { fitTimestampToDate } from './fit-parser';
import {
  store,
  getRawFiles,
  nonCombinedSegments,
  dirsForSegment,
  type CloudSession,
} from '../store';

const BUCKET = 'fits';

function requireClient() {
  if (!supabase) throw new Error('Cloud features are not configured.');
  return supabase;
}

function metaSubset(meta: any) {
  if (!meta) return null;
  return {
    startDate: meta.startDate ?? null,
    durationS: meta.durationS,
    sampleCount: meta.sampleCount,
    sport: meta.sport ?? null,
    format: meta.format,
    formatLabel: meta.formatLabel,
    startLat: meta.startLat ?? null,
    startLon: meta.startLon ?? null,
    hasGPS: meta.hasGPS,
    hasHR: meta.hasHR,
  };
}

export interface CreateMatchOpts {
  title?: string | null;
  visibility?: 'private' | 'unlisted' | 'public';
}

// Save the currently analyzed match. Returns the new match short_id.
export async function createMatchFromCurrent(opts: CreateMatchOpts = {}): Promise<string> {
  const sb = requireClient();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in to save matches.');
  if (!auth.profile?.username) throw new Error('Choose a username first.');
  const raw = getRawFiles();
  if (!raw.length) throw new Error('This match has no source file (demo data can’t be saved).');
  const segs = nonCombinedSegments();
  if (!segs.length || !store.analytics) throw new Error('Nothing to save yet.');

  const shortId = nanoid(12);

  // 1. Upload raw .fit files to fits/{uid}/{shortId}/{filename}
  for (const f of raw) {
    const path = `${uid}/${shortId}/${f.name}`;
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(path, new Blob([f.bytes], { type: 'application/octet-stream' }), { upsert: true });
    if (error) throw error;
  }

  // 2. Insert the match row
  const meta = store.analytics.meta;
  const { data: match, error: mErr } = await sb
    .from('matches')
    .insert({
      short_id: shortId,
      owner_id: uid,
      title: opts.title ?? null,
      sport: typeof meta.sport === 'string' ? meta.sport : null,
      format: store.options.format,
      group_gap_min: store.options.groupGapMin,
      started_at: meta.startDate ? new Date(meta.startDate).toISOString() : null,
      location_label: store.location,
      centroid_lat: meta.startLat ?? null,
      centroid_lon: meta.startLon ?? null,
      file_names: store.files,
      visibility: opts.visibility ?? 'unlisted',
    })
    .select()
    .single();
  if (mErr) throw mErr;

  // 3. Insert one session row per non-combined segment (with cached summary)
  const rows = segs.map((seg, i) => {
    const dirs = dirsForSegment(seg);
    const a = compute(
      {
        records: seg.records,
        sessions: seg.session ? [seg.session] : [],
        laps: [],
        events: [],
        activity: null,
        file_id: null,
        other: {},
      },
      {
        age: store.options.age,
        maxHR: store.options.maxHR,
        sprintKmh: store.options.sprintKmh,
        highIntensityKmh: store.options.highIntensityKmh,
        attackingDir: dirs.attacking_dir,
        sideDir: dirs.side_dir,
        format: store.options.format,
      }
    );
    return {
      match_id: match.id,
      owner_id: uid,
      seq: i + 1,
      label: seg.label,
      kind: seg.kind,
      start_time: fitTimestampToDate(seg.startTime)?.toISOString() ?? null,
      end_time: fitTimestampToDate(seg.endTime)?.toISOString() ?? null,
      attacking_dir: dirs.attacking_dir,
      side_dir: dirs.side_dir,
      flips: dirs.flips,
      periods: seg.periods,
      duration_s: a.summary?.durationS ?? null,
      sample_count: a.meta?.sampleCount ?? null,
      summary: a.ok ? { summary: a.summary, meta: metaSubset(a.meta), role: a.football?.role?.top ?? null } : null,
      analysis_options: {
        age: store.options.age,
        maxHR: store.options.maxHR,
        sprintKmh: store.options.sprintKmh,
        highIntensityKmh: store.options.highIntensityKmh,
        format: store.options.format,
      },
    };
  });
  const { error: sErr } = await sb.from('sessions').insert(rows);
  if (sErr) throw sErr;

  return shortId;
}

export interface LoadedMatch {
  match: any;
  sessions: any[];
  rawFiles: { name: string; bytes: ArrayBuffer }[];
}

// Fetch a saved match + sessions and download its .fit files from Storage.
export async function getMatch(shortId: string): Promise<LoadedMatch | null> {
  const sb = requireClient();
  const { data: match, error } = await sb.from('matches').select('*').eq('short_id', shortId).maybeSingle();
  if (error) throw error;
  if (!match) return null;
  const { data: sessions } = await sb.from('sessions').select('*').eq('match_id', match.id).order('seq');
  const names: string[] = match.file_names || [];
  const rawFiles: { name: string; bytes: ArrayBuffer }[] = [];
  for (const name of names) {
    const path = `${match.owner_id}/${shortId}/${name}`;
    const { data, error: dErr } = await sb.storage.from(BUCKET).download(path);
    if (dErr) throw dErr;
    rawFiles.push({ name, bytes: await data.arrayBuffer() });
  }
  return { match, sessions: sessions || [], rawFiles };
}

// Map DB session rows → the store's CloudSession shape.
export function toCloudSessions(sessions: any[]): CloudSession[] {
  return sessions.map((s) => ({
    seq: s.seq,
    attacking_dir: s.attacking_dir,
    side_dir: s.side_dir,
    flips: s.flips,
  }));
}

// ---- Profiles & match listing (Phase 2) ----
export async function getProfileByUsername(username: string): Promise<any | null> {
  const sb = requireClient();
  const { data } = await sb
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url')
    .eq('username', username)
    .maybeSingle();
  return data ?? null;
}

export interface ProfileMatches {
  profile: any;
  isOwner: boolean;
  matches: any[];
}

// A user's matches. The owner sees all; everyone else sees only public ones.
export async function listMatches(username: string): Promise<ProfileMatches | null> {
  const sb = requireClient();
  const profile = await getProfileByUsername(username);
  if (!profile) return null;
  const isOwner = auth.user?.id === profile.id;
  let q = sb
    .from('matches')
    .select(
      'short_id, title, sport, format, started_at, created_at, visibility, location_label, sessions(seq, duration_s, summary)'
    )
    .eq('owner_id', profile.id)
    .order('started_at', { ascending: false, nullsFirst: false });
  if (!isOwner) q = q.eq('visibility', 'public');
  const { data, error } = await q;
  if (error) throw error;
  return { profile, isOwner, matches: data || [] };
}

export async function setMatchVisibility(matchId: string, visibility: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from('matches').update({ visibility }).eq('id', matchId);
  if (error) throw error;
}

export async function updateMatchTitle(matchId: string, title: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from('matches').update({ title: title || null }).eq('id', matchId);
  if (error) throw error;
}

// Delete a match: remove its .fit files from Storage, then the row (sessions cascade).
export async function deleteMatch(match: {
  id: string;
  short_id: string;
  owner_id: string;
  file_names?: string[] | null;
}): Promise<void> {
  const sb = requireClient();
  const names = match.file_names || [];
  if (names.length) {
    const paths = names.map((n) => `${match.owner_id}/${match.short_id}/${n}`);
    await sb.storage.from(BUCKET).remove(paths);
  }
  const { error } = await sb.from('matches').delete().eq('id', match.id);
  if (error) throw error;
}

// Persist a single session's direction flips (owner editing a saved match).
export async function updateSessionDirs(
  sessionId: string,
  attacking_dir: number,
  side_dir: number,
  flips: unknown
): Promise<void> {
  const sb = requireClient();
  await sb.from('sessions').update({ attacking_dir, side_dir, flips }).eq('id', sessionId);
}
