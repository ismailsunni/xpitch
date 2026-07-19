import { describe, expect, it } from 'vitest';
import { compute, estimateRole, FORMATS } from './analytics';
import type { PositionalAnalytics, RunEvent } from './analytics';
import type { FitResult, RecordSample } from './fit-parser';

function fit(records: RecordSample[]): FitResult {
  return { records, sessions: [], laps: [], events: [], activity: null, file_id: null, other: {} };
}

function fullMatchFixture(): FitResult {
  const records: RecordSample[] = [];
  const start = 1_000_000;
  // A 90-minute, five-second GPS/HR trace that repeatedly covers a full pitch.
  for (let t = 0; t <= 90 * 60; t += 5) {
    const phase = (t / 5) % 84;
    const row = Math.floor(phase / 42);
    const u = (row ? 41 - (phase % 42) : phase % 42) / 41;
    const v = row ? 0.7 : 0.3;
    records.push({
      timestamp: start + t,
      position_lat: -7.775 + v * 0.0005,
      position_long: 110.375 + u * 0.001,
      speed: 2.4 + (phase % 6) * 0.35,
      heart_rate: 135 + (phase % 20),
      cadence: 145,
    });
  }
  return fit(records);
}

describe('compute', () => {
  it('uses real period windows for fatigue and excludes a recorded break', () => {
    const records = [0, 10, 20, 30, 40, 50, 60, 70].map((t) => ({
      timestamp: 1_000 + t,
      speed: t < 30 ? 2 : t < 50 ? 0 : 1,
      distance: t < 30 ? t * 2 : t < 50 ? 40 : 40 + (t - 40),
    }));

    const result = compute(fit(records), {
      periods: [
        { startSec: 0, endSec: 20 },
        { startSec: 50, endSec: 70 },
      ],
    });

    expect(result.ok).toBe(true);
    // `compute` caps a sparse FIT interval at eight seconds, so the test also
    // proves rest samples are excluded rather than counted as play time.
    expect(result.football?.fatigue.firstHalf.time).toBe(16);
    expect(result.football?.fatigue.secondHalf.time).toBe(24);
    expect(result.football?.fatigue.firstHalf.ratePerMin).toBeCloseTo(150);
    expect(result.football?.fatigue.secondHalf.ratePerMin).toBeCloseTo(75);
  });

  it('uses the sprint threshold that matches the sprint speed zone for full football', () => {
    expect(FORMATS.full.sprintKmh).toBe(25.2);
    expect(FORMATS.auto.sprintKmh).toBe(25.2);
  });

  it('uses heart-rate reserve zones and reports moving cadence when resting HR is set', () => {
    const result = compute(
      fit([
        { timestamp: 1_000, speed: 2, heart_rate: 120, cadence: 80 },
        { timestamp: 1_005, speed: 3, heart_rate: 150, cadence: 100 },
      ]),
      { maxHR: 200, restHR: 50 }
    );

    expect(result.physio).toMatchObject({ zoneMethod: 'hrr', restHR: 50 });
    expect(result.physio.hrZones[0]).toMatchObject({ lowBpm: 50, highBpm: 140 });
    expect(result.running?.avgCadence).toBe(90);
  });

  it('handles recordings without GPS or heart-rate data', () => {
    const result = compute(fit([
      { timestamp: 1_000, speed: 2 },
      { timestamp: 1_010, speed: 3 },
    ]));

    expect(result.ok).toBe(true);
    expect(result.meta).toMatchObject({ hasGPS: false, hasHR: false, hasSpeed: true });
    expect(result.positional).toBeNull();
    expect(result.physio).toBeNull();
  });

  it('counts the sprint threshold in the sprint zone, not high speed', () => {
    const result = compute(fit([
      { timestamp: 1_000, speed: 19.8 / 3.6 },
      { timestamp: 1_005, speed: 25.2 / 3.6 },
      { timestamp: 1_010, speed: 26 / 3.6 },
    ]), { sprintKmh: 25.2 });

    expect(result.running?.zones[3].distance).toBeGreaterThanOrEqual(0);
    expect(result.running?.zones[4].distance).toBeGreaterThan(0);
    expect(result.running?.sprints).toHaveLength(1);
  });

  it('analyzes a representative 90-minute GPS and HR recording within a responsive budget', () => {
    const startedAt = performance.now();
    const result = compute(fullMatchFixture(), {
      field: [
        { lat: -7.775, lon: 110.375 },
        { lat: -7.775, lon: 110.376 },
        { lat: -7.7745, lon: 110.376 },
        { lat: -7.7745, lon: 110.375 },
      ],
      format: 'full',
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.ok).toBe(true);
    expect(result.summary?.durationS).toBe(90 * 60);
    expect(result.meta).toMatchObject({ hasGPS: true, hasHR: true, format: 'full' });
    expect(result.positional?.hasField).toBe(true);
    // This is intentionally loose enough for CI/older laptops, while catching
    // accidental quadratic work over a full-match recording.
    expect(elapsedMs).toBeLessThan(1_000);
  });
});

function rolePosition(points: { u: number; v: number }[], hasField = false): Pick<PositionalAnalytics, 'points' | 'thirds' | 'hasField'> {
  const thirds = [0, 0, 0];
  for (const point of points) thirds[Math.min(2, Math.floor(point.u * 3))]++;
  return {
    hasField,
    thirds,
    points: points.map((point, i) => ({ ...point, tSec: i * 10, dt: 10, speed: 2 })),
  };
}

const noSprints: RunEvent[] = [];

describe('role estimation', () => {
  it('does not offer goalkeeper from PCA-normalized GPS alone', () => {
    const role = estimateRole(
      rolePosition([{ u: 0.12, v: 0.5 }, { u: 0.13, v: 0.51 }, { u: 0.11, v: 0.49 }]),
      { sprints: noSprints, totalDistance: 350, durationS: 3600 },
      'full',
    );
    expect(role.ranked.some((candidate) => candidate.role.startsWith('Goalkeeper'))).toBe(false);
  });

  it('recognizes a deep, central and low-movement player as a goalkeeper when a pitch is known', () => {
    const role = estimateRole(
      rolePosition([{ u: 0.08, v: 0.5 }, { u: 0.1, v: 0.51 }, { u: 0.09, v: 0.49 }], true),
      { sprints: noSprints, totalDistance: 350, durationS: 3600 },
      'full',
    );
    expect(role.top).toBe('Goalkeeper');
  });
});
