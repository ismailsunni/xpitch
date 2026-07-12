/* charts.ts — Chart.js config builders for each analytics panel. */
import type { ChartConfiguration } from 'chart.js';

const KMH = 3.6;
const GRID = 'rgba(255,255,255,0.07)';
const TICK = 'rgba(230,235,245,0.65)';

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function base(extra: any = {}): any {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: TICK, boxWidth: 12, font: { size: 11 } } } },
    scales: {
      x: { grid: { color: GRID }, ticks: { color: TICK } },
      y: { grid: { color: GRID }, ticks: { color: TICK } },
    },
    ...extra,
  };
}

export function speedZonesConfig(zones: any[]): ChartConfiguration {
  return {
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
    options: base({
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { afterLabel: (c: any) => 'Time: ' + fmtTime(zones[c.dataIndex].time) } },
      },
    }),
  };
}

export function hrGraphConfig(series: any[]): ChartConfiguration {
  return {
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
    options: base({
      parsing: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          type: 'linear',
          grid: { color: GRID },
          ticks: { color: TICK, callback: (v: any) => fmtTime(v) },
          title: { display: true, text: 'Match time', color: TICK },
        },
        y: { grid: { color: GRID }, ticks: { color: TICK }, title: { display: true, text: 'bpm', color: TICK } },
      },
    }),
  };
}

export function hrZonesConfig(zones: any[]): ChartConfiguration {
  return {
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
    options: base({
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { afterLabel: (c: any) => zones[c.dataIndex].lowBpm + '–' + zones[c.dataIndex].highBpm + ' bpm' },
        },
      },
    }),
  };
}

export function workRateConfig(bins: any[]): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: bins.map((b) => b.minute + 1),
      datasets: [
        {
          label: 'Distance per minute (m)',
          data: bins.map((b) => Math.round(b.distance)),
          backgroundColor: '#22c55e',
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
        } as any,
      ],
    },
    options: base({
      scales: {
        x: { grid: { color: GRID }, ticks: { color: TICK }, title: { display: true, text: 'Minute', color: TICK } },
        y: { grid: { color: GRID }, ticks: { color: TICK }, title: { display: true, text: 'm / min', color: TICK } },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#f87171' },
          title: { display: true, text: 'bpm', color: '#f87171' },
        },
      },
    }),
  };
}

export function fatigueConfig(segments: any[]): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: segments.map((s) => s.label),
      datasets: [
        { label: 'Total distance (m)', data: segments.map((s) => Math.round(s.distance)), backgroundColor: '#818cf8', borderRadius: 4 },
        { label: 'High-intensity distance (m)', data: segments.map((s) => Math.round(s.hi)), backgroundColor: '#fb923c', borderRadius: 4 },
      ],
    },
    options: base({
      scales: {
        x: { grid: { color: GRID }, ticks: { color: TICK }, title: { display: true, text: 'Match segment (min)', color: TICK } },
        y: { grid: { color: GRID }, ticks: { color: TICK } },
      },
    }),
  };
}

export function speedProfileConfig(samples: any[]): ChartConfiguration {
  const step = Math.max(1, Math.floor(samples.length / 1200));
  const data: any[] = [];
  for (let i = 0; i < samples.length; i += step) {
    data.push({ x: samples[i].tSec, y: +(samples[i].speed * KMH).toFixed(1) });
  }
  return {
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
    options: base({
      parsing: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { type: 'linear', grid: { color: GRID }, ticks: { color: TICK, callback: (v: any) => fmtTime(v) } },
        y: { grid: { color: GRID }, ticks: { color: TICK }, title: { display: true, text: 'km/h', color: TICK } },
      },
    }),
  };
}
