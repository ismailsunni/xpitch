<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../../store';
import StatCard from '../StatCard.vue';
import ChartPanel from '../ChartPanel.vue';
import RoleCard from '../RoleCard.vue';
import { workRateConfig, fatigueConfig } from '../../lib/charts';

const a = computed<any>(() => store.analytics);
const f = computed(() => a.value.football);
const fa = computed(() => f.value.fatigue);
const workRate = computed(() => workRateConfig(f.value.workRate));
const fatigue = computed(() => fatigueConfig(fa.value.segments));

const dropStr = computed(
  () => (fa.value.distanceDropPct >= 0 ? '+' : '') + fa.value.distanceDropPct.toFixed(0) + '%'
);
const verdict = computed(() => {
  const d = fa.value.distanceDropPct;
  if (d < -12) return `Noticeable fatigue — output dropped ${Math.abs(d).toFixed(0)}% in the second half.`;
  if (d < -4) return `Mild fatigue — output eased ${Math.abs(d).toFixed(0)}% after half-time.`;
  return `Strong endurance — work rate held up (${dropStr.value}).`;
});
const verdictClass = computed(() => (fa.value.distanceDropPct < -12 ? 'warn' : ''));
</script>

<template>
  <section class="tabpane">
    <div class="cards">
      <StatCard
        label="High-intensity runs"
        :value="a.running.highIntensityRuns.length"
        :sub="'≥ ' + a.options.highIntensityKmh + ' km/h'"
        accent
      />
      <StatCard label="Repeated-sprint bouts" :value="f.rse.length" sub="≥3 sprints in quick succession" />
      <StatCard label="2nd-half work rate" :value="dropStr" sub="vs 1st half (m/min)" />
      <StatCard label="Sprints 1st / 2nd" :value="fa.sprintsFirst + ' / ' + fa.sprintsSecond" />
    </div>

    <div class="panel">
      <h3>Work rate throughout the match</h3>
      <ChartPanel :config="workRate" />
    </div>

    <div class="grid2">
      <div class="panel">
        <h3>Fatigue — distance per 10-minute segment</h3>
        <ChartPanel :config="fatigue" />
        <p class="hint">
          1st half: <strong>{{ fa.firstHalf.ratePerMin.toFixed(0) }} m/min</strong> · 2nd half:
          <strong>{{ fa.secondHalf.ratePerMin.toFixed(0) }} m/min</strong>.<br />
          <span :class="verdictClass">{{ verdict }}</span>
        </p>
      </div>
      <div class="panel">
        <h3>Estimated playing role</h3>
        <RoleCard :role="f.role" />
      </div>
    </div>
  </section>
</template>
