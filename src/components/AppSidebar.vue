<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { RouterLink, useRouter, useRoute } from 'vue-router';
import { loadFiles } from '../store';
import { auth, signOut } from '../lib/auth';
import { supabaseEnabled } from '../lib/supabase';
import SaveMatchButton from './SaveMatchButton.vue';

const router = useRouter();
const route = useRoute();

// Mobile drawer + user menu open state.
const drawerOpen = ref(false);
const menuOpen = ref(false);

async function onPick(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length) {
    await loadFiles(Array.from(files));
    await router.push('/analyze');
    drawerOpen.value = false;
  }
}

const initials = computed(() => {
  const s = auth.profile?.display_name || auth.profile?.username || auth.user?.email || '';
  const parts = s.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || (s[0] || 'U').toUpperCase();
});
const displayName = computed(
  () => auth.profile?.display_name || auth.profile?.username || auth.user?.email || 'Account'
);
const profilePath = computed(() => (auth.profile?.username ? '/' + auth.profile.username : '/login'));

async function doSignOut() {
  menuOpen.value = false;
  await signOut();
  router.push('/');
}

// Close the drawer/menu whenever the route changes.
watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false;
    menuOpen.value = false;
  }
);
</script>

<template>
  <!-- Mobile top bar (hidden on desktop) -->
  <header class="mtop">
    <RouterLink to="/" class="mbrand">
      <span class="logo-badge"><span class="logo-glyph">◉</span></span>
      <span class="wordmark">xPitch</span>
    </RouterLink>
    <button class="hamburger" aria-label="Open menu" @click="drawerOpen = true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  </header>

  <!-- Backdrop for the mobile drawer -->
  <div v-if="drawerOpen" class="drawer-backdrop" @click="drawerOpen = false"></div>

  <aside class="sidebar" :class="{ open: drawerOpen }">
    <RouterLink to="/" class="brand-row">
      <span class="logo-badge"><span class="logo-glyph">◉</span></span>
      <span class="wordmark">xPitch</span>
    </RouterLink>

    <div class="nav-group">
      <div class="nav-label">Menu</div>
      <RouterLink to="/" class="nav-item" exact-active-class="active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
        <span>Feed</span>
      </RouterLink>
      <RouterLink to="/fields" class="nav-item" active-class="active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /><circle cx="12" cy="12" r="2.5" /></svg>
        <span>Pitches</span>
      </RouterLink>
      <RouterLink to="/help" class="nav-item" active-class="active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" /><circle cx="12" cy="16.5" r="0.6" fill="currentColor" /></svg>
        <span>Help</span>
      </RouterLink>
    </div>

    <div class="spacer"></div>

    <label class="import-cta">
      <input type="file" accept=".fit" multiple hidden @change="onPick" />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
      Import .fit file
    </label>

    <SaveMatchButton class="save-in-sidebar" />

    <!-- User chip -->
    <div v-if="supabaseEnabled" class="user-zone">
      <template v-if="auth.user">
        <button class="user-chip" @click="menuOpen = !menuOpen">
          <span class="avatar">{{ initials }}</span>
          <span class="user-meta">
            <span class="user-name">{{ displayName }}</span>
            <span class="user-sub">{{ auth.profile?.username ? '@' + auth.profile.username : 'Signed in' }}</span>
          </span>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6" /></svg>
        </button>
        <div v-if="menuOpen" class="user-menu">
          <RouterLink :to="profilePath" class="menu-item">My profile &amp; matches</RouterLink>
          <RouterLink to="/settings" class="menu-item">Edit profile</RouterLink>
          <button class="menu-item" @click="doSignOut">Sign out</button>
        </div>
      </template>
      <RouterLink v-else to="/login" class="btn ghost login-btn">Log in</RouterLink>
    </div>
  </aside>
</template>

<style scoped>
/* ---------- Desktop sidebar ---------- */
.sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 24px 16px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  overflow-y: auto;
}
.brand-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 2px 8px 20px;
  text-decoration: none;
  color: var(--text);
}
.logo-badge {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 22px rgba(200, 247, 81, 0.35);
  flex: none;
}
.logo-glyph {
  color: var(--on-accent);
  font-size: 18px;
  line-height: 1;
}
.wordmark {
  font-family: var(--font-head);
  font-weight: 700;
  font-size: 20px;
  letter-spacing: -0.02em;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dim);
  padding: 12px 8px 6px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 10px 13px;
  border-radius: 11px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-family: var(--font-body);
  font-size: 13.5px;
  font-weight: 600;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.nav-item svg {
  width: 18px;
  height: 18px;
  flex: none;
}
.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
}
.nav-item.active {
  background: var(--accent-tint);
  color: var(--accent);
  box-shadow: inset 2px 0 0 var(--accent);
}

.spacer {
  flex: 1;
  min-height: 12px;
}

.import-cta {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px dashed rgba(200, 247, 81, 0.4);
  background: rgba(200, 247, 81, 0.06);
  color: var(--accent);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.import-cta:hover {
  background: rgba(200, 247, 81, 0.12);
}
.import-cta svg {
  width: 16px;
  height: 16px;
}
.save-in-sidebar {
  margin-top: 8px;
}
.save-in-sidebar :deep(.btn) {
  width: 100%;
  justify-content: center;
}

.user-zone {
  position: relative;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 8px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.user-chip:hover {
  background: rgba(255, 255, 255, 0.05);
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2b6cff, #00e28a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-head);
  font-weight: 700;
  font-size: 12px;
  color: #04110b;
  flex: none;
}
.user-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;
  flex: 1;
}
.user-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-sub {
  font-size: 11px;
  color: var(--muted2);
}
.chev {
  width: 16px;
  height: 16px;
  color: var(--dim);
  flex: none;
}
.user-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  overflow: hidden;
  z-index: 40;
}
.menu-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  padding: 11px 14px;
  cursor: pointer;
  font-size: 13px;
  text-decoration: none;
}
.menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.login-btn {
  width: 100%;
  justify-content: center;
  text-align: center;
  text-decoration: none;
}

/* ---------- Mobile top bar + drawer ---------- */
.mtop {
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sidebar);
  position: sticky;
  top: 0;
  z-index: 25;
}
.mbrand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
}
.hamburger {
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
  padding: 4px;
}
.drawer-backdrop {
  display: none;
}

@media (max-width: 900px) {
  .mtop {
    display: flex;
  }
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    height: 100vh;
    width: 264px;
    z-index: 30;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
  }
  .sidebar.open {
    transform: translateX(0);
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.6);
  }
  .drawer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 29;
  }
}
</style>
