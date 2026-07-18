<script setup lang="ts">
withDefaults(defineProps<{ count?: number; variant?: 'card' | 'row' }>(), { count: 3, variant: 'card' });
</script>

<template>
  <div class="skeletons" :class="variant" role="status" aria-live="polite" aria-label="Loading content">
    <div v-for="index in count" :key="index" class="skeleton">
      <span class="line title"></span><span class="line"></span><span class="line short"></span>
    </div>
  </div>
</template>

<style scoped>
.skeletons { display: grid; gap: 14px; }
.skeletons.card { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.skeleton { display: grid; gap: 10px; min-height: 128px; padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-elev); }
.line { display: block; width: 100%; height: 12px; border-radius: 4px; background: linear-gradient(90deg, var(--bg-elev2) 25%, var(--border) 50%, var(--bg-elev2) 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
.line.title { width: 62%; height: 18px; }.line.short { width: 38%; }
@keyframes shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .line { animation: none; } }
</style>
