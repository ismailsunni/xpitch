<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { supabaseEnabled } from '../lib/supabase';
import { auth } from '../lib/auth';
import { listFeed } from '../lib/api';
import MatchCard from '../components/MatchCard.vue';

const PAGE = 12;
const page = ref(0);
const total = ref(0);
const matches = ref<any[]>([]);
const state = ref<'loading' | 'ready' | 'error' | 'disabled'>('loading');
const err = ref('');

const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE)));

async function load() {
  state.value = 'loading';
  if (!supabaseEnabled) {
    state.value = 'disabled';
    return;
  }
  try {
    const r = await listFeed(page.value, PAGE);
    matches.value = r.matches;
    total.value = r.total;
    state.value = 'ready';
  } catch (e: any) {
    state.value = 'error';
    err.value = e?.message || String(e);
  }
}
function go(p: number) {
  page.value = p;
  load();
  window.scrollTo(0, 0);
}
onMounted(load);
watch(() => auth.user?.id, () => go(0));
</script>

<template>
  <main class="tabpane">
    <div class="feed-head">
      <h2 style="margin: 0">Match feed</h2>
      <RouterLink to="/analyze" class="btn primary small">＋ Analyze a .fit</RouterLink>
    </div>

    <p v-if="state === 'disabled'" class="empty">
      The cloud feed isn’t available on this deployment. You can still
      <RouterLink to="/analyze">analyze a file</RouterLink>.
    </p>
    <p v-else-if="state === 'loading'" class="empty">Loading…</p>
    <p v-else-if="state === 'error'" class="empty">{{ err }}</p>
    <template v-else>
      <p v-if="!matches.length" class="empty">
        No matches yet — <RouterLink to="/analyze">analyze a file</RouterLink> and hit Save.
      </p>
      <div v-else class="match-grid">
        <MatchCard v-for="m in matches" :key="m.short_id" :match="m" show-author />
      </div>
      <div v-if="pages > 1" class="pager">
        <button class="btn ghost small" :disabled="page === 0" @click="go(page - 1)">← Prev</button>
        <span class="hint" style="margin: 0">Page {{ page + 1 }} / {{ pages }}</span>
        <button class="btn ghost small" :disabled="page >= pages - 1" @click="go(page + 1)">Next →</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.feed-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.match-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.pager {
  display: flex;
  gap: 14px;
  align-items: center;
  justify-content: center;
  margin: 26px 0;
}
</style>
