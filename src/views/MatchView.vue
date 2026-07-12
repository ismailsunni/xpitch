<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getMatch,
  toCloudSessions,
  updateSessionDirs,
  updateMatchFromCurrent,
  setMatchVisibility,
  updateMatchTitle,
  deleteMatch,
} from '../lib/api';
import { store, loadFromCloud, nonCombinedSegments, dirsForSegment, selectSegment } from '../store';
import * as FitParser from '../lib/fit-parser';
import { mergeFiles } from '../lib/segmentation';
import { auth } from '../lib/auth';
import { supabaseEnabled } from '../lib/supabase';
import Dashboard from '../components/Dashboard.vue';
import ShareButtons from '../components/ShareButtons.vue';

const shareUrl = computed(
  () => window.location.origin + import.meta.env.BASE_URL + 'match/' + (route.params.shortId as string)
);
const shareTitle = computed(() =>
  matchRow.value?.title ? `${matchRow.value.title} — xPitch` : 'My match on xPitch'
);

const route = useRoute();
const router = useRouter();
const state = ref<'loading' | 'ready' | 'error' | 'notfound'>('loading');
const errMsg = ref('');
const matchRow = ref<any>(null);
let sessionIdBySeq: Record<number, string> = {};
let ownerId = '';

const isOwner = () => !!auth.user && auth.user.id === ownerId;
const owned = computed(() => state.value === 'ready' && isOwner());

// Unsaved analysis edits (format, age, sprint, manual split, applied pitch).
const dirty = ref(false);
const saving = ref(false);
const savedFlash = ref(false);

async function onSaveChanges() {
  if (!matchRow.value || saving.value) return;
  saving.value = true;
  try {
    const rows = await updateMatchFromCurrent(matchRow.value.id);
    sessionIdBySeq = {};
    rows.forEach((s) => (sessionIdBySeq[s.seq] = s.id));
    dirty.value = false;
    savedFlash.value = true;
    setTimeout(() => (savedFlash.value = false), 2500);
  } catch (e: any) {
    alert('Could not save changes: ' + (e?.message || e));
  } finally {
    saving.value = false;
  }
}

async function onTitle(e: Event) {
  const title = (e.target as HTMLInputElement).value.trim();
  matchRow.value.title = title;
  await updateMatchTitle(matchRow.value.id, title);
}
async function onVisibility(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  matchRow.value.visibility = v;
  await setMatchVisibility(matchRow.value.id, v);
}
async function onDelete() {
  if (!matchRow.value) return;
  if (!confirm('Delete this match and its files? This cannot be undone.')) return;
  await deleteMatch(matchRow.value);
  router.push('/' + (auth.profile?.username || ''));
}

async function load() {
  state.value = 'loading';
  if (!supabaseEnabled) {
    state.value = 'error';
    errMsg.value = 'Cloud features are not configured on this deployment.';
    return;
  }
  try {
    const shortId = route.params.shortId as string;
    const res = await getMatch(shortId);
    if (!res) {
      state.value = 'notfound';
      return;
    }
    matchRow.value = res.match;
    ownerId = res.match.owner_id;
    sessionIdBySeq = {};
    res.sessions.forEach((s: any) => (sessionIdBySeq[s.seq] = s.id));
    const parsed = res.rawFiles.map((f) => ({ name: f.name, fit: FitParser.parse(f.bytes) }));
    const fit = parsed.length === 1 ? parsed[0].fit : mergeFiles(parsed);
    const seq = route.params.seq ? parseInt(route.params.seq as string, 10) : undefined;
    loadFromCloud(fit, {
      shortId,
      ownerId,
      fileNames: res.match.file_names || res.rawFiles.map((f) => f.name),
      rawFiles: res.rawFiles,
      groupGapMin: res.match.group_gap_min ?? 10,
      options: res.sessions[0]?.analysis_options || { format: res.match.format },
      sessions: toCloudSessions(res.sessions),
      manualSplits: res.match.manual_splits || null,
      seq,
    });
    state.value = 'ready';
    // Options just set by loadFromCloud shouldn't count as edits.
    void nextTick(() => (dirty.value = false));
  } catch (e: any) {
    state.value = 'error';
    errMsg.value = e?.message || String(e);
  }
}

onMounted(load);
watch(() => route.params.shortId, load);

// Selecting a session via the URL segment.
watch(
  () => route.params.seq,
  (seq) => {
    if (state.value !== 'ready') return;
    const segs = nonCombinedSegments();
    const idx = seq ? parseInt(seq as string, 10) - 1 : 0;
    if (segs[idx] && segs[idx].id !== store.activeSegmentId) selectSegment(segs[idx].id);
  }
);

// Mark the match dirty when the owner edits analysis options / split / pitch.
// (Flips persist on their own via the watch below, so they're excluded here.)
watch(
  () => [
    store.options.format,
    store.options.age,
    store.options.maxHR,
    store.options.sprintKmh,
    store.manualSplits,
    store.appliedFieldId,
  ],
  () => {
    if (state.value === 'ready' && isOwner()) dirty.value = true;
  },
  { deep: true }
);

// Owner-only: persist flips to the active session (debounced).
let t: ReturnType<typeof setTimeout>;
watch(
  () => [store.attackDirs, store.sideDirs],
  () => {
    if (store.cloud.mode !== 'cloud' || !isOwner()) return;
    clearTimeout(t);
    t = setTimeout(() => {
      const segs = nonCombinedSegments();
      const idx = segs.findIndex((s) => s.id === store.activeSegmentId);
      if (idx < 0) return;
      const sid = sessionIdBySeq[idx + 1];
      if (!sid) return;
      const d = dirsForSegment(segs[idx]);
      void updateSessionDirs(sid, d.attacking_dir, d.side_dir, d.flips);
    }, 800);
  },
  { deep: true }
);
</script>

<template>
  <main>
    <p v-if="state === 'loading'" class="empty" style="padding: 48px; text-align: center">Loading match…</p>
    <p v-else-if="state === 'notfound'" class="empty" style="padding: 48px; text-align: center">
      Match not found, or it’s private.
    </p>
    <p v-else-if="state === 'error'" class="error" style="padding: 48px; text-align: center">{{ errMsg }}</p>
    <template v-else>
      <div class="sharebar">
        <span class="sb-label">Share this match</span>
        <ShareButtons :url="shareUrl" :title="shareTitle" />
      </div>
      <div v-if="owned" class="ownerbar">
        <input class="ob-title" :value="matchRow.title || ''" placeholder="Untitled match" @change="onTitle" />
        <label class="ob-vis">
          Visibility
          <select :value="matchRow.visibility" @change="onVisibility">
            <option value="unlisted">Unlisted (link only)</option>
            <option value="public">Public (on profile)</option>
            <option value="private">Private (only me)</option>
          </select>
        </label>
        <button class="btn primary small" :disabled="saving || !dirty" @click="onSaveChanges">
          {{ saving ? 'Saving…' : savedFlash ? 'Saved ✓' : dirty ? '💾 Save changes' : 'Saved' }}
        </button>
        <button class="btn ghost small ob-del" @click="onDelete">🗑 Delete</button>
      </div>
      <Dashboard />
    </template>
  </main>
</template>

<style scoped>
.sharebar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 10px 22px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.015);
}
.sb-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}
.ownerbar {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 22px;
  border-bottom: 1px solid var(--border);
}
.ob-title {
  flex: 1;
  min-width: 180px;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 15px;
  font-weight: 600;
}
.ob-vis {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ob-vis select {
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 13px;
  text-transform: none;
  letter-spacing: 0;
}
.ob-del:hover {
  border-color: var(--danger);
  color: var(--danger);
}
</style>

