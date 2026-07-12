<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { FORMATS } from '../lib/analytics';
import { fmtDist, fmtDur } from '../lib/format';

const props = defineProps<{ match: any; showAuthor?: boolean }>();
const author = computed(() => props.match._author);

const sessions = computed<any[]>(() => props.match.sessions || []);
const totalDistance = computed(() =>
  sessions.value.reduce((a, s) => a + (s?.summary?.summary?.totalDistance || 0), 0)
);
const totalDuration = computed(() => sessions.value.reduce((a, s) => a + (s?.duration_s || 0), 0));
const when = computed(() => {
  const d = props.match.started_at || props.match.created_at;
  return d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
});
const formatLabel = computed(() => FORMATS[props.match.format]?.short || props.match.format || '—');
const title = computed(() => props.match.title || (props.match.location_label ? props.match.location_label : 'Match'));
</script>

<template>
  <RouterLink :to="`/match/${match.short_id}`" class="matchcard card">
    <div class="mc-top">
      <span class="mc-title">{{ title }}</span>
      <span v-if="match.visibility !== 'public'" class="mc-badge">{{ match.visibility }}</span>
    </div>
    <div v-if="showAuthor && author" class="mc-author" @click.prevent="$router.push('/' + author.username)">
      by @{{ author.username }}
    </div>
    <div class="mc-sub">{{ when }} · {{ formatLabel }} · {{ sessions.length }} session{{ sessions.length === 1 ? '' : 's' }}</div>
    <div class="mc-stats">
      <span><strong>{{ fmtDist(totalDistance) }}</strong> distance</span>
      <span><strong>{{ fmtDur(totalDuration) }}</strong> played</span>
    </div>
  </RouterLink>
</template>

<style scoped>
.matchcard {
  display: block;
  text-decoration: none;
  color: inherit;
  transition: 0.15s;
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
</style>
