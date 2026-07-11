<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router';
import { loadFiles } from '../store';
import { auth } from '../lib/auth';
import { supabaseEnabled } from '../lib/supabase';
import AuthMenu from './AuthMenu.vue';
import SaveMatchButton from './SaveMatchButton.vue';

const router = useRouter();

async function onPick(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length) {
    await loadFiles(Array.from(files));
    await router.push('/analyze');
  }
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

    <nav class="topnav">
      <RouterLink to="/">Feed</RouterLink>
      <RouterLink to="/fields">Pitches</RouterLink>
      <RouterLink to="/analyze">Analyze</RouterLink>
    </nav>

    <div class="topbar-actions">
      <SaveMatchButton />
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

<style scoped>
.topnav {
  display: flex;
  gap: 4px;
  margin-right: auto;
  margin-left: 8px;
}
.topnav a {
  color: var(--muted);
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 8px;
}
.topnav a:hover {
  color: var(--text);
}
.topnav a.router-link-active {
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
}
@media (max-width: 640px) {
  .topnav {
    order: 3;
    width: 100%;
    margin: 6px 0 0;
  }
}
</style>
