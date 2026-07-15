/*
 * api.ts — typed Supabase data/storage access for saved matches.
 * Phase 1: create a match from the current in-memory analysis, and re-open a
 * saved match by its short id (download .fit(s) from Storage + rows).
 */
import { nanoid } from 'nanoid';
import { supabase } from './supabase';
import { auth, reloadProfile } from './auth';
import { compute } from './analytics';
import { fitTimestampToDate } from './fit-parser';
import { centroid, haversine, type LatLon } from './geo';
import {
  store,
  recompute,
  getRawFiles,
  nonCombinedSegments,
  dirsForSegment,
  isPredefined,
  type CloudSession,
} from '../store';

const FIELD_MATCH_M = 1500;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'pitch'
  );
}

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

  // 2. Insert the match row (link to the nearest known pitch, if any)
  const meta = store.analytics.meta;
  const nearField =
    meta.startLat != null && meta.startLon != null
      ? await resolveNearestFieldId(meta.startLat, meta.startLon)
      : null;
  const selectedFieldId = store.selectedFieldId && !isPredefined(store.selectedFieldId) ? store.selectedFieldId : nearField?.id ?? null;
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
      primary_field_id: selectedFieldId,
      file_names: store.files,
      break_files: store.breakFiles,
      break_session_starts: store.breakSessionStarts,
      manual_splits: store.manualSplits,
      visibility: opts.visibility ?? 'unlisted',
    })
    .select()
    .single();
  if (mErr) throw mErr;

  // 3. Insert one session row per non-combined segment (with cached summary)
  const { error: sErr } = await sb.from('sessions').insert(buildSessionRows(match.id, uid, selectedFieldId));
  if (sErr) throw sErr;

  return shortId;
}

// Build the session rows for the current in-memory analysis (used by both
// create and update). Recomputes each segment with the current options so the
// cached summary/role reflect the latest edits.
function buildSessionRows(matchId: string, uid: string, fieldId: string | null) {
  return nonCombinedSegments().map((seg, i) => {
    const dirs = dirsForSegment(seg);
    const a = compute(
      { records: seg.records, sessions: seg.session ? [seg.session] : [], laps: [], events: [], activity: null, file_id: null, other: {} },
      {
        age: store.options.age,
        maxHR: store.options.maxHR,
        maxHRSource: store.options.maxHRSource,
        sprintKmh: store.options.sprintKmh,
        highIntensityKmh: store.options.highIntensityKmh,
        attackingDir: dirs.attacking_dir,
        sideDir: dirs.side_dir,
        format: store.options.format,
      }
    );
    return {
      match_id: matchId,
      owner_id: uid,
      seq: i + 1,
      field_id: fieldId,
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
        maxHRSource: store.options.maxHRSource,
        sprintKmh: store.options.sprintKmh,
        highIntensityKmh: store.options.highIntensityKmh,
        format: store.options.format,
      },
    };
  });
}

// Persist edits to an existing match: match-level options + rebuilt sessions
// (delete + re-insert cleanly handles a changed manual split). Returns the new
// session id/seq pairs so callers can refresh their seq→id map.
export async function updateMatchFromCurrent(matchId: string): Promise<{ id: string; seq: number }[]> {
  const sb = requireClient();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in to save changes.');
  if (!store.analytics) throw new Error('Nothing to save.');
  const meta = store.analytics.meta;
  const nearField =
    meta.startLat != null && meta.startLon != null ? await resolveNearestFieldId(meta.startLat, meta.startLon) : null;

  const selectedFieldId = store.selectedFieldId && !isPredefined(store.selectedFieldId) ? store.selectedFieldId : nearField?.id ?? null;
  const { error: mErr } = await sb
    .from('matches')
    .update({
      format: store.options.format,
      group_gap_min: store.options.groupGapMin,
      manual_splits: store.manualSplits,
      break_files: store.breakFiles,
      break_session_starts: store.breakSessionStarts,
      primary_field_id: selectedFieldId,
    })
    .eq('id', matchId);
  if (mErr) throw mErr;

  const { error: dErr } = await sb.from('sessions').delete().eq('match_id', matchId);
  if (dErr) throw dErr;
  const { data: inserted, error: sErr } = await sb
    .from('sessions')
    .insert(buildSessionRows(matchId, uid, selectedFieldId))
    .select('id,seq');
  if (sErr) throw sErr;
  return inserted || [];
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

// ---- Feed, fields list, profile (Phase 4) ----

// Attach { _author: {username, display_name} } to match rows (client-side join).
async function attachAuthors(matches: any[]): Promise<any[]> {
  const ids = [...new Set(matches.map((m) => m.owner_id).filter(Boolean))];
  if (!ids.length) return matches;
  const sb = requireClient();
  const { data } = await sb.from('profiles').select('id, username, display_name').in('id', ids);
  const map = new Map((data || []).map((p: any) => [p.id, p]));
  return matches.map((m) => ({ ...m, _author: map.get(m.owner_id) || null }));
}

// Public + own matches, newest first, paginated.
export async function listFeed(
  page = 0,
  pageSize = 12,
  mine = false
): Promise<{ matches: any[]; total: number }> {
  const sb = requireClient();
  const from = page * pageSize;
  const to = from + pageSize - 1;
  let q = sb
    .from('matches')
    .select(
      'short_id, title, format, started_at, created_at, visibility, owner_id, location_label, sessions(seq, duration_s, summary)',
      { count: 'exact' }
    )
    .order('started_at', { ascending: false, nullsFirst: false })
    .range(from, to);
  const uid = auth.user?.id;
  // "My matches" → only the signed-in user's (any visibility, per RLS);
  // otherwise the public feed plus the user's own.
  if (mine && uid) q = q.eq('owner_id', uid);
  else q = uid ? q.or(`visibility.eq.public,owner_id.eq.${uid}`) : q.eq('visibility', 'public');
  const { data, error, count } = await q;
  if (error) throw error;
  const matches = await attachAuthors(data || []);
  return { matches, total: count || 0 };
}

// Public + own pitches (predefined ones are public → included).
export async function listFields(): Promise<any[]> {
  const sb = requireClient();
  let q = sb
    .from('fields')
    .select('id, slug, name, corners, visibility, owner_id, centroid_lat, centroid_lon')
    .order('name');
  const uid = auth.user?.id;
  q = uid ? q.or(`visibility.eq.public,owner_id.eq.${uid}`) : q.eq('visibility', 'public');
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function setFieldVisibility(id: string, visibility: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from('fields').update({ visibility }).eq('id', id);
  if (error) throw error;
  await loadMyFields();
}

export async function updateProfile(patch: {
  display_name?: string | null;
  bio?: string | null;
  birth_date?: string | null;
}): Promise<void> {
  const sb = requireClient();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in first.');
  const { error } = await sb.from('profiles').update(patch).eq('id', uid);
  if (error) throw error;
  await reloadProfile();
}

// ---- Cloud pitches (Phase 3) ----

// Load the signed-in user's saved pitches into the store (for auto-matching).
export async function loadMyFields(): Promise<void> {
  if (!supabase || !auth.user) {
    store.cloudFields = [];
    return;
  }
  const { data } = await supabase
    .from('fields')
    .select('id, slug, name, corners, visibility')
    .eq('owner_id', auth.user.id)
    .order('created_at');
  store.cloudFields = (data || []).map((f: any) => ({
    id: f.id,
    slug: f.slug,
    name: f.name,
    corners: f.corners,
    visibility: f.visibility,
  }));
  recompute();
}

// Create or update a pitch owned by the current user.
export async function upsertFieldCloud(field: {
  id?: string;
  name: string;
  corners: LatLon[];
  visibility?: string;
}): Promise<any> {
  const sb = requireClient();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in to save pitches.');
  const c = centroid(field.corners);
  const patch: any = { name: field.name, corners: field.corners, centroid_lat: c?.lat ?? null, centroid_lon: c?.lon ?? null };
  if (field.visibility) patch.visibility = field.visibility;
  let row: any;
  if (field.id) {
    const { data, error } = await sb.from('fields').update(patch).eq('id', field.id).select().single();
    if (error) throw error;
    row = data;
  } else {
    const slug = `${slugify(field.name)}-${nanoid(4).toLowerCase()}`;
    const { data, error } = await sb
      .from('fields')
      .insert({ owner_id: uid, slug, visibility: field.visibility || 'unlisted', ...patch })
      .select()
      .single();
    if (error) throw error;
    row = data;
  }
  await loadMyFields();
  return row;
}

export async function deleteFieldCloud(id: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from('fields').delete().eq('id', id);
  if (error) throw error;
  await loadMyFields();
}

export async function getField(slug: string): Promise<any | null> {
  const sb = requireClient();
  const { data } = await sb.from('fields').select('*').eq('slug', slug).maybeSingle();
  return data ?? null;
}

// Matches linked to a field, visible to the viewer (public, or their own).
export async function listMatchesByField(fieldId: string): Promise<any[]> {
  const sb = requireClient();
  const { data } = await sb
    .from('matches')
    .select('short_id, title, format, started_at, created_at, visibility, owner_id, location_label, sessions(seq, duration_s, summary)')
    .eq('primary_field_id', fieldId)
    .order('started_at', { ascending: false, nullsFirst: false });
  return (data || []).filter((m: any) => m.visibility === 'public' || m.owner_id === auth.user?.id);
}

// Nearest DB field (visible to caller) to a point, within FIELD_MATCH_M.
export async function resolveNearestFieldId(lat: number, lon: number): Promise<{ id: string; slug: string } | null> {
  const sb = requireClient();
  const { data } = await sb.from('fields').select('id, slug, centroid_lat, centroid_lon');
  let best: any = null;
  let bestD = Infinity;
  for (const f of data || []) {
    if (f.centroid_lat == null || f.centroid_lon == null) continue;
    const d = haversine(lat, lon, f.centroid_lat, f.centroid_lon);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best && bestD <= FIELD_MATCH_M ? { id: best.id, slug: best.slug } : null;
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
