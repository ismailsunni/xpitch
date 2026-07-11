<script setup lang="ts">
import { ref, onMounted, watch, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import { supabaseEnabled } from '../lib/supabase';
import { getField, listMatchesByField } from '../lib/api';
import MatchCard from '../components/MatchCard.vue';

const PitchMap = defineAsyncComponent(() => import('../components/PitchMap.vue'));

const route = useRoute();
const state = ref<'loading' | 'ready' | 'notfound' | 'error'>('loading');
const field = ref<any>(null);
const matches = ref<any[]>([]);
const errMsg = ref('');

const dims = ref('');
function computeDims(corners: { lat: number; lon: number }[]) {
  // Rough length x width from the two edge pairs.
  const R = 6371000,
    rad = (d: number) => (d * Math.PI) / 180;
  const d = (a: any, b: any) => {
    const dLat = rad(b.lat - a.lat),
      dLon = rad(b.lon - a.lon);
    const x = dLat,
      y = dLon * Math.cos(rad(a.lat));
    return Math.sqrt(x * x + y * y) * R;
  };
  const e = [d(corners[0], corners[1]), d(corners[1], corners[2]), d(corners[2], corners[3]), d(corners[3], corners[0])];
  const len = Math.max((e[0] + e[2]) / 2, (e[1] + e[3]) / 2);
  const wid = Math.min((e[0] + e[2]) / 2, (e[1] + e[3]) / 2);
  return `${Math.round(len)} m × ${Math.round(wid)} m`;
}

async function load() {
  state.value = 'loading';
  if (!supabaseEnabled) {
    state.value = 'error';
    errMsg.value = 'Field pages aren’t available on this deployment yet.';
    return;
  }
  try {
    const f = await getField(String(route.params.slug));
    if (!f) {
      state.value = 'notfound';
      return;
    }
    field.value = f;
    dims.value = Array.isArray(f.corners) && f.corners.length === 4 ? computeDims(f.corners) : '';
    matches.value = await listMatchesByField(f.id);
    state.value = 'ready';
  } catch (e: any) {
    state.value = 'error';
    errMsg.value = e?.message || String(e);
  }
}
onMounted(load);
watch(() => route.params.slug, load);
</script>

<template>
  <main class="tabpane">
    <p v-if="state === 'loading'" class="empty">Loading…</p>
    <p v-else-if="state === 'error'" class="empty">{{ errMsg }}</p>
    <p v-else-if="state === 'notfound'" class="empty">No pitch “{{ route.params.slug }}”.</p>
    <template v-else>
      <header style="margin-bottom: 16px">
        <h2 style="margin: 0">📍 {{ field.name }}</h2>
        <p class="hint" style="margin: 2px 0 0">{{ dims }}</p>
      </header>

      <div class="panel">
        <PitchMap :field-corners="field.corners" />
      </div>

      <h3 style="margin: 22px 0 12px">Matches here</h3>
      <p v-if="!matches.length" class="empty">No matches recorded on this pitch yet.</p>
      <div v-else class="match-grid">
        <MatchCard v-for="m in matches" :key="m.short_id" :match="m" />
      </div>
    </template>
  </main>
</template>

<style scoped>
.match-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
</style>
