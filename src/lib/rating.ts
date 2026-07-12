/*
 * rating.ts — derives a match "report card" (grade + component scores + a few
 * highlights) from the real analytics. These are heuristics over data we already
 * compute (distance, intensity, sprints, HR, half-to-half fatigue), NOT external
 * benchmarks — so treat them as a self-relative summary, not a league ranking.
 */
import { fmtClock } from './format';

const KMH = 3.6;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export interface Rating {
  score: number; // 0–100 overall
  grade: string; // letter grade, e.g. "A−"
  title: string;
  blurb: string;
  workRate: number;
  intensity: number;
  endurance: number;
}

export interface Highlight {
  minute: string; // "34'"
  color: string;
  title: string;
  detail: string;
}

function toGrade(score: number): string {
  const bands: [number, string][] = [
    [90, 'A'], [85, 'A−'], [80, 'B+'], [75, 'B'], [70, 'B−'],
    [65, 'C+'], [60, 'C'], [55, 'C−'], [50, 'D+'], [0, 'D'],
  ];
  return (bands.find(([min]) => score >= min) || [0, 'D'])[1];
}

export function deriveRating(a: any): Rating {
  const s = a.summary;
  const mins = Math.max(1, s.durationS / 60);
  const distPerMin = s.totalDistance / mins;

  // Work rate: distance covered per minute (≈120 m/min is a strong amateur shift).
  const workRate = clamp((distPerMin / 130) * 100);

  // Intensity: prefer HR load (avg as a fraction of reference max); otherwise
  // fall back to the share of distance run at high speed.
  let intensity: number;
  if (a.physio?.refMax) {
    intensity = clamp(((a.physio.avgHR / a.physio.refMax - 0.5) / 0.4) * 100);
  } else {
    const hiDist = (a.running?.zones || [])
      .filter((z: any) => z.min >= 14.4 / KMH || z.min >= 14) // running and faster (km/h thresholds)
      .reduce((t: number, z: any) => t + z.distance, 0);
    intensity = clamp((hiDist / Math.max(1, s.totalDistance) / 0.25) * 100);
  }

  // Endurance: how well the 2nd-half work rate held up vs the 1st.
  const drop = a.football?.fatigue?.distanceDropPct ?? 0;
  const endurance = clamp(85 + drop, 20, 100);

  const score = clamp(workRate * 0.4 + intensity * 0.3 + endurance * 0.3);

  // Pick a headline from the strongest trait.
  const traits: [number, string, string][] = [
    [workRate, 'Box-to-box engine', 'relentless ground coverage across the match'],
    [intensity, 'High-intensity threat', 'lots of time spent in the red'],
    [endurance, 'Iron lungs', 'barely dropped off after half-time'],
  ];
  traits.sort((x, y) => y[0] - x[0]);
  const [, title] = traits[0];

  const km = (s.totalDistance / 1000).toFixed(2);
  const sprints = a.running?.sprints?.length ?? 0;
  const accel = a.running?.accelEvents?.length ?? 0;
  const blurb =
    `${km} km at ${Math.round(distPerMin)} m/min` +
    (sprints ? ` with ${sprints} sprint${sprints === 1 ? '' : 's'}` : '') +
    (accel ? ` and ${accel} accelerations.` : '.');

  return { score: Math.round(score), grade: toGrade(score), title, blurb, workRate: Math.round(workRate), intensity: Math.round(intensity), endurance: Math.round(endurance) };
}

export function deriveHighlights(a: any): Highlight[] {
  const out: Highlight[] = [];
  const sprints = a.running?.sprints || [];

  // Fastest sprint (top speed moment).
  if (sprints.length) {
    const fastest = sprints.reduce((m: any, r: any) => (r.maxSpeed > m.maxSpeed ? r : m), sprints[0]);
    out.push({
      minute: fmtClock(fastest.start).split(':')[0] + "'",
      color: 'var(--c-coral)',
      title: `Top speed ${(fastest.maxSpeed * KMH).toFixed(1)} km/h`,
      detail: 'fastest burst of the match',
    });
    // Longest sprint (by distance).
    const longest = sprints.reduce((m: any, r: any) => (r.distance > m.distance ? r : m), sprints[0]);
    if (longest !== fastest) {
      out.push({
        minute: fmtClock(longest.start).split(':')[0] + "'",
        color: 'var(--accent)',
        title: `Longest sprint ${Math.round(longest.distance)} m`,
        detail: 'sustained top-end run',
      });
    }
  }

  // Busiest 10-minute block.
  const segs = a.football?.fatigue?.segments || [];
  if (segs.length) {
    const busiest = segs.reduce((m: any, x: any) => (x.distance > m.distance ? x : m), segs[0]);
    out.push({
      minute: busiest.label.split('–')[0] + "'",
      color: 'var(--c-mint)',
      title: `Busiest block — ${Math.round(busiest.distance)} m`,
      detail: `most ground covered (${busiest.label} min)`,
    });
  }

  return out.slice(0, 3);
}
