<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../store';
import ControlsBar from './ControlsBar.vue';
import MetaBar from './MetaBar.vue';
import SegmentBar from './SegmentBar.vue';
import OverviewTab from './tabs/OverviewTab.vue';
import PositionalTab from './tabs/PositionalTab.vue';
import RunningTab from './tabs/RunningTab.vue';
import PhysioTab from './tabs/PhysioTab.vue';
import FootballTab from './tabs/FootballTab.vue';

const TABS = [
  { id: 'overview', label: 'Overview', comp: OverviewTab },
  { id: 'positional', label: 'Heatmap', comp: PositionalTab },
  { id: 'running', label: 'Speed & distance', comp: RunningTab },
  { id: 'physio', label: 'Heart rate', comp: PhysioTab },
  { id: 'football', label: 'Football', comp: FootballTab },
];

const activeComp = computed(() => TABS.find((t) => t.id === store.activeTab)?.comp || OverviewTab);
</script>

<template>
  <div>
    <!-- Activity-local section nav (this level is the match detail's own nav,
         separate from the global sidebar — Strava keeps the two apart). -->
    <nav class="tabs">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="tab"
        :class="{ active: store.activeTab === t.id }"
        @click="store.activeTab = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <ControlsBar />
    <MetaBar />
    <SegmentBar />

    <component :is="activeComp" :key="store.activeTab" />

    <footer class="foot">
      <p>All processing is local · FIT decoded in-browser · Metrics are estimates from GPS/HR data.</p>
    </footer>
  </div>
</template>
