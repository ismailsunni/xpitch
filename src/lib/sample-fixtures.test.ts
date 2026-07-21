import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from './fit-parser';
import { buildSegments, missingRecordRestIntervals } from './segmentation';
import { compute } from './analytics';

const amikom = [
  { lat: -7.7623279322076115, lon: 110.41793171866435 },
  { lat: -7.762382229525912, lon: 110.41824325775242 },
  { lat: -7.761906796671553, lon: 110.41834754980765 },
  { lat: -7.7618485263125905, lon: 110.4180279882538 },
];

describe('bundled manual-import fixtures', () => {
  it('contains four distinct mini-soccer sessions on the seeded Amikom pitch', () => {
    const bytes = readFileSync(new URL('../../public/samples/mini-soccer-4-sessions-roles.fit', import.meta.url));
    const fit = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const sessions = buildSegments(fit, 10 * 60).filter((segment) => segment.kind === 'session');

    expect(fit.records.length).toBeGreaterThan(800);
    expect(fit.sessions).toHaveLength(4);
    expect(sessions).toHaveLength(4);
    expect(missingRecordRestIntervals(fit)).toHaveLength(3);
    expect(fit.records[0]).toMatchObject({ heart_rate: 157, cadence: 94 });
    expect(fit.records.every((record) => record.position_lat! > -7.763 && record.position_lat! < -7.761)).toBe(true);
  });

  it('models striker, goalkeeper, and left-back movement profiles', () => {
    const bytes = readFileSync(new URL('../../public/samples/mini-soccer-4-sessions-roles.fit', import.meta.url));
    const fit = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const sessions = buildSegments(fit, 10 * 60).filter((segment) => segment.kind === 'session');
    const roles = sessions.map((segment) => compute(
      { records: segment.records, sessions: [segment.session!], laps: [], events: [], activity: null, file_id: null, other: {} },
      { field: amikom, format: 'mini', sprintKmh: 18, highIntensityKmh: 13 },
    ).football?.role?.top);

    expect(roles[0]).toBe('Forward');
    expect(roles[1]).toBe('Goalkeeper');
    expect(roles[2]).toBe('Full-back');
    expect(roles[3]).toBe('Forward');
  });
});
