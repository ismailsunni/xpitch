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
// 'all' = public + own; 'mine' = only the signed-in user's matches.
const filter = ref<'all' | 'mine'>('all');

const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE)));

async function load() {
  state.value = 'loading';
  if (!supabaseEnabled) {
    state.value = 'disabled';
    return;
  }
  try {
    const r = await listFeed(page.value, PAGE, filter.value === 'mine');
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
function setFilter(f: 'all' | 'mine') {
  if (filter.value === f) return;
  filter.value = f;
  go(0);
}
onMounted(load);
// Reset to "All" when signing out (My matches is meaningless logged-out).
watch(
  () => auth.user?.id,
  (id) => {
    if (!id) filter.value = 'all';
    go(0);
  }
);
</script>

<template>
  <main class="tabpane">
    <div class="feed-head">
      <h2 style="margin: 0">Match feed</h2>
      <div class="feed-actions">
        <div v-if="auth.user" class="seg" role="tablist" aria-label="Feed filter">
          <button class="seg-btn" :class="{ on: filter === 'all' }" @click="setFilter('all')">All</button>
          <button class="seg-btn" :class="{ on: filter === 'mine' }" @click="setFilter('mine')">My matches</button>
        </div>
        <RouterLink to="/analyze" class="btn primary small">＋ Analyze a .fit</RouterLink>
      </div>
    </div>

    <p v-if="state === 'disabled'" class="empty">
      The cloud feed isn’t available on this deployment. You can still
      <RouterLink to="/analyze">analyze a file</RouterLink>.
    </p>
    <p v-else-if="state === 'loading'" class="empty">Loading…</p>
    <p v-else-if="state === 'error'" class="empty">{{ err }}</p>
    <template v-else>
      <p v-if="!matches.length && filter === 'mine'" class="empty">
        You haven’t saved any matches yet — <RouterLink to="/analyze">analyze a file</RouterLink> and hit Save.
      </p>
      <p v-else-if="!matches.length" class="empty">
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
.feed-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.seg {
  display: inline-flex;
  padding: 3px;
  gap: 3px;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  border-radius: 11px;
}
.seg-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: 0.15s;
}
.seg-btn:hover {
  color: var(--text);
}
.seg-btn.on {
  background: var(--accent);
  color: var(--on-accent);
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
