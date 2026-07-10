<script setup lang="ts">
import { ref } from 'vue';
import { store, loadFile, loadDemo } from '../store';

const dragging = ref(false);

function onDrop(e: DragEvent) {
  dragging.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
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
      <h2>Drop your <code>.fit</code> file here</h2>
      <p>
        or use <strong>Open .fit file</strong> above. Nothing is uploaded — parsing happens
        locally in your browser.
      </p>
      <p class="dz-or">
        No file handy? <button class="linkbtn" @click="loadDemo">Load a demo match</button>
      </p>
      <p v-if="store.loading" class="hint">Parsing…</p>
      <p v-if="store.error" class="error">{{ store.error }}</p>
    </div>
  </section>
</template>
