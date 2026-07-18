<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../../store';
import StatCard from '../StatCard.vue';
import ChartPanel from '../ChartPanel.vue';
import { speedZonesConfig } from '../../lib/charts';
import { fmtDist, fmtClock, kmh } from '../../lib/format';
import { METRICS } from '../../lib/metrics';

const a = computed<any>(() => store.analytics);
const r = computed(() => a.value.running);
const s = computed(() => a.value.summary);
const chart = computed(() => speedZonesConfig(r.value.zones));
const hiDist = computed(() =>
  r.value.zones.slice(2).reduce((acc: number, z: any) => acc + z.distance, 0)
);
</script>

<template>
  <section class="tabpane">
    <div class="cards">
      <StatCard label="Total distance" :value="fmtDist(s.totalDistance)" :info="METRICS.totalDistance.desc" accent />
      <StatCard label="Sprints" :value="r.sprints.length" :sub="'≥ ' + a.options.sprintKmh + ' km/h'" :info="METRICS.sprints.desc" />
      <StatCard
        label="High-intensity runs"
        :value="r.highIntensityRuns.length"
        :sub="'≥ ' + a.options.highIntensityKmh + ' km/h'"
        :info="METRICS.highIntensityRuns.desc"
      />
      <StatCard label="High-speed distance" :value="fmtDist(hiDist)" sub="running + faster" :info="METRICS.highSpeedDistance.desc" />
      <StatCard v-if="r.avgCadence" label="Avg cadence" :value="r.avgCadence" unit="spm" sub="while moving" />
      <StatCard label="Top speed" :value="kmh(s.topSpeed)" unit="km/h" :info="METRICS.topSpeed.desc" />
      <StatCard label="Accelerations" :value="r.accelEvents.accelerations.length" sub="≥ 2 m/s²" :info="METRICS.accelerations.desc" />
      <StatCard label="Decelerations" :value="r.accelEvents.decelerations.length" sub="≤ -2 m/s²" :info="METRICS.decelerations.desc" />
    </div>

    <div class="grid2">
      <div class="panel">
        <h3>Distance by speed zone</h3>
        <ChartPanel :config="chart" />
      </div>
      <div class="panel">
        <h3>Sprint efforts</h3>
        <div class="scroll-list">
          <p v-if="!r.sprints.length" class="empty">
            No sprints detected above the threshold. Try lowering the sprint speed.
          </p>
          <div v-for="(sp, i) in r.sprints" :key="i" class="list-row">
            <span class="lead">Sprint {{ i + 1 }} <span class="meta">@ {{ fmtClock(sp.start) }}</span></span>
            <span class="meta"
              >{{ sp.duration.toFixed(0) }}s · {{ Math.round(sp.distance) }} m · top
              {{ kmh(sp.maxSpeed) }} km/h</span
            >
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
