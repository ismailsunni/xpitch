/*
 * metrics.ts — single source of truth for what every stat means. Used both for
 * the inline info tooltips (InfoTip) and the Help page glossary, so the two
 * never drift. Reference a description inline with METRICS.<key>.desc.
 */
export interface Metric {
  key: string;
  term: string;
  desc: string;
}
export interface MetricSection {
  title: string;
  items: Metric[];
}

export const METRIC_SECTIONS: MetricSection[] = [
  {
    title: 'Match rating',
    items: [
      { key: 'rating', term: 'Match rating', desc: 'An overall letter grade for the session, blending work rate, intensity and endurance. It’s relative to your own effort, not a league benchmark.' },
      { key: 'workRate', term: 'Work rate', desc: 'How much ground you covered per minute of the match, scored 0–100.' },
      { key: 'intensity', term: 'Intensity', desc: 'How hard the match was — from your average heart-rate load, or the share of high-speed running when no HR is available. Scored 0–100.' },
      { key: 'endurance', term: 'Endurance', desc: 'How well your second-half work rate held up versus the first half. Scored 0–100.' },
    ],
  },
  {
    title: 'Distance & speed',
    items: [
      { key: 'totalDistance', term: 'Total distance', desc: 'Total ground covered during the session, from the GPS track.' },
      { key: 'topSpeed', term: 'Top speed', desc: 'Fastest speed reached, lightly smoothed to remove GPS spikes.' },
      { key: 'avgSpeedMoving', term: 'Avg speed (moving)', desc: 'Average speed while actually moving — standing still is excluded.' },
      { key: 'movingTime', term: 'Moving time', desc: 'Time spent moving (above a walking threshold).' },
      { key: 'standingTime', term: 'Standing time', desc: 'Time spent stationary or barely moving.' },
      { key: 'sprints', term: 'Sprints', desc: 'Number of runs above the sprint speed threshold (set in analysis settings).' },
      { key: 'highIntensityRuns', term: 'High-intensity runs', desc: 'Runs above the high-intensity threshold — faster than jogging but below a full sprint.' },
      { key: 'highSpeedDistance', term: 'High-speed distance', desc: 'Distance covered at running speed or faster.' },
      { key: 'accelerations', term: 'Accelerations', desc: 'Count of sharp speed-ups (≥ 2 m/s²) — bursts of effort.' },
      { key: 'decelerations', term: 'Decelerations', desc: 'Count of hard slow-downs (≤ −2 m/s²) — braking and changes of pace.' },
      { key: 'speedZones', term: 'Distance by speed zone', desc: 'How your distance splits across walk / jog / run / high-speed / sprint bands.' },
    ],
  },
  {
    title: 'Heart rate',
    items: [
      { key: 'avgHR', term: 'Average HR', desc: 'Average heart rate across the session.' },
      { key: 'maxHR', term: 'Max HR', desc: 'Highest heart rate recorded during the session.' },
      { key: 'refMax', term: 'Reference max', desc: 'The max HR used to scale the zones: your set value, else estimated from age (220 − age), else the highest observed.' },
      { key: 'hrZones', term: 'HR zones', desc: 'Time spent in each zone (Z1 recovery → Z5 max), defined from heart-rate reserve when resting HR is set, otherwise from reference max HR.' },
      { key: 'recoveries', term: 'Recovery windows', desc: 'Low-intensity windows where your heart rate dropped noticeably. Use repeated-sprint bouts alongside this for between-effort context.' },
      { key: 'calories', term: 'Calories', desc: 'Estimated energy burned, taken from the device when it records it.' },
    ],
  },
  {
    title: 'Positioning',
    items: [
      { key: 'coverage', term: 'Pitch covered', desc: 'Share of the pitch (a grid of cells) that you spent time in.' },
      { key: 'thirds', term: 'Time by third', desc: 'Share of time in the defensive, middle and attacking third along the pitch.' },
      { key: 'sides', term: 'Time by side', desc: 'Share of time on the left, central and right of the pitch (width).' },
      { key: 'avgPosition', term: 'Average position', desc: 'Your mean position on the pitch across the session.' },
      { key: 'heatmap', term: 'Heatmap', desc: 'Where you spent time — red is most, blue least. Needs GPS; more accurate with a defined pitch.' },
    ],
  },
  {
    title: 'Football',
    items: [
      { key: 'role', term: 'Estimated role', desc: 'A best-guess playing role from your movement spread, average position and sprint activity — a heuristic, not a scouting verdict.' },
      { key: 'rse', term: 'Repeated-sprint bouts', desc: 'Sequences of 3+ sprints in quick succession — a marker of intense passages.' },
      { key: 'secondHalfWorkRate', term: '2nd-half work rate', desc: 'Change in distance-per-minute from the first to the second half (negative means you slowed down).' },
      { key: 'sprintsSplit', term: 'Sprints 1st / 2nd', desc: 'How your sprints were distributed between the two halves.' },
      { key: 'workRateChart', term: 'Work rate over time', desc: 'Distance covered each minute, with average heart rate overlaid when available.' },
    ],
  },
  {
    title: 'Session & data',
    items: [
      { key: 'viewing', term: 'Viewing', desc: 'Which session or half of the upload these numbers describe. Pick another in the session chooser.' },
      { key: 'duration', term: 'Duration', desc: 'Elapsed time of the selected session or half.' },
      { key: 'data', term: 'Data', desc: 'How many GPS samples were recorded and whether GPS and heart-rate data are present.' },
      { key: 'orientation', term: 'Orientation', desc: 'Which end you attacked. Flip it so the pitch matches reality; ends usually switch at half-time.' },
    ],
  },
];

// Flat lookup for inline tooltips.
export const METRICS: Record<string, Metric> = Object.fromEntries(
  METRIC_SECTIONS.flatMap((s) => s.items).map((m) => [m.key, m])
);

export function metricDesc(key: string): string {
  return METRICS[key]?.desc || '';
}
