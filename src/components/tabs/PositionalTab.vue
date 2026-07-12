<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { store } from '../../store';
import PitchCanvas from '../PitchCanvas.vue';
// Lazy: only pulls in OpenLayers when the positional tab is viewed.
const PitchMap = defineAsyncComponent(() => import('../PitchMap.vue'));

const a = computed<any>(() => store.analytics);
const p = computed<any>(() => a.value.positional);

const thirdLabels = ['Defensive third', 'Middle third', 'Attacking third'];
const thirdColors = ['#3b82f6', '#16c060', '#ef4444'];
const sideLabels = ['Left flank', 'Central', 'Right flank'];
const sideColors = ['#a78bfa', '#16c060', '#fb923c'];

function bars(values: number[], labels: string[], colors: string[]) {
  const total = values.reduce((x, y) => x + y, 0) || 1;
  return values.map((v, i) => ({
    label: labels[i],
    pct: Math.round((v / total) * 100),
    color: colors[i],
  }));
}

const thirds = computed(() => (p.value ? bars(p.value.thirds, thirdLabels, thirdColors) : []));
const sides = computed(() => (p.value ? bars(p.value.sides, sideLabels, sideColors) : []));
const preferredSide = computed(() => {
  if (!p.value) return '';
  return sideLabels[p.value.sides.indexOf(Math.max(...p.value.sides))];
});
</script>

<template>
  <section class="tabpane">
    <p v-if="!p" class="empty">No GPS data in this file — positional analysis is unavailable.</p>
    <template v-else>
      <div class="grid2">
        <div class="panel">
          <h3>Positional heatmap</h3>
          <PitchCanvas :positional="p" mode="heatmap" />
          <p class="hint">Red = most time spent. White dot = average position.</p>
        </div>
        <div class="panel">
          <h3>Movement trail</h3>
          <PitchCanvas :positional="p" mode="trail" />
          <p class="hint">
            <span class="swatch" style="background: #8c5afa"></span> start →
            <span class="swatch" style="background: #ff961e"></span> end
          </p>
        </div>
        <div class="panel">
          <h3>Zone occupancy (time %)</h3>
          <PitchCanvas :positional="p" mode="zones" />
          <p class="hint">% of time spent in each zone (6 × 3). Darker red = more time; 0% = barely visited.</p>
        </div>
        <div class="panel">
          <h3>Positioning breakdown</h3>
          <div class="subhead">Along the pitch (length)</div>
          <div v-for="b in thirds" :key="b.label" class="bar-row">
            <div class="bl"><span>{{ b.label }}</span><span>{{ b.pct }}%</span></div>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: b.pct + '%', background: b.color }"></div>
            </div>
          </div>
          <div class="subhead" style="margin-top: 16px">Across the pitch (width)</div>
          <div v-for="b in sides" :key="b.label" class="bar-row">
            <div class="bl"><span>{{ b.label }}</span><span>{{ b.pct }}%</span></div>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: b.pct + '%', background: b.color }"></div>
            </div>
          </div>
          <p class="hint">
            <template v-if="p.hasField">
              Using your defined field: {{ Math.round(p.lengthM) }} m long ×
              {{ Math.round(p.widthM) }} m wide (true orientation).
            </template>
            <template v-else>
              Pitch span sampled from GPS: ~{{ Math.round(p.lengthM) }} m long ×
              {{ Math.round(p.widthM) }} m wide (orientation inferred — set a field for accuracy).
            </template>
            Preferred side: <strong style="color: var(--text)">{{ preferredSide }}</strong>.
          </p>
        </div>
      </div>

      <div class="panel">
        <h3>On the real pitch</h3>
        <PitchMap :key="store.activeSegmentId + ':' + store.activePeriod" />
        <p class="hint">
          Your GPS track on satellite imagery.
          <span v-if="p.hasField">Green outline = the defined pitch.</span>
          <span class="swatch" style="background: #8c5afa"></span> start
          <span class="swatch" style="background: #ff961e"></span> end.
        </p>
      </div>
    </template>
  </section>
</template>
