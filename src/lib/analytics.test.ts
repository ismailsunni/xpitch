import { describe, expect, it } from 'vitest';
import { compute, FORMATS } from './analytics';
import type { FitResult, RecordSample } from './fit-parser';

function fit(records: RecordSample[]): FitResult {
  return { records, sessions: [], laps: [], events: [], activity: null, file_id: null, other: {} };
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
});
