/*
 * api.ts — typed Supabase data/storage access for saved matches.
 * Phase 1: create a match from the current in-memory analysis, and re-open a
 * saved match by its short id (download .fit(s) from Storage + rows).
 */
import { nanoid } from 'nanoid';
import { supabase } from './supabase';
import { auth, isAdmin, reloadProfile } from './auth';
import { compute } from './analytics';
import { fitTimestampToDate, parse as parseFit } from './fit-parser';
import { buildSegments, buildSegmentsManual, buildSegmentsPerFile, mergeFiles } from './segmentation';
import { centroid, haversine, type LatLon } from './geo';
import type { Database, Json } from './database.types';
import {
  store,
  recompute,
  getRawFiles,
  nonCombinedSegments,
  dirsForSegment,
  allFields,
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
const MEDIA_BUCKET = 'match-media';
type Visibility = Database['public']['Enums']['visibility'];

function asJson(value: unknown): Json {
  return value as Json;
}

function asVisibility(value: string): Visibility {
  if (value === 'private' || value === 'unlisted' || value === 'public') return value;
  throw new Error('Invalid visibility value.');
}

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

function positionalPreview(positional: any) {
  const pts = positional?.points || [];
  if (!pts.length) return null;
  const maxPoints = 180;
  const step = Math.max(1, Math.ceil(pts.length / maxPoints));
  return {
    hasField: !!positional.hasField,
    templateAspect: positional.templateAspect ?? null,
    lengthM: positional.lengthM ?? null,
    widthM: positional.widthM ?? null,
    compass: positional.compass ?? null,
    GX: positional.GX ?? null,
    GY: positional.GY ?? null,
    grid: positional.grid ?? null,
    gridMax: positional.gridMax ?? null,
    zoneGrid: positional.zoneGrid ?? null,
    avgPos: positional.avgPos ?? null,
    points: pts
      .filter((_: any, i: number) => i % step === 0 || i === pts.length - 1)
      .map((p: any) => ({
        u: Number(p.u.toFixed(4)),
        v: Number(p.v.toFixed(4)),
        tSec: p.tSec ?? null,
      })),
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
  const selectedFieldId = store.selectedFieldId || nearField?.id || null;
  const { data: match, error: mErr } = await sb
    .from('matches')
    .insert({
      short_id: shortId,
      owner_id: uid,
      title: opts.title ?? (store.matchTitle.trim() || null),
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
      manual_splits: asJson(store.manualSplits),
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
  const field = fieldId ? allFields().find((value) => value.id === fieldId) : null;
  return nonCombinedSegments().map((seg, i) => {
    const dirs = dirsForSegment(seg);
    const a = compute(
      { records: seg.records, sessions: seg.session ? [seg.session] : [], laps: [], events: [], activity: null, file_id: null, other: {} },
      {
        age: store.options.age,
        maxHR: store.options.maxHR,
        maxHRSource: store.options.maxHRSource,
        restHR: store.options.restHR,
        sprintKmh: store.options.sprintKmh,
        highIntensityKmh: store.options.highIntensityKmh,
        attackingDir: dirs.attacking_dir,
        sideDir: dirs.side_dir,
        field: field?.corners || null,
        format: store.options.format,
        periods: seg.periods.map((period) => ({ startSec: period.startTime - seg.startTime, endSec: period.endTime - seg.startTime })),
      }
    );
    return {
      match_id: matchId,
      owner_id: uid,
      seq: i + 1,
      label: seg.label,
      kind: seg.kind,
      start_time: fitTimestampToDate(seg.startTime)?.toISOString() ?? null,
      end_time: fitTimestampToDate(seg.endTime)?.toISOString() ?? null,
      attacking_dir: dirs.attacking_dir,
      side_dir: dirs.side_dir,
      flips: asJson(dirs.flips),
      periods: asJson(seg.periods),
      duration_s: a.summary?.durationS ?? null,
      sample_count: a.meta?.sampleCount ?? null,
      summary: a.ok
        ? asJson({
            summary: a.summary,
            meta: metaSubset(a.meta),
            role: a.football?.role?.top ?? null,
            physio: a.physio ? { avgHR: a.physio.avgHR, maxHR: a.physio.maxHR } : null,
            preview: positionalPreview(a.positional),
          })
        : null,
      analysis_options: asJson({
        age: store.options.age,
        maxHR: store.options.maxHR,
        maxHRSource: store.options.maxHRSource,
        restHR: store.options.restHR,
        sprintKmh: store.options.sprintKmh,
        highIntensityKmh: store.options.highIntensityKmh,
        format: store.options.format,
      }),
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

  const selectedFieldId = store.selectedFieldId || nearField?.id || null;
  const { error: mErr } = await sb
    .from('matches')
    .update({
      format: store.options.format,
      group_gap_min: store.options.groupGapMin,
      manual_splits: asJson(store.manualSplits),
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
  primaryField: any | null;
}

// Legacy previews can be regenerated for cards that have no cached preview or
// were cached before the selected pitch transform was included.
export async function buildLegacyFeedHeatmap(match: any): Promise<any | null> {
  const sb = requireClient();
  const names = Array.isArray(match.file_names)
    ? match.file_names.filter((name): name is string => typeof name === 'string')
    : [];
  if (!names.length || !match.owner_id || !match.short_id) return null;
  const rawFiles: { name: string; bytes: ArrayBuffer }[] = [];
  for (const name of names) {
    const { data, error } = await sb.storage.from(BUCKET).download(`${match.owner_id}/${match.short_id}/${name}`);
    if (error) throw error;
    rawFiles.push({ name, bytes: await data.arrayBuffer() });
  }
  const parsed = rawFiles.map((file) => ({ name: file.name, fit: parseFit(file.bytes) }));
  const fit = parsed.length === 1 ? parsed[0].fit : mergeFiles(parsed);
  const start = fit.records.find((record) => record.timestamp != null)?.timestamp as number | undefined;
  const splits = match.manual_splits;
  const segments = splits && start != null
    ? buildSegmentsManual(fit, splits.sessionBreaks || [], splits.halfBreaks || [], start)
    : match.break_files?.length
      ? buildSegmentsPerFile(fit, match.break_files)
      : buildSegments(fit, (match.group_gap_min || 10) * 60);
  const segment = segments.find((value) => value.kind !== 'combined');
  if (!segment) return null;
  const session = (match.sessions || []).find((value: any) => value.seq === 1) || match.sessions?.[0] || {};
  let field = Array.isArray(match.fields) ? match.fields[0] : match.fields;
  if (!field?.corners && match.primary_field_id) {
    const { data } = await sb.from('fields').select('corners').eq('id', match.primary_field_id).maybeSingle();
    field = data;
  }
  const options = session.analysis_options || { format: match.format };
  const analysis = compute(
    { records: segment.records, sessions: segment.session ? [segment.session] : [], laps: [], events: [], activity: null, file_id: null, other: {} },
    {
      age: options.age,
      maxHR: options.maxHR,
      maxHRSource: options.maxHRSource,
      restHR: options.restHR,
      sprintKmh: options.sprintKmh,
      highIntensityKmh: options.highIntensityKmh,
      attackingDir: session.attacking_dir ?? 1,
      sideDir: session.side_dir ?? 1,
      field: field?.corners || null,
      format: options.format || match.format,
      periods: Array.isArray(session.periods)
        ? session.periods.map((period: any) => ({ startSec: period.startTime - segment.startTime, endSec: period.endTime - segment.startTime }))
        : [],
    }
  );
  return analysis.ok ? analysis.positional : null;
}

// Fetch a saved match + sessions and download its .fit files from Storage.
export async function getMatch(shortId: string): Promise<LoadedMatch | null> {
  const sb = requireClient();
  const { data: match, error } = await sb.from('matches').select('*').eq('short_id', shortId).maybeSingle();
  if (error) throw error;
  if (!match) return null;
  const { data: sessions } = await sb.from('sessions').select('*').eq('match_id', match.id).order('seq');
  const { data: primaryField } = match.primary_field_id
    ? await sb.from('fields').select('id, slug, name, corners, visibility, owner_id').eq('id', match.primary_field_id).maybeSingle()
    : { data: null };
  const names = Array.isArray(match.file_names)
    ? match.file_names.filter((name): name is string => typeof name === 'string')
    : [];
  const rawFiles: { name: string; bytes: ArrayBuffer }[] = [];
  for (const name of names) {
    const path = `${match.owner_id}/${shortId}/${name}`;
    const { data, error: dErr } = await sb.storage.from(BUCKET).download(path);
    if (dErr) throw dErr;
    rawFiles.push({ name, bytes: await data.arrayBuffer() });
  }
  return { match, sessions: sessions || [], rawFiles, primaryField: primaryField ?? null };
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
      'short_id, title, sport, format, started_at, created_at, visibility, location_label, primary_field_id, sessions(seq, duration_s, summary)'
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
  const { error } = await sb.from('matches').update({ visibility: asVisibility(visibility) }).eq('id', matchId);
  if (error) throw error;
}

export async function updateMatchTitle(matchId: string, title: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from('matches').update({ title: title || null }).eq('id', matchId);
  if (error) throw error;
}

export async function getMatchPrivateNote(matchId: string): Promise<string> {
  const sb = requireClient();
  const { data, error } = await sb
    .from('match_private_notes')
    .select('note')
    .eq('match_id', matchId)
    .maybeSingle();
  if (error) throw error;
  return data?.note || '';
}

export async function saveMatchPrivateNote(matchId: string, ownerId: string, note: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from('match_private_notes')
    .upsert({ match_id: matchId, owner_id: ownerId, note }, { onConflict: 'match_id' });
  if (error) throw error;
}

export interface MatchMedia {
  id: string;
  match_id: string;
  owner_id: string;
  storage_path: string;
  media_type: 'photo';
  mime_type: string | null;
  width: number | null;
  height: number | null;
  caption: string | null;
  visibility: 'private' | 'unlisted' | 'public';
  sort_order: number;
  created_at: string;
}

export async function listMatchMedia(matchId: string): Promise<MatchMedia[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from('match_media')
    .select('*')
    .eq('match_id', matchId)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return (data || []) as MatchMedia[];
}

function mediaExt(file: File): string {
  const nameExt = file.name.split('.').pop()?.toLowerCase();
  if (nameExt && /^[a-z0-9]{2,5}$/.test(nameExt)) return nameExt;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

export async function uploadMatchPhoto(match: {
  id: string;
  short_id: string;
  owner_id: string;
}, file: File): Promise<MatchMedia> {
  const sb = requireClient();
  const uid = auth.user?.id;
  if (!uid || uid !== match.owner_id) throw new Error('Only the match owner can upload photos.');
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const id = crypto.randomUUID();
  const storagePath = `${uid}/${match.short_id}/${id}.${mediaExt(file)}`;
  const { error: uploadError } = await sb.storage.from(MEDIA_BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  });
  if (uploadError) throw uploadError;
  const { data, error } = await sb
    .from('match_media')
    .insert({
      id,
      match_id: match.id,
      owner_id: uid,
      storage_path: storagePath,
      media_type: 'photo',
      mime_type: file.type || null,
      visibility: 'private',
    })
    .select()
    .single();
  if (error) {
    await sb.storage.from(MEDIA_BUCKET).remove([storagePath]);
    throw error;
  }
  return data as MatchMedia;
}

export async function downloadMatchMedia(media: MatchMedia): Promise<Blob> {
  const sb = requireClient();
  const { data, error } = await sb.storage.from(MEDIA_BUCKET).download(media.storage_path);
  if (error) throw error;
  return data;
}

export async function updateMatchMedia(
  id: string,
  patch: Partial<Pick<MatchMedia, 'caption' | 'visibility' | 'sort_order'>>
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from('match_media').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteMatchMedia(media: MatchMedia): Promise<void> {
  const sb = requireClient();
  await sb.storage.from(MEDIA_BUCKET).remove([media.storage_path]);
  const { error } = await sb.from('match_media').delete().eq('id', media.id);
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
  const { data: media } = await sb.from('match_media').select('storage_path').eq('match_id', match.id);
  const mediaPaths = (media || []).map((m: any) => m.storage_path).filter(Boolean);
  if (mediaPaths.length) await sb.storage.from(MEDIA_BUCKET).remove(mediaPaths);
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
      'short_id, title, format, started_at, created_at, visibility, owner_id, location_label, primary_field_id, file_names, group_gap_min, manual_splits, break_files, fields(corners), sessions(seq, duration_s, summary, analysis_options, attacking_dir, side_dir), match_media(id, storage_path, caption, visibility, created_at)',
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

export async function listMyHistory(): Promise<{ matches: any[]; fields: any[] }> {
  const sb = requireClient();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in to view history.');
  const [matchesRes, fieldsRes] = await Promise.all([
    sb
      .from('matches')
      .select(
        'short_id, title, format, started_at, created_at, visibility, location_label, primary_field_id, sessions(seq, duration_s, summary)'
      )
      .eq('owner_id', uid)
      .order('started_at', { ascending: true, nullsFirst: false }),
    sb.from('fields').select('id, name').order('name'),
  ]);
  if (matchesRes.error) throw matchesRes.error;
  if (fieldsRes.error) throw fieldsRes.error;
  return { matches: matchesRes.data || [], fields: fieldsRes.data || [] };
}

export async function listAdminData(): Promise<{ profiles: any[]; matches: any[]; fields: any[] }> {
  if (!isAdmin()) throw new Error('Admin access only.');
  const sb = requireClient();
  const [profilesRes, matchesRes, fieldsRes] = await Promise.all([
    sb.from('profiles').select('id, username, display_name, avatar_url, bio, created_at, updated_at').order('created_at', { ascending: false }),
    sb
      .from('matches')
      .select(
        'id, short_id, title, format, started_at, created_at, updated_at, visibility, owner_id, location_label, primary_field_id, file_names, sessions(seq, duration_s, summary)'
      )
      .order('created_at', { ascending: false }),
    sb.from('fields').select('id, slug, name, owner_id, visibility, centroid_lat, centroid_lon, created_at, updated_at').order('created_at', { ascending: false }),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (matchesRes.error) throw matchesRes.error;
  if (fieldsRes.error) throw fieldsRes.error;
  return {
    profiles: profilesRes.data || [],
    matches: await attachAuthors(matchesRes.data || []),
    fields: fieldsRes.data || [],
  };
}

// Public/system + own pitches.
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
  const { error } = await sb.from('fields').update({ visibility: asVisibility(visibility) }).eq('id', id);
  if (error) throw error;
  await loadMyFields();
}

export async function updateProfile(patch: {
  display_name?: string | null;
  bio?: string | null;
  birth_date?: string | null;
  max_hr?: number | null;
  rest_hr?: number | null;
}): Promise<void> {
  const sb = requireClient();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in first.');
  const { display_name, bio, birth_date, max_hr, rest_hr } = patch;
  if (display_name !== undefined || bio !== undefined) {
    const { error } = await sb.from('profiles').update({ display_name, bio }).eq('id', uid);
    if (error) throw error;
  }
  if (birth_date !== undefined || max_hr !== undefined || rest_hr !== undefined) {
    const { error } = await sb.from('profile_analysis_defaults').upsert(
      { user_id: uid, ...(birth_date !== undefined ? { birth_date } : {}), ...(max_hr !== undefined ? { max_hr } : {}), ...(rest_hr !== undefined ? { rest_hr } : {}) },
      { onConflict: 'user_id' },
    );
    if (error) throw error;
  }
  await reloadProfile();
}

// ---- Cloud pitches (Phase 3) ----

// Load visible DB pitches into the store (public/system + the signed-in user's).
export async function loadMyFields(): Promise<void> {
  if (!supabase) {
    store.cloudFields = [];
    return;
  }
  let q = supabase
    .from('fields')
    .select('id, slug, name, corners, visibility')
    .order('created_at');
  q = auth.user ? q.or(`visibility.eq.public,owner_id.eq.${auth.user.id}`) : q.eq('visibility', 'public');
  const { data, error } = await q;
  if (error) {
    console.warn('Could not load pitches', error);
    return;
  }
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
    .select('short_id, title, format, started_at, created_at, visibility, owner_id, location_label, primary_field_id, sessions(seq, duration_s, summary)')
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
  flips: Json
): Promise<void> {
  const sb = requireClient();
  await sb.from('sessions').update({ attacking_dir, side_dir, flips }).eq('id', sessionId);
}
