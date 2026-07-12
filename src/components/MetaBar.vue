<script setup lang="ts">
import { computed } from 'vue';
import { store, activeSegment } from '../store';
import { sportName, fmtDur } from '../lib/format';

const meta = computed(() => store.analytics?.meta);
const session = computed<any>(() => meta.value?.session || {});

// Clear label of the currently selected match + period.
const viewing = computed(() => {
  const seg = activeSegment();
  if (!seg || store.segments.length <= 1) {
    if (seg && seg.periods.length && store.activePeriod >= 0) return seg.periods[store.activePeriod].label;
    return null;
  }
  const period =
    store.activePeriod >= 0 && seg.periods[store.activePeriod] ? ' · ' + seg.periods[store.activePeriod].label : '';
  return seg.label + period;
});

const when = computed(() => {
  const d: Date | undefined = meta.value?.startDate;
  return d ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
});

const coords = computed(() => {
  const la = meta.value?.startLat;
  const lo = meta.value?.startLon;
  return la != null && lo != null ? { la, lo } : null;
});

const osmUrl = computed(() =>
  coords.value
    ? `https://www.openstreetmap.org/?mlat=${coords.value.la}&mlon=${coords.value.lo}#map=16/${coords.value.la}/${coords.value.lo}`
    : null
);

const calories = computed(() => session.value.total_calories ?? null);
</script>

<template>
  <section class="metabar" v-if="meta">
    <div class="mi" v-if="viewing">
      <span class="k">Viewing</span>
      <span class="val" style="color: var(--accent-ink)">{{ viewing }}</span>
    </div>
    <div class="mi" v-if="when">
      <span class="k">When</span>
      <span class="val">{{ when }}</span>
    </div>
    <div class="mi" v-if="coords">
      <span class="k">Where</span>
      <span class="val">
        <template v-if="store.location">{{ store.location }}</template>
        <template v-else>{{ coords.la.toFixed(4) }}, {{ coords.lo.toFixed(4) }}</template>
        <a :href="osmUrl!" target="_blank" rel="noopener" style="margin-left: 8px; font-weight: 500"
          >map ↗</a
        >
      </span>
    </div>
    <div class="mi">
      <span class="k">Sport</span>
      <span class="val">{{ sportName(meta.sport) || '—' }}</span>
    </div>
    <div class="mi">
      <span class="k">Format</span>
      <span class="val">{{ meta.formatLabel }}</span>
    </div>
    <div class="mi">
      <span class="k">Duration</span>
      <span class="val">{{ fmtDur(meta.durationS) }}</span>
    </div>
    <div class="mi" v-if="calories">
      <span class="k">Calories</span>
      <span class="val">{{ Math.round(calories) }} kcal</span>
    </div>
    <div class="mi" v-if="store.files.length > 1">
      <span class="k">Files</span>
      <span class="val" :title="store.files.join('\n')">{{ store.files.length }} merged</span>
    </div>
    <div class="mi">
      <span class="k">Data</span>
      <span class="val"
        >{{ meta.sampleCount.toLocaleString() }} samples · {{ meta.hasGPS ? 'GPS' : 'no GPS' }} ·
        {{ meta.hasHR ? 'HR' : 'no HR' }}</span
      >
    </div>
  </section>
</template>
