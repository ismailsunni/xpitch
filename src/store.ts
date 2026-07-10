/* store.ts — reactive application state and actions (lightweight, no Pinia). */
import { reactive } from 'vue';
import * as FitParser from './lib/fit-parser';
import type { FitResult, RecordSample } from './lib/fit-parser';
import { compute, FORMATS } from './lib/analytics';
import type { MatchAnalytics, FormatKey } from './lib/analytics';
import { generate } from './lib/demo';
import { buildSegments, recordsForPeriod, mergeFiles, DEFAULT_GROUP_GAP_MIN } from './lib/segmentation';
import type { Segment, ParsedFile } from './lib/segmentation';
import { reverseGeocode } from './lib/format';
import { haversine, centroid } from './lib/geo';
import type { LatLon } from './lib/geo';

export interface SavedField {
  id: string;
  name: string;
  corners: LatLon[];
}

export interface AppState {
  analytics: MatchAnalytics | null;
  fileName: string;
  error: string;
  loading: boolean;
  activeTab: string;
  location: string | null;
  files: string[];
  segments: Segment[];
  activeSegmentId: string;
  activePeriod: number; // -1 = whole segment
  fields: SavedField[];
  appliedFieldId: string | null;
  fieldEditorOpen: boolean;
  // Attacking direction (length) and side (left/right, width) per view
  // ("<segmentId>:<period>" -> +1 | -1). Not global: ends switch at half-time,
  // and the auto-inferred left/right can need mirroring per match.
  attackDirs: Record<string, number>;
  sideDirs: Record<string, number>;
  options: {
    age: number | null;
    maxHR: number | null;
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
let geoToken = 0;

export const store = reactive<AppState>({
  analytics: null,
  fileName: '',
  error: '',
  loading: false,
  activeTab: 'overview',
  location: null,
  files: [],
  segments: [],
  activeSegmentId: '',
  activePeriod: -1,
  fields: loadStoredFields(),
  appliedFieldId: null,
  fieldEditorOpen: false,
  attackDirs: {},
  sideDirs: {},
  options: {
    age: null,
    maxHR: null,
    sprintKmh: 19.8,
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

// Nearest saved field to a set of records, within FIELD_MATCH_M.
function resolveField(recs: RecordSample[]): SavedField | null {
  const gc = centroid(recordsToLatLon(recs));
  if (!gc) return null;
  let best: SavedField | null = null;
  let bestD = Infinity;
  for (const f of store.fields) {
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
  const a = compute(pseudo, {
    age: store.options.age,
    maxHR: store.options.maxHR,
    sprintKmh: store.options.sprintKmh,
    highIntensityKmh: store.options.highIntensityKmh,
    attackingDir: currentAttackDir(),
    sideDir: currentSideDir(),
    field: field ? field.corners : null,
    format: store.options.format,
  });
  if (!a.ok) {
    store.error = a.error || 'Could not analyze this segment.';
    store.analytics = null;
    return;
  }
  store.error = '';
  store.analytics = a;
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

export function loadFit(fit: FitResult, name: string): void {
  currentFit = fit;
  store.fileName = name;
  store.attackDirs = {};
  store.sideDirs = {};
  store.activeTab = 'overview';
  store.segments = buildSegments(fit, store.options.groupGapMin * 60);
  // Default to the first real match, not the combined "whole file" view.
  const first = store.segments.find((s) => s.kind !== 'combined') || store.segments[0];
  store.activeSegmentId = first ? first.id : '';
  store.activePeriod = -1;
  recompute();
  if (store.analytics) geocodeCurrent();
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
    for (const f of fileList) {
      const buf = await f.arrayBuffer();
      const fit = FitParser.parse(buf);
      if (!fit.records.length) throw new Error(`${f.name}: no record messages found`);
      parsed.push({ name: f.name, fit });
    }
    if (!parsed.length) return;
    store.files = parsed.map((p) => p.name);
    const merged = parsed.length === 1 ? parsed[0].fit : mergeFiles(parsed);
    const label = parsed.length === 1 ? parsed[0].name : `${parsed.length} files`;
    loadFit(merged, label);
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
    for (const u of urls) {
      const buf = await (await fetch(u)).arrayBuffer();
      parsed.push({ name: u.split('/').pop() || u, fit: FitParser.parse(buf) });
    }
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
  if (!currentFit) return;
  store.segments = buildSegments(currentFit, min * 60);
  const first = store.segments.find((s) => s.kind !== 'combined') || store.segments[0];
  store.activeSegmentId = first ? first.id : '';
  store.activePeriod = -1;
  recompute();
  geocodeCurrent();
}

export function flipAttack(): void {
  const k = viewKey();
  store.attackDirs[k] = (store.attackDirs[k] ?? 1) * -1;
  recompute();
}

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

export const appliedField = () => store.fields.find((f) => f.id === store.appliedFieldId) || null;

// Centroid of the current view's GPS (for the field editor to focus on).
export function currentViewCentroid(): LatLon | null {
  const seg = activeSegment();
  if (!seg) return null;
  return centroid(recordsToLatLon(recordsForPeriod(seg, store.activePeriod)));
}
