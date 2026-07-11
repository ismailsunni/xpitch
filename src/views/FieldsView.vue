<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { supabaseEnabled } from '../lib/supabase';
import { auth } from '../lib/auth';
import { store, openFieldEditor } from '../store';
import { listFields } from '../lib/api';

function newPitch() {
  openFieldEditor();
}
function editPitch(f: any) {
  openFieldEditor({ id: f.id, name: f.name, corners: f.corners, slug: f.slug, visibility: f.visibility });
}
// Refresh the list after the editor closes (a pitch may have been added).
watch(
  () => store.fieldEditorOpen,
  (open, was) => {
    if (was && !open) load();
  }
);

const state = ref<'loading' | 'ready' | 'error' | 'disabled'>('loading');
const fields = ref<any[]>([]);
const err = ref('');

function dims(corners: any): string {
  if (!Array.isArray(corners) || corners.length !== 4) return '';
  const R = 6371000,
    rad = (d: number) => (d * Math.PI) / 180;
  const d = (a: any, b: any) => {
    const x = rad(b.lat - a.lat),
      y = rad(b.lon - a.lon) * Math.cos(rad(a.lat));
    return Math.sqrt(x * x + y * y) * R;
  };
  const e = [d(corners[0], corners[1]), d(corners[1], corners[2]), d(corners[2], corners[3]), d(corners[3], corners[0])];
  const len = Math.max((e[0] + e[2]) / 2, (e[1] + e[3]) / 2);
  const wid = Math.min((e[0] + e[2]) / 2, (e[1] + e[3]) / 2);
  return `${Math.round(len)} × ${Math.round(wid)} m`;
}

async function load() {
  state.value = 'loading';
  if (!supabaseEnabled) {
    state.value = 'disabled';
    return;
  }
  try {
    fields.value = await listFields();
    state.value = 'ready';
  } catch (e: any) {
    state.value = 'error';
    err.value = e?.message || String(e);
  }
}
onMounted(load);
watch(() => auth.user?.id, load);
</script>

<template>
  <main class="tabpane">
    <div class="fields-head">
      <h2 style="margin: 0">Pitches</h2>
      <button v-if="auth.user" class="btn primary small" @click="newPitch">＋ New pitch</button>
    </div>
    <p v-if="state === 'disabled'" class="empty">Pitches aren’t available on this deployment.</p>
    <p v-else-if="state === 'loading'" class="empty">Loading…</p>
    <p v-else-if="state === 'error'" class="empty">{{ err }}</p>
    <template v-else>
      <p v-if="!fields.length" class="empty">No pitches yet.</p>
      <div v-else class="field-grid">
        <RouterLink v-for="f in fields" :key="f.id" :to="`/field/${f.slug}`" class="fieldcard card">
          <div class="fc-top">
            <span class="fc-name">🏟 {{ f.name }}</span>
            <span v-if="f.visibility !== 'public'" class="fc-badge">{{ f.visibility }}</span>
          </div>
          <div class="fc-sub">{{ dims(f.corners) }}<span v-if="!f.owner_id"> · built-in</span></div>
          <button
            v-if="auth.user && f.owner_id === auth.user.id"
            class="btn ghost small fc-edit"
            @click.prevent.stop="editPitch(f)"
          >
            ✏ Edit
          </button>
        </RouterLink>
      </div>
    </template>
  </main>
</template>

<style scoped>
.fields-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.fieldcard {
  display: block;
  text-decoration: none;
  color: inherit;
  transition: 0.15s;
  position: relative;
}
.fc-edit {
  margin-top: 10px;
}
.fieldcard:hover {
  border-color: var(--accent);
}
.fc-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.fc-name {
  font-weight: 700;
  font-size: 15px;
}
.fc-badge {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 2px 8px;
}
.fc-sub {
  color: var(--muted);
  font-size: 12.5px;
  margin-top: 4px;
}
</style>
