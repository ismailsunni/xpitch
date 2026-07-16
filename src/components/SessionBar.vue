<script setup lang="ts">
import { computed } from 'vue';
import { store, activeSegment, flipAttack, flipSides, currentAttackDir, currentSideDir } from '../store';
import { auth } from '../lib/auth';
import { fmtDur } from '../lib/format';
import { METRICS } from '../lib/metrics';
import InfoTip from './InfoTip.vue';

const props = defineProps<{ editing?: boolean }>();

// Everything about the currently-selected session/period. Shown right after the
// session chooser so the flow reads match → session → this session's detail.
const meta = computed(() => store.analytics?.meta);
const session = computed<any>(() => meta.value?.session || {});
const calories = computed(() => session.value.total_calories ?? null);

const readOnly = computed(() => store.cloud.mode === 'cloud' && auth.user?.id !== store.cloud.ownerId);
const canEditOrientation = computed(() => !readOnly.value && (props.editing || store.cloud.mode === 'local'));
const flipped = computed(() => currentAttackDir() === -1);
const sidesFlipped = computed(() => currentSideDir() === -1);
const usingField = computed(() => !!store.analytics?.positional?.hasField);

const viewing = computed(() => {
  const seg = activeSegment();
  if (!seg || store.segments.length <= 1) {
    if (seg && seg.periods.length && store.activePeriod >= 0) return seg.periods[store.activePeriod].label;
    return 'Full upload';
  }
  const period =
    store.activePeriod >= 0 && seg.periods[store.activePeriod] ? ' · ' + seg.periods[store.activePeriod].label : '';
  return seg.label + period;
});
</script>

<template>
  <section class="sessionbar" v-if="meta">
    <div class="mi lead">
      <span class="k">Viewing<InfoTip :text="METRICS.viewing.desc" /></span>
      <span class="val" style="color: var(--accent-ink)">{{ viewing }}</span>
    </div>
    <div class="mi">
      <span class="k">Duration<InfoTip :text="METRICS.duration.desc" /></span>
      <span class="val">{{ fmtDur(meta.durationS) }}</span>
    </div>
    <div class="mi" v-if="calories">
      <span class="k">Calories<InfoTip :text="METRICS.calories.desc" /></span>
      <span class="val">{{ Math.round(calories) }} kcal</span>
    </div>
    <div class="mi">
      <span class="k">Data<InfoTip :text="METRICS.data.desc" /></span>
      <span class="val"
        >{{ meta.sampleCount.toLocaleString() }} samples · {{ meta.hasGPS ? 'GPS' : 'no GPS' }} ·
        {{ meta.hasHR ? 'HR' : 'no HR' }}</span
      >
    </div>

    <div class="mi orient" v-if="canEditOrientation">
      <span class="k">Orientation<InfoTip :text="METRICS.orientation.desc" /></span>
      <div class="orient-btns">
        <button
          class="btn ghost small"
          :class="{ on: flipped }"
          title="Switch which end you attacked — rotates the pitch 180° (ends and wings together). Selected session/half only."
          @click="flipAttack"
        >
          {{ flipped ? 'Attacking ◀' : '▶ Attacking' }}
        </button>
        <button
          v-if="!usingField"
          class="btn ghost small"
          :class="{ on: sidesFlipped }"
          title="Mirror left/right (width). Only needed without a defined pitch, where left/right is guessed."
          @click="flipSides"
        >
          ⇅ Swap sides
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sessionbar {
  display: flex;
  align-items: flex-start;
  gap: 22px;
  flex-wrap: wrap;
  padding: 12px 22px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 13px;
}
.mi {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.mi .k {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}
.mi .val {
  color: var(--text);
  font-weight: 600;
  font-size: 13.5px;
}
.orient-btns {
  display: flex;
  gap: 6px;
  margin-top: 1px;
}
@media (max-width: 640px) {
  .sessionbar {
    gap: 14px 16px;
    padding: 12px 14px;
  }
  .orient {
    margin-left: 0;
    flex-basis: 100%;
  }
}
</style>
