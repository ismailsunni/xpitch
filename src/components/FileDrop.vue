<script setup lang="ts">
import { ref } from 'vue';
import { store, loadFiles, loadDemo } from '../store';

const dragging = ref(false);

function onDrop(e: DragEvent) {
  dragging.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length) loadFiles(Array.from(files));
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
        No file handy? <button class="linkbtn" @click="loadDemo">Load a demo match</button>
      </p>
      <p v-if="store.loading" class="hint">Parsing…</p>
      <p v-if="store.error" class="error">{{ store.error }}</p>
    </div>
  </section>
</template>
