<script setup lang="ts">
import { defineAsyncComponent, watch } from 'vue';
import AppHeader from './components/AppHeader.vue';
import { store } from './store';
import { auth, needsUsername } from './lib/auth';
import { loadMyFields } from './lib/api';

// Lazy: OpenLayers (FieldEditor) and the rarely-shown username gate.
const FieldEditor = defineAsyncComponent(() => import('./components/FieldEditor.vue'));
const UsernameGate = defineAsyncComponent(() => import('./components/UsernameGate.vue'));
const ManualSplitEditor = defineAsyncComponent(() => import('./components/ManualSplitEditor.vue'));

// Keep the user's saved pitches loaded (for auto-matching) across sign in/out.
watch(
  () => auth.user?.id,
  () => void loadMyFields(),
  { immediate: true }
);
</script>

<template>
  <AppHeader />
  <router-view />
  <FieldEditor v-if="store.fieldEditorOpen" />
  <ManualSplitEditor v-if="store.manualSplitOpen" />
  <UsernameGate v-if="auth.ready && needsUsername()" />
</template>
