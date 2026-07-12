<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps<{ url: string; title?: string }>();
const copied = ref(false);
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const canShare = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function';
const enc = encodeURIComponent;
const text = () => props.title || 'Check out this match on xPitch';

async function copy() {
  try {
    await navigator.clipboard.writeText(props.url);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* clipboard blocked */
  }
}
async function nativeShare() {
  try {
    await (navigator as any).share({ title: props.title || 'xPitch match', url: props.url });
  } catch {
    /* cancelled */
  }
}
// On mobile, tap opens the OS share sheet directly. On desktop, toggle the popover.
function onTrigger() {
  if (canShare) nativeShare();
  else open.value = !open.value;
}
function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <div class="share" ref="root">
    <button class="btn ghost small share-trigger" :class="{ on: open }" @click.stop="onTrigger">
      🔗 Share<span v-if="!canShare" class="caret" aria-hidden="true">▾</span>
    </button>
    <div v-if="open && !canShare" class="share-pop">
      <button class="btn ghost small" @click="copy">{{ copied ? 'Copied ✓' : '🔗 Copy link' }}</button>
      <a
        class="btn ghost small"
        :href="`https://wa.me/?text=${enc(text() + ' ' + url)}`"
        target="_blank"
        rel="noopener"
        >WhatsApp</a
      >
      <a
        class="btn ghost small"
        :href="`https://twitter.com/intent/tweet?text=${enc(text())}&url=${enc(url)}`"
        target="_blank"
        rel="noopener"
        >X</a
      >
    </div>
  </div>
</template>

<style scoped>
.share {
  position: relative;
  display: inline-flex;
}
.caret {
  margin-left: 6px;
  font-size: 10px;
  opacity: 0.7;
}
.share-pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--ctl-radius);
  box-shadow: var(--shadow);
  min-width: 160px;
}
.share-pop a {
  text-decoration: none;
  text-align: left;
}
</style>
