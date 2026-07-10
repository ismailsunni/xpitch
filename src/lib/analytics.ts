/*
 * analytics.ts — turns parsed FIT records into football/match analytics.
 *
 * compute(fit, options) -> big object consumed by the UI.
 * All speeds internally in m/s; presented in km/h. Distances in metres.
 */
import { haversine, buildPitchTransform, buildFieldTransform, centroid } from './geo';
import type { PitchTransform, LatLon } from './geo';
import type { FitResult } from './fit-parser';

export const KMH = 3.6; // m/s -> km/h
const MAX_GAP_S = 8; // cap dt across data gaps when accumulating time

export type FormatKey = 'auto' | 'futsal' | 'mini' | 'full';

// Match formats. `maxLengthM` bounds the auto-detection by pitch length;
// `aspect` is the drawn template's width/length; sprint/hi are default km/h
// thresholds fitting the format's typical top speeds.
export const FORMATS: Record<
  string,
  { key: FormatKey; label: string; short: string; maxLengthM: number; aspect: number; sprintKmh: number; hiKmh: number }
> = {
  auto: { key: 'auto', label: 'Auto-detect', short: 'Auto', maxLengthM: 0, aspect: 68 / 105, sprintKmh: 19.8, hiKmh: 14.4 },
  futsal: { key: 'futsal', label: 'Futsal / 5-a-side', short: 'Futsal', maxLengthM: 32, aspect: 0.5, sprintKmh: 15, hiKmh: 11 },
  mini: { key: 'mini', label: 'Mini-soccer / 7-a-side', short: 'Mini-soccer', maxLengthM: 78, aspect: 0.62, sprintKmh: 18, hiKmh: 13 },
  full: { key: 'full', label: 'Full football / 11-a-side', short: 'Full football', maxLengthM: Infinity, aspect: 68 / 105, sprintKmh: 19.8, hiKmh: 14.4 },
};

function inferFormatKey(lengthM: number, fromField: boolean): FormatKey {
  // Players rarely reach the corners, so scale up a GPS-box estimate.
  const L = fromField ? lengthM : lengthM * 1.25;
  if (L < FORMATS.futsal.maxLengthM) return 'futsal';
  if (L < FORMATS.mini.maxLengthM) return 'mini';
  return 'full';
}

function resolveFormat(
  optFormat: FormatKey,
  positional: any
): { key: FormatKey; from: 'user' | 'field' | 'gps' | 'default' } {
  if (optFormat && optFormat !== 'auto' && FORMATS[optFormat]) return { key: optFormat, from: 'user' };
  if (positional) {
    return {
      key: inferFormatKey(positional.lengthM, positional.hasField),
      from: positional.hasField ? 'field' : 'gps',
    };
  }
  return { key: 'full', from: 'default' };
}

// Football speed zones (km/h). Distance & time accumulate per zone.
export const SPEED_ZONES = [
  { name: 'Walking', min: 0, max: 7, color: '#3b82f6' },
  { name: 'Jogging', min: 7, max: 14.4, color: '#22c55e' },
  { name: 'Running', min: 14.4, max: 19.8, color: '#eab308' },
  { name: 'High speed', min: 19.8, max: 25.2, color: '#f97316' },
  { name: 'Sprint', min: 25.2, max: Infinity, color: '#ef4444' },
];

export interface AnalyticsOptions {
  maxHR?: number | null;
  restHR?: number;
  age?: number | null;
  attackingDir?: number;
  sideDir?: number; // +1 normal, -1 mirror left/right (width axis)
  sprintKmh?: number;
  highIntensityKmh?: number;
  field?: LatLon[] | null; // user-defined pitch corners (lat/lon)
  format?: FormatKey; // match format ('auto' infers from pitch size)
}

export interface MatchAnalytics {
  ok: boolean;
  error?: string;
  meta?: any;
  samples?: any[];
  summary?: any;
  positional?: any;
  running?: any;
  physio?: any;
  football?: any;
  options?: Required<AnalyticsOptions>;
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

// Moving-average smoothing (odd window).
function smooth(arr: number[], win: number): number[] {
  if (win <= 1) return arr.slice();
  const half = Math.floor(win / 2);
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      if (arr[j] != null && isFinite(arr[j])) {
        s += arr[j];
        c++;
      }
    }
    out[i] = c ? s / c : 0;
  }
  return out;
}

export function compute(fit: FitResult, options?: AnalyticsOptions): MatchAnalytics {
  const opt = Object.assign(
    {
      maxHR: null,
      restHR: 60,
      age: null,
      attackingDir: 1,
      sideDir: 1,
      sprintKmh: 19.8,
      highIntensityKmh: 14.4,
      field: null,
      format: 'auto',
    },
    options || {}
  ) as Required<AnalyticsOptions>;

  // ---- 1. Build clean, time-sorted sample series ----
  const raw = fit.records
    .filter((r) => r.timestamp != null)
    .sort((a, b) => (a.timestamp as number) - (b.timestamp as number));

  if (!raw.length) {
    return { ok: false, error: 'No timestamped record data found in this FIT file.' };
  }

  const t0 = raw[0].timestamp as number;
  const samples: any[] = raw.map((r) => {
    const speed = r.enhanced_speed != null ? r.enhanced_speed : r.speed;
    return {
      tSec: (r.timestamp as number) - t0,
      date: r.date,
      lat: r.position_lat,
      lon: r.position_long,
      speed: speed != null ? speed : null,
      hr: r.heart_rate != null ? r.heart_rate : null,
      distance: r.distance != null ? r.distance : null,
      altitude: r.enhanced_altitude != null ? r.enhanced_altitude : r.altitude,
      cadence: r.cadence,
      power: r.power,
    };
  });

  const hasGPS = samples.some((s) => s.lat != null && s.lon != null);
  const hasHR = samples.some((s) => s.hr != null);

  // Per-sample dt.
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    s.dt = i === 0 ? 0 : Math.min(MAX_GAP_S, samples[i].tSec - samples[i - 1].tSec);
    if (s.dt < 0) s.dt = 0;
  }

  // Treat implausible speeds as missing. GPS glitches report 60+ m/s, and some
  // devices use a non-standard "invalid" sentinel (e.g. raw 64536 -> 64.5 m/s)
  // rather than the spec's 0xFFFF, so a hard human-range cap is the reliable
  // filter. Missing values are reconstructed from GPS, else 0.
  const MAX_SPEED = 12.5; // m/s (~45 km/h)
  for (const s of samples) {
    if (s.speed == null || !isFinite(s.speed) || s.speed < 0 || s.speed > MAX_SPEED) {
      s.speed = null;
    }
  }
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    if (s.speed == null && s.lat != null && samples[i - 1].lat != null && s.dt > 0) {
      const v = haversine(samples[i - 1].lat, samples[i - 1].lon, s.lat, s.lon) / s.dt;
      if (v >= 0 && v <= MAX_SPEED) s.speed = v;
    }
  }
  for (const s of samples) if (s.speed == null) s.speed = 0;

  // Incremental distance per sample. Prefer the device distance field, then the
  // (cleaned) speed integral — device speed is far less noisy than differencing
  // raw GPS fixes — and only fall back to GPS as a last resort.
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    const prev = samples[i - 1];
    let di: number | null = null;
    if (s.distance != null && prev.distance != null) {
      di = s.distance - prev.distance;
      if (di < 0 || di > 60) di = null;
    }
    if (di == null && s.dt > 0) di = s.speed * s.dt;
    if (di == null && s.lat != null && prev.lat != null) {
      di = haversine(prev.lat, prev.lon, s.lat, s.lon);
      if (di > 60) di = null;
    }
    s.dInc = Math.max(0, di || 0);
  }
  samples[0].dInc = 0;

  // ---- 2. Summary / timing ----
  const durationS = samples[samples.length - 1].tSec;
  const movingSamples = samples.filter((s) => s.speed > 0.6);
  const movingTime = movingSamples.reduce((a, s) => a + s.dt, 0);
  const standingTime = samples.reduce((a, s) => a + s.dt, 0) - movingTime;

  // Sum of positive per-sample increments (dInc) is the robust total: it works
  // for a partial slice (a single half) and for merged multi-file data where
  // each file's cumulative `distance` resets. Fall back to the device session
  // total only when there is no usable distance field at all.
  let totalDistance: number;
  const dIncSum = samples.reduce((a, s) => a + s.dInc, 0);
  const hasDistField = samples.some((s) => s.distance != null);
  const sessionDist = fit.sessions[0] && (fit.sessions[0].total_distance as number);
  if (hasDistField) {
    totalDistance = dIncSum;
  } else if (sessionDist != null && sessionDist > 0) {
    totalDistance = sessionDist;
  } else {
    totalDistance = dIncSum;
  }

  const smoothSpeed = smooth(
    samples.map((s) => s.speed),
    3
  );
  const topSpeed = Math.max(...smoothSpeed);
  const rawTopSpeed = Math.max(...samples.map((s) => s.speed));
  const avgSpeedMoving = mean(movingSamples.map((s) => s.speed));

  // ---- 3. Positional analytics ----
  let positional: any = null;
  if (hasGPS) {
    const gpsPts: { lat: number; lon: number }[] = [];
    let prevFix: any = null;
    for (const s of samples) {
      if (s.lat == null || s.lon == null) continue;
      if (prevFix) {
        const jump = haversine(prevFix.lat, prevFix.lon, s.lat, s.lon);
        const dt = s.tSec - prevFix.tSec || 1;
        if (jump / dt > 12.5) {
          s._gpsOutlier = true;
          continue;
        }
      }
      prevFix = { lat: s.lat, lon: s.lon, tSec: s.tSec };
      gpsPts.push({ lat: s.lat, lon: s.lon });
    }
    // Prefer a user-defined field (true orientation/extent), but ignore a
    // saved field that belongs to a different venue (>3 km from this track).
    let transform: PitchTransform | null = null;
    let hasField = false;
    let fieldIgnored = false;
    if (opt.field && opt.field.length >= 4) {
      const fc = centroid(opt.field);
      const gc = centroid(gpsPts);
      const far = fc && gc && haversine(fc.lat, fc.lon, gc.lat, gc.lon) > 3000;
      if (far) {
        fieldIgnored = true;
      } else {
        transform = buildFieldTransform(opt.field);
        hasField = !!transform;
      }
    }
    if (!transform) transform = buildPitchTransform(gpsPts);
    if (transform) {
      const pts: any[] = [];
      for (const s of samples) {
        if (s.lat == null || s.lon == null || s._gpsOutlier) continue;
        const p = transform.project(s.lat, s.lon);
        const u = opt.attackingDir >= 0 ? p.u : 1 - p.u;
        const v = opt.sideDir >= 0 ? p.v : 1 - p.v;
        pts.push({ u, v, tSec: s.tSec, dt: s.dt, speed: s.speed });
        s._u = u;
        s._v = v;
      }

      const GX = 42;
      const GY = 27;
      const grid = Array.from({ length: GY }, () => new Array(GX).fill(0));
      let gridMax = 0;
      for (const p of pts) {
        const gx = Math.min(GX - 1, Math.max(0, Math.floor(p.u * GX)));
        const gy = Math.min(GY - 1, Math.max(0, Math.floor(p.v * GY)));
        grid[gy][gx] += p.dt || 0.5;
        if (grid[gy][gx] > gridMax) gridMax = grid[gy][gx];
      }

      const avgPos = { u: mean(pts.map((p) => p.u)), v: mean(pts.map((p) => p.v)) };

      const thirds = [0, 0, 0];
      for (const p of pts) {
        const idx = p.u < 1 / 3 ? 0 : p.u < 2 / 3 ? 1 : 2;
        thirds[idx] += p.dt;
      }

      const sides = [0, 0, 0];
      for (const p of pts) {
        const idx = p.v < 1 / 3 ? 0 : p.v < 2 / 3 ? 1 : 2;
        sides[idx] += p.dt;
      }

      const zoneGrid = Array.from({ length: 3 }, () => new Array(3).fill(0));
      for (const p of pts) {
        const zx = Math.min(2, Math.floor(p.u * 3));
        const zy = Math.min(2, Math.floor(p.v * 3));
        zoneGrid[zy][zx] += p.dt;
      }

      positional = {
        transform,
        points: pts,
        grid,
        gridMax,
        GX,
        GY,
        avgPos,
        thirds,
        sides,
        zoneGrid,
        lengthM: transform.lengthM,
        widthM: transform.widthM,
        hasField,
        fieldIgnored,
      };
    }
  }

  // ---- 4. Running analytics: speed zones ----
  const zones = SPEED_ZONES.map((z) => ({ ...z, distance: 0, time: 0 }));
  for (const s of samples) {
    const kmh = s.speed * KMH;
    const zi = zones.findIndex((z) => kmh >= z.min && kmh < z.max);
    const idx = zi === -1 ? zones.length - 1 : zi;
    zones[idx].distance += s.dInc;
    zones[idx].time += s.dt;
  }

  const sprintThr = opt.sprintKmh / KMH;
  const hiThr = opt.highIntensityKmh / KMH;
  const sprints = detectRuns(samples, sprintThr, 1.0);
  const highIntensityRuns = detectRuns(samples, hiThr, 1.0);
  const accelEvents = detectAccel(samples, smoothSpeed);

  // ---- 5. Physiological ----
  let physio: any = null;
  if (hasHR) {
    const hrSamples = samples.filter((s) => s.hr != null && s.hr > 0);
    const maxHRObs = Math.max(...hrSamples.map((s) => s.hr));
    const refMax = opt.maxHR || (opt.age ? 220 - opt.age : null) || Math.round(maxHRObs);
    const avgHR = mean(hrSamples.map((s) => s.hr));

    const zoneDefs = [
      { name: 'Z1 Recovery', min: 0, max: 0.6, color: '#3b82f6' },
      { name: 'Z2 Aerobic', min: 0.6, max: 0.7, color: '#22c55e' },
      { name: 'Z3 Tempo', min: 0.7, max: 0.8, color: '#eab308' },
      { name: 'Z4 Threshold', min: 0.8, max: 0.9, color: '#f97316' },
      { name: 'Z5 Max', min: 0.9, max: Infinity, color: '#ef4444' },
    ];
    const hrZones = zoneDefs.map((z) => ({
      ...z,
      lowBpm: Math.round(z.min * refMax),
      highBpm: z.max === Infinity ? refMax : Math.round(z.max * refMax),
      time: 0,
    }));
    for (const s of samples) {
      if (s.hr == null || s.hr <= 0) continue;
      const frac = s.hr / refMax;
      let zi = hrZones.findIndex((z) => frac >= z.min && frac < z.max);
      if (zi === -1) zi = hrZones.length - 1;
      hrZones[zi].time += s.dt;
    }

    const recoveries = detectRecoveries(samples);

    physio = {
      series: samples.filter((s) => s.hr != null).map((s) => ({ x: s.tSec, y: s.hr })),
      avgHR: Math.round(avgHR),
      maxHR: maxHRObs,
      refMax,
      hrZones,
      recoveries,
    };
  }

  // ---- 6. Work rate & fatigue ----
  const workRate = buildMinuteBins(samples);
  const fatigue = computeFatigue(samples, sprints, hiThr, durationS);
  const rse = detectRepeatedSprints(sprints);

  // ---- 7. Format resolution + role estimation ----
  const fmt = resolveFormat(opt.format, positional);
  if (positional) positional.templateAspect = FORMATS[fmt.key].aspect;
  const role = positional
    ? estimateRole(positional, { sprints, highIntensityRuns, totalDistance, durationS }, fmt.key)
    : null;

  return {
    ok: true,
    meta: {
      hasGPS,
      hasHR,
      hasSpeed: samples.some((s) => s.speed > 0),
      startDate: samples[0].date,
      durationS,
      sampleCount: samples.length,
      sport: fit.sessions[0] ? fit.sessions[0].sport : null,
      format: fmt.key,
      formatFrom: fmt.from,
      formatLabel: FORMATS[fmt.key].label,
      session: fit.sessions[0] || null,
      fileId: fit.file_id || null,
      startLat: samples.find((s) => s.lat != null)?.lat ?? null,
      startLon: samples.find((s) => s.lon != null)?.lon ?? null,
    },
    samples,
    summary: {
      durationS,
      movingTime,
      standingTime,
      totalDistance,
      topSpeed,
      rawTopSpeed,
      avgSpeedMoving,
    },
    positional,
    running: { zones, sprints, highIntensityRuns, accelEvents },
    physio,
    football: { workRate, fatigue, rse, role },
    options: opt,
  };
}

function detectRuns(samples: any[], thrMs: number, minDurationS: number): any[] {
  const runs: any[] = [];
  let cur: any = null;
  for (const s of samples) {
    if (s.speed >= thrMs) {
      if (!cur) cur = { start: s.tSec, end: s.tSec, maxSpeed: s.speed, distance: 0 };
      cur.end = s.tSec;
      cur.maxSpeed = Math.max(cur.maxSpeed, s.speed);
      cur.distance += s.dInc;
    } else if (cur) {
      cur.duration = cur.end - cur.start;
      if (cur.duration >= minDurationS) runs.push(cur);
      cur = null;
    }
  }
  if (cur) {
    cur.duration = cur.end - cur.start;
    if (cur.duration >= minDurationS) runs.push(cur);
  }
  return runs;
}

function detectAccel(samples: any[], smoothSpeed: number[], thr = 2.0): any {
  const events: any[] = [];
  let cur: any = null;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].dt;
    if (dt <= 0) continue;
    const a = (smoothSpeed[i] - smoothSpeed[i - 1]) / dt;
    const sign = a >= thr ? 1 : a <= -thr ? -1 : 0;
    if (sign !== 0) {
      if (!cur || cur.sign !== sign) {
        if (cur) events.push(cur);
        cur = { sign, start: samples[i].tSec, peak: Math.abs(a) };
      }
      cur.end = samples[i].tSec;
      cur.peak = Math.max(cur.peak, Math.abs(a));
    } else if (cur) {
      events.push(cur);
      cur = null;
    }
  }
  if (cur) events.push(cur);
  return {
    accelerations: events.filter((e) => e.sign > 0),
    decelerations: events.filter((e) => e.sign < 0),
  };
}

function detectRecoveries(samples: any[]): any[] {
  const recoveries: any[] = [];
  const hrSeries = samples.filter((s) => s.hr != null);
  let cur: any = null;
  for (let i = 1; i < hrSeries.length; i++) {
    const prev = hrSeries[i - 1];
    const s = hrSeries[i];
    const dropping = s.hr < prev.hr && s.speed < 2.0;
    if (dropping) {
      if (!cur) cur = { start: prev.tSec, startHR: prev.hr, end: s.tSec, endHR: s.hr };
      cur.end = s.tSec;
      cur.endHR = s.hr;
    } else if (cur) {
      cur.drop = cur.startHR - cur.endHR;
      cur.duration = cur.end - cur.start;
      if (cur.drop >= 10 && cur.duration >= 10) recoveries.push(cur);
      cur = null;
    }
  }
  return recoveries;
}

function buildMinuteBins(samples: any[]): any[] {
  const bins: any[] = [];
  for (const s of samples) {
    const m = Math.floor(s.tSec / 60);
    if (!bins[m]) bins[m] = { minute: m, distance: 0, avgSpeed: 0, samples: 0, hrSum: 0, hrN: 0 };
    bins[m].distance += s.dInc;
    bins[m].avgSpeed += s.speed;
    bins[m].samples++;
    if (s.hr != null) {
      bins[m].hrSum += s.hr;
      bins[m].hrN++;
    }
  }
  for (let m = 0; m < bins.length; m++) {
    if (!bins[m]) bins[m] = { minute: m, distance: 0, avgSpeed: 0, samples: 0, hrSum: 0, hrN: 0 };
    const b = bins[m];
    b.avgSpeed = b.samples ? (b.avgSpeed / b.samples) * KMH : 0;
    b.avgHR = b.hrN ? b.hrSum / b.hrN : null;
  }
  return bins;
}

function computeFatigue(samples: any[], sprints: any[], hiThr: number, durationS: number): any {
  const half = durationS / 2;
  const firstHalf = { distance: 0, time: 0, hiDistance: 0 };
  const secondHalf = { distance: 0, time: 0, hiDistance: 0 };
  for (const s of samples) {
    const bucket = s.tSec < half ? firstHalf : secondHalf;
    bucket.distance += s.dInc;
    bucket.time += s.dt;
    if (s.speed >= hiThr) bucket.hiDistance += s.dInc;
  }
  const rate = (b: any) => (b.time > 0 ? b.distance / (b.time / 60) : 0);
  const r1 = rate(firstHalf);
  const r2 = rate(secondHalf);
  const distanceDropPct = r1 > 0 ? ((r2 - r1) / r1) * 100 : 0;

  const seg: any[] = [];
  for (const s of samples) {
    const idx = Math.floor(s.tSec / 600);
    if (!seg[idx]) seg[idx] = { label: idx * 10 + '–' + (idx + 1) * 10, distance: 0, hi: 0 };
    seg[idx].distance += s.dInc;
    if (s.speed >= hiThr) seg[idx].hi += s.dInc;
  }

  const sprintsFirst = sprints.filter((r) => r.start < half).length;
  const sprintsSecond = sprints.length - sprintsFirst;

  return {
    firstHalf: { ...firstHalf, ratePerMin: r1 },
    secondHalf: { ...secondHalf, ratePerMin: r2 },
    distanceDropPct,
    sprintsFirst,
    sprintsSecond,
    segments: seg.filter(Boolean),
  };
}

function detectRepeatedSprints(sprints: any[]): any[] {
  const bouts: any[][] = [];
  let cur: any[] = [];
  for (let i = 0; i < sprints.length; i++) {
    if (cur.length === 0) {
      cur = [sprints[i]];
      continue;
    }
    const gap = sprints[i].start - cur[cur.length - 1].end;
    if (gap <= 60) {
      cur.push(sprints[i]);
    } else {
      if (cur.length >= 3) bouts.push(cur);
      cur = [sprints[i]];
    }
  }
  if (cur.length >= 3) bouts.push(cur);
  return bouts.map((b) => ({
    count: b.length,
    start: b[0].start,
    end: b[b.length - 1].end,
    sprints: b,
  }));
}

function estimateRole(positional: any, ctx: any, format: FormatKey): any {
  const pts = positional.points;
  const us = pts.map((p: any) => p.u);
  const vs = pts.map((p: any) => p.v);
  const avgU = mean(us);
  const avgV = mean(vs);
  const spreadU = std(us);
  const spreadV = std(vs);
  const lateralBias = Math.abs(avgV - 0.5);
  const km = ctx.totalDistance / 1000;
  const minutes = ctx.durationS / 60 || 1;
  const kmPerHour = km / (minutes / 60);
  const sprints = ctx.sprints.length;
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const thirdsTot = sum(positional.thirds) || 1;
  const attFrac = positional.thirds[2] / thirdsTot;
  const midFrac = positional.thirds[1] / thirdsTot;
  const defFrac = positional.thirds[0] / thirdsTot;

  // Shared feature signals -> reusable partial scores.
  const wide = lateralBias; // 0 central .. 0.5 wide
  const forward = Math.max(0, avgU - 0.5);
  const back = Math.max(0, 0.5 - avgU);
  const roam = (spreadU + spreadV) / 2; // how much of the pitch is covered

  // Per-format role vocabularies. Smaller formats have less positional
  // specialization, so "Universal / all-rounder" is a real candidate.
  let roles: { role: string; score: number }[];
  if (format === 'futsal') {
    const sp = Math.min(sprints / 8, 1);
    roles = [
      { role: 'Pivot (target)', score: forward * 3.0 + attFrac * 1.6 + (0.5 - Math.min(wide, 0.5)) * 0.9 },
      { role: 'Ala (wide)', score: wide * 3.2 + spreadU * 1.3 + sp * 1.0 },
      { role: 'Fixo (defender)', score: back * 3.0 + defFrac * 1.8 + (1 - sp) * 0.6 },
      { role: 'Universal (all-rounder)', score: roam * 2.6 + (1 - Math.min(wide * 2, 1)) * 0.8 + Math.min(kmPerHour / 8, 1) * 0.8 },
    ];
  } else if (format === 'mini') {
    const sp = Math.min(sprints / 10, 1);
    roles = [
      { role: 'Forward', score: forward * 3.0 + attFrac * 1.6 + sp * 1.2 + (0.5 - Math.min(wide, 0.5)) * 0.8 },
      { role: 'Winger', score: wide * 3.2 + spreadU * 1.1 + sp * 1.2 + Math.max(0, avgU - 0.45) * 1.0 },
      { role: 'Midfielder', score: (1 - Math.min(wide * 2, 1)) * 1.5 + Math.min(kmPerHour / 8, 1) * 2.0 + spreadU * 2.0 + midFrac * 1.3 },
      { role: 'Defender', score: back * 3.0 + defFrac * 1.7 + (1 - sp) * 0.9 },
      { role: 'Full-back', score: wide * 2.2 + back * 1.6 + spreadU * 1.5 + sp * 0.7 },
    ];
  } else {
    // full (11-a-side)
    const sp = Math.min(sprints / 12, 1);
    roles = [
      { role: 'Winger', score: wide * 3.2 + sp * 1.6 + forward * 1.4 + spreadU * 0.8 },
      { role: 'Forward / Striker', score: forward * 3.0 + sp * 1.4 + (0.5 - Math.min(wide, 0.5)) * 1.2 + attFrac * 1.5 },
      { role: 'Central Midfielder', score: (1 - Math.min(wide * 2, 1)) * 1.6 + Math.min(kmPerHour / 9, 1) * 2.0 + spreadU * 2.2 + midFrac * 1.4 },
      { role: 'Centre-back', score: back * 3.2 + defFrac * 1.8 + (1 - sp) * 1.0 + (0.4 - Math.min(spreadU, 0.4)) * 1.2 },
      { role: 'Full-back / Wing-back', score: wide * 2.4 + back * 1.8 + spreadU * 1.6 + sp * 0.8 },
    ];
  }

  roles.sort((a, b) => b.score - a.score);
  const top = roles[0];
  const total = roles.reduce((a, r) => a + Math.max(0, r.score), 0) || 1;
  const confidence = Math.round((Math.max(0, top.score) / total) * 100);

  const notes: string[] = [];
  notes.push(
    lateralBias > 0.15
      ? `Play skewed to the ${avgV < 0.5 ? 'left' : 'right'} flank`
      : 'Play concentrated centrally'
  );
  notes.push(
    avgU > 0.55
      ? 'Average position in the attacking half'
      : avgU < 0.45
      ? 'Average position in the defensive half'
      : 'Average position around midfield'
  );
  notes.push(`${sprints} sprints, ${kmPerHour.toFixed(1)} km covered per hour`);

  return { top: top.role, confidence, ranked: roles, notes, avgU, avgV, spreadU, spreadV };
}
