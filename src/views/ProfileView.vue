<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { supabaseEnabled } from '../lib/supabase';
import { auth } from '../lib/auth';
import { listMatches } from '../lib/api';
import MatchCard from '../components/MatchCard.vue';

const route = useRoute();
const state = ref<'loading' | 'ready' | 'notfound' | 'error'>('loading');
const data = ref<{ profile: any; isOwner: boolean; matches: any[] } | null>(null);
const errMsg = ref('');

async function load() {
  state.value = 'loading';
  if (!supabaseEnabled) {
    state.value = 'error';
    errMsg.value = 'Profiles aren’t available on this deployment yet.';
    return;
  }
  try {
    const res = await listMatches(String(route.params.username));
    if (!res) {
      state.value = 'notfound';
      return;
    }
    data.value = res;
    state.value = 'ready';
  } catch (e: any) {
    state.value = 'error';
    errMsg.value = e?.message || String(e);
  }
}
onMounted(load);
watch(() => route.params.username, load);
// Re-fetch once the session resolves (so the owner sees unlisted/private too)
// or on sign in/out.
watch(() => auth.user?.id, load);
</script>

<template>
  <main class="tabpane">
    <p v-if="state === 'loading'" class="empty">Loading…</p>
    <p v-else-if="state === 'error'" class="empty">{{ errMsg }}</p>
    <p v-else-if="state === 'notfound'" class="empty">No user “{{ route.params.username }}”.</p>
    <template v-else-if="data">
      <header class="profile-head">
        <div class="pf-avatar">{{ (data.profile.username || '?')[0].toUpperCase() }}</div>
        <div>
          <h2 style="margin: 0">@{{ data.profile.username }}</h2>
          <p v-if="data.profile.display_name" class="hint" style="margin: 2px 0 0">
            {{ data.profile.display_name }}
          </p>
          <p class="hint" style="margin: 2px 0 0">
            {{ data.matches.length }} match{{ data.matches.length === 1 ? '' : 'es' }}
            <template v-if="data.isOwner"> · this is you</template>
          </p>
        </div>
      </header>

      <p v-if="!data.matches.length" class="empty">
        <template v-if="data.isOwner">
          No saved matches yet. Open a <code>.fit</code> file, then hit <strong>Save match</strong>.
        </template>
        <template v-else>No public matches.</template>
      </p>

      <div v-else class="match-grid">
        <MatchCard v-for="m in data.matches" :key="m.short_id" :match="m" />
      </div>
    </template>
  </main>
</template>

<style scoped>
.profile-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 22px;
}
.pf-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.3), rgba(52, 211, 153, 0.2));
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 800;
}
.match-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
</style>
