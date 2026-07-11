/* format.ts — presentation helpers (durations, distances, sport names, geocode). */

const KMH = 3.6;

export function fmtDur(sec: number): string {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

export function fmtDist(m: number): string {
  if (m >= 1000) return (m / 1000).toFixed(2) + ' km';
  return Math.round(m) + ' m';
}

export function kmh(ms: number): string {
  return (ms * KMH).toFixed(1);
}

export function pct(a: number, b: number): number {
  return b ? Math.round((a / b) * 100) : 0;
}

// FIT sport enum -> label (device stores a number; demo stores a string).
const SPORTS: Record<number, string> = {
  0: 'Generic', 1: 'Running', 2: 'Cycling', 4: 'Fitness equipment',
  5: 'Swimming', 6: 'Basketball', 7: 'Soccer', 8: 'Tennis',
  9: 'American football', 10: 'Training', 11: 'Walking', 15: 'Rowing',
  18: 'Hiking', 19: 'Multisport',
};

export function sportName(sport: number | string | null | undefined): string | null {
  if (sport == null) return null;
  if (typeof sport === 'number') return SPORTS[sport] || 'Sport ' + sport;
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}

// Age in whole years from an ISO birth date (yyyy-mm-dd), or null.
export function deriveAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a > 0 && a < 120 ? a : null;
}

// Best-effort reverse geocode via OSM Nominatim. Returns a short place label.
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14` +
      `&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    const place =
      a.suburb || a.neighbourhood || a.village || a.town || a.city || a.county || '';
    const region = a.city || a.state || a.country || '';
    const parts = [place, region].filter((x, i, arr) => x && arr.indexOf(x) === i);
    return parts.length ? parts.join(', ') : data.display_name || null;
  } catch {
    return null;
  }
}
