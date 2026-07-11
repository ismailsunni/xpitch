<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ url: string; title?: string }>();
const copied = ref(false);
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
</script>

<template>
  <div class="share">
    <button class="btn ghost small" @click="copy">{{ copied ? 'Copied ✓' : '🔗 Copy link' }}</button>
    <button v-if="canShare" class="btn ghost small" @click="nativeShare">Share…</button>
    <a class="btn ghost small" :href="`https://wa.me/?text=${enc(text() + ' ' + url)}`" target="_blank" rel="noopener">WhatsApp</a>
    <a class="btn ghost small" :href="`https://twitter.com/intent/tweet?text=${enc(text())}&url=${enc(url)}`" target="_blank" rel="noopener">X</a>
    <a class="btn ghost small" :href="`https://t.me/share/url?url=${enc(url)}&text=${enc(text())}`" target="_blank" rel="noopener">Telegram</a>
    <a class="btn ghost small" :href="`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`" target="_blank" rel="noopener">Facebook</a>
  </div>
</template>

<style scoped>
.share {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.share a {
  text-decoration: none;
}
</style>
