<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { getMatch, toCloudSessions, updateSessionDirs } from '../lib/api';
import { store, loadFromCloud, nonCombinedSegments, dirsForSegment, selectSegment } from '../store';
import * as FitParser from '../lib/fit-parser';
import { mergeFiles } from '../lib/segmentation';
import { auth } from '../lib/auth';
import { supabaseEnabled } from '../lib/supabase';
import Dashboard from '../components/Dashboard.vue';

const route = useRoute();
const state = ref<'loading' | 'ready' | 'error' | 'notfound'>('loading');
const errMsg = ref('');
let sessionIdBySeq: Record<number, string> = {};
let ownerId = '';

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
      seq,
    });
    state.value = 'ready';
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

// Owner-only: persist flips to the active session (debounced).
const isOwner = () => !!auth.user && auth.user.id === ownerId;
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
    <Dashboard v-else />
  </main>
</template>
