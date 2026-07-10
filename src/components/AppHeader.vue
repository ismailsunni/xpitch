<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router';
import { loadFiles, loadSample } from '../store';
import { auth } from '../lib/auth';
import { supabaseEnabled } from '../lib/supabase';
import AuthMenu from './AuthMenu.vue';
import SaveMatchButton from './SaveMatchButton.vue';

const router = useRouter();

async function toHomeIfNeeded() {
  if (router.currentRoute.value.name !== 'home') await router.push('/');
}
async function onPick(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length) {
    await loadFiles(Array.from(files));
    await toHomeIfNeeded();
  }
}
async function sample() {
  await loadSample();
  await toHomeIfNeeded();
}
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand" style="text-decoration: none; color: inherit">
      <span class="logo">⚽</span>
      <div>
        <h1>xPitch</h1>
        <p class="tagline">Smart football match analysis from a <code>.fit</code> file</p>
      </div>
    </RouterLink>
    <div class="topbar-actions">
      <SaveMatchButton />
      <button class="btn ghost" @click="sample">Load sample</button>
      <label class="btn primary">
        <input type="file" accept=".fit" multiple hidden @change="onPick" />
        Open .fit file(s)
      </label>
      <template v-if="supabaseEnabled">
        <AuthMenu v-if="auth.user" />
        <RouterLink v-else to="/login" class="btn ghost">Log in</RouterLink>
      </template>
    </div>
  </header>
</template>
