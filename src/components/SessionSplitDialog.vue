<script setup lang="ts">
import SessionSplitEditor from './SessionSplitEditor.vue';
import { store } from '../store';
import { useDialog } from '../composables/useDialog';

function close() {
  store.sessionSplitEditorOpen = false;
}

const { dialogRef } = useDialog(close);
</script>

<template>
  <div class="split-overlay" @click.self="close">
    <section ref="dialogRef" class="split-dialog card" role="dialog" aria-modal="true" aria-labelledby="split-dialog-title">
      <header class="split-dialog-head">
        <div>
          <span class="eyebrow">Session setup</span>
          <h2 id="split-dialog-title">Edit sessions</h2>
        </div>
        <button class="btn ghost small" aria-label="Close session editor" @click="close">×</button>
      </header>
      <SessionSplitEditor />
      <footer class="split-dialog-foot">
        <button class="btn primary" @click="close">Done</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.split-overlay{position:fixed;inset:0;z-index:120;background:rgba(4,8,14,.72);display:grid;place-items:center;padding:18px}.split-dialog{width:min(860px,100%);max-height:calc(100vh - 36px);overflow:auto}.split-dialog-head{display:flex;justify-content:space-between;align-items:start;gap:12px;margin-bottom:18px}.split-dialog h2{margin:3px 0 0}.eyebrow{font:11px var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.split-dialog-foot{display:flex;justify-content:flex-end;margin-top:18px}
</style>
