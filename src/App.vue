<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue';
import { store, loadDemo, loadFile, loadFromUrl } from './store';
import FileDrop from './components/FileDrop.vue';
// Lazy-loaded so OpenLayers is only fetched when the field editor is opened.
const FieldEditor = defineAsyncComponent(() => import('./components/FieldEditor.vue'));
import ControlsBar from './components/ControlsBar.vue';
import MetaBar from './components/MetaBar.vue';
import OverviewTab from './components/tabs/OverviewTab.vue';
import PositionalTab from './components/tabs/PositionalTab.vue';
import RunningTab from './components/tabs/RunningTab.vue';
import PhysioTab from './components/tabs/PhysioTab.vue';
import FootballTab from './components/tabs/FootballTab.vue';

const TABS = [
  { id: 'overview', label: 'Overview', comp: OverviewTab },
  { id: 'positional', label: '🗺️ Positional', comp: PositionalTab },
  { id: 'running', label: '🏃 Running', comp: RunningTab },
  { id: 'physio', label: '❤️ Physiological', comp: PhysioTab },
  { id: 'football', label: '⚽ Football', comp: FootballTab },
];

const activeComp = computed(() => TABS.find((t) => t.id === store.activeTab)?.comp || OverviewTab);

function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) loadFile(f);
}

onMounted(() => {
  // Dev/test hooks: #autodemo[/tab] or #autoload=<url>[/tab]
  const hash = location.hash;
  if (hash.indexOf('autodemo') !== -1) {
    loadDemo();
    const tab = hash.split('/')[1];
    if (tab === 'field') store.fieldEditorOpen = true;
    else if (tab) store.activeTab = tab;
  } else if (hash.indexOf('autoload=') !== -1) {
    const rest = hash.split('autoload=')[1];
    const [url, tab] = rest.split('/');
    loadFromUrl(url).then(() => {
      if (tab) store.activeTab = tab;
    });
  }
});
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="logo">⚽</span>
      <div>
        <h1>Spatial Football</h1>
        <p class="tagline">Analyze &amp; visualize a <code>.fit</code> match file — all in your browser</p>
      </div>
    </div>
    <div class="topbar-actions">
      <button class="btn ghost" @click="loadDemo">Load demo match</button>
      <label class="btn primary">
        <input type="file" accept=".fit" hidden @change="onPick" />
        Open .fit file
      </label>
    </div>
  </header>

  <FileDrop v-if="!store.analytics" />

  <main v-else>
    <ControlsBar />
    <MetaBar />

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
  </main>

  <FieldEditor v-if="store.fieldEditorOpen" />
</template>
