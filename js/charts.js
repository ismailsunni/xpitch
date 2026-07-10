/*
 * charts.js — thin wrappers around Chart.js for the match analytics UI.
 * Each function (re)creates a chart in a given canvas id, destroying any prior
 * instance so the panels can be re-rendered when options change.
 */
(function (global) {
  'use strict';

  const instances = {};
  const KMH = 3.6;

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  const GRID = 'rgba(255,255,255,0.07)';
  const TICK = 'rgba(230,235,245,0.65)';

  function baseOptions(extra) {
    return Object.assign(
      {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: TICK, boxWidth: 12, font: { size: 11 } } },
        },
        scales: {
          x: { grid: { color: GRID }, ticks: { color: TICK } },
          y: { grid: { color: GRID }, ticks: { color: TICK } },
        },
      },
      extra || {}
    );
  }

  function render(id, config) {
    const el = document.getElementById(id);
    if (!el) return;
    if (instances[id]) instances[id].destroy();
    instances[id] = new Chart(el.getContext('2d'), config);
  }

  function speedZones(id, zones) {
    render(id, {
      type: 'bar',
      data: {
        labels: zones.map((z) => z.name),
        datasets: [
          {
            label: 'Distance (m)',
            data: zones.map((z) => Math.round(z.distance)),
            backgroundColor: zones.map((z) => z.color),
            borderRadius: 4,
          },
        ],
      },
      options: baseOptions({
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: (c) => {
                const z = zones[c.dataIndex];
                return 'Time: ' + fmtTime(z.time);
              },
            },
          },
        },
      }),
    });
  }

  function hrGraph(id, series, zones, refMax) {
    const annotations = [];
    render(id, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Heart rate (bpm)',
            data: series,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239,68,68,0.12)',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: true,
            tension: 0.15,
          },
        ],
      },
      options: baseOptions({
        parsing: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            type: 'linear',
            grid: { color: GRID },
            ticks: { color: TICK, callback: (v) => fmtTime(v) },
            title: { display: true, text: 'Match time', color: TICK },
          },
          y: { grid: { color: GRID }, ticks: { color: TICK }, title: { display: true, text: 'bpm', color: TICK } },
        },
      }),
    });
  }

  function hrZones(id, zones) {
    render(id, {
      type: 'bar',
      data: {
        labels: zones.map((z) => z.name),
        datasets: [
          {
            label: 'Time (min)',
            data: zones.map((z) => +(z.time / 60).toFixed(1)),
            backgroundColor: zones.map((z) => z.color),
            borderRadius: 4,
          },
        ],
      },
      options: baseOptions({
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: (c) => {
                const z = zones[c.dataIndex];
                return z.lowBpm + '–' + z.highBpm + ' bpm';
              },
            },
          },
        },
      }),
    });
  }

  function workRate(id, bins) {
    render(id, {
      type: 'bar',
      data: {
        labels: bins.map((b) => b.minute + 1),
        datasets: [
          {
            label: 'Distance per minute (m)',
            data: bins.map((b) => Math.round(b.distance)),
            backgroundColor: '#38bdf8',
            borderRadius: 3,
            order: 2,
          },
          {
            label: 'Avg HR (bpm)',
            data: bins.map((b) => (b.avgHR ? Math.round(b.avgHR) : null)),
            type: 'line',
            borderColor: '#f87171',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            pointRadius: 0,
            yAxisID: 'y1',
            order: 1,
            spanGaps: true,
          },
        ],
      },
      options: baseOptions({
        scales: {
          x: {
            grid: { color: GRID },
            ticks: { color: TICK },
            title: { display: true, text: 'Minute', color: TICK },
          },
          y: {
            grid: { color: GRID },
            ticks: { color: TICK },
            title: { display: true, text: 'm / min', color: TICK },
          },
          y1: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#f87171' },
            title: { display: true, text: 'bpm', color: '#f87171' },
          },
        },
      }),
    });
  }

  function fatigueSegments(id, segments) {
    render(id, {
      type: 'bar',
      data: {
        labels: segments.map((s) => s.label),
        datasets: [
          {
            label: 'Total distance (m)',
            data: segments.map((s) => Math.round(s.distance)),
            backgroundColor: '#818cf8',
            borderRadius: 4,
          },
          {
            label: 'High-intensity distance (m)',
            data: segments.map((s) => Math.round(s.hi)),
            backgroundColor: '#fb923c',
            borderRadius: 4,
          },
        ],
      },
      options: baseOptions({
        scales: {
          x: {
            grid: { color: GRID },
            ticks: { color: TICK },
            title: { display: true, text: 'Match segment (min)', color: TICK },
          },
          y: { grid: { color: GRID }, ticks: { color: TICK } },
        },
      }),
    });
  }

  function speedProfile(id, samples) {
    // Downsample for performance.
    const step = Math.max(1, Math.floor(samples.length / 1200));
    const data = [];
    for (let i = 0; i < samples.length; i += step) {
      data.push({ x: samples[i].tSec, y: +(samples[i].speed * KMH).toFixed(1) });
    }
    render(id, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Speed (km/h)',
            data,
            borderColor: '#34d399',
            backgroundColor: 'rgba(52,211,153,0.12)',
            borderWidth: 1.2,
            pointRadius: 0,
            fill: true,
            tension: 0.1,
          },
        ],
      },
      options: baseOptions({
        parsing: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            type: 'linear',
            grid: { color: GRID },
            ticks: { color: TICK, callback: (v) => fmtTime(v) },
          },
          y: { grid: { color: GRID }, ticks: { color: TICK }, title: { display: true, text: 'km/h', color: TICK } },
        },
      }),
    });
  }

  function destroyAll() {
    for (const k in instances) {
      instances[k].destroy();
      delete instances[k];
    }
  }

  // Charts created while their tab was hidden get a 0x0 canvas; call this after
  // a pane becomes visible so they lay out to the now-sized container.
  function resizeAll() {
    for (const k in instances) instances[k].resize();
  }

  global.Charts = {
    speedZones,
    hrGraph,
    hrZones,
    workRate,
    fatigueSegments,
    speedProfile,
    destroyAll,
    resizeAll,
    fmtTime,
  };
})(typeof window !== 'undefined' ? window : this);
