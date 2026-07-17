<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getMatch,
  toCloudSessions,
  updateMatchFromCurrent,
  setMatchVisibility,
  updateMatchTitle,
  deleteMatch,
  getMatchPrivateNote,
  saveMatchPrivateNote,
  listMatchMedia,
  uploadMatchPhoto,
  downloadMatchMedia,
  updateMatchMedia,
  deleteMatchMedia,
  type MatchMedia,
} from '../lib/api';
import { store, getRawFiles, loadFromCloud, nonCombinedSegments, recompute, selectSegment, setSelectedField } from '../store';
import * as FitParser from '../lib/fit-parser';
import { mergeFiles } from '../lib/segmentation';
import { auth } from '../lib/auth';
import { supabaseEnabled } from '../lib/supabase';
import Dashboard from '../components/Dashboard.vue';
import ShareButtons from '../components/ShareButtons.vue';
import ShareImageModal from '../components/ShareImageModal.vue';

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
const editMode = ref(false);
const shareImageOpen = ref(false);
const draftTitle = ref('');
const draftVisibility = ref('unlisted');
const noteDraft = ref('');
const noteSaved = ref('');
const noteSaving = ref(false);
const mediaLoading = ref(false);
const mediaUploading = ref(false);
const mediaItems = ref<{ row: MatchMedia; url: string }[]>([]);
let editSnapshot: {
  title: string;
  visibility: string;
  options: typeof store.options;
  selectedFieldId: string | null;
  manualSplits: typeof store.manualSplits;
  breakSessionStarts: number[];
  attackDirs: Record<string, number>;
  sideDirs: Record<string, number>;
} | null = null;

const hasDraftChanges = computed(
  () =>
    !!matchRow.value &&
    (draftTitle.value.trim() !== (matchRow.value.title || '') ||
      draftVisibility.value !== (matchRow.value.visibility || 'unlisted'))
);
const hasUnsavedChanges = computed(() => dirty.value || hasDraftChanges.value);
const fitDownloadLabel = computed(() => (getRawFiles().length > 1 ? 'Download .fit files' : 'Download .fit'));
const hasNoteChanges = computed(() => noteDraft.value !== noteSaved.value);

function revokeMediaUrls() {
  mediaItems.value.forEach((item) => URL.revokeObjectURL(item.url));
  mediaItems.value = [];
}

function downloadFitFiles() {
  const files = getRawFiles();
  for (const file of files) {
    const name = file.name.toLowerCase().endsWith('.fit') ? file.name : `${file.name}.fit`;
    const url = URL.createObjectURL(new Blob([file.bytes], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function beginEdit() {
  if (!matchRow.value) return;
  editSnapshot = {
    title: matchRow.value.title || '',
    visibility: matchRow.value.visibility || 'unlisted',
    options: { ...store.options },
    selectedFieldId: store.selectedFieldId,
    manualSplits: store.manualSplits
      ? { sessionBreaks: [...store.manualSplits.sessionBreaks], halfBreaks: [...store.manualSplits.halfBreaks] }
      : null,
    breakSessionStarts: [...store.breakSessionStarts],
    attackDirs: { ...store.attackDirs },
    sideDirs: { ...store.sideDirs },
  };
  draftTitle.value = editSnapshot.title;
  draftVisibility.value = editSnapshot.visibility;
  editMode.value = true;
}

async function onSaveChanges() {
  if (!matchRow.value || saving.value) return;
  saving.value = true;
  try {
    const title = draftTitle.value.trim();
    if (title !== (matchRow.value.title || '')) {
      await updateMatchTitle(matchRow.value.id, title);
      matchRow.value.title = title;
      store.matchTitle = title;
    }
    if (draftVisibility.value !== matchRow.value.visibility) {
      await setMatchVisibility(matchRow.value.id, draftVisibility.value);
      matchRow.value.visibility = draftVisibility.value;
    }
    const rows = await updateMatchFromCurrent(matchRow.value.id);
    sessionIdBySeq = {};
    rows.forEach((s) => (sessionIdBySeq[s.seq] = s.id));
    dirty.value = false;
    editMode.value = false;
    editSnapshot = null;
    savedFlash.value = true;
    setTimeout(() => (savedFlash.value = false), 2500);
  } catch (e: any) {
    alert('Could not save changes: ' + (e?.message || e));
  } finally {
    saving.value = false;
  }
}

async function saveNote() {
  if (!matchRow.value || noteSaving.value) return;
  noteSaving.value = true;
  try {
    await saveMatchPrivateNote(matchRow.value.id, ownerId, noteDraft.value);
    noteSaved.value = noteDraft.value;
    savedFlash.value = true;
    setTimeout(() => (savedFlash.value = false), 2500);
  } catch (e: any) {
    alert('Could not save note: ' + (e?.message || e));
  } finally {
    noteSaving.value = false;
  }
}

async function refreshMedia() {
  if (!matchRow.value) return;
  mediaLoading.value = true;
  try {
    const rows = await listMatchMedia(matchRow.value.id);
    const next: { row: MatchMedia; url: string }[] = [];
    for (const row of rows) {
      const blob = await downloadMatchMedia(row);
      next.push({ row, url: URL.createObjectURL(blob) });
    }
    revokeMediaUrls();
    mediaItems.value = next;
  } catch (e) {
    console.warn('Could not load match media', e);
  } finally {
    mediaLoading.value = false;
  }
}

async function onPhotoUpload(event: Event) {
  if (!matchRow.value || mediaUploading.value) return;
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;
  mediaUploading.value = true;
  try {
    for (const file of files) await uploadMatchPhoto(matchRow.value, file);
    await refreshMedia();
  } catch (e: any) {
    alert('Could not upload photo: ' + (e?.message || e));
  } finally {
    mediaUploading.value = false;
  }
}

async function saveMedia(item: { row: MatchMedia; url: string }) {
  try {
    await updateMatchMedia(item.row.id, {
      caption: item.row.caption?.trim() || null,
      visibility: item.row.visibility,
    });
  } catch (e: any) {
    alert('Could not save photo: ' + (e?.message || e));
  }
}

async function removeMedia(item: { row: MatchMedia; url: string }) {
  if (!confirm('Delete this photo?')) return;
  try {
    await deleteMatchMedia(item.row);
    URL.revokeObjectURL(item.url);
    mediaItems.value = mediaItems.value.filter((m) => m.row.id !== item.row.id);
  } catch (e: any) {
    alert('Could not delete photo: ' + (e?.message || e));
  }
}

function cancelEdit() {
  if (!editSnapshot || !matchRow.value) {
    editMode.value = false;
    return;
  }
  draftTitle.value = editSnapshot.title;
  draftVisibility.value = editSnapshot.visibility;
  store.matchTitle = editSnapshot.title;
  Object.assign(store.options, editSnapshot.options);
  setSelectedField(editSnapshot.selectedFieldId);
  store.manualSplits = editSnapshot.manualSplits
    ? { sessionBreaks: [...editSnapshot.manualSplits.sessionBreaks], halfBreaks: [...editSnapshot.manualSplits.halfBreaks] }
    : null;
  store.breakSessionStarts = [...editSnapshot.breakSessionStarts];
  store.attackDirs = { ...editSnapshot.attackDirs };
  store.sideDirs = { ...editSnapshot.sideDirs };
  recompute();
  editMode.value = false;
  editSnapshot = null;
  void nextTick(() => (dirty.value = false));
}
async function onDelete() {
  if (!matchRow.value) return;
  if (!confirm('Delete this match and its files? This cannot be undone.')) return;
  await deleteMatch(matchRow.value);
  router.push('/' + (auth.profile?.username || ''));
}

async function load() {
  state.value = 'loading';
  revokeMediaUrls();
  noteDraft.value = '';
  noteSaved.value = '';
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
    store.matchTitle = res.match.title || '';
    draftTitle.value = res.match.title || '';
    draftVisibility.value = res.match.visibility || 'unlisted';
    ownerId = res.match.owner_id;
    if (isOwner()) {
      noteSaved.value = await getMatchPrivateNote(res.match.id);
      noteDraft.value = noteSaved.value;
    }
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
      cloudFields: res.primaryField
        ? [
            {
              id: res.primaryField.id,
              slug: res.primaryField.slug,
              name: res.primaryField.name,
              corners: res.primaryField.corners,
              visibility: res.primaryField.visibility,
            },
          ]
        : undefined,
      manualSplits: res.match.manual_splits || null,
      selectedFieldId: res.match.primary_field_id || null,
      breakFiles: res.match.break_files || [],
      breakSessionStarts: res.match.break_session_starts || [],
      seq,
    });
    state.value = 'ready';
    void refreshMedia();
    // Options just set by loadFromCloud shouldn't count as edits.
    void nextTick(() => (dirty.value = false));
  } catch (e: any) {
    state.value = 'error';
    errMsg.value = e?.message || String(e);
  }
}

onMounted(load);
onUnmounted(revokeMediaUrls);
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

// Mark the match dirty when the owner edits analysis options, split, pitch, or orientation.
watch(
  () => [
    store.options.format,
    store.options.age,
    store.options.maxHR,
    store.options.maxHRSource,
    store.options.sprintKmh,
    store.options.highIntensityKmh,
    store.manualSplits,
    store.breakSessionStarts,
    store.appliedFieldId,
    store.selectedFieldId,
    store.attackDirs,
    store.sideDirs,
  ],
  () => {
    if (state.value === 'ready' && isOwner() && editMode.value) dirty.value = true;
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
      <header class="match-head">
        <div class="mh-title">
          <input
            v-if="owned && editMode"
            class="mh-title-input"
            v-model="draftTitle"
            placeholder="Untitled match"
            aria-label="Match title"
          />
          <h1 v-else>{{ matchRow.title || 'Untitled match' }}</h1>
        </div>
        <div class="mh-actions">
          <label v-if="owned && editMode" class="mh-vis">
            <span class="mh-vis-k">Visibility</span>
            <select v-model="draftVisibility">
              <option value="unlisted">Unlisted (link only)</option>
              <option value="public">Public (on profile)</option>
              <option value="private">Private (only me)</option>
            </select>
          </label>
          <span v-else-if="owned" class="mh-vis-read">{{ matchRow.visibility }}</span>
          <span v-if="owned && editMode && hasUnsavedChanges" class="unsaved-note">Unsaved changes</span>
          <button v-if="owned && !editMode" class="btn ghost small" @click="beginEdit">Edit match</button>
          <button v-if="owned && editMode" class="btn ghost small" :disabled="saving" @click="cancelEdit">Cancel</button>
          <button
            v-if="owned && editMode"
            class="btn primary small"
            :disabled="saving || !hasUnsavedChanges"
            @click="onSaveChanges"
          >
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
          <span v-else-if="owned && savedFlash" class="saved-note">Saved ✓</span>
          <button class="btn ghost small" :disabled="!getRawFiles().length" @click="downloadFitFiles">
            {{ fitDownloadLabel }}
          </button>
          <button class="btn ghost small" @click="shareImageOpen = true">Share image</button>
          <ShareButtons :url="shareUrl" :title="shareTitle" />
          <button v-if="owned" class="btn ghost small mh-del" title="Delete match" @click="onDelete">🗑</button>
        </div>
      </header>
      <section v-if="owned || mediaItems.length" class="match-extras">
        <div v-if="owned" class="match-panel note-panel">
          <div class="panel-head">
            <h2>Private note</h2>
            <button class="btn primary small" :disabled="noteSaving || !hasNoteChanges" @click="saveNote">
              {{ noteSaving ? 'Saving…' : 'Save note' }}
            </button>
          </div>
          <textarea
            v-model="noteDraft"
            rows="4"
            placeholder="Only you can see this note."
            aria-label="Private match note"
          ></textarea>
        </div>

        <div class="match-panel photo-panel">
          <div class="panel-head">
            <h2>Photos</h2>
            <label v-if="owned" class="btn ghost small upload-btn">
              {{ mediaUploading ? 'Uploading…' : 'Add photos' }}
              <input type="file" accept="image/*" multiple :disabled="mediaUploading" @change="onPhotoUpload" />
            </label>
          </div>
          <p v-if="mediaLoading" class="hint">Loading photos…</p>
          <p v-else-if="!mediaItems.length" class="hint">No photos yet.</p>
          <div v-else class="photo-grid">
            <article v-for="item in mediaItems" :key="item.row.id" class="photo-card">
              <img :src="item.url" :alt="item.row.caption || 'Match photo'" />
              <div v-if="owned" class="photo-edit">
                <input
                  v-model="item.row.caption"
                  placeholder="Caption"
                  aria-label="Photo caption"
                  @blur="saveMedia(item)"
                />
                <div class="photo-actions">
                  <select v-model="item.row.visibility" aria-label="Photo visibility" @change="saveMedia(item)">
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                  <button class="btn ghost small" @click="removeMedia(item)">Delete</button>
                </div>
              </div>
              <p v-else-if="item.row.caption" class="photo-caption">{{ item.row.caption }}</p>
            </article>
          </div>
        </div>
      </section>
      <Dashboard :editing-match="editMode" />
      <ShareImageModal v-if="shareImageOpen" @close="shareImageOpen = false" />
    </template>
  </main>
</template>

<style scoped>
/* Unified match header: title on the left, action cluster on the right.
   Emerald accent wash + left bar so it reads as the page header, not another dark strip. */
.match-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  background: linear-gradient(90deg, rgba(200, 247, 81, 0.12), rgba(200, 247, 81, 0.02) 55%, transparent);
}
.mh-title {
  min-width: 0;
  flex: 1;
}
.mh-title h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Editable title styled like a heading, not a boxy full-width field. */
.mh-title-input {
  width: 100%;
  max-width: 460px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: 4px 8px;
  margin-left: -8px;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  transition: 0.15s;
}
.mh-title-input:hover {
  border-color: var(--border);
  background: rgba(255, 255, 255, 0.03);
}
.mh-title-input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--bg-elev2);
}
.mh-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.mh-vis {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.mh-vis-read {
  color: var(--muted);
  font-size: 12.5px;
  text-transform: capitalize;
}
.unsaved-note {
  color: var(--accent-ink);
  background: var(--accent-tint);
  border: 1px solid var(--accent-tint-strong);
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 12px;
  font-weight: 700;
}
.mh-vis-k {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}
.mh-vis select {
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: var(--ctl-pad-y-sm) 10px;
  line-height: var(--ctl-line-sm);
  font-size: 13px;
  cursor: pointer;
}
.mh-del:hover {
  border-color: var(--danger);
  color: var(--danger);
}
.match-extras {
  display: grid;
  grid-template-columns: minmax(260px, 0.85fr) minmax(320px, 1.15fr);
  gap: 14px;
  padding: 16px 22px 0;
}
.match-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elev);
  padding: 14px;
  min-width: 0;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.panel-head h2 {
  margin: 0;
  font-size: 15px;
  line-height: 1.2;
}
.note-panel textarea {
  width: 100%;
  resize: vertical;
  min-height: 104px;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: 10px 12px;
  font: inherit;
  line-height: 1.45;
}
.upload-btn {
  position: relative;
  overflow: hidden;
}
.upload-btn input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.photo-card {
  min-width: 0;
}
.photo-card img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elev2);
}
.photo-edit {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}
.photo-edit input,
.photo-edit select {
  width: 100%;
  min-width: 0;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: 8px 9px;
  font: inherit;
  font-size: 13px;
}
.photo-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.photo-caption {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.35;
}
@media (max-width: 640px) {
  .match-head {
    padding: 14px;
    gap: 12px;
  }
  .mh-title {
    flex-basis: 100%;
  }
  .mh-title h1,
  .mh-title-input {
    font-size: 20px;
  }
  .mh-vis-k {
    display: none;
  }
  /* Actions drop to their own full-width row and space out evenly. */
  .mh-actions {
    width: 100%;
    gap: 8px;
  }
  .mh-vis,
  .mh-vis select {
    flex: 1;
    min-width: 0;
  }
  .match-extras {
    grid-template-columns: 1fr;
    padding: 14px 14px 0;
  }
  .photo-grid {
    grid-template-columns: 1fr;
  }
}
</style>
