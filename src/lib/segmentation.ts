/*
 * segmentation.ts — split parsed FIT data into analyzable segments, across one
 * or many uploaded files.
 *
 * Pipeline: merge files into one timeline -> base units (one per FIT `session`,
 * or contiguous runs split on short pauses when there are no sessions) -> group
 * adjacent units whose gap is within `groupGapS` into one segment ("group them
 * as one session if close enough"). Merged pieces become periods (halves).
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
  sourceFile?: string;
}

export interface ParsedFile {
  name: string;
  fit: FitResult;
}

export const DEFAULT_GROUP_GAP_MIN = 10;
const ATOMIC_GAP_S = 120; // pauses shorter than this stay within one base unit

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
  const start = (s.start_time as number) ?? (s.timestamp != null && elapsed ? (s.timestamp as number) - elapsed : fallbackStart);
  const end = elapsed ? start + elapsed : ((s.timestamp as number) ?? fallbackEnd);
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

interface BaseUnit {
  startTime: number;
  endTime: number;
  records: RecordSample[];
  session: SessionMessage | null;
  laps: Period[];
}

// Atomic units before grouping: one per FIT session, else contiguous runs.
function baseUnits(fit: FitResult, recs: RecordSample[]): BaseUnit[] {
  const firstTs = ts(recs[0]);
  const lastTs = ts(recs[recs.length - 1]);
  const sessions = fit.sessions.filter((s) => s && (s.start_time != null || s.timestamp != null));

  if (sessions.length >= 1) {
    const units = sessions
      .map((s) => {
        const [start, end] = sessionRange(s, firstTs, lastTs);
        const sr = recs.filter((r) => ts(r) >= start - 2 && ts(r) <= end + 2);
        return { startTime: start, endTime: end, records: sr, session: s, laps: lapsFor(fit.laps, start, end) };
      })
      .filter((u) => u.records.length);
    if (units.length) return units.sort((a, b) => a.startTime - b.startTime);
    // Bad session ranges: fall through to gap-splitting.
  }

  const chunks = gapSplit(recs, ATOMIC_GAP_S);
  return chunks.map((c) => ({
    startTime: ts(c[0]),
    endTime: ts(c[c.length - 1]),
    records: c,
    session: null,
    laps: [],
  }));
}

function synthSession(members: BaseUnit[], start: number, end: number): SessionMessage {
  const withS = members.filter((m) => m.session);
  const calSum = withS.reduce((a, m) => a + (Number(m.session!.total_calories) || 0), 0);
  return {
    sport: withS[0]?.session?.sport,
    total_calories: calSum || undefined,
    // total_distance intentionally omitted: summed record deltas are correct
    // across per-file distance resets (see analytics totalDistance).
    start_time: start,
    total_elapsed_time: end - start,
    timestamp: end,
  } as SessionMessage;
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

export function buildSegments(fit: FitResult, groupGapS = DEFAULT_GROUP_GAP_MIN * 60): Segment[] {
  const recs = fit.records.filter((r) => r.timestamp != null).sort((a, b) => ts(a) - ts(b));
  if (!recs.length) return [];

  const units = baseUnits(fit, recs);
  if (!units.length) {
    return [
      {
        id: 'full',
        label: 'Full activity',
        sublabel: sublabel(ts(recs[0]), ts(recs[recs.length - 1])),
        kind: 'full',
        startTime: ts(recs[0]),
        endTime: ts(recs[recs.length - 1]),
        records: recs,
        session: null,
        periods: [],
      },
    ];
  }

  // Group adjacent units whose gap is within the threshold.
  const groups: BaseUnit[][] = [];
  let cur: BaseUnit[] = [units[0]];
  for (let i = 1; i < units.length; i++) {
    if (units[i].startTime - cur[cur.length - 1].endTime <= groupGapS) cur.push(units[i]);
    else {
      groups.push(cur);
      cur = [units[i]];
    }
  }
  groups.push(cur);

  const single = groups.length === 1;
  const segs: Segment[] = groups.map((g, i) => {
    const records = g.flatMap((m) => m.records);
    const start = g[0].startTime;
    const end = g[g.length - 1].endTime;
    const periods: Period[] =
      g.length > 1
        ? g.map((m, idx) => ({ index: idx, label: periodLabel(idx, g.length), startTime: m.startTime, endTime: m.endTime }))
        : g[0].laps;
    const session = g.length === 1 ? g[0].session : synthSession(g, start, end);
    const hasSession = !!session;
    return {
      id: 'g' + i,
      label: single ? 'Full match' : 'Session ' + (i + 1),
      sublabel: sublabel(start, end),
      kind: hasSession ? 'session' : 'full',
      startTime: start,
      endTime: end,
      records,
      session,
      periods,
    };
  });

  if (groups.length > 1) segs.unshift(combinedSeg(recs, 'Whole upload'));
  return segs;
}

// A multi-file upload represents a deliberate match/session boundary at every
// file boundary. Do not infer or group across those boundaries, even if their
// timestamps are close together.
export function buildSegmentsPerFile(fit: FitResult, breakFiles: string[] = []): Segment[] {
  const recs = fit.records.filter((r) => r.timestamp != null).sort((a, b) => ts(a) - ts(b));
  const byFile = new Map<string, RecordSample[]>();
  for (const r of recs) {
    const name = typeof r._fileName === 'string' ? r._fileName : null;
    if (!name) return buildSegments(fit);
    const group = byFile.get(name) || [];
    group.push(r);
    byFile.set(name, group);
  }
  const files = [...byFile.entries()]
    .map(([name, records]) => ({ name, records, start: ts(records[0]), end: ts(records[records.length - 1]) }))
    .sort((a, b) => a.start - b.start);
  if (files.length < 2) return buildSegments(fit);
  const activeFiles = files.filter((file) => !breakFiles.includes(file.name));
  if (!activeFiles.length) return [];
  const activeRecords = activeFiles.flatMap((file) => file.records).sort((a, b) => ts(a) - ts(b));
  const segs: Segment[] = activeFiles.map((file, i) => ({
    id: 'f' + i,
    label: 'Session ' + (i + 1),
    sublabel: sublabel(file.start, file.end),
    kind: 'session',
    startTime: file.start,
    endTime: file.end,
    records: file.records,
    session: null,
    periods: [],
    sourceFile: file.name,
  }));
  return [combinedSeg(activeRecords, 'Whole upload'), ...segs];
}

// Manual splitting: carve the recording into sessions at `sessionBreaksSec`
// and each session into periods (halves) at `halfBreaksSec`. Break times are
// seconds from the recording's first record.
export function buildSegmentsManual(
  fit: FitResult,
  sessionBreaksSec: number[],
  halfBreaksSec: number[],
  recordingStartTime?: number
): Segment[] {
  const recs = fit.records.filter((r) => r.timestamp != null).sort((a, b) => ts(a) - ts(b));
  if (!recs.length) return [];
  const firstTs = recordingStartTime ?? ts(recs[0]);
  const lastTs = ts(recs[recs.length - 1]);
  const toTs = (sec: number) => firstTs + sec;

  const sBreaks = [...sessionBreaksSec]
    .map(toTs)
    .filter((t) => t > firstTs && t < lastTs)
    .sort((a, b) => a - b);
  const bounds = [firstTs, ...sBreaks, lastTs + 1]; // upper bound exclusive

  const segs: Segment[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const chunk = recs.filter((r) => ts(r) >= bounds[i] && ts(r) < bounds[i + 1]);
    if (chunk.length < 2) continue;
    const cStart = ts(chunk[0]);
    const cEnd = ts(chunk[chunk.length - 1]);
    const hBreaks = halfBreaksSec
      .map(toTs)
      .filter((t) => t > cStart && t < cEnd)
      .sort((a, b) => a - b);
    const pb = [cStart, ...hBreaks, cEnd + 1];
    const periods: Period[] =
      pb.length > 2
        ? pb.slice(0, -1).map((s, j) => ({
            index: j,
            label: periodLabel(j, pb.length - 1),
            startTime: s,
            endTime: pb[j + 1] - 1,
          }))
        : [];
    segs.push({
      id: 'm' + i,
      label: 'Session ' + (segs.length + 1),
      sublabel: sublabel(cStart, cEnd),
      kind: 'session',
      startTime: cStart,
      endTime: cEnd,
      records: chunk,
      session: null,
      periods,
    });
  }
  if (!segs.length) return buildSegments(fit); // nothing valid → fall back
  if (segs.length > 1) segs.unshift(combinedSeg(recs, 'Whole recording'));
  else segs[0].label = 'Full match';
  return segs;
}

// Merge several parsed files into one timeline (records tagged with file name).
export function mergeFiles(files: ParsedFile[]): FitResult {
  const records: RecordSample[] = [];
  const sessions: SessionMessage[] = [];
  const laps: SessionMessage[] = [];
  for (const pf of files) {
    for (const r of pf.fit.records) records.push({ ...r, _fileName: pf.name });
    sessions.push(...pf.fit.sessions);
    laps.push(...pf.fit.laps);
  }
  records.sort((a, b) => (a.timestamp as number) - (b.timestamp as number));
  return { records, sessions, laps, events: [], activity: null, file_id: files[0]?.fit.file_id ?? null, other: {} };
}

// Records within a segment restricted to a period (half). index -1 = whole.
export function recordsForPeriod(seg: Segment, periodIndex: number): RecordSample[] {
  if (periodIndex < 0 || !seg.periods[periodIndex]) return seg.records;
  const p = seg.periods[periodIndex];
  return seg.records.filter((r) => ts(r) >= p.startTime - 2 && ts(r) <= p.endTime + 2);
}
