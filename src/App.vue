<script setup lang="ts">
import { defineAsyncComponent, watch } from 'vue';
import AppSidebar from './components/AppSidebar.vue';
import { recompute, store } from './store';
import { auth, needsUsername } from './lib/auth';
import { loadMyFields } from './lib/api';

// Lazy: OpenLayers (FieldEditor) and the rarely-shown username gate.
const FieldEditor = defineAsyncComponent(() => import('./components/FieldEditor.vue'));
const UsernameGate = defineAsyncComponent(() => import('./components/UsernameGate.vue'));
const ManualSplitEditor = defineAsyncComponent(() => import('./components/ManualSplitEditor.vue'));
const UploadSetupWizard = defineAsyncComponent(() => import('./components/UploadSetupWizard.vue'));

// Keep the user's saved pitches loaded (for auto-matching) across sign in/out.
watch(
  () => auth.user?.id,
  () => void loadMyFields(),
  { immediate: true }
);

// A profile may arrive after a FIT is already loaded (for example after the
// user signs in). Reapply its private HR defaults to the active analysis.
watch(
  () => [auth.profile?.birth_date, auth.profile?.max_hr, auth.profile?.rest_hr],
  () => recompute(),
);
</script>

<template>
  <div class="shell">
    <AppSidebar />
    <main class="shell-main"><router-view /></main>
  </div>
  <FieldEditor v-if="store.fieldEditorOpen" />
  <ManualSplitEditor v-if="store.manualSplitOpen" />
  <UploadSetupWizard v-if="store.uploadWizardOpen" />
  <UsernameGate v-if="auth.ready && needsUsername()" />
</template>
