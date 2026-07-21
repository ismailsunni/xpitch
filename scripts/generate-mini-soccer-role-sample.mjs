import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Amikom Soccer Arena, seeded in supabase/migrations/0001_init.sql.
const corners = [
  { lat: -7.7623279322076115, lon: 110.41793171866435 },
  { lat: -7.762382229525912, lon: 110.41824325775242 },
  { lat: -7.761906796671553, lon: 110.41834754980765 },
  { lat: -7.7618485263125905, lon: 110.4180279882538 },
];
const FIT_EPOCH = 631065600;
const outFile = resolve('public/samples/mini-soccer-4-sessions-roles.fit');

const u16 = (value) => [value & 0xff, (value >>> 8) & 0xff];
const u32 = (value) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
const i32 = (value) => u32(value >>> 0);
const semi = (degrees) => Math.round(degrees / (180 / 2 ** 31));
const fitTime = (date) => Math.floor(date.getTime() / 1000) - FIT_EPOCH;

function pitchPoint(u, v) {
  // Bilinear interpolation across the actual saved pitch polygon.
  const south = {
    lat: corners[0].lat + (corners[1].lat - corners[0].lat) * v,
    lon: corners[0].lon + (corners[1].lon - corners[0].lon) * v,
  };
  const north = {
    lat: corners[3].lat + (corners[2].lat - corners[3].lat) * v,
    lon: corners[3].lon + (corners[2].lon - corners[3].lon) * v,
  };
  return {
    lat: south.lat + (north.lat - south.lat) * u,
    lon: south.lon + (north.lon - south.lon) * u,
  };
}

function profile(role, index) {
  const wave = Math.sin(index * 0.18);
  const weave = Math.cos(index * 0.11);
  const sprint = index % 24 < 3;
  if (role === 'goalkeeper') return { u: 0.08 + wave * 0.035, v: 0.5 + weave * 0.08, hr: 124 + Math.round(wave * 5), cadence: 62, speed: 1.5 + Math.abs(wave) * 0.8, distanceSpeed: 1.3 };
  if (role === 'left-back') return { u: 0.25 + wave * 0.08, v: 0.05 + weave * 0.025, hr: 148 + Math.round(wave * 12), cadence: 88 + Math.round(Math.abs(wave) * 10), speed: sprint ? 6.2 : 2.7, distanceSpeed: 0.8 };
  return { u: 0.9 + wave * 0.06, v: 0.5 + weave * 0.1, hr: 157 + Math.round(wave * 13), cadence: 94 + Math.round(Math.abs(wave) * 11), speed: sprint ? 6.5 : 2.8, distanceSpeed: 1.5 };
}

const recordsDefinition = [
  0x40, 0, 0, ...u16(20), 7,
  253, 4, 0x86, // timestamp
  0, 4, 0x85, // latitude
  1, 4, 0x85, // longitude
  3, 1, 0x02, // heart rate
  4, 1, 0x02, // cadence
  5, 4, 0x86, // distance
  6, 2, 0x84, // speed
];
const sessionDefinition = [
  0x41, 0, 0, ...u16(18), 5,
  253, 4, 0x86, // timestamp
  2, 4, 0x86, // start time
  5, 1, 0x00, // sport
  7, 4, 0x86, // elapsed time
  9, 4, 0x86, // distance
];

const bytes = [...recordsDefinition, ...sessionDefinition];
const sessionRoles = ['striker', 'goalkeeper', 'left-back', 'striker'];
const firstStart = new Date('2026-07-19T08:00:00Z');
const sessionDurationS = 18 * 60;
const gapS = 12 * 60;

for (let sessionIndex = 0; sessionIndex < sessionRoles.length; sessionIndex++) {
  const role = sessionRoles[sessionIndex];
  const start = new Date(firstStart.getTime() + sessionIndex * (sessionDurationS + gapS) * 1000);
  let distanceM = 0;
  for (let t = 0; t <= sessionDurationS; t += 5) {
    const p = profile(role, t / 5 + sessionIndex * 31);
    const point = pitchPoint(Math.max(0.02, Math.min(0.98, p.u)), Math.max(0.04, Math.min(0.96, p.v)));
    distanceM += p.distanceSpeed * 5;
    bytes.push(
      0x00,
      ...u32(fitTime(new Date(start.getTime() + t * 1000))),
      ...i32(semi(point.lat)),
      ...i32(semi(point.lon)),
      p.hr,
      p.cadence,
      ...u32(Math.round(distanceM * 100)),
      ...u16(Math.round(p.speed * 1000)),
    );
  }
  const end = new Date(start.getTime() + sessionDurationS * 1000);
  bytes.push(
    0x01,
    ...u32(fitTime(end)),
    ...u32(fitTime(start)),
    1, // FIT running sport enum; xPitch's selected pitch drives mini-soccer format detection.
    ...u32(sessionDurationS * 1000),
    ...u32(Math.round(distanceM * 100)),
  );
}

const header = [14, 0x20, 0, 1, ...u32(bytes.length), 46, 70, 73, 84, 0, 0];
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, Uint8Array.from([...header, ...bytes, 0, 0]));
console.log(`Wrote ${outFile}`);
