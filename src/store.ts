/* store.ts — reactive application state and actions (lightweight, no Pinia). */
import { reactive } from 'vue';
import * as FitParser from './lib/fit-parser';
import type { FitResult } from './lib/fit-parser';
import { compute } from './lib/analytics';
import type { MatchAnalytics } from './lib/analytics';
import { generate } from './lib/demo';
import { FORMATS } from './lib/analytics';
import type { FormatKey } from './lib/analytics';
import { reverseGeocode } from './lib/format';
import type { LatLon } from './lib/geo';

export interface AppState {
  analytics: MatchAnalytics | null;
  fileName: string;
  error: string;
  loading: boolean;
  activeTab: string;
  location: string | null;
  field: LatLon[] | null;
  fieldEditorOpen: boolean;
  options: {
    age: number | null;
    maxHR: number | null;
    sprintKmh: number;
    highIntensityKmh: number;
    attackingDir: number;
    format: FormatKey;
  };
}

const FIELD_KEY = 'sf_field_v1';
const FORMAT_KEY = 'sf_format_v1';

function loadStoredFormat(): FormatKey {
  try {
    const v = localStorage.getItem(FORMAT_KEY) as FormatKey;
    return v && FORMATS[v] ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function loadStoredField(): LatLon[] | null {
  try {
    const raw = localStorage.getItem(FIELD_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length >= 4 ? arr : null;
  } catch {
    return null;
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
  field: loadStoredField(),
  fieldEditorOpen: false,
  options: {
    age: null,
    maxHR: null,
    sprintKmh: 19.8,
    highIntensityKmh: 14.4,
    attackingDir: 1,
    format: loadStoredFormat(),
  },
});

export function recompute(): void {
  if (!currentFit) return;
  const a = compute(currentFit, {
    age: store.options.age,
    maxHR: store.options.maxHR,
    sprintKmh: store.options.sprintKmh,
    highIntensityKmh: store.options.highIntensityKmh,
    attackingDir: store.options.attackingDir,
    field: store.field,
    format: store.options.format,
  });
  if (!a.ok) {
    store.error = a.error || 'Could not analyze this file.';
    store.analytics = null;
    return;
  }
  store.error = '';
  store.analytics = a;
}

function afterLoad(): void {
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
  store.options.attackingDir = 1;
  store.activeTab = 'overview';
  recompute();
  if (store.analytics) afterLoad();
}

export function loadDemo(): void {
  loadFit(generate(), 'demo-minisoccer.fit');
}

export async function loadFile(file: File): Promise<void> {
  store.loading = true;
  store.error = '';
  try {
    const buf = await file.arrayBuffer();
    const fit = FitParser.parse(buf);
    if (!fit.records.length) throw new Error('No record messages found in this FIT file.');
    loadFit(fit, file.name);
  } catch (e: any) {
    store.error = 'Could not parse this file: ' + (e?.message || e);
    store.analytics = null;
  } finally {
    store.loading = false;
  }
}

export async function loadFromUrl(url: string, name?: string): Promise<void> {
  store.loading = true;
  store.error = '';
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    loadFit(FitParser.parse(buf), name || url.split('/').pop() || 'match.fit');
  } catch (e: any) {
    store.error = 'Could not load sample: ' + (e?.message || e);
  } finally {
    store.loading = false;
  }
}

export function flipAttack(): void {
  store.options.attackingDir *= -1;
  recompute();
}

export function setField(corners: LatLon[]): void {
  store.field = corners;
  try {
    localStorage.setItem(FIELD_KEY, JSON.stringify(corners));
  } catch {
    /* ignore */
  }
  recompute();
}

export function setFormat(fmt: FormatKey): void {
  store.options.format = fmt;
  try {
    localStorage.setItem(FORMAT_KEY, fmt);
  } catch {
    /* ignore */
  }
  // Choosing a specific format sets its default intensity thresholds (still
  // user-adjustable afterwards). 'auto' leaves the current thresholds alone.
  if (fmt !== 'auto' && FORMATS[fmt]) {
    store.options.sprintKmh = FORMATS[fmt].sprintKmh;
    store.options.highIntensityKmh = FORMATS[fmt].hiKmh;
  }
  recompute();
}

export function clearField(): void {
  store.field = null;
  try {
    localStorage.removeItem(FIELD_KEY);
  } catch {
    /* ignore */
  }
  recompute();
}

export function reset(): void {
  currentFit = null;
  store.analytics = null;
  store.fileName = '';
  store.error = '';
  store.location = null;
}
