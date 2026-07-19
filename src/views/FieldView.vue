<script setup lang="ts">
import { ref, onMounted, watch, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import { supabaseEnabled } from '../lib/supabase';
import { auth } from '../lib/auth';
import { getField, listMatchesByField, setFieldVisibility } from '../lib/api';
import { store, openFieldEditor } from '../store';
import MatchCard from '../components/MatchCard.vue';
import { userErrorMessage } from '../lib/errors';

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
    errMsg.value = userErrorMessage(e, 'Could not load this pitch. Try again.');
  }
}
onMounted(load);
watch(() => route.params.slug, load);

const isOwner = () => !!auth.user && field.value && field.value.owner_id === auth.user.id;
async function onVisibility(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  field.value.visibility = v;
  await setFieldVisibility(field.value.id, v);
}
function editPitch() {
  const f = field.value;
  openFieldEditor({ id: f.id, name: f.name, corners: f.corners, slug: f.slug, visibility: f.visibility });
}
// Reload the pitch after the editor closes (corners/name may have changed).
watch(
  () => store.fieldEditorOpen,
  (open, was) => {
    if (was && !open) load();
  }
);
</script>

<template>
  <main class="tabpane">
    <p v-if="state === 'loading'" class="empty">Loading pitch…</p>
    <p v-else-if="state === 'error'" class="empty">We couldn’t load this pitch. <button class="linkbtn" @click="load">Retry</button></p>
    <p v-else-if="state === 'notfound'" class="empty">No pitch “{{ route.params.slug }}”.</p>
    <template v-else>
      <header style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap">
        <div>
          <h1 style="margin: 0">📍 {{ field.name }}</h1>
          <p class="hint" style="margin: 2px 0 0">{{ dims }}</p>
        </div>
        <div v-if="isOwner()" class="fv-owner">
          <button class="btn ghost small" @click="editPitch">✏ Edit pitch</button>
          <label class="fv-vis">
            Visibility
            <select :value="field.visibility" @change="onVisibility">
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </label>
        </div>
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
.fv-owner {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}
.fv-vis {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.fv-vis select {
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: var(--ctl-pad-y-sm) 10px;
  line-height: var(--ctl-line-sm);
  font-size: 13px;
  text-transform: none;
  letter-spacing: 0;
}
</style>
