<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { store, loadDemo, loadSample, loadFromUrl, loadFromUrls, isSaveable } from '../store';
import { auth } from '../lib/auth';
import { supabaseEnabled } from '../lib/supabase';
import FileDrop from '../components/FileDrop.vue';
import Dashboard from '../components/Dashboard.vue';
import SaveMatchButton from '../components/SaveMatchButton.vue';

onMounted(() => {
  // Dev/test hooks: #autosample, #autodemo[/tab], #autoload=<url>[,...]
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
  <main v-else>
    <div v-if="store.cloud.mode === 'local' && isSaveable()" class="savebar">
      <span class="sb-text">Analysis ready — save it to your profile to keep and share it.</span>
      <SaveMatchButton v-if="supabaseEnabled && auth.user" />
      <RouterLink v-else-if="supabaseEnabled" to="/login" class="btn primary small">Log in to save</RouterLink>
    </div>
    <Dashboard />
  </main>
</template>

<style scoped>
.savebar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 12px 22px;
  background: rgba(56, 189, 248, 0.08);
  border-bottom: 1px solid var(--border);
}
.sb-text {
  font-size: 13.5px;
  color: var(--text);
}
</style>
