import { describe, expect, it } from 'vitest';
import { buildFieldTransform, buildPitchTransform, centroid, haversine, rankByDistance } from './geo';

describe('geo helpers', () => {
  it('computes approximate great-circle distances', () => {
    expect(haversine(0, 0, 0, 1)).toBeGreaterThan(111_000);
    expect(haversine(0, 0, 0, 1)).toBeLessThan(112_000);
  });

  it('computes centroids while ignoring invalid points', () => {
    expect(centroid([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }, { lat: Number.NaN, lon: 9 }])).toEqual({
      lat: 2,
      lon: 3,
    });
    expect(centroid([])).toBeNull();
  });

  it('ranks pitches by distance from the recording location', () => {
    const ranked = rankByDistance([
      { name: 'Far', corners: [{ lat: 0, lon: 2 }] },
      { name: 'Near', corners: [{ lat: 0, lon: 0.01 }] },
      { name: 'Invalid', corners: [] },
    ], { lat: 0, lon: 0 });
    expect(ranked.map(({ item }) => item.name)).toEqual(['Near', 'Far', 'Invalid']);
    expect(ranked[2].distance).toBe(Infinity);
  });

  it('builds a normalized transform from GPS tracks', () => {
    const transform = buildPitchTransform([
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.001 },
      { lat: 0.0002, lon: 0 },
      { lat: 0.0002, lon: 0.001 },
    ]);
    expect(transform).not.toBeNull();
    expect(transform!.lengthM).toBeGreaterThan(100);
    expect(transform!.widthM).toBeGreaterThan(20);
    const p = transform!.project(0.0001, 0.0005);
    expect(p.u).toBeGreaterThan(0.45);
    expect(p.u).toBeLessThan(0.55);
    expect(p.v).toBeGreaterThan(0.45);
    expect(p.v).toBeLessThan(0.55);
  });

  it('maps field corners into a usable pitch transform', () => {
    const transform = buildFieldTransform([
      { lat: 0, lon: 0 },
      { lat: 0.0002, lon: 0.001 },
      { lat: 0, lon: 0.001 },
      { lat: 0.0002, lon: 0 },
    ]);
    expect(transform).not.toBeNull();
    expect(transform!.lengthM).toBeGreaterThan(100);
    expect(transform!.widthM).toBeGreaterThan(20);
    const center = transform!.project(0.0001, 0.0005);
    expect(center.u).toBeGreaterThan(0.45);
    expect(center.u).toBeLessThan(0.55);
    expect(center.v).toBeGreaterThan(0.45);
    expect(center.v).toBeLessThan(0.55);
  });
});
