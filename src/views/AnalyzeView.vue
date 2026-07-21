<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { store, loadDemo, loadSample, loadFromUrl, loadFromUrls, isSaveable, openFieldEditor } from '../store';
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
    if (tab === 'field') openFieldEditor(undefined, 'match');
    else if (tab) store.activeTab = tab;
  } else if (hash.indexOf('autoload=') !== -1) {
    const urls = hash.split('autoload=')[1].split(',');
    if (urls.length > 1) loadFromUrls(urls);
    else loadFromUrl(urls[0]);
  }
});
</script>

<template>
  <!-- Landing here comes from Import activity; a plain drop zone if visited empty. -->
  <main v-if="!store.analytics" class="analyze-empty">
    <h1 class="sr-only">Analyze an activity file</h1>
    <FileDrop />
  </main>
  <main v-else>
    <div v-if="store.cloud.mode === 'local' && isSaveable()" class="savebar">
      <span class="sb-text">Analysis ready — save it to your profile to keep and share it.</span>
      <span v-if="auth.user && (auth.profile?.birth_date || auth.profile?.max_hr || auth.profile?.rest_hr)" class="sb-text muted">
        Using your saved profile age and heart-rate defaults.
      </span>
      <SaveMatchButton v-if="supabaseEnabled && auth.user" />
      <RouterLink v-else-if="supabaseEnabled" to="/login" class="btn primary">Log in to save</RouterLink>
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
  background: rgba(200, 247, 81, 0.08);
  border-bottom: 1px solid var(--border);
}
.sb-text {
  font-size: 13.5px;
  color: var(--text);
}
.muted { color: var(--muted); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
