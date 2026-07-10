/*
 * geo.js — geospatial helpers: local projection, distance, and PCA alignment
 * that maps raw GPS points onto a normalized pitch coordinate system.
 *
 * The player's GPS track is projected to local metres (equirectangular around
 * the mean), then PCA finds the dominant axis of movement which we treat as the
 * pitch's *length* direction. Points are expressed as (u, v):
 *   u = position along pitch length  (metres, then normalized 0..1)
 *   v = position across pitch width  (metres, then normalized 0..1)
 */
(function (global) {
  'use strict';

  const R_EARTH = 6371000; // metres

  function toRad(d) {
    return (d * Math.PI) / 180;
  }

  // Great-circle distance between two lat/lon points (metres).
  function haversine(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /*
   * Build a pitch coordinate mapping from an array of {lat, lon} points.
   * Returns:
   *   project(lat, lon) -> {u, v}  (normalized 0..1, u=length, v=width)
   *   lengthM, widthM             (extent of the track along each axis)
   *   toLocal(lat, lon) -> {x, y}  (metres, east/north)
   */
  function buildPitchTransform(points) {
    const valid = points.filter((p) => p && isFinite(p.lat) && isFinite(p.lon));
    if (valid.length < 3) return null;

    let sumLat = 0,
      sumLon = 0;
    for (const p of valid) {
      sumLat += p.lat;
      sumLon += p.lon;
    }
    const meanLat = sumLat / valid.length;
    const meanLon = sumLon / valid.length;
    const cosLat = Math.cos(toRad(meanLat));

    // Equirectangular projection to local metres.
    const toLocal = (lat, lon) => ({
      x: toRad(lon - meanLon) * cosLat * R_EARTH, // east
      y: toRad(lat - meanLat) * R_EARTH, // north
    });

    const local = valid.map((p) => toLocal(p.lat, p.lon));

    // Covariance matrix of local points.
    let sxx = 0,
      syy = 0,
      sxy = 0;
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
    // Principal eigenvector (length axis direction).
    let ax, ay;
    if (Math.abs(sxy) > 1e-9) {
      ax = l1 - syy;
      ay = sxy;
    } else {
      // Diagonal covariance: pick axis with larger variance.
      if (sxx >= syy) {
        ax = 1;
        ay = 0;
      } else {
        ax = 0;
        ay = 1;
      }
    }
    const norm = Math.hypot(ax, ay) || 1;
    ax /= norm;
    ay /= norm;
    // Width axis is perpendicular.
    const bx = -ay;
    const by = ax;

    // Project all points onto (length, width) axes to find extents.
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
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

    const project = (lat, lon) => {
      const l = toLocal(lat, lon);
      const u = l.x * ax + l.y * ay;
      const v = l.x * bx + l.y * by;
      return {
        u: (u - minU) / spanU,
        v: (v - minV) / spanV,
      };
    };

    return {
      project,
      toLocal,
      lengthM,
      widthM,
      meanLat,
      meanLon,
    };
  }

  global.Geo = { haversine, buildPitchTransform };
})(typeof window !== 'undefined' ? window : this);
