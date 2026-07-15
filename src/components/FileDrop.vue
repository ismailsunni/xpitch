<script setup lang="ts">
import { ref } from 'vue';
import { store, loadFiles, loadDemo, loadSample } from '../store';

const dragging = ref(false);
const picker = ref<HTMLInputElement>();
const pendingFiles = ref<File[]>([]);

function stage(files: File[]) {
  pendingFiles.value = files;
  store.error = '';
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length) stage(Array.from(files));
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) stage(Array.from(input.files));
  // Let the user choose the same files again after a parse error.
  input.value = '';
}

function startUpload() {
  if (!pendingFiles.value.length) return;
  const files = pendingFiles.value;
  pendingFiles.value = [];
  void loadFiles(files);
}

function cancelSelection() {
  pendingFiles.value = [];
}
</script>

<template>
  <section
    class="dropzone"
    :class="{ drag: dragging }"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <div class="dz-inner">
      <div class="dz-icon">📂</div>
      <h2>Drop your <code>.fit</code> file(s) here</h2>
      <p>
        One or several files — matches recorded close together are grouped into one session
        automatically. Nothing is uploaded; parsing happens locally in your browser.
      </p>
      <p class="dz-or">
        No file handy? <button class="linkbtn" @click="loadSample">Load a real sample</button>
        <span style="color: var(--muted)"> — an afternoon of 4 mini-soccer matches</span>
      </p>
      <p style="font-size: 12.5px">
        or a <button class="linkbtn" @click="loadDemo">synthetic demo</button>
      </p>
      <input ref="picker" class="file-picker" type="file" accept=".fit,application/octet-stream" multiple @change="onPick" />
      <template v-if="pendingFiles.length">
        <div class="chosen-files">
          <strong>{{ pendingFiles.length }} file{{ pendingFiles.length === 1 ? '' : 's' }} selected</strong>
          <span>{{ pendingFiles.map((f) => f.name).join(', ') }}</span>
        </div>
        <div class="choose-actions">
          <button class="btn primary" @click="startUpload">Analyze file{{ pendingFiles.length === 1 ? '' : 's' }}</button>
          <button class="btn ghost" @click="cancelSelection">Cancel</button>
        </div>
      </template>
      <button v-else class="btn ghost" @click="picker?.click()">Choose .fit file(s)</button>
      <p v-if="store.loading" class="hint">Parsing…</p>
      <p v-else-if="store.files.length" class="hint">{{ store.files.length }} file{{ store.files.length === 1 ? '' : 's' }} loaded</p>
      <p v-if="store.error" class="error">{{ store.error }}</p>
    </div>
  </section>
</template>

<style scoped>
.file-picker { display: none; }
.chosen-files { display: grid; gap: 3px; max-width: 480px; margin: 12px auto 8px; font-size: 13px; }
.chosen-files span { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.choose-actions { display: flex; justify-content: center; gap: 8px; }
</style>
