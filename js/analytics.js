/*
 * analytics.js — turns parsed FIT records into football/match analytics.
 *
 * Analytics.compute(fit, options) -> big object consumed by the UI.
 * options: { maxHR, restHR, age, attackingDir (+1|-1),
 *            sprintKmh, highIntensityKmh }
 *
 * All speeds internally in m/s; presented in km/h. Distances in metres.
 */
(function (global) {
  'use strict';

  const KMH = 3.6; // m/s -> km/h
  const MAX_GAP_S = 8; // cap dt across data gaps when accumulating time

  // Football speed zones (km/h). Distance & time accumulate per zone.
  const SPEED_ZONES = [
    { name: 'Walking', min: 0, max: 7, color: '#3b82f6' },
    { name: 'Jogging', min: 7, max: 14.4, color: '#22c55e' },
    { name: 'Running', min: 14.4, max: 19.8, color: '#eab308' },
    { name: 'High speed', min: 19.8, max: 25.2, color: '#f97316' },
    { name: 'Sprint', min: 25.2, max: Infinity, color: '#ef4444' },
  ];

  function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  function std(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
  }

  // Moving-average smoothing (odd window).
  function smooth(arr, win) {
    if (win <= 1) return arr.slice();
    const half = Math.floor(win / 2);
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let s = 0,
        c = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
        if (arr[j] != null && isFinite(arr[j])) {
          s += arr[j];
          c++;
        }
      }
      out[i] = c ? s / c : 0;
    }
    return out;
  }

  function compute(fit, options) {
    const opt = Object.assign(
      {
        maxHR: null,
        restHR: 60,
        age: null,
        attackingDir: 1,
        sprintKmh: 19.8,
        highIntensityKmh: 14.4,
      },
      options || {}
    );

    // ---- 1. Build clean, time-sorted sample series ----
    const raw = fit.records
      .filter((r) => r.timestamp != null)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (!raw.length) {
      return { ok: false, error: 'No timestamped record data found in this FIT file.' };
    }

    const t0 = raw[0].timestamp;
    const samples = raw.map((r) => {
      let speed = r.enhanced_speed != null ? r.enhanced_speed : r.speed;
      return {
        tSec: r.timestamp - t0,
        date: r.date,
        lat: r.position_lat,
        lon: r.position_long,
        speed: speed != null ? speed : null, // m/s
        hr: r.heart_rate != null ? r.heart_rate : null,
        distance: r.distance != null ? r.distance : null, // cumulative m
        altitude: r.enhanced_altitude != null ? r.enhanced_altitude : r.altitude,
        cadence: r.cadence,
        power: r.power,
      };
    });

    const hasGPS = samples.some((s) => s.lat != null && s.lon != null);
    const hasHR = samples.some((s) => s.hr != null);

    // Per-sample dt and incremental distance.
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      s.dt = i === 0 ? 0 : Math.min(MAX_GAP_S, samples[i].tSec - samples[i - 1].tSec);
      if (s.dt < 0) s.dt = 0;
    }

    // Treat implausible speeds as missing. GPS glitches report 60+ m/s, and
    // some devices use a non-standard "invalid" sentinel (e.g. raw 64536 ->
    // 64.5 m/s) rather than the spec's 0xFFFF, so a hard human-range cap is the
    // reliable filter. Missing values are reconstructed from GPS, else 0.
    const MAX_SPEED = 12.5; // m/s (~45 km/h)
    for (const s of samples) {
      if (s.speed == null || !isFinite(s.speed) || s.speed < 0 || s.speed > MAX_SPEED) {
        s.speed = null;
      }
    }
    // Reconstruct missing speed from consecutive GPS fixes.
    for (let i = 1; i < samples.length; i++) {
      const s = samples[i];
      if (s.speed == null && s.lat != null && samples[i - 1].lat != null && s.dt > 0) {
        const v = Geo.haversine(samples[i - 1].lat, samples[i - 1].lon, s.lat, s.lon) / s.dt;
        if (v >= 0 && v <= MAX_SPEED) s.speed = v;
      }
    }
    for (const s of samples) if (s.speed == null) s.speed = 0;

    // Incremental distance per sample. Prefer the device distance field, then
    // the (cleaned) speed integral — device speed is far less noisy than
    // differencing raw GPS fixes — and only fall back to GPS as a last resort.
    for (let i = 1; i < samples.length; i++) {
      const s = samples[i];
      const prev = samples[i - 1];
      let di = null;
      if (s.distance != null && prev.distance != null) {
        di = s.distance - prev.distance;
        if (di < 0 || di > 60) di = null; // reject bad deltas
      }
      if (di == null && s.dt > 0) di = s.speed * s.dt;
      if (di == null && s.lat != null && prev.lat != null) {
        di = Geo.haversine(prev.lat, prev.lon, s.lat, s.lon);
        if (di > 60) di = null;
      }
      s.dInc = Math.max(0, di || 0);
    }
    samples[0].dInc = 0;

    // ---- 2. Summary / timing ----
    const durationS = samples[samples.length - 1].tSec;
    const movingSamples = samples.filter((s) => s.speed > 0.6);
    const movingTime = movingSamples.reduce((a, s) => a + s.dt, 0);
    const standingTime = samples.reduce((a, s) => a + s.dt, 0) - movingTime;

    let totalDistance;
    const distField = samples.filter((s) => s.distance != null);
    const sessionDist = fit.sessions[0] && fit.sessions[0].total_distance;
    if (distField.length >= 2) {
      totalDistance = distField[distField.length - 1].distance - distField[0].distance;
    } else if (sessionDist != null && sessionDist > 0) {
      totalDistance = sessionDist; // authoritative device total
    } else {
      totalDistance = samples.reduce((a, s) => a + s.dInc, 0);
    }

    const smoothSpeed = smooth(
      samples.map((s) => s.speed),
      3
    );
    const topSpeed = Math.max(...smoothSpeed); // m/s, lightly smoothed to reject GPS spikes
    const rawTopSpeed = Math.max(...samples.map((s) => s.speed));
    const avgSpeedMoving = mean(movingSamples.map((s) => s.speed));

    // ---- 3. Positional analytics ----
    let positional = null;
    if (hasGPS) {
      // Collect GPS fixes, dropping outliers that jump implausibly far from the
      // last accepted fix (a single glitch would otherwise stretch the pitch).
      const gpsPts = [];
      let prevFix = null;
      for (const s of samples) {
        if (s.lat == null || s.lon == null) continue;
        if (prevFix) {
          const jump = Geo.haversine(prevFix.lat, prevFix.lon, s.lat, s.lon);
          const dt = s.tSec - prevFix.tSec || 1;
          if (jump / dt > 12.5) {
            s._gpsOutlier = true; // skip for pitch, keep for time accounting
            continue;
          }
        }
        prevFix = { lat: s.lat, lon: s.lon, tSec: s.tSec };
        gpsPts.push({ lat: s.lat, lon: s.lon });
      }
      const transform = Geo.buildPitchTransform(gpsPts);
      if (transform) {
        const pts = [];
        for (const s of samples) {
          if (s.lat == null || s.lon == null || s._gpsOutlier) continue;
          const p = transform.project(s.lat, s.lon);
          // Apply attacking-direction flip along length axis.
          let u = opt.attackingDir >= 0 ? p.u : 1 - p.u;
          pts.push({ u, v: p.v, tSec: s.tSec, dt: s.dt, speed: s.speed });
          s._u = u;
          s._v = p.v;
        }

        // Heatmap grid (length x width).
        const GX = 42,
          GY = 27;
        const grid = Array.from({ length: GY }, () => new Array(GX).fill(0));
        let gridMax = 0;
        for (const p of pts) {
          const gx = Math.min(GX - 1, Math.max(0, Math.floor(p.u * GX)));
          const gy = Math.min(GY - 1, Math.max(0, Math.floor(p.v * GY)));
          grid[gy][gx] += p.dt || 0.5;
          if (grid[gy][gx] > gridMax) gridMax = grid[gy][gx];
        }

        const avgPos = { u: mean(pts.map((p) => p.u)), v: mean(pts.map((p) => p.v)) };

        // Thirds along length: defensive / middle / attacking.
        const thirds = [0, 0, 0]; // def, mid, att
        for (const p of pts) {
          const idx = p.u < 1 / 3 ? 0 : p.u < 2 / 3 ? 1 : 2;
          thirds[idx] += p.dt;
        }

        // Sides across width: left / center / right.
        const sides = [0, 0, 0];
        for (const p of pts) {
          const idx = p.v < 1 / 3 ? 0 : p.v < 2 / 3 ? 1 : 2;
          sides[idx] += p.dt;
        }

        // 3x3 zone occupancy time.
        const zoneGrid = Array.from({ length: 3 }, () => new Array(3).fill(0));
        for (const p of pts) {
          const zx = Math.min(2, Math.floor(p.u * 3));
          const zy = Math.min(2, Math.floor(p.v * 3));
          zoneGrid[zy][zx] += p.dt;
        }

        positional = {
          transform,
          points: pts,
          grid,
          gridMax,
          GX,
          GY,
          avgPos,
          thirds,
          sides,
          zoneGrid,
          lengthM: transform.lengthM,
          widthM: transform.widthM,
        };
      }
    }

    // ---- 4. Running analytics: speed zones ----
    const zones = SPEED_ZONES.map((z) => ({ ...z, distance: 0, time: 0 }));
    for (const s of samples) {
      const kmh = s.speed * KMH;
      const zi = zones.findIndex((z) => kmh >= z.min && kmh < z.max);
      const idx = zi === -1 ? zones.length - 1 : zi;
      zones[idx].distance += s.dInc;
      zones[idx].time += s.dt;
    }

    // Sprint & high-intensity run detection.
    const sprintThr = opt.sprintKmh / KMH;
    const hiThr = opt.highIntensityKmh / KMH;
    const sprints = detectRuns(samples, sprintThr, 1.0);
    const highIntensityRuns = detectRuns(samples, hiThr, 1.0);

    // Accel / decel events from the same window-3 smoothed speed. A lighter
    // window keeps genuine changes; window-5 over-flattens the derivative at 1 Hz.
    const accelEvents = detectAccel(samples, smoothSpeed);

    // ---- 5. Physiological ----
    let physio = null;
    if (hasHR) {
      const hrSamples = samples.filter((s) => s.hr != null && s.hr > 0);
      const maxHRObs = Math.max(...hrSamples.map((s) => s.hr));
      const refMax =
        opt.maxHR || (opt.age ? 220 - opt.age : null) || Math.round(maxHRObs);
      const avgHR = mean(hrSamples.map((s) => s.hr));

      // HR zones as % of reference max.
      const zoneDefs = [
        { name: 'Z1 Recovery', min: 0, max: 0.6, color: '#3b82f6' },
        { name: 'Z2 Aerobic', min: 0.6, max: 0.7, color: '#22c55e' },
        { name: 'Z3 Tempo', min: 0.7, max: 0.8, color: '#eab308' },
        { name: 'Z4 Threshold', min: 0.8, max: 0.9, color: '#f97316' },
        { name: 'Z5 Max', min: 0.9, max: Infinity, color: '#ef4444' },
      ];
      const hrZones = zoneDefs.map((z) => ({
        ...z,
        lowBpm: Math.round(z.min * refMax),
        highBpm: z.max === Infinity ? refMax : Math.round(z.max * refMax),
        time: 0,
      }));
      for (const s of samples) {
        if (s.hr == null || s.hr <= 0) continue;
        const frac = s.hr / refMax;
        let zi = hrZones.findIndex((z) => frac >= z.min && frac < z.max);
        if (zi === -1) zi = hrZones.length - 1;
        hrZones[zi].time += s.dt;
      }

      const recoveries = detectRecoveries(samples);

      physio = {
        series: samples
          .filter((s) => s.hr != null)
          .map((s) => ({ x: s.tSec, y: s.hr })),
        avgHR: Math.round(avgHR),
        maxHR: maxHRObs,
        refMax,
        hrZones,
        recoveries,
      };
    }

    // ---- 6. Work rate & fatigue ----
    const minuteBins = buildMinuteBins(samples);
    const workRate = minuteBins; // distance per minute
    const fatigue = computeFatigue(samples, sprints, highIntensityRuns, hiThr, durationS);

    // Repeated sprint efforts: >=3 sprints within a rolling 60s, recovery <60s.
    const rse = detectRepeatedSprints(sprints);

    // ---- 7. Role estimation ----
    const role = positional
      ? estimateRole(positional, { sprints, highIntensityRuns, totalDistance, durationS })
      : null;

    return {
      ok: true,
      meta: {
        hasGPS,
        hasHR,
        hasSpeed: samples.some((s) => s.speed > 0),
        startDate: samples[0].date,
        durationS,
        sampleCount: samples.length,
        sport: fit.sessions[0] ? fit.sessions[0].sport : null,
      },
      samples,
      summary: {
        durationS,
        movingTime,
        standingTime,
        totalDistance,
        topSpeed,
        rawTopSpeed,
        avgSpeedMoving,
      },
      positional,
      running: {
        zones,
        sprints,
        highIntensityRuns,
        accelEvents,
      },
      physio,
      football: {
        workRate,
        fatigue,
        rse,
        role,
      },
      options: opt,
    };
  }

  // Detect sustained runs above a speed threshold.
  function detectRuns(samples, thrMs, minDurationS) {
    const runs = [];
    let cur = null;
    for (const s of samples) {
      if (s.speed >= thrMs) {
        if (!cur) cur = { start: s.tSec, end: s.tSec, maxSpeed: s.speed, distance: 0 };
        cur.end = s.tSec;
        cur.maxSpeed = Math.max(cur.maxSpeed, s.speed);
        cur.distance += s.dInc;
      } else if (cur) {
        cur.duration = cur.end - cur.start;
        if (cur.duration >= minDurationS) runs.push(cur);
        cur = null;
      }
    }
    if (cur) {
      cur.duration = cur.end - cur.start;
      if (cur.duration >= minDurationS) runs.push(cur);
    }
    return runs;
  }

  // Detect acceleration / deceleration events from smoothed speed.
  function detectAccel(samples, smoothSpeed, thr = 2.0) {
    const events = [];
    let cur = null;
    for (let i = 1; i < samples.length; i++) {
      const dt = samples[i].dt;
      if (dt <= 0) continue;
      const a = (smoothSpeed[i] - smoothSpeed[i - 1]) / dt;
      const sign = a >= thr ? 1 : a <= -thr ? -1 : 0;
      if (sign !== 0) {
        if (!cur || cur.sign !== sign) {
          if (cur) events.push(cur);
          cur = { sign, start: samples[i].tSec, peak: Math.abs(a) };
        }
        cur.end = samples[i].tSec;
        cur.peak = Math.max(cur.peak, Math.abs(a));
      } else if (cur) {
        events.push(cur);
        cur = null;
      }
    }
    if (cur) events.push(cur);
    return {
      accelerations: events.filter((e) => e.sign > 0),
      decelerations: events.filter((e) => e.sign < 0),
    };
  }

  // Detect HR recovery: HR drops from a high value while movement is low.
  function detectRecoveries(samples) {
    const recoveries = [];
    const hrSeries = samples.filter((s) => s.hr != null);
    let cur = null;
    for (let i = 1; i < hrSeries.length; i++) {
      const prev = hrSeries[i - 1];
      const s = hrSeries[i];
      const dropping = s.hr < prev.hr && s.speed < 2.0;
      if (dropping) {
        if (!cur) cur = { start: prev.tSec, startHR: prev.hr, end: s.tSec, endHR: s.hr };
        cur.end = s.tSec;
        cur.endHR = s.hr;
      } else if (cur) {
        cur.drop = cur.startHR - cur.endHR;
        cur.duration = cur.end - cur.start;
        if (cur.drop >= 10 && cur.duration >= 10) recoveries.push(cur);
        cur = null;
      }
    }
    return recoveries;
  }

  // Distance per minute bins.
  function buildMinuteBins(samples) {
    const bins = [];
    for (const s of samples) {
      const m = Math.floor(s.tSec / 60);
      if (!bins[m]) bins[m] = { minute: m, distance: 0, avgSpeed: 0, samples: 0, hrSum: 0, hrN: 0 };
      bins[m].distance += s.dInc;
      bins[m].avgSpeed += s.speed;
      bins[m].samples++;
      if (s.hr != null) {
        bins[m].hrSum += s.hr;
        bins[m].hrN++;
      }
    }
    for (let m = 0; m < bins.length; m++) {
      if (!bins[m]) bins[m] = { minute: m, distance: 0, avgSpeed: 0, samples: 0, hrSum: 0, hrN: 0 };
      const b = bins[m];
      b.avgSpeed = b.samples ? (b.avgSpeed / b.samples) * KMH : 0;
      b.avgHR = b.hrN ? b.hrSum / b.hrN : null;
    }
    return bins;
  }

  // Fatigue: compare first vs second half; per-10-minute distance profile.
  function computeFatigue(samples, sprints, hiRuns, hiThr, durationS) {
    const half = durationS / 2;
    const firstHalf = { distance: 0, time: 0, hiDistance: 0 };
    const secondHalf = { distance: 0, time: 0, hiDistance: 0 };
    for (const s of samples) {
      const bucket = s.tSec < half ? firstHalf : secondHalf;
      bucket.distance += s.dInc;
      bucket.time += s.dt;
      if (s.speed >= hiThr) bucket.hiDistance += s.dInc;
    }
    const rate = (b) => (b.time > 0 ? b.distance / (b.time / 60) : 0);
    const r1 = rate(firstHalf);
    const r2 = rate(secondHalf);
    const distanceDropPct = r1 > 0 ? ((r2 - r1) / r1) * 100 : 0;

    // Per-10-min distance profile.
    const seg = [];
    for (const s of samples) {
      const idx = Math.floor(s.tSec / 600);
      if (!seg[idx]) seg[idx] = { label: idx * 10 + '–' + (idx + 1) * 10, distance: 0, hi: 0 };
      seg[idx].distance += s.dInc;
      if (s.speed >= hiThr) seg[idx].hi += s.dInc;
    }

    const sprintsFirst = sprints.filter((r) => r.start < half).length;
    const sprintsSecond = sprints.length - sprintsFirst;

    return {
      firstHalf: { ...firstHalf, ratePerMin: r1 },
      secondHalf: { ...secondHalf, ratePerMin: r2 },
      distanceDropPct,
      sprintsFirst,
      sprintsSecond,
      segments: seg.filter(Boolean),
    };
  }

  // Repeated sprint efforts: >=3 sprints, each within 60s of the next.
  function detectRepeatedSprints(sprints) {
    const bouts = [];
    let cur = [];
    for (let i = 0; i < sprints.length; i++) {
      if (cur.length === 0) {
        cur = [sprints[i]];
        continue;
      }
      const gap = sprints[i].start - cur[cur.length - 1].end;
      if (gap <= 60) {
        cur.push(sprints[i]);
      } else {
        if (cur.length >= 3) bouts.push(cur);
        cur = [sprints[i]];
      }
    }
    if (cur.length >= 3) bouts.push(cur);
    return bouts.map((b) => ({
      count: b.length,
      start: b[0].start,
      end: b[b.length - 1].end,
      sprints: b,
    }));
  }

  // Heuristic playing-role estimate from spatial + intensity features.
  function estimateRole(positional, ctx) {
    const pts = positional.points;
    const us = pts.map((p) => p.u);
    const vs = pts.map((p) => p.v);
    const avgU = mean(us);
    const avgV = mean(vs);
    const spreadU = std(us);
    const spreadV = std(vs);
    const lateralBias = Math.abs(avgV - 0.5); // 0 central .. 0.5 wide
    const km = ctx.totalDistance / 1000;
    const minutes = ctx.durationS / 60 || 1;
    const kmPerHour = km / (minutes / 60);
    const sprintsPer = ctx.sprints.length;

    // Score candidate roles.
    const roles = [];
    // Winger: wide (high lateral bias), lots of sprints, forward-leaning.
    roles.push({
      role: 'Winger',
      score:
        lateralBias * 3.2 +
        Math.min(sprintsPer / 12, 1) * 1.6 +
        Math.max(0, avgU - 0.5) * 1.4 +
        spreadU * 0.8,
    });
    // Forward / Pivot: central-forward, high sprints, high top-third time.
    roles.push({
      role: 'Forward / Pivot',
      score:
        Math.max(0, avgU - 0.55) * 3.0 +
        Math.min(sprintsPer / 12, 1) * 1.4 +
        (0.5 - Math.min(lateralBias, 0.5)) * 1.2 +
        (positional.thirds[2] / (sumArr(positional.thirds) || 1)) * 1.5,
    });
    // Central Midfielder: central, high distance, large length spread.
    roles.push({
      role: 'Central Midfielder',
      score:
        (1 - Math.min(lateralBias * 2, 1)) * 1.6 +
        Math.min(kmPerHour / 9, 1) * 2.0 +
        spreadU * 2.2 +
        (positional.thirds[1] / (sumArr(positional.thirds) || 1)) * 1.4,
    });
    // Defender: back-leaning position, lower spread, fewer sprints.
    roles.push({
      role: 'Defender',
      score:
        Math.max(0, 0.45 - avgU) * 3.2 +
        (positional.thirds[0] / (sumArr(positional.thirds) || 1)) * 1.8 +
        (1 - Math.min(sprintsPer / 12, 1)) * 1.0 +
        (0.4 - Math.min(spreadU, 0.4)) * 1.2,
    });
    // Full-back: wide AND back-leaning.
    roles.push({
      role: 'Full-back / Wing-back',
      score:
        lateralBias * 2.4 +
        Math.max(0, 0.5 - avgU) * 1.8 +
        spreadU * 1.6 +
        Math.min(sprintsPer / 12, 1) * 0.8,
    });

    roles.sort((a, b) => b.score - a.score);
    const top = roles[0];
    const total = roles.reduce((a, r) => a + Math.max(0, r.score), 0) || 1;
    const confidence = Math.round((Math.max(0, top.score) / total) * 100);

    const notes = [];
    notes.push(
      lateralBias > 0.15
        ? `Play skewed to the ${avgV < 0.5 ? 'left' : 'right'} flank`
        : 'Play concentrated centrally'
    );
    notes.push(
      avgU > 0.55
        ? 'Average position in the attacking half'
        : avgU < 0.45
        ? 'Average position in the defensive half'
        : 'Average position around midfield'
    );
    notes.push(`${ctx.sprints.length} sprints, ${kmPerHour.toFixed(1)} km covered per hour`);

    return { top: top.role, confidence, ranked: roles, notes, avgU, avgV, spreadU, spreadV };
  }

  function sumArr(a) {
    return a.reduce((x, y) => x + y, 0);
  }

  global.Analytics = { compute, SPEED_ZONES, KMH };
})(typeof window !== 'undefined' ? window : this);
