/* store.ts — reactive application state and actions (lightweight, no Pinia). */
import { markRaw, reactive } from 'vue';
import * as FitParser from './lib/fit-parser';
import type { FitResult, RecordSample } from './lib/fit-parser';
import { compute, FORMATS } from './lib/analytics';
import type { MatchAnalytics, FormatKey } from './lib/analytics';
import { generate } from './lib/demo';
import { buildSegments, buildSegmentsManual, buildSegmentsPerFile, recordsForPeriod, mergeFiles, DEFAULT_GROUP_GAP_MIN } from './lib/segmentation';
import type { Segment, ParsedFile } from './lib/segmentation';
import { reverseGeocode, deriveAge } from './lib/format';
import { auth } from './lib/auth';
import { haversine, centroid } from './lib/geo';
import type { LatLon } from './lib/geo';

export interface SavedField {
  id: string;
  name: string;
  corners: LatLon[];
  slug?: string; // present for cloud pitches (enables /field/{slug})
  visibility?: 'private' | 'unlisted' | 'public';
}

export interface AppState {
  analytics: MatchAnalytics | null;
  fileName: string;
  error: string;
  loading: boolean;
  activeTab: string;
  location: string | null;
  matchTitle: string;
  files: string[];
  segments: Segment[];
  activeSegmentId: string;
  activePeriod: number; // -1 = whole segment
  fields: SavedField[];
  appliedFieldId: string | null;
  // Explicit pitch chosen during the upload setup. Null keeps nearest-pitch matching.
  selectedFieldId: string | null;
  breakFiles: string[];
  breakSessionStarts: number[];
  uploadWizardOpen: boolean;
  sessionSplitEditorOpen: boolean;
  fieldEditorOpen: boolean;
  fieldEditorContext: 'standalone' | 'match';
  settingsOpen: boolean; // analysis-settings panel (toggled by the gear in the match line)
  editFieldTarget: SavedField | null; // pitch to preload into the editor (Edit pitch)
  // Attacking direction (length) and side (left/right, width) per view
  // ("<segmentId>:<period>" -> +1 | -1). Not global: ends switch at half-time,
  // and the auto-inferred left/right can need mirroring per match.
  attackDirs: Record<string, number>;
  sideDirs: Record<string, number>;
  cloudFields: SavedField[]; // pitches fetched from Supabase (logged-in users)
  cloud: {
    mode: 'local' | 'cloud';
    matchShortId: string | null;
    ownerId: string | null;
  };
  // User-defined split points (seconds from recording start); null = automatic.
  manualSplits: { sessionBreaks: number[]; halfBreaks: number[] } | null;
  manualSplitOpen: boolean;
  options: {
    age: number | null;
    maxHR: number | null;
    maxHRSource: 'entered' | 'default' | null;
    restHR: number | null;
    sprintKmh: number;
    highIntensityKmh: number;
    format: FormatKey;
    groupGapMin: number;
  };
}

const FIELDS_KEY = 'xp_fields_v1';
const FORMAT_KEY = 'sf_format_v1';
const FIELD_MATCH_M = 1500; // a saved field within this distance applies

function genId(): string {
  return 'f' + Math.random().toString(36).slice(2, 9);
}

function loadStoredFields(): SavedField[] {
  try {
    const raw = localStorage.getItem(FIELDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
    // Migrate a legacy single field.
    const legacy = localStorage.getItem('sf_field_v1');
    if (legacy) {
      const c = JSON.parse(legacy);
      if (Array.isArray(c) && c.length >= 4) return [{ id: genId(), name: 'Saved pitch', corners: c }];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function loadStoredFormat(): FormatKey {
  try {
    const v = localStorage.getItem(FORMAT_KEY) as FormatKey;
    return v && FORMATS[v] ? v : 'auto';
  } catch {
    return 'auto';
  }
}

let currentFit: FitResult | null = null;
let currentRawFiles: { name: string; bytes: ArrayBuffer }[] = [];
let geoToken = 0;

// Raw .fit bytes of the currently loaded match (for saving to cloud Storage).
// Empty for the synthetic demo (not saveable).
export function getRawFiles(): { name: string; bytes: ArrayBuffer }[] {
  return currentRawFiles;
}
export function getCurrentFit(): FitResult | null {
  return currentFit;
}
export function isSaveable(): boolean {
  return currentRawFiles.length > 0 && !!store.analytics;
}

export const store = reactive<AppState>({
  analytics: null,
  fileName: '',
  error: '',
  loading: false,
  activeTab: 'overview',
  location: null,
  matchTitle: '',
  files: [],
  segments: [],
  activeSegmentId: '',
  activePeriod: -1,
  fields: loadStoredFields(),
  appliedFieldId: null,
  selectedFieldId: null,
  breakFiles: [],
  breakSessionStarts: [],
  uploadWizardOpen: false,
  sessionSplitEditorOpen: false,
  fieldEditorOpen: false,
  fieldEditorContext: 'standalone',
  settingsOpen: false,
  editFieldTarget: null,
  attackDirs: {},
  sideDirs: {},
  cloudFields: [],
  cloud: { mode: 'local', matchShortId: null, ownerId: null },
  manualSplits: null,
  manualSplitOpen: false,
  options: {
    age: null,
    maxHR: null,
    maxHRSource: null,
    restHR: null,
    sprintKmh: 25.2,
    highIntensityKmh: 14.4,
    format: loadStoredFormat(),
    groupGapMin: DEFAULT_GROUP_GAP_MIN,
  },
});

function viewKey(): string {
  return store.activeSegmentId + ':' + store.activePeriod;
}

// Attacking direction (+1 / -1) for the currently selected match & period.
export function currentAttackDir(): number {
  return store.attackDirs[viewKey()] ?? 1;
}
export function currentSideDir(): number {
  return store.sideDirs[viewKey()] ?? 1;
}

function recordsToLatLon(recs: RecordSample[]): LatLon[] {
  return recs
    .filter((r) => r.position_lat != null && r.position_long != null)
    .map((r) => ({ lat: r.position_lat as number, lon: r.position_long as number }));
}

function fieldSignature(field: SavedField): string {
  const name = field.name.trim().toLowerCase();
  const corners = field.corners
    .map((corner) => `${corner.lat.toFixed(7)},${corner.lon.toFixed(7)}`)
    .join('|');
  return `${name}:${corners}`;
}

function uniqueFields(fields: SavedField[]): SavedField[] {
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const out: SavedField[] = [];
  for (const field of fields) {
    if (seenIds.has(field.id)) continue;
    const signature = fieldSignature(field);
    if (seenSignatures.has(signature)) continue;
    seenIds.add(field.id);
    seenSignatures.add(signature);
    out.push(field);
  }
  return out;
}

// All fields available for matching. DB-backed visible pitches are preferred,
// with localStorage pitches kept as a fallback for older local/guest data.
export function allFields(): SavedField[] {
  return uniqueFields([...store.cloudFields, ...store.fields]);
}

// Nearest field to a set of records, within FIELD_MATCH_M.
function resolveField(recs: RecordSample[]): SavedField | null {
  if (store.selectedFieldId) return allFields().find((f) => f.id === store.selectedFieldId) || null;
  const gc = centroid(recordsToLatLon(recs));
  if (!gc) return null;
  let best: SavedField | null = null;
  let bestD = Infinity;
  for (const f of allFields()) {
    const fc = centroid(f.corners);
    if (!fc) continue;
    const d = haversine(gc.lat, gc.lon, fc.lat, fc.lon);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best && bestD <= FIELD_MATCH_M ? best : null;
}

export const activeSegment = () => store.segments.find((s) => s.id === store.activeSegmentId) || store.segments[0] || null;

function baseUploadSegments(fit: FitResult): Segment[] {
  return store.files.length > 1 ? buildSegmentsPerFile(fit, store.breakFiles) : buildSegments(fit, store.options.groupGapMin * 60);
}

function compactRecordsForSegments(segs: Segment[]): { records: RecordSample[]; durationS: number } {
  const firstRecordTs = segs[0]?.records.find((r) => r.timestamp != null)?.timestamp as number | undefined;
  let cursor = firstRecordTs ?? segs[0]?.startTime ?? 0;
  const origin = cursor;
  const records: RecordSample[] = [];
  for (const seg of segs) {
    const sourceRecords = seg.records.filter((r) => r.timestamp != null).sort((a, b) => (a.timestamp as number) - (b.timestamp as number));
    if (!sourceRecords.length) continue;
    const sourceStart = sourceRecords[0].timestamp as number;
    const sourceEnd = sourceRecords[sourceRecords.length - 1].timestamp as number;
    const shift = cursor - sourceStart;
    for (const r of sourceRecords) {
      const originalTs = r.timestamp as number;
      const timestamp = originalTs + shift;
      records.push({ ...r, timestamp, date: FitParser.fitTimestampToDate(timestamp) || r.date });
    }
    cursor += Math.max(0, sourceEnd - sourceStart);
  }
  return { records, durationS: Math.max(0, cursor - origin) };
}

function combinedSublabel(startTs: number, durationS: number): string {
  const d = FitParser.fitTimestampToDate(startTs);
  const clock = d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const mins = Math.max(0, Math.round(durationS / 60));
  return [clock, mins + ' min'].filter(Boolean).join(' · ');
}

function applySessionBreaks(segs: Segment[]): Segment[] {
  const real = segs.filter((s) => s.kind !== 'combined');
  const kept = store.breakSessionStarts.length ? real.filter((s) => !store.breakSessionStarts.includes(s.startTime)) : real;
  if (!kept.length) return segs;
  if (kept.length === 1) return kept;
  const combined = segs.find((s) => s.kind === 'combined');
  if (!combined) return kept;
  const compacted = compactRecordsForSegments(kept);
  const startTime = kept[0].startTime;
  return [
    {
      ...combined,
      startTime,
      endTime: startTime + compacted.durationS,
      sublabel: combinedSublabel(startTime, compacted.durationS),
      records: compacted.records,
    },
    ...kept,
  ];
}

function buildUploadSegments(fit: FitResult): Segment[] {
  return applySessionBreaks(baseUploadSegments(fit));
}

function fitWithoutBreaks(fit: FitResult): FitResult {
  if (!store.breakFiles.length) return fit;
  return { ...fit, records: fit.records.filter((r) => !store.breakFiles.includes(String(r._fileName || ''))) };
}

function recordingStartTime(fit: FitResult | null): number | undefined {
  return fit?.records.find((r) => r.timestamp != null)?.timestamp as number | undefined;
}

export function recompute(): void {
  const seg = activeSegment();
  if (!currentFit || !seg) {
    store.analytics = null;
    return;
  }
  const recs = recordsForPeriod(seg, store.activePeriod);
  const field = resolveField(recs);
  store.appliedFieldId = field?.id ?? null;

  const pseudo: FitResult = {
    records: recs,
    sessions: seg.session ? [seg.session] : [],
    laps: [],
    events: [],
    activity: null,
    file_id: currentFit.file_id,
    other: {},
  };
  // Per-match settings take precedence over the signed-in user's private
  // defaults. Without a max HR, analytics derives 220 − age.
  const effectiveAge = store.options.age ?? deriveAge(auth.profile?.birth_date);
  const effectiveMaxHR = store.options.maxHR ?? auth.profile?.max_hr ?? null;
  const effectiveRestHR = store.options.restHR ?? auth.profile?.rest_hr ?? null;
  const a = compute(pseudo, {
    age: effectiveAge,
    maxHR: effectiveMaxHR,
    maxHRSource: store.options.maxHRSource || undefined,
    restHR: effectiveRestHR,
    sprintKmh: store.options.sprintKmh,
    highIntensityKmh: store.options.highIntensityKmh,
    attackingDir: currentAttackDir(),
    sideDir: currentSideDir(),
    field: field ? field.corners : null,
    format: store.options.format,
    periods: store.activePeriod < 0
      ? seg.periods.map((period) => ({ startSec: period.startTime - seg.startTime, endSec: period.endTime - seg.startTime }))
      : [],
  });
  if (!a.ok) {
    store.error = a.error || 'Could not analyze this segment.';
    store.analytics = null;
    return;
  }
  store.error = '';
  // Analysis is a large, immutable result. The reactive state only needs to
  // react when the result object is replaced, not proxy every GPS sample.
  store.analytics = markRaw(a);
}

function geocodeCurrent(): void {
  store.location = null;
  const meta = store.analytics?.meta;
  if (meta && meta.startLat != null && meta.startLon != null) {
    const token = ++geoToken;
    reverseGeocode(meta.startLat, meta.startLon).then((place) => {
      if (token === geoToken) store.location = place;
    });
  }
}

export function loadFit(fit: FitResult, name: string, resetFlips = true): void {
  currentFit = fit;
  store.fileName = name;
  if (resetFlips) {
    store.attackDirs = {};
    store.sideDirs = {};
    store.cloud = { mode: 'local', matchShortId: null, ownerId: null };
    store.manualSplits = null;
    store.selectedFieldId = null;
    store.matchTitle = '';
    store.breakFiles = [];
    store.breakSessionStarts = [];
    store.uploadWizardOpen = false;
    store.sessionSplitEditorOpen = false;
    store.fieldEditorContext = 'standalone';
  }
  store.activeTab = 'overview';
  store.segments = store.manualSplits
    ? applySessionBreaks(buildSegmentsManual(fitWithoutBreaks(fit), store.manualSplits.sessionBreaks, store.manualSplits.halfBreaks, recordingStartTime(fit)))
    : buildUploadSegments(fit);
  // Default to the first real match, not the combined "whole file" view.
  const first = store.segments.find((s) => s.kind !== 'combined') || store.segments[0];
  store.activeSegmentId = first ? first.id : '';
  store.activePeriod = -1;
  recompute();
  if (store.analytics) geocodeCurrent();
}

// Non-combined segments in order; session `seq` (1-based) maps to index seq-1.
export function nonCombinedSegments(): Segment[] {
  return store.segments.filter((s) => s.kind !== 'combined');
}

export function selectSegment(id: string): void {
  store.activeSegmentId = id;
  store.activePeriod = -1;
  recompute();
  geocodeCurrent();
}

export function selectPeriod(index: number): void {
  store.activePeriod = index;
  recompute();
}

export function loadDemo(): void {
  store.files = ['demo-afternoon.fit'];
  currentRawFiles = []; // synthetic — no real bytes, not saveable
  loadFit(generate(), 'demo-afternoon.fit');
}

// Real sample: an afternoon of four mini-soccer matches (shipped in public/).
const SAMPLE_FILES = [
  'Mini_Soccer_Match_1.fit',
  'Mini_Soccer_Match_2.fit',
  'Mini_Soccer_Match_3.fit',
  'Mini_Soccer_Match_4.fit',
];

export function loadSample(): Promise<void> {
  const base = import.meta.env.BASE_URL || './';
  return loadFromUrls(SAMPLE_FILES.map((f) => `${base}samples/${f}`));
}

// Parse and load one or more .fit files, merged into a single timeline.
export async function loadFiles(fileList: File[]): Promise<void> {
  store.loading = true;
  store.error = '';
  try {
    const parsed: ParsedFile[] = [];
    const raw: { name: string; bytes: ArrayBuffer }[] = [];
    for (const f of fileList) {
      const buf = await f.arrayBuffer();
      const fit = FitParser.parse(buf);
      if (!fit.records.length) throw new Error(`${f.name}: no record messages found`);
      parsed.push({ name: f.name, fit });
      raw.push({ name: f.name, bytes: buf });
    }
    if (!parsed.length) return;
    currentRawFiles = raw;
    store.files = parsed.map((p) => p.name);
    const merged = parsed.length === 1 ? parsed[0].fit : mergeFiles(parsed);
    const label = parsed.length === 1 ? parsed[0].name : `${parsed.length} files`;
    loadFit(merged, label);
    // Only an actual user file upload starts guided setup. Samples and developer
    // hooks intentionally retain their immediate-dashboard behaviour.
    store.uploadWizardOpen = !!store.analytics;
  } catch (e: any) {
    store.error = 'Could not parse: ' + (e?.message || e);
    store.analytics = null;
  } finally {
    store.loading = false;
  }
}

export async function loadFile(file: File): Promise<void> {
  return loadFiles([file]);
}

export async function loadFromUrl(url: string, name?: string): Promise<void> {
  store.loading = true;
  store.error = '';
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const nm = name || url.split('/').pop() || 'match.fit';
    currentRawFiles = [{ name: nm, bytes: buf }];
    store.files = [nm];
    loadFit(FitParser.parse(buf), nm);
  } catch (e: any) {
    store.error = 'Could not load sample: ' + (e?.message || e);
  } finally {
    store.loading = false;
  }
}

export async function loadFromUrls(urls: string[]): Promise<void> {
  store.loading = true;
  store.error = '';
  try {
    const parsed: ParsedFile[] = [];
    const raw: { name: string; bytes: ArrayBuffer }[] = [];
    for (const u of urls) {
      const buf = await (await fetch(u)).arrayBuffer();
      const name = u.split('/').pop() || u;
      parsed.push({ name, fit: FitParser.parse(buf) });
      raw.push({ name, bytes: buf });
    }
    currentRawFiles = raw;
    store.files = parsed.map((p) => p.name);
    const merged = parsed.length === 1 ? parsed[0].fit : mergeFiles(parsed);
    loadFit(merged, parsed.length === 1 ? parsed[0].name : `${parsed.length} files`);
  } catch (e: any) {
    store.error = 'Could not load: ' + (e?.message || e);
  } finally {
    store.loading = false;
  }
}

export function setGroupGap(min: number): void {
  store.options.groupGapMin = min;
  if (!currentFit || store.manualSplits || store.files.length > 1) return;
  store.segments = buildSegments(currentFit, min * 60);
  const first = store.segments.find((s) => s.kind !== 'combined') || store.segments[0];
  store.activeSegmentId = first ? first.id : '';
  store.activePeriod = -1;
  recompute();
  geocodeCurrent();
}

// Total recording span (seconds) of the currently loaded file(s).
export function recordingDurationSec(): number {
  const recs = (currentFit?.records || []).filter((r) => r.timestamp != null);
  if (recs.length < 2) return 0;
  const ts = recs.map((r) => r.timestamp as number);
  return Math.max(...ts) - Math.min(...ts);
}

// Apply manual split points (seconds from recording start). Empty → automatic.
export function setManualSplits(sessionBreaks: number[], halfBreaks: number[]): void {
  if (!currentFit) return;
  const active = sessionBreaks.length || halfBreaks.length;
  store.manualSplits = active ? { sessionBreaks, halfBreaks } : null;
  store.breakSessionStarts = [];
  store.attackDirs = {};
  store.sideDirs = {};
  store.segments = store.manualSplits
    ? applySessionBreaks(buildSegmentsManual(fitWithoutBreaks(currentFit), sessionBreaks, halfBreaks, recordingStartTime(currentFit)))
    : buildUploadSegments(currentFit);
  const first = store.segments.find((s) => s.kind !== 'combined') || store.segments[0];
  store.activeSegmentId = first ? first.id : '';
  store.activePeriod = -1;
  recompute();
  geocodeCurrent();
}

export function setSelectedField(id: string | null): void {
  store.selectedFieldId = id;
  recompute();
}

export function setBreakFiles(names: string[]): boolean {
  if (!currentFit || names.length >= store.files.length) return false;
  store.breakFiles = names;
  store.breakSessionStarts = [];
  store.manualSplits = null;
  store.attackDirs = {};
  store.sideDirs = {};
  store.segments = buildUploadSegments(currentFit);
  const first = store.segments.find((s) => s.kind !== 'combined') || store.segments[0];
  store.activeSegmentId = first?.id || '';
  store.activePeriod = -1;
  recompute();
  geocodeCurrent();
  return true;
}

export function setBreakSessionStarts(starts: number[]): boolean {
  if (!currentFit) return false;
  const real = store.segments.filter((s) => s.kind !== 'combined');
  if (starts.length >= real.length) return false;
  store.breakSessionStarts = starts;
  store.attackDirs = {};
  store.sideDirs = {};
  const base = store.manualSplits
    ? buildSegmentsManual(fitWithoutBreaks(currentFit), store.manualSplits.sessionBreaks, store.manualSplits.halfBreaks, recordingStartTime(currentFit))
    : baseUploadSegments(currentFit);
  store.segments = applySessionBreaks(base);
  const first = store.segments.find((s) => s.kind !== 'combined') || store.segments[0];
  store.activeSegmentId = first?.id || '';
  store.activePeriod = -1;
  recompute();
  geocodeCurrent();
  return true;
}

export function sessionStartOffsets(): number[] {
  const start = recordingStartTime(currentFit);
  if (start == null) return [];
  return nonCombinedSegments().map((s) => s.startTime - start).sort((a, b) => a - b);
}

export function recordingStartOffsetBase(): number | null {
  return recordingStartTime(currentFit) ?? null;
}

export function setDefaultMaxHR(): void {
  store.options.age = null;
  store.options.maxHR = 190;
  store.options.maxHRSource = 'default';
  recompute();
}

export function clearManualSplits(): void {
  setManualSplits([], []);
}

// Switching which end you attack is a 180° rotation: both the ends AND
// left/right invert together (not a pure mirror).
export function flipAttack(): void {
  const k = viewKey();
  store.attackDirs[k] = (store.attackDirs[k] ?? 1) * -1;
  store.sideDirs[k] = (store.sideDirs[k] ?? 1) * -1;
  recompute();
}

// Pure left/right mirror, for the rare case the wings are still reversed.
export function flipSides(): void {
  const k = viewKey();
  store.sideDirs[k] = (store.sideDirs[k] ?? 1) * -1;
  recompute();
}

export function setFormat(fmt: FormatKey): void {
  store.options.format = fmt;
  try {
    localStorage.setItem(FORMAT_KEY, fmt);
  } catch {
    /* ignore */
  }
  if (fmt !== 'auto' && FORMATS[fmt]) {
    store.options.sprintKmh = FORMATS[fmt].sprintKmh;
    store.options.highIntensityKmh = FORMATS[fmt].hiKmh;
  }
  recompute();
}

// ---- Saved field list ----
function persistFields(): void {
  try {
    localStorage.setItem(FIELDS_KEY, JSON.stringify(store.fields));
  } catch {
    /* ignore */
  }
}

export function addField(name: string, corners: LatLon[]): string {
  const id = genId();
  store.fields.push({ id, name: name || 'Field ' + (store.fields.length + 1), corners });
  persistFields();
  recompute();
  return id;
}

export function updateField(id: string, name: string, corners: LatLon[]): void {
  const f = store.fields.find((x) => x.id === id);
  if (!f) return;
  f.name = name || f.name;
  f.corners = corners;
  persistFields();
  recompute();
}

export function removeField(id: string): void {
  store.fields = store.fields.filter((x) => x.id !== id);
  persistFields();
  recompute();
}

export const appliedField = () => allFields().find((f) => f.id === store.appliedFieldId) || null;

// Standalone pages must not inherit the last match's GPS state. Match/upload
// callers opt in explicitly when they want their current track on the map.
export function openFieldEditor(field?: SavedField, context: 'standalone' | 'match' = 'standalone'): void {
  store.editFieldTarget = field ?? null;
  store.fieldEditorContext = context;
  store.fieldEditorOpen = true;
}

// Centroid of the current view's GPS (for the field editor to focus on).
export function currentViewCentroid(): LatLon | null {
  const seg = activeSegment();
  if (!seg) return null;
  return centroid(recordsToLatLon(recordsForPeriod(seg, store.activePeriod)));
}

// ---- Cloud (Supabase) load/save helpers ----
export interface CloudSession {
  seq: number;
  attacking_dir: number;
  side_dir: number;
  flips?: { attack?: Record<string, number>; side?: Record<string, number> } | null;
}

export interface CloudLoadMeta {
  shortId: string;
  ownerId: string;
  fileNames: string[];
  rawFiles: { name: string; bytes: ArrayBuffer }[];
  groupGapMin: number;
  options: {
    age?: number | null;
    maxHR?: number | null;
    maxHRSource?: 'entered' | 'default' | null;
    restHR?: number | null;
    sprintKmh?: number;
    highIntensityKmh?: number;
    format?: FormatKey;
  };
  sessions: CloudSession[];
  cloudFields?: SavedField[];
  selectedFieldId?: string | null;
  breakFiles?: string[];
  breakSessionStarts?: number[];
  manualSplits?: { sessionBreaks: number[]; halfBreaks: number[] } | null;
  seq?: number;
}

// Open a match downloaded from the cloud: apply stored options, build segments
// deterministically (same group gap), seed per-session flips, select `seq`.
export function loadFromCloud(fit: FitResult, meta: CloudLoadMeta): void {
  currentRawFiles = meta.rawFiles;
  store.files = meta.fileNames;
  if (meta.cloudFields) {
    const byId = new Map([...store.cloudFields, ...meta.cloudFields].map((field) => [field.id, field]));
    store.cloudFields = [...byId.values()];
  }
  const o = meta.options || {};
  if (o.format) store.options.format = o.format;
  if (o.age !== undefined) store.options.age = o.age ?? null;
  if (o.maxHR !== undefined) store.options.maxHR = o.maxHR ?? null;
  if (o.maxHRSource !== undefined) store.options.maxHRSource = o.maxHRSource;
  if (o.restHR !== undefined) store.options.restHR = o.restHR ?? null;
  if (o.sprintKmh != null) store.options.sprintKmh = o.sprintKmh;
  if (o.highIntensityKmh != null) store.options.highIntensityKmh = o.highIntensityKmh;
  store.options.groupGapMin = meta.groupGapMin;

  store.attackDirs = {};
  store.sideDirs = {};
  store.cloud = { mode: 'cloud', matchShortId: meta.shortId, ownerId: meta.ownerId };
  store.manualSplits = meta.manualSplits ?? null;
  store.selectedFieldId = meta.selectedFieldId ?? null;
  store.breakFiles = meta.breakFiles ?? [];
  store.breakSessionStarts = meta.breakSessionStarts ?? [];
  loadFit(fit, meta.fileNames.length === 1 ? meta.fileNames[0] : `${meta.fileNames.length} files`, false);

  const segs = nonCombinedSegments();
  for (const sess of meta.sessions) {
    const seg = segs[sess.seq - 1];
    if (!seg) continue;
    store.attackDirs[`${seg.id}:-1`] = sess.attacking_dir ?? 1;
    store.sideDirs[`${seg.id}:-1`] = sess.side_dir ?? 1;
    const fa = sess.flips?.attack || {};
    const fs = sess.flips?.side || {};
    for (const p in fa) store.attackDirs[`${seg.id}:${p}`] = fa[p];
    for (const p in fs) store.sideDirs[`${seg.id}:${p}`] = fs[p];
  }
  const target = meta.seq ? segs[meta.seq - 1] : segs[0];
  if (target) store.activeSegmentId = target.id;
  store.activePeriod = -1;
  recompute();
  geocodeCurrent();
}

// Per-session direction payload for saving (whole-segment dirs + period overrides).
export function dirsForSegment(seg: Segment): {
  attacking_dir: number;
  side_dir: number;
  flips: { attack: Record<string, number>; side: Record<string, number> };
} {
  const whole = `${seg.id}:-1`;
  const attack: Record<string, number> = {};
  const side: Record<string, number> = {};
  for (const p of seg.periods) {
    const ka = `${seg.id}:${p.index}`;
    if (store.attackDirs[ka] != null) attack[p.index] = store.attackDirs[ka];
    if (store.sideDirs[ka] != null) side[p.index] = store.sideDirs[ka];
  }
  return {
    attacking_dir: store.attackDirs[whole] ?? 1,
    side_dir: store.sideDirs[whole] ?? 1,
    flips: { attack, side },
  };
}
