import { describe, expect, it } from 'vitest';
import { importedToFit } from './strava';

describe('Strava import fixture', () => {
  it('normalizes GPS, distance, speed, and heart-rate streams to match records', () => {
    const fit = importedToFit({
      activity: { id: 4, name: 'Evening football', sportType: 'Soccer', startDate: '2026-07-23T12:00:00Z' },
      records: [
        { time: 0, lat: -7.7612, lon: 110.376, distance: 0, heartRate: 145, speed: 1.2, altitude: 120 },
        { time: 5, lat: -7.7611, lon: 110.3761, distance: 9, heartRate: 151, speed: 2.8, altitude: 121 },
      ],
    });
    expect(fit.records).toHaveLength(2);
    expect(fit.records[1]).toMatchObject({ position_lat: -7.7611, distance: 9, heart_rate: 151, speed: 2.8 });
    expect(fit.sessions[0].total_elapsed_time).toBe(5);
  });
});
