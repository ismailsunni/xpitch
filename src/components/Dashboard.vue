<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../store';
import ControlsBar from './ControlsBar.vue';
import MetaBar from './MetaBar.vue';
import SegmentBar from './SegmentBar.vue';
import SessionSplitDialog from './SessionSplitDialog.vue';
import SessionBar from './SessionBar.vue';
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
const props = defineProps<{ editingMatch?: boolean }>();

function openSessionSetup() {
  store.sessionSplitEditorOpen = true;
}
</script>

<template>
  <div>
    <!-- Order: match info → analysis settings → session chooser → this session,
         then the section nav sits directly above the content it switches. -->
    <MetaBar :editing="editingMatch" />
    <ControlsBar />
    <slot name="after-settings" />
    <SegmentBar :editing="props.editingMatch" @edit-sessions="openSessionSetup" />
    <SessionSplitDialog v-if="store.sessionSplitEditorOpen" />
    <SessionBar :editing="editingMatch" />

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
    <!-- Mobile: the section tabs become a dropdown. -->
    <div class="tabs-mobile">
      <select
        class="tabs-select"
        :value="store.activeTab"
        @change="store.activeTab = ($event.target as HTMLSelectElement).value"
      >
        <option v-for="t in TABS" :key="t.id" :value="t.id">{{ t.label }}</option>
      </select>
    </div>

    <component :is="activeComp" :key="store.activeTab" />

    <footer class="foot">
      <p>All processing is local · FIT decoded in-browser · Metrics are estimates from GPS/HR data.</p>
    </footer>
  </div>
</template>

<style scoped>
/* Section nav: pills on desktop, a dropdown on mobile. */
.tabs-mobile {
  display: none;
}
.tabs-select {
  width: 100%;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
@media (max-width: 900px) {
  .tabs {
    display: none;
  }
  .tabs-mobile {
    display: block;
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--bg);
    padding: 12px 14px;
  }
  .session-split-panel {
    padding: 14px;
  }
}
</style>
