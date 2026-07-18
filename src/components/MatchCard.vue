<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { FORMATS } from '../lib/analytics';
import { fmtDist, fmtDur, kmh } from '../lib/format';
import MatchPreviewCarousel from './MatchPreviewCarousel.vue';

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
const hasPreview = computed(() =>
  sessions.value.some((session) => {
    const preview = session?.summary?.preview;
    return !!preview?.grid || (preview?.points || []).length > 1;
  })
);
const hasMedia = computed(() => (props.match.match_media || []).length > 0);
const hasLegacyHeatmapCandidate = computed(
  () =>
    (props.match.file_names || []).length > 0 &&
    sessions.value.some((session) => session?.summary?.meta?.hasGPS || session?.summary?.summary?.hasGPS)
);
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
      <MatchPreviewCarousel v-if="hasMedia || hasPreview || hasLegacyHeatmapCandidate" class="activity-preview" :match="match" :media="match.match_media || []" :sessions="sessions" />
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
      <MatchPreviewCarousel v-if="hasMedia || hasPreview || hasLegacyHeatmapCandidate" :match="match" :media="match.match_media || []" :sessions="sessions" />
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
.activity-preview { margin-top: 24px; }
@media (max-width: 640px) {
  .matchcard.list {
    padding: 14px;
  }
  .activity-stats > div {
    min-width: 50%;
    margin: 0 0 12px;
    padding-right: 12px;
  }
}
</style>
