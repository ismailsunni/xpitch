import { describe, expect, it } from 'vitest';
import { deriveHighlights, deriveRating } from './rating';

function analytics(overrides: Record<string, unknown> = {}) {
  return {
    summary: { durationS: 600, totalDistance: 1000 },
    running: { zones: [], sprints: [], accelEvents: [] },
    football: { fatigue: { distanceDropPct: -10, segments: [] } },
    ...overrides,
  };
}

describe('match rating', () => {
  it('uses heart rate when available and produces a bounded grade', () => {
    const rating = deriveRating(
      analytics({
        physio: { avgHR: 170, refMax: 180 },
        running: { zones: [], sprints: [{}], accelEvents: [{}] },
      })
    );

    expect(rating).toMatchObject({ score: 83, grade: 'B+', title: 'High-intensity threat', workRate: 77, intensity: 100, endurance: 75 });
    expect(rating.blurb).toBe('1.00 km at 100 m/min with 1 sprint and 1 accelerations.');
  });

  it('falls back to high-speed distance when heart-rate data is absent', () => {
    const rating = deriveRating(
      analytics({ running: { zones: [{ min: 5, distance: 250 }], sprints: [], accelEvents: [] } })
    );

    expect(rating.intensity).toBe(100);
    expect(rating.score).toBeGreaterThanOrEqual(0);
    expect(rating.score).toBeLessThanOrEqual(100);
  });
});

describe('match highlights', () => {
  it('selects fastest and longest distinct sprints, then the busiest block', () => {
    const highlights = deriveHighlights(
      analytics({
        running: {
          sprints: [
            { start: 65, maxSpeed: 8, distance: 12 },
            { start: 130, maxSpeed: 7, distance: 24 },
          ],
        },
        football: { fatigue: { segments: [{ label: '10–20', distance: 300 }, { label: '20–30', distance: 250 }] } },
      })
    );

    expect(highlights.map((highlight) => highlight.title)).toEqual([
      'Top speed 28.8 km/h',
      'Longest sprint 24 m',
      'Busiest block — 300 m',
    ]);
    expect(highlights.map((highlight) => highlight.minute)).toEqual(["1'", "2'", "10'"]);
  });
});
