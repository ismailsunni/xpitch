<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import ChartPanel from '../components/ChartPanel.vue';
import { FORMATS } from '../lib/analytics';
import { auth } from '../lib/auth';
import { historyLineConfig } from '../lib/charts';
import { fmtDist, fmtDur, kmh } from '../lib/format';
import { listMyHistory } from '../lib/api';
import { supabaseEnabled } from '../lib/supabase';

type HistoryMatch = {
  short_id: string;
  title: string | null;
  format: string | null;
  started_at: string | null;
  created_at: string | null;
  location_label: string | null;
  primary_field_id: string | null;
  sessions: any[];
  distance: number;
  duration: number;
  topSpeed: number;
  avgHR: number | null;
};

const state = ref<'loading' | 'ready' | 'error' | 'disabled' | 'signedout'>('loading');
const err = ref('');
const matches = ref<HistoryMatch[]>([]);
const fields = ref<any[]>([]);
const filters = ref({ range: 'all', field: 'all', format: 'all' });

function matchDate(m: any): Date {
  return new Date(m.started_at || m.created_at || 0);
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatLabel(key: string | null | undefined): string {
  return FORMATS[key as keyof typeof FORMATS]?.short || key || 'Unknown';
}

function normalizeMatch(m: any): HistoryMatch {
  const sessions = m.sessions || [];
  let hrWeighted = 0;
  let hrDuration = 0;
  const duration = sessions.reduce((a: number, s: any) => a + (s.duration_s || s.summary?.summary?.durationS || 0), 0);
  const distance = sessions.reduce((a: number, s: any) => a + (s.summary?.summary?.totalDistance || 0), 0);
  const topSpeed = Math.max(0, ...sessions.map((s: any) => s.summary?.summary?.topSpeed || 0));
  for (const s of sessions) {
    const hr = s.summary?.physio?.avgHR;
    const d = s.duration_s || s.summary?.summary?.durationS || 0;
    if (!hr || !d) continue;
    hrWeighted += hr * d;
    hrDuration += d;
  }
  return {
    ...m,
    sessions,
    distance,
    duration,
    topSpeed,
    avgHR: hrDuration ? Math.round(hrWeighted / hrDuration) : null,
  };
}

async function load() {
  state.value = 'loading';
  if (!supabaseEnabled) {
    state.value = 'disabled';
    return;
  }
  if (!auth.user) {
    state.value = 'signedout';
    return;
  }
  try {
    const res = await listMyHistory();
    matches.value = res.matches.map(normalizeMatch);
    fields.value = res.fields;
    state.value = 'ready';
  } catch (e: any) {
    err.value = e?.message || String(e);
    state.value = 'error';
  }
}

const fieldName = computed(() => new Map(fields.value.map((f) => [f.id, f.name])));

const formatOptions = computed(() => {
  const keys = [...new Set(matches.value.map((m) => m.format).filter(Boolean))] as string[];
  return keys.sort().map((key) => ({ key, label: formatLabel(key) }));
});

const fieldOptions = computed(() => {
  const ids = [...new Set(matches.value.map((m) => m.primary_field_id).filter(Boolean))] as string[];
  return ids
    .map((id) => ({ id, name: fieldName.value.get(id) || 'Unknown pitch' }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

const filtered = computed(() => {
  const now = new Date();
  const days = filters.value.range === '30' ? 30 : filters.value.range === '90' ? 90 : null;
  return matches.value.filter((m) => {
    if (filters.value.format !== 'all' && m.format !== filters.value.format) return false;
    if (filters.value.field !== 'all' && m.primary_field_id !== filters.value.field) return false;
    if (days) {
      const ageMs = now.getTime() - matchDate(m).getTime();
      if (ageMs > days * 24 * 3600 * 1000) return false;
    }
    return true;
  });
});

const newestFirst = computed(() => [...filtered.value].sort((a, b) => +matchDate(b) - +matchDate(a)));

const totals = computed(() => {
  const ms = filtered.value;
  const totalDistance = ms.reduce((a, m) => a + m.distance, 0);
  const totalDuration = ms.reduce((a, m) => a + m.duration, 0);
  const sessionCount = ms.reduce((a, m) => a + m.sessions.length, 0);
  const topSpeed = Math.max(0, ...ms.map((m) => m.topSpeed));
  const avgDistance = ms.length ? totalDistance / ms.length : 0;
  const avgDuration = ms.length ? totalDuration / ms.length : 0;
  let hrWeighted = 0;
  let hrDuration = 0;
  for (const m of ms) {
    if (!m.avgHR || !m.duration) continue;
    hrWeighted += m.avgHR * m.duration;
    hrDuration += m.duration;
  }
  return {
    matchCount: ms.length,
    sessionCount,
    totalDistance,
    totalDuration,
    avgDistance,
    avgDuration,
    topSpeed,
    avgHR: hrDuration ? Math.round(hrWeighted / hrDuration) : null,
  };
});

const pitchBreakdown = computed(() => {
  const map = new Map<string, { name: string; count: number; distance: number; duration: number }>();
  for (const m of filtered.value) {
    const id = m.primary_field_id || 'none';
    const cur = map.get(id) || {
      name: m.primary_field_id ? fieldName.value.get(m.primary_field_id) || 'Unknown pitch' : 'No pitch',
      count: 0,
      distance: 0,
      duration: 0,
    };
    cur.count++;
    cur.distance += m.distance;
    cur.duration += m.duration;
    map.set(id, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.distance - a.distance).slice(0, 5);
});

const trendPoints = computed(() =>
  [...filtered.value]
    .sort((a, b) => +matchDate(a) - +matchDate(b))
    .map((m) => ({
      label: dateLabel(matchDate(m)),
      distanceKm: +(m.distance / 1000).toFixed(2),
      durationMin: +(m.duration / 60).toFixed(1),
      topSpeedKmh: +(m.topSpeed * 3.6).toFixed(1),
      avgHR: m.avgHR,
    }))
);

const distanceChart = computed(() =>
  historyLineConfig('Distance', trendPoints.value.map((p) => ({ x: p.label, y: p.distanceKm })), 'km')
);
const durationChart = computed(() =>
  historyLineConfig('Duration', trendPoints.value.map((p) => ({ x: p.label, y: p.durationMin })), 'min')
);
const speedChart = computed(() =>
  historyLineConfig('Top speed', trendPoints.value.map((p) => ({ x: p.label, y: p.topSpeedKmh || null })), 'km/h')
);
const hrChart = computed(() =>
  historyLineConfig('Avg HR', trendPoints.value.map((p) => ({ x: p.label, y: p.avgHR })), 'bpm')
);
const hasHR = computed(() => filtered.value.some((m) => m.avgHR));

const recentComparison = computed(() => {
  const ordered = [...matches.value].sort((a, b) => +matchDate(b) - +matchDate(a));
  const recent = ordered.slice(0, 5);
  const previous = ordered.slice(5, 10);
  if (recent.length < 2 || previous.length < 2) return null;
  const avg = (arr: HistoryMatch[]) => arr.reduce((a, m) => a + m.distance, 0) / arr.length;
  const r = avg(recent);
  const p = avg(previous);
  if (!p) return null;
  return Math.round(((r - p) / p) * 100);
});

onMounted(load);
watch(() => auth.user?.id, load);
</script>

<template>
  <main class="tabpane history">
    <header class="history-head">
      <div>
        <h1>Historical analysis</h1>
        <p class="hint">Trends across your saved matches and sessions.</p>
      </div>
      <RouterLink to="/analyze" class="btn primary small">＋ Analyze a .fit</RouterLink>
    </header>

    <p v-if="state === 'disabled'" class="empty">History is not available on this deployment.</p>
    <p v-else-if="state === 'signedout'" class="empty">
      Sign in to see your match history. <RouterLink to="/login">Log in</RouterLink>
    </p>
    <p v-else-if="state === 'loading'" class="empty">Loading history…</p>
    <p v-else-if="state === 'error'" class="empty">We couldn’t load history. <button class="linkbtn" @click="load">Retry</button></p>

    <template v-else>
      <p v-if="!matches.length" class="empty">
        No saved matches yet. Analyze a <code>.fit</code> file, then save it to build your history.
      </p>

      <template v-else>
        <section class="filters card">
          <label>
            Date range
            <select v-model="filters.range">
              <option value="all">All time</option>
              <option value="90">Last 90 days</option>
              <option value="30">Last 30 days</option>
            </select>
          </label>
          <label>
            Pitch
            <select v-model="filters.field">
              <option value="all">All pitches</option>
              <option v-for="f in fieldOptions" :key="f.id" :value="f.id">{{ f.name }}</option>
            </select>
          </label>
          <label>
            Game type
            <select v-model="filters.format">
              <option value="all">All game types</option>
              <option v-for="f in formatOptions" :key="f.key" :value="f.key">{{ f.label }}</option>
            </select>
          </label>
        </section>

        <section class="tiles">
          <div class="tile accent">
            <div class="tile-k">Matches</div>
            <div class="tile-v">{{ totals.matchCount }}</div>
            <div class="tile-s">{{ totals.sessionCount }} session{{ totals.sessionCount === 1 ? '' : 's' }}</div>
          </div>
          <div class="tile">
            <div class="tile-k">Total distance</div>
            <div class="tile-v">{{ fmtDist(totals.totalDistance) }}</div>
            <div class="tile-s">avg {{ fmtDist(totals.avgDistance) }} / match</div>
          </div>
          <div class="tile">
            <div class="tile-k">Play time</div>
            <div class="tile-v">{{ fmtDur(totals.totalDuration) }}</div>
            <div class="tile-s">avg {{ fmtDur(totals.avgDuration) }} / match</div>
          </div>
          <div class="tile">
            <div class="tile-k">Top speed</div>
            <div class="tile-v">{{ kmh(totals.topSpeed) }} <small>km/h</small></div>
            <div class="tile-s" v-if="totals.avgHR">avg HR {{ totals.avgHR }} bpm</div>
            <div class="tile-s" v-else>HR not available</div>
          </div>
        </section>

        <div v-if="recentComparison !== null" class="insight card">
          <strong>Recent form:</strong>
          average distance over your latest 5 matches is
          <span :class="recentComparison >= 0 ? 'up' : 'down'">
            {{ recentComparison >= 0 ? '+' : '' }}{{ recentComparison }}%
          </span>
          vs the previous 5.
        </div>

        <section class="chart-grid">
          <div class="panel">
            <h3>Distance trend</h3>
            <ChartPanel :config="distanceChart" />
          </div>
          <div class="panel">
            <h3>Duration trend</h3>
            <ChartPanel :config="durationChart" />
          </div>
          <div class="panel">
            <h3>Top speed trend</h3>
            <ChartPanel :config="speedChart" />
          </div>
          <div class="panel">
            <h3>Heart-rate trend</h3>
            <ChartPanel v-if="hasHR" :config="hrChart" />
            <p v-else class="empty small">No saved heart-rate summaries yet.</p>
          </div>
        </section>

        <section class="split">
          <div class="panel">
            <h3>Pitch breakdown</h3>
            <div v-if="pitchBreakdown.length" class="pitch-list">
              <div v-for="p in pitchBreakdown" :key="p.name" class="pitch-row">
                <div>
                  <strong>{{ p.name }}</strong>
                  <span>{{ p.count }} match{{ p.count === 1 ? '' : 'es' }}</span>
                </div>
                <div class="mono">{{ fmtDist(p.distance) }}</div>
              </div>
            </div>
            <p v-else class="empty small">No pitch data in this filter.</p>
          </div>

          <div class="panel">
            <h3>Matches</h3>
            <div class="history-table">
              <RouterLink v-for="m in newestFirst" :key="m.short_id" :to="`/match/${m.short_id}`" class="hist-row">
                <div>
                  <strong>{{ m.title || m.location_label || 'Match' }}</strong>
                  <span>{{ dateLabel(matchDate(m)) }} · {{ formatLabel(m.format) }}</span>
                </div>
                <span>{{ fmtDist(m.distance) }}</span>
                <span>{{ fmtDur(m.duration) }}</span>
                <span>{{ kmh(m.topSpeed) }} km/h</span>
              </RouterLink>
            </div>
          </div>
        </section>
      </template>
    </template>
  </main>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.history-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.history-head h1 {
  margin: 0;
}
.filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(180px, 1fr));
  gap: 12px;
}
.filters label {
  display: grid;
  gap: 5px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.filters select {
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  border-radius: var(--ctl-radius);
  color: var(--text);
  font: 14px var(--font-body);
  padding: 8px 10px;
  text-transform: none;
  letter-spacing: 0;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.tile {
  border: 1px solid var(--border);
  background: var(--bg-elev);
  border-radius: 16px;
  padding: 16px;
}
.tile.accent {
  background: var(--accent-tint);
  border-color: var(--accent-tint-strong);
}
.tile-k {
  color: var(--muted);
  font-size: 12px;
}
.tile-v {
  margin-top: 5px;
  font: 700 26px/1 var(--font-head);
}
.tile-v small {
  color: var(--muted);
  font-size: 13px;
}
.tile-s {
  margin-top: 5px;
  color: var(--muted);
  font-size: 12px;
}
.insight {
  color: var(--muted);
}
.insight strong,
.insight .up {
  color: var(--accent-ink);
}
.insight .down {
  color: var(--c-coral);
}
.chart-grid,
.split {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.panel h3 {
  margin-top: 0;
}
.pitch-list {
  display: grid;
  gap: 8px;
}
.pitch-row,
.hist-row {
  display: grid;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}
.pitch-row {
  grid-template-columns: 1fr auto;
}
.pitch-row span,
.hist-row span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}
.history-table {
  display: grid;
}
.hist-row {
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  text-decoration: none;
  color: inherit;
}
.hist-row:hover strong {
  color: var(--accent-ink);
}
.mono {
  font-family: var(--font-mono);
}
.small {
  margin: 0;
}
@media (max-width: 900px) {
  .filters,
  .tiles,
  .chart-grid,
  .split {
    grid-template-columns: 1fr;
  }
  .hist-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
