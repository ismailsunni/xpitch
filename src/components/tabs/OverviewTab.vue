<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../../store';
import StatCard from '../StatCard.vue';
import ChartPanel from '../ChartPanel.vue';
import RoleCard from '../RoleCard.vue';
import { speedProfileConfig } from '../../lib/charts';
import { fmtDur, fmtDist, kmh, pct } from '../../lib/format';

const a = computed<any>(() => store.analytics);
const s = computed(() => a.value.summary);
const chart = computed(() => speedProfileConfig(a.value.samples));
</script>

<template>
  <section class="tabpane">
    <div class="cards">
      <StatCard
        label="Duration"
        :value="fmtDur(s.durationS)"
        :sub="a.meta.startDate ? a.meta.startDate.toLocaleDateString() : ''"
        accent
      />
      <StatCard label="Total distance" :value="fmtDist(s.totalDistance)" />
      <StatCard label="Top speed" :value="kmh(s.topSpeed)" unit="km/h" sub="smoothed" />
      <StatCard label="Avg speed (moving)" :value="kmh(s.avgSpeedMoving)" unit="km/h" />
      <StatCard
        label="Moving time"
        :value="fmtDur(s.movingTime)"
        :sub="pct(s.movingTime, s.durationS) + '% of match'"
      />
      <StatCard
        label="Standing time"
        :value="fmtDur(s.standingTime)"
        :sub="pct(s.standingTime, s.durationS) + '% of match'"
      />
      <StatCard v-if="a.physio" label="Avg heart rate" :value="a.physio.avgHR" unit="bpm" />
      <StatCard v-if="a.physio" label="Max heart rate" :value="a.physio.maxHR" unit="bpm" />
      <StatCard label="Sprints" :value="a.running.sprints.length" sub="high-speed efforts" />
    </div>

    <div class="panel">
      <h3>Speed profile</h3>
      <ChartPanel :config="chart" />
    </div>

    <div class="panel" v-if="a.football.role">
      <h3>Estimated playing role</h3>
      <RoleCard :role="a.football.role" />
    </div>
  </section>
</template>
