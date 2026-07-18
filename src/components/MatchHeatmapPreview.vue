<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ sessions: any[]; label?: string; tone?: string }>();

const tracks = computed(() =>
  props.sessions
    .map((session) => session?.summary?.preview?.points || [])
    .filter((points) => points.length > 1)
    .map((points) => points.map((point: any) => `${(point.u * 100).toFixed(2)},${(point.v * 100).toFixed(2)}`).join(' '))
);
</script>

<template>
  <div class="heatmap-preview" :class="{ empty: !tracks.length }">
    <span class="preview-badge" :class="tone">{{ tracks.length ? 'Heatmap' : label || 'No GPS' }}</span>
    <svg viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true">
      <rect class="stripe a" x="0" y="0" width="12.5" height="64" /><rect class="stripe b" x="12.5" y="0" width="12.5" height="64" />
      <rect class="stripe a" x="25" y="0" width="12.5" height="64" /><rect class="stripe b" x="37.5" y="0" width="12.5" height="64" />
      <rect class="stripe a" x="50" y="0" width="12.5" height="64" /><rect class="stripe b" x="62.5" y="0" width="12.5" height="64" />
      <rect class="stripe a" x="75" y="0" width="12.5" height="64" /><rect class="stripe b" x="87.5" y="0" width="12.5" height="64" />
      <rect class="line" x="4" y="5" width="92" height="54" /><line class="line" x1="50" y1="5" x2="50" y2="59" />
      <circle class="line" cx="50" cy="32" r="8" /><rect class="line" x="4" y="19" width="13" height="26" /><rect class="line" x="83" y="19" width="13" height="26" />
      <polyline v-for="(points, index) in tracks" :key="index" class="track" :points="points" />
    </svg>
  </div>
</template>

<style scoped>
.heatmap-preview { position: relative; overflow: hidden; min-height: 128px; background: var(--bg-elev2); border: 1px solid var(--border); border-radius: 6px; }
.heatmap-preview svg { display: block; width: 100%; height: 100%; min-height: 128px; }
.stripe.a { fill: #b4d76a; }.stripe.b { fill: #bfe07a; }
.line { fill: none; stroke: rgba(28, 55, 18, .5); stroke-width: .7; vector-effect: non-scaling-stroke; }
.track { fill: none; stroke: var(--accent-ink); stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; stroke-opacity: .78; vector-effect: non-scaling-stroke; }
.preview-badge { position: absolute; z-index: 1; top: 8px; left: 8px; background: rgba(255,255,255,.82); border: 1px solid var(--border); border-radius: 5px; padding: 3px 6px; color: var(--muted); font-size: 11px; font-weight: 700; }
.preview-badge.ok { color: var(--accent-ink); }.preview-badge.warn { color: var(--c-amber); }
</style>
