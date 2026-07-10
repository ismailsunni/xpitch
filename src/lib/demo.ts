/*
 * demo.ts — synthesizes a realistic minisoccer match as if parsed from a FIT
 * file (records with GPS, speed, HR, distance). Powers the "Load demo match"
 * button so the app is usable without a real .fit file.
 *
 * The simulated player is a right-sided attacker: play skewed to the right
 * flank and forward, real sprints/accelerations down the wing, occasional
 * defensive track-backs, and a measurable second-half fatigue drop.
 */
import type { FitResult } from './fit-parser';

const R = 6371000;
const FIT_EPOCH = 631065600;

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
function pick<T extends { p: number }>(states: T[]): T {
  let r = Math.random();
  for (const s of states) {
    if (r < s.p) return s;
    r -= s.p;
  }
  return states[states.length - 1];
}

export function generate(): FitResult {
  const baseLat = 46.204;
  const baseLon = 6.143;
  const theta = 0.6;
  const L = 50;
  const W = 32;
  const lengthVec = { x: Math.cos(theta), y: Math.sin(theta) };
  const widthVec = { x: -Math.sin(theta), y: Math.cos(theta) };
  const cosBase = Math.cos((baseLat * Math.PI) / 180);

  const durationS = 50 * 60;
  const startTs = 1_000_000_000;

  const statesH1 = [
    { name: 'stand', p: 0.18, lo: 0, hi: 0.4 },
    { name: 'walk', p: 0.35, lo: 0.6, hi: 1.8 },
    { name: 'jog', p: 0.3, lo: 2.0, hi: 3.4 },
    { name: 'run', p: 0.13, lo: 3.6, hi: 5.2 },
    { name: 'sprint', p: 0.04, lo: 5.8, hi: 8.2 },
  ];
  const statesH2 = [
    { name: 'stand', p: 0.23, lo: 0, hi: 0.4 },
    { name: 'walk', p: 0.4, lo: 0.5, hi: 1.6 },
    { name: 'jog', p: 0.26, lo: 1.8, hi: 3.0 },
    { name: 'run', p: 0.09, lo: 3.4, hi: 4.6 },
    { name: 'sprint', p: 0.02, lo: 5.4, hi: 7.2 },
  ];

  let u = 25;
  let v = 22;
  let heading = 0;
  let curSpeed = 1;
  let anchor = { u: 36, v: 24 };
  let cumDist = 0;
  let stateHold = 0;
  let cur = statesH1[1];

  const records: any[] = [];
  for (let sec = 0; sec <= durationS; sec++) {
    const half2 = sec > durationS / 2;

    if (Math.random() < 0.03) {
      if (Math.random() < 0.2) anchor = { u: rand(8, 22), v: rand(14, 28) };
      else anchor = { u: rand(30, 47), v: rand(20, 31) };
    }

    if (stateHold <= 0) {
      cur = pick(half2 ? statesH2 : statesH1);
      stateHold = cur.name === 'sprint' ? Math.round(rand(2, 5)) : Math.round(rand(1, 4));
    }
    stateHold--;
    const target = rand(cur.lo, cur.hi);
    const maxChange = 3.0;
    curSpeed += Math.max(-maxChange, Math.min(maxChange, target - curSpeed));
    curSpeed = Math.max(0, curSpeed);
    const speed = curSpeed;

    const desired = Math.atan2(anchor.v - v, anchor.u - u);
    const diff = ((desired - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    heading += diff * 0.35 + rand(-0.3, 0.3);

    u += Math.cos(heading) * speed;
    v += Math.sin(heading) * speed;
    if (u < 1) {
      u = 1;
      heading = Math.PI - heading;
    }
    if (u > L - 1) {
      u = L - 1;
      heading = Math.PI - heading;
    }
    if (v < 1) {
      v = 1;
      heading = -heading;
    }
    if (v > W - 1) {
      v = W - 1;
      heading = -heading;
    }

    cumDist += speed;

    const x = u * lengthVec.x + v * widthVec.x;
    const y = u * lengthVec.y + v * widthVec.y;
    const lat = baseLat + ((y / R) * 180) / Math.PI;
    const lon = baseLon + ((x / (R * cosBase)) * 180) / Math.PI;

    const prevHR = records.length ? records[records.length - 1].heart_rate : 120;
    const targetHR = 118 + speed * 9 + (half2 ? 10 : 0) + rand(-3, 3);
    const hr = Math.round(prevHR + (targetHR - prevHR) * 0.12);

    const ts = startTs + sec;
    records.push({
      timestamp: ts,
      date: new Date((ts + FIT_EPOCH) * 1000),
      position_lat: lat,
      position_long: lon,
      speed,
      heart_rate: Math.max(72, Math.min(199, hr)),
      distance: cumDist,
      altitude: 375 + rand(-0.5, 0.5),
      cadence: speed > 1 ? Math.round(rand(70, 96)) : 0,
    });
  }

  const sessions = [
    {
      sport: 'soccer',
      total_distance: cumDist,
      total_timer_time: durationS,
      total_elapsed_time: durationS,
      total_calories: Math.round(durationS * 0.16),
      start_date: new Date((startTs + FIT_EPOCH) * 1000),
      start_time: startTs,
    },
  ];

  return { records, sessions, laps: [], events: [], activity: null, file_id: null, other: {} };
}
