<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { FORMATS } from '../lib/analytics';
import { fmtDist, fmtDur, kmh } from '../lib/format';

const props = defineProps<{ match: any; showAuthor?: boolean; variant?: 'card' | 'list' }>();
const author = computed(() => props.match._author);

const sessions = computed<any[]>(() => props.match.sessions || []);
const totalDistance = computed(() =>
  sessions.value.reduce((a, s) => a + (s?.summary?.summary?.totalDistance || 0), 0)
);
const totalDuration = computed(() => sessions.value.reduce((a, s) => a + (s?.duration_s || 0), 0));
const topSpeed = computed(() => Math.max(0, ...sessions.value.map((s) => s?.summary?.summary?.topSpeed || 0)));
const avgHR = computed(() => {
  let weighted = 0;
  let duration = 0;
  for (const s of sessions.value) {
    const hr = s?.summary?.physio?.avgHR;
    const d = s?.duration_s || s?.summary?.summary?.durationS || 0;
    if (!hr || !d) continue;
    weighted += hr * d;
    duration += d;
  }
  return duration ? Math.round(weighted / duration) : null;
});
const when = computed(() => {
  const d = props.match.started_at || props.match.created_at;
  return d
    ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
});
const time = computed(() => {
  const d = props.match.started_at || props.match.created_at;
  return d ? new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
});
const formatLabel = computed(() => FORMATS[props.match.format]?.short || props.match.format || '—');
const title = computed(() => props.match.title || (props.match.location_label ? props.match.location_label : 'Match'));
const hasGps = computed(() =>
  sessions.value.some((s) => s?.summary?.meta?.hasGPS || s?.summary?.summary?.hasGPS || s?.summary?.hasGPS)
);
const pitchStatus = computed(() => {
  if (props.match.primary_field_id) return { label: 'Pitch set', tone: 'ok' };
  if (hasGps.value) return { label: 'GPS only', tone: 'warn' };
  return { label: 'No GPS', tone: 'muted' };
});
const previewSessions = computed(() =>
  sessions.value
    .map((s) => s?.summary?.preview?.points || [])
    .filter((pts) => pts.length > 1)
    .map((pts) =>
      pts
        .map((p: any) => `${(p.u * 100).toFixed(2)},${(p.v * 100).toFixed(2)}`)
        .join(' ')
    )
);
const hasPreview = computed(() => previewSessions.value.length > 0);
</script>

<template>
  <RouterLink :to="`/match/${match.short_id}`" class="matchcard card" :class="{ list: variant === 'list' }">
    <template v-if="variant === 'list'">
      <div class="activity-head">
        <div class="avatar">{{ (author?.display_name || author?.username || title).slice(0, 1).toUpperCase() }}</div>
        <div>
          <div class="actor">{{ author?.display_name || author?.username || 'xPitch player' }}</div>
          <div class="activity-meta">{{ when }}<template v-if="time"> at {{ time }}</template><template v-if="match.location_label"> · {{ match.location_label }}</template></div>
        </div>
      </div>
      <div class="activity-title">{{ title }}</div>
      <div class="activity-kind">{{ formatLabel }} · {{ sessions.length }} session{{ sessions.length === 1 ? '' : 's' }}</div>
      <div class="activity-stats">
        <div>
          <span>Distance</span>
          <strong>{{ fmtDist(totalDistance) }}</strong>
        </div>
        <div>
          <span>Duration</span>
          <strong>{{ fmtDur(totalDuration) }}</strong>
        </div>
        <div v-if="topSpeed">
          <span>Top speed</span>
          <strong>{{ kmh(topSpeed) }} <small>km/h</small></strong>
        </div>
        <div v-if="avgHR">
          <span>Avg HR</span>
          <strong>{{ avgHR }} <small>bpm</small></strong>
        </div>
      </div>
      <div class="activity-map" :class="{ empty: !hasPreview }">
        <span class="map-badge" :class="pitchStatus.tone">{{ hasPreview ? 'Pitch trail' : pitchStatus.label }}</span>
        <svg viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true">
          <rect class="stripe a" x="0" y="0" width="12.5" height="64" />
          <rect class="stripe b" x="12.5" y="0" width="12.5" height="64" />
          <rect class="stripe a" x="25" y="0" width="12.5" height="64" />
          <rect class="stripe b" x="37.5" y="0" width="12.5" height="64" />
          <rect class="stripe a" x="50" y="0" width="12.5" height="64" />
          <rect class="stripe b" x="62.5" y="0" width="12.5" height="64" />
          <rect class="stripe a" x="75" y="0" width="12.5" height="64" />
          <rect class="stripe b" x="87.5" y="0" width="12.5" height="64" />
          <rect class="line" x="4" y="5" width="92" height="54" />
          <line class="line" x1="50" y1="5" x2="50" y2="59" />
          <circle class="line" cx="50" cy="32" r="8" />
          <rect class="line" x="4" y="19" width="13" height="26" />
          <rect class="line" x="83" y="19" width="13" height="26" />
          <polyline v-for="(points, i) in previewSessions" :key="i" class="track" :points="points" />
        </svg>
      </div>
    </template>

    <template v-else>
      <div class="mc-main">
        <div class="mc-top">
          <span class="mc-title">{{ title }}</span>
          <span v-if="match.visibility !== 'public'" class="mc-badge">{{ match.visibility }}</span>
        </div>
        <div v-if="showAuthor && author" class="mc-author" @click.prevent="$router.push('/' + author.username)">
          by @{{ author.username }}
        </div>
        <div class="mc-sub">
          {{ when }} · {{ formatLabel }} · {{ sessions.length }} session{{ sessions.length === 1 ? '' : 's' }}
          <span class="mc-pitch" :class="pitchStatus.tone">{{ pitchStatus.label }}</span>
        </div>
      </div>
      <div class="mc-stats">
        <span><strong>{{ fmtDist(totalDistance) }}</strong> distance</span>
        <span><strong>{{ fmtDur(totalDuration) }}</strong> played</span>
      </div>
    </template>
  </RouterLink>
</template>

<style scoped>
.matchcard {
  display: block;
  text-decoration: none;
  color: inherit;
  transition: 0.15s;
}
.matchcard.list {
  padding: 18px;
  border-radius: 0;
}
.matchcard:hover {
  border-color: var(--accent);
}
.mc-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.mc-title {
  font-weight: 700;
  font-size: 15px;
}
.mc-badge {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 2px 8px;
}
.mc-author {
  color: var(--accent-ink);
  font-size: 12px;
  margin-top: 2px;
}
.mc-author:hover {
  text-decoration: underline;
}
.mc-sub {
  color: var(--muted);
  font-size: 12.5px;
  margin-top: 3px;
}
.mc-pitch {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 7px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.mc-pitch.ok {
  color: var(--accent-ink);
  border-color: var(--accent-tint-strong);
  background: var(--accent-tint);
}
.mc-pitch.warn {
  color: var(--c-amber);
}
.mc-stats {
  display: flex;
  gap: 18px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--muted);
}
.mc-stats strong {
  color: var(--text);
  font-size: 15px;
}
.activity-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 800;
}
.actor {
  font-weight: 700;
  font-size: 14px;
}
.activity-meta,
.activity-kind {
  color: var(--muted);
  font-size: 12.5px;
}
.activity-title {
  margin-top: 14px;
  font: 700 23px/1.1 var(--font-head);
}
.activity-kind {
  margin-top: 7px;
}
.activity-stats {
  display: flex;
  gap: 0;
  margin-top: 16px;
  flex-wrap: wrap;
}
.activity-stats > div {
  min-width: 112px;
  padding-right: 18px;
  margin-right: 18px;
  border-right: 1px solid var(--border);
}
.activity-stats > div:last-child {
  border-right: 0;
}
.activity-stats span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}
.activity-stats strong {
  display: block;
  margin-top: 2px;
  font: 700 20px/1.1 var(--font-head);
}
.activity-stats small {
  font-size: 12px;
  color: var(--muted);
}
.activity-map {
  position: relative;
  margin-top: 24px;
  overflow: hidden;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.activity-map svg {
  display: block;
  width: 100%;
  height: 240px;
}
.stripe.a {
  fill: #b4d76a;
}
.stripe.b {
  fill: #bfe07a;
}
.line {
  fill: none;
  stroke: rgba(28, 55, 18, 0.5);
  stroke-width: 0.7;
  vector-effect: non-scaling-stroke;
}
.track {
  fill: none;
  stroke: var(--accent-ink);
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-opacity: 0.78;
  vector-effect: non-scaling-stroke;
}
.map-badge {
  position: absolute;
  z-index: 1;
  top: 12px;
  left: 12px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}
.map-badge.ok {
  color: var(--accent-ink);
}
.map-badge.warn {
  color: var(--c-amber);
}
@media (max-width: 640px) {
  .matchcard.list {
    padding: 14px;
  }
  .activity-stats > div {
    min-width: 50%;
    margin: 0 0 12px;
    padding-right: 12px;
  }
  .activity-map svg {
    height: 190px;
  }
}
</style>
