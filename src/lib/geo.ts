/*
 * geo.ts — geospatial helpers: local projection, distance, and PCA alignment
 * that maps raw GPS points onto a normalized pitch coordinate system.
 *
 * The player's GPS track is projected to local metres (equirectangular around
 * the mean), then PCA finds the dominant axis of movement which we treat as the
 * pitch's *length* direction. Points are expressed as (u, v) in [0,1]:
 *   u = position along pitch length, v = position across pitch width.
 */

const R_EARTH = 6371000; // metres

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

// Great-circle distance between two lat/lon points (metres).
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface PitchTransform {
  project(lat: number, lon: number): { u: number; v: number };
  toLocal(lat: number, lon: number): { x: number; y: number };
  lengthM: number;
  widthM: number;
  meanLat: number;
  meanLon: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/*
 * Build a pitch coordinate mapping from an array of {lat, lon} points.
 */
export function buildPitchTransform(points: LatLon[]): PitchTransform | null {
  const valid = points.filter((p) => p && isFinite(p.lat) && isFinite(p.lon));
  if (valid.length < 3) return null;

  let sumLat = 0;
  let sumLon = 0;
  for (const p of valid) {
    sumLat += p.lat;
    sumLon += p.lon;
  }
  const meanLat = sumLat / valid.length;
  const meanLon = sumLon / valid.length;
  const cosLat = Math.cos(toRad(meanLat));

  // Equirectangular projection to local metres.
  const toLocal = (lat: number, lon: number) => ({
    x: toRad(lon - meanLon) * cosLat * R_EARTH, // east
    y: toRad(lat - meanLat) * R_EARTH, // north
  });

  const local = valid.map((p) => toLocal(p.lat, p.lon));

  // Covariance matrix of local points.
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const l of local) {
    sxx += l.x * l.x;
    syy += l.y * l.y;
    sxy += l.x * l.y;
  }
  const n = local.length;
  sxx /= n;
  syy /= n;
  sxy /= n;

  // Eigen-decomposition of the 2x2 symmetric covariance matrix.
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (trace / 2) ** 2 - det));
  const l1 = trace / 2 + disc; // larger eigenvalue -> length axis
  let ax: number;
  let ay: number;
  if (Math.abs(sxy) > 1e-9) {
    ax = l1 - syy;
    ay = sxy;
  } else if (sxx >= syy) {
    ax = 1;
    ay = 0;
  } else {
    ax = 0;
    ay = 1;
  }
  const norm = Math.hypot(ax, ay) || 1;
  ax /= norm;
  ay /= norm;
  const bx = -ay; // width axis (perpendicular)
  const by = ax;

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const l of local) {
    const u = l.x * ax + l.y * ay;
    const v = l.x * bx + l.y * by;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const lengthM = maxU - minU;
  const widthM = maxV - minV;
  const spanU = lengthM || 1;
  const spanV = widthM || 1;

  const project = (lat: number, lon: number) => {
    const l = toLocal(lat, lon);
    const u = l.x * ax + l.y * ay;
    const v = l.x * bx + l.y * by;
    return { u: (u - minU) / spanU, v: (v - minV) / spanV };
  };

  return { project, toLocal, lengthM, widthM, meanLat, meanLon };
}

// Solve a dense linear system A x = b (Gaussian elimination, partial pivoting).
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// 4-point homography mapping src[i]=(x,y) -> dst[i]=(u,v). Returns [h0..h7]
// where u = (h0 x + h1 y + h2)/(h6 x + h7 y + 1), v likewise with h3..h5.
function homography(src: number[][], dst: number[][]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  return solveLinear(A, b);
}

/*
 * Build a pitch transform from four field corners (lat/lon), e.g. drawn on a
 * map or entered manually. Corners may be given in any order — they are ordered
 * around their centroid and the longer edge pair is taken as the pitch length.
 * A projective homography maps the field quadrilateral to the unit square, so
 * arbitrary orientation and slightly non-rectangular fields work correctly.
 */
export function buildFieldTransform(cornersLL: LatLon[]): PitchTransform | null {
  const valid = cornersLL.filter((p) => p && isFinite(p.lat) && isFinite(p.lon));
  if (valid.length < 4) return null;
  const pts = valid.slice(0, 4);

  const meanLat = pts.reduce((a, p) => a + p.lat, 0) / 4;
  const meanLon = pts.reduce((a, p) => a + p.lon, 0) / 4;
  const cosLat = Math.cos(toRad(meanLat));
  const toLocal = (lat: number, lon: number) => ({
    x: toRad(lon - meanLon) * cosLat * R_EARTH,
    y: toRad(lat - meanLat) * R_EARTH,
  });

  let local = pts.map((p) => toLocal(p.lat, p.lon));
  const cx = local.reduce((a, p) => a + p.x, 0) / 4;
  const cy = local.reduce((a, p) => a + p.y, 0) / 4;
  // Order CCW around the centroid.
  local = local
    .map((p) => ({ ...p, ang: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((a, b) => a.ang - b.ang);

  const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
  const edges = (arr: any[]) => [
    dist(arr[0], arr[1]),
    dist(arr[1], arr[2]),
    dist(arr[2], arr[3]),
    dist(arr[3], arr[0]),
  ];
  let e = edges(local);
  // Rotate so the longer opposite-edge pair (e[0]+e[2]) is the pitch length.
  if (e[1] + e[3] > e[0] + e[2]) {
    local = [local[1], local[2], local[3], local[0]];
    e = edges(local);
  }
  const lengthM = (e[0] + e[2]) / 2;
  const widthM = (e[1] + e[3]) / 2;
  if (lengthM < 3 || widthM < 3) return null; // degenerate

  const src = local.map((p) => [p.x, p.y]);
  const dst = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const H = homography(src, dst);
  if (!H) return null;

  const project = (lat: number, lon: number) => {
    const l = toLocal(lat, lon);
    const den = H[6] * l.x + H[7] * l.y + 1;
    return {
      u: (H[0] * l.x + H[1] * l.y + H[2]) / den,
      v: (H[3] * l.x + H[4] * l.y + H[5]) / den,
    };
  };

  return { project, toLocal, lengthM, widthM, meanLat, meanLon };
}

// Centroid of a set of lat/lon points (for the "different venue" guard).
export function centroid(pts: LatLon[]): LatLon | null {
  const v = pts.filter((p) => p && isFinite(p.lat) && isFinite(p.lon));
  if (!v.length) return null;
  return {
    lat: v.reduce((a, p) => a + p.lat, 0) / v.length,
    lon: v.reduce((a, p) => a + p.lon, 0) / v.length,
  };
}
