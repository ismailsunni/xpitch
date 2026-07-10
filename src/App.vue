<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import AppHeader from './components/AppHeader.vue';
import { store } from './store';
import { auth, needsUsername } from './lib/auth';

// Lazy: OpenLayers (FieldEditor) and the rarely-shown username gate.
const FieldEditor = defineAsyncComponent(() => import('./components/FieldEditor.vue'));
const UsernameGate = defineAsyncComponent(() => import('./components/UsernameGate.vue'));
</script>

<template>
  <AppHeader />
  <router-view />
  <FieldEditor v-if="store.fieldEditorOpen" />
  <UsernameGate v-if="auth.ready && needsUsername()" />
</template>
