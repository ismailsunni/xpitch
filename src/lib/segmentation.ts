/*
 * segmentation.ts — split a parsed FIT file into analyzable segments.
 *
 * A single .fit can hold several matches (multiple `session` messages), or one
 * continuous recording of several matches (split on long time gaps). Within a
 * session, `lap` messages become periods (halves / extra time).
 */
import { fitTimestampToDate } from './fit-parser';
import type { FitResult, RecordSample, SessionMessage } from './fit-parser';

export interface Period {
  index: number;
  label: string;
  startTime: number;
  endTime: number;
}

export interface Segment {
  id: string;
  label: string;
  sublabel: string;
  kind: 'combined' | 'session' | 'gap' | 'full';
  startTime: number;
  endTime: number;
  records: RecordSample[];
  session: SessionMessage | null;
  periods: Period[];
}

const GAP_SPLIT_S = 240; // a >4-min break starts a new segment

function ts(r: RecordSample): number {
  return r.timestamp as number;
}

function sublabel(startTs: number, endTs: number): string {
  const d = fitTimestampToDate(startTs);
  const clock = d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const mins = Math.max(0, Math.round((endTs - startTs) / 60));
  return [clock, mins + ' min'].filter(Boolean).join(' · ');
}

function periodLabel(i: number, n: number): string {
  const halves = ['1st half', '2nd half', 'Extra time', 'Extra time 2'];
  if (n === 2) return ['1st half', '2nd half'][i];
  return halves[i] || 'Period ' + (i + 1);
}

function sessionRange(s: SessionMessage, fallbackStart: number, fallbackEnd: number): [number, number] {
  const elapsed = (s.total_elapsed_time ?? s.total_timer_time ?? 0) as number;
  let start = (s.start_time as number) ?? (s.timestamp != null && elapsed ? (s.timestamp as number) - elapsed : fallbackStart);
  let end = elapsed ? start + elapsed : ((s.timestamp as number) ?? fallbackEnd);
  return [start, end];
}

function lapsFor(laps: SessionMessage[], sStart: number, sEnd: number): Period[] {
  const inSession = laps.filter((l) => {
    const [ls] = sessionRange(l, sStart, sEnd);
    return ls >= sStart - 2 && ls <= sEnd + 2;
  });
  if (inSession.length <= 1) return [];
  return inSession.map((l, i) => {
    const [ls, le] = sessionRange(l, sStart, sEnd);
    return { index: i, label: periodLabel(i, inSession.length), startTime: ls, endTime: le };
  });
}

function gapSplit(recs: RecordSample[], gapS: number): RecordSample[][] {
  const chunks: RecordSample[][] = [];
  let cur: RecordSample[] = [recs[0]];
  for (let i = 1; i < recs.length; i++) {
    if (ts(recs[i]) - ts(recs[i - 1]) > gapS) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(recs[i]);
  }
  if (cur.length) chunks.push(cur);
  return chunks.filter((c) => c.length >= 10);
}

function combinedSeg(recs: RecordSample[], label: string): Segment {
  return {
    id: 'all',
    label,
    sublabel: sublabel(ts(recs[0]), ts(recs[recs.length - 1])),
    kind: 'combined',
    startTime: ts(recs[0]),
    endTime: ts(recs[recs.length - 1]),
    records: recs,
    session: null,
    periods: [],
  };
}

export function buildSegments(fit: FitResult): Segment[] {
  const recs = fit.records
    .filter((r) => r.timestamp != null)
    .sort((a, b) => ts(a) - ts(b));
  if (!recs.length) return [];

  const firstTs = ts(recs[0]);
  const lastTs = ts(recs[recs.length - 1]);
  const sessions = fit.sessions.filter((s) => s && (s.start_time != null || s.timestamp != null));

  // Primary: split by FIT sessions.
  if (sessions.length >= 1) {
    const segs: Segment[] = sessions.map((s, i) => {
      const [start, end] = sessionRange(s, firstTs, lastTs);
      let sr = recs.filter((r) => ts(r) >= start - 2 && ts(r) <= end + 2);
      if (!sr.length) sr = recs; // bad ranges -> don't lose data
      return {
        id: 's' + i,
        label: 'Session ' + (i + 1),
        sublabel: sublabel(start, end),
        kind: 'session' as const,
        startTime: start,
        endTime: end,
        records: sr,
        session: s,
        periods: lapsFor(fit.laps, start, end),
      };
    });
    if (sessions.length > 1) segs.unshift(combinedSeg(recs, 'Whole file (all sessions)'));
    return segs;
  }

  // Fallback: no sessions — split on long time gaps.
  const chunks = gapSplit(recs, GAP_SPLIT_S);
  if (chunks.length <= 1) {
    return [
      {
        id: 'full',
        label: 'Full activity',
        sublabel: sublabel(firstTs, lastTs),
        kind: 'full',
        startTime: firstTs,
        endTime: lastTs,
        records: recs,
        session: null,
        periods: [],
      },
    ];
  }
  const segs: Segment[] = chunks.map((c, i) => ({
    id: 'g' + i,
    label: 'Part ' + (i + 1),
    sublabel: sublabel(ts(c[0]), ts(c[c.length - 1])),
    kind: 'gap' as const,
    startTime: ts(c[0]),
    endTime: ts(c[c.length - 1]),
    records: c,
    session: null,
    periods: [],
  }));
  segs.unshift(combinedSeg(recs, 'Whole recording'));
  return segs;
}

// Records within a segment restricted to a period (half). index -1 = whole.
export function recordsForPeriod(seg: Segment, periodIndex: number): RecordSample[] {
  if (periodIndex < 0 || !seg.periods[periodIndex]) return seg.records;
  const p = seg.periods[periodIndex];
  return seg.records.filter((r) => ts(r) >= p.startTime - 2 && ts(r) <= p.endTime + 2);
}
