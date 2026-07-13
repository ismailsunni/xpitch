<script setup lang="ts">
// A small circled "i" that shows an explanation on hover/focus (native tooltip).
// Text comes from the shared glossary (lib/metrics.ts) so inline help and the
// Help page stay in sync.
defineProps<{ text?: string }>();
</script>

<template>
  <span v-if="text" class="infotip" :title="text" tabindex="0" role="img" :aria-label="text">i</span>
</template>

<style scoped>
.infotip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  margin-left: 5px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  color: var(--muted2);
  font-size: 9px;
  font-weight: 700;
  font-style: italic;
  line-height: 1;
  cursor: help;
  vertical-align: middle;
  flex: none;
}
.infotip:hover,
.infotip:focus-visible {
  color: var(--text);
  border-color: var(--text);
  outline: none;
}
</style>
