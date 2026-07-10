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
  { id: 'positional', label: '🗺️ Positional', comp: PositionalTab },
  { id: 'running', label: '🏃 Running', comp: RunningTab },
  { id: 'physio', label: '❤️ Physiological', comp: PhysioTab },
  { id: 'football', label: '⚽ Football', comp: FootballTab },
];

const activeComp = computed(() => TABS.find((t) => t.id === store.activeTab)?.comp || OverviewTab);
</script>

<template>
  <div>
    <ControlsBar />
    <MetaBar />
    <SegmentBar />

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

    <component :is="activeComp" :key="store.activeTab" />

    <footer class="foot">
      <p>All processing is local · FIT decoded in-browser · Metrics are estimates from GPS/HR data.</p>
    </footer>
  </div>
</template>
