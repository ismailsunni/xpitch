import { describe, expect, it } from 'vitest';
import { buildSegmentsManual, buildSegmentsPerFile, mergeFiles, playableSegments, recordsForPeriod, suggestRestIntervalsFromHR, suggestSessionBreaksFromHR } from './segmentation';
import type { FitResult, RecordSample } from './fit-parser';

function records(from: number, to: number, step = 10, fileName?: string): RecordSample[] {
  const out: RecordSample[] = [];
  for (let t = from; t <= to; t += step) out.push({ timestamp: t, _fileName: fileName } as RecordSample);
  return out;
}

function fit(recs: RecordSample[]): FitResult {
  return { records: recs, sessions: [], laps: [], events: [], activity: null, file_id: null, other: {} };
}

describe('segmentation helpers', () => {
  it('splits recordings manually into sessions and periods', () => {
    const segments = buildSegmentsManual(fit(records(100, 190)), [45], [20, 70], 100);

    expect(segments).toHaveLength(3);
    expect(segments[0].label).toBe('Whole recording');
    expect(segments[1].label).toBe('Session 1');
    expect(segments[1].startTime).toBe(100);
    expect(segments[1].endTime).toBe(140);
    expect(segments[1].periods.map((p) => p.label)).toEqual(['1st half', '2nd half']);
    expect(segments[2].startTime).toBe(150);
    expect(segments[2].endTime).toBe(190);
  });

  it('returns period records with a small timestamp tolerance', () => {
    const [first] = buildSegmentsManual(fit(records(100, 150)), [], [25], 100);
    expect(recordsForPeriod(first, 0).map((r) => r.timestamp)).toEqual([100, 110, 120]);
    expect(recordsForPeriod(first, -1)).toHaveLength(first.records.length);
  });

  it('keeps uploaded file boundaries as separate sessions', () => {
    const merged = mergeFiles([
      { name: 'a.fit', fit: fit(records(100, 130)) },
      { name: 'b.fit', fit: fit(records(140, 170)) },
    ]);
    const segments = buildSegmentsPerFile(merged);

    expect(segments.map((s) => s.label)).toEqual(['Whole upload', 'Session 1', 'Session 2']);
    expect(segments[1].sourceFile).toBe('a.fit');
    expect(segments[2].sourceFile).toBe('b.fit');
  });

  it('removes rest sections without leaving gaps in playable session labels', () => {
    const segments = buildSegmentsManual(fit(records(100, 190)), [30, 60], [], 100);
    const play = playableSegments(segments, [130]);
    expect(play.map((segment) => segment.label)).toEqual(['Session 1', 'Session 2']);
    expect(play.map((segment) => segment.startTime)).toEqual([100, 160]);
  });

  it('suggests a session break for a sustained heart-rate recovery valley', () => {
    const recs: RecordSample[] = [];
    for (let t = 0; t <= 1_500; t += 30) {
      const resting = t >= 600 && t <= 780;
      recs.push({ timestamp: 10_000 + t, heart_rate: resting ? 100 : 160 });
    }
    expect(suggestSessionBreaksFromHR(fit(recs))).toEqual([705]);
    expect(suggestRestIntervalsFromHR(fit(recs))).toEqual([{ start: 600, end: 810 }]);
  });
});
