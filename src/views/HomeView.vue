<script setup lang="ts">
import { onMounted } from 'vue';
import { store, loadDemo, loadSample, loadFromUrl, loadFromUrls } from '../store';
import FileDrop from '../components/FileDrop.vue';
import Dashboard from '../components/Dashboard.vue';

onMounted(() => {
  // Dev/test hooks (kept working): #autosample, #autodemo[/tab], #autoload=<url>[,...]
  const hash = location.hash;
  if (hash.indexOf('autosample') !== -1) {
    loadSample();
  } else if (hash.indexOf('autodemo') !== -1) {
    loadDemo();
    const tab = hash.split('/')[1];
    if (tab === 'field') store.fieldEditorOpen = true;
    else if (tab) store.activeTab = tab;
  } else if (hash.indexOf('autoload=') !== -1) {
    const urls = hash.split('autoload=')[1].split(',');
    if (urls.length > 1) loadFromUrls(urls);
    else loadFromUrl(urls[0]);
  }
});
</script>

<template>
  <FileDrop v-if="!store.analytics" />
  <main v-else><Dashboard /></main>
</template>
