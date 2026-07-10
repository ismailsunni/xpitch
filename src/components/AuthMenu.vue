<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { auth, signOut } from '../lib/auth';

const router = useRouter();
const open = ref(false);

const label = () =>
  auth.profile?.username || auth.profile?.display_name || auth.user?.email || 'Account';

function goMatches() {
  open.value = false;
  if (auth.profile?.username) router.push('/' + auth.profile.username);
}
async function doSignOut() {
  open.value = false;
  await signOut();
  router.push('/');
}
</script>

<template>
  <div class="authmenu" @focusout="open = false" tabindex="-1">
    <button class="btn ghost small" @click="open = !open">{{ label() }} ▾</button>
    <div v-if="open" class="menu">
      <button class="menu-item" @click="goMatches">My matches</button>
      <button class="menu-item" @click="doSignOut">Sign out</button>
    </div>
  </div>
</template>

<style scoped>
.authmenu {
  position: relative;
}
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  min-width: 160px;
  z-index: 30;
  overflow: hidden;
}
.menu-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  padding: 10px 14px;
  cursor: pointer;
  font-size: 13.5px;
}
.menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
</style>
