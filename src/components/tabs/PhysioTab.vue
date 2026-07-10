<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../../store';
import StatCard from '../StatCard.vue';
import ChartPanel from '../ChartPanel.vue';
import { hrGraphConfig, hrZonesConfig } from '../../lib/charts';
import { fmtDur, fmtClock } from '../../lib/format';

const a = computed<any>(() => store.analytics);
const ph = computed<any>(() => a.value.physio);
const graph = computed(() => (ph.value ? hrGraphConfig(ph.value.series) : null));
const zones = computed(() => (ph.value ? hrZonesConfig(ph.value.hrZones) : null));
const topZone = computed(() =>
  ph.value ? ph.value.hrZones.reduce((x: any, y: any) => (y.time > x.time ? y : x)) : null
);
const refSource = computed(() =>
  a.value.options.maxHR ? 'entered' : a.value.options.age ? '220 − age' : 'observed'
);
</script>

<template>
  <section class="tabpane">
    <p v-if="!ph" class="empty">
      No heart-rate data in this file — physiological analysis is unavailable.
    </p>
    <template v-else>
      <div class="cards">
        <StatCard label="Average HR" :value="ph.avgHR" unit="bpm" accent />
        <StatCard label="Max HR" :value="ph.maxHR" unit="bpm" />
        <StatCard label="Reference max" :value="ph.refMax" unit="bpm" :sub="refSource" />
        <StatCard
          label="Most time in"
          :value="topZone.name.replace(/^Z\d /, '')"
          :sub="fmtDur(topZone.time)"
        />
        <StatCard label="Recovery periods" :value="ph.recoveries.length" sub="HR drops while resting" />
      </div>

      <div class="panel">
        <h3>Heart rate over the match</h3>
        <ChartPanel :config="graph!" />
      </div>

      <div class="grid2">
        <div class="panel">
          <h3>Time in HR zones</h3>
          <ChartPanel :config="zones!" />
        </div>
        <div class="panel">
          <h3>Recovery periods</h3>
          <div class="scroll-list">
            <p v-if="!ph.recoveries.length" class="empty">No clear recovery periods detected.</p>
            <div v-for="(rc, i) in ph.recoveries" :key="i" class="list-row">
              <span class="lead">@ {{ fmtClock(rc.start) }}</span>
              <span class="meta"
                >−{{ rc.drop }} bpm ({{ rc.startHR }}→{{ rc.endHR }}) over
                {{ rc.duration.toFixed(0) }}s</span
              >
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
