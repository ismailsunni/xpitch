<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { buildLegacyFeedHeatmap, downloadMatchMedia, type MatchMedia } from '../lib/api';
import MatchHeatmapPreview from './MatchHeatmapPreview.vue';
import type { PitchMode } from '../lib/pitch';

const props = defineProps<{ match: any; media: MatchMedia[]; sessions: any[] }>();
const photoUrls = ref<{ id: string; url: string; alt: string }[]>([]);
const legacyPositional = ref<any | null>(null);
const activeIndex = ref(0);
const paused = ref(false);
const reducedMotion = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const mediaKey = computed(() => props.media.map((media) => media.storage_path).join('|'));
const hasSavedHeatmap = computed(() =>
  props.sessions.some((session) => {
    const preview = session?.summary?.preview;
    return !!preview?.grid || (preview?.points || []).length > 1;
  })
);
const needsPitchAlignedPreview = computed(() =>
  !!props.match.primary_field_id &&
  props.sessions.some((session) => {
    const preview = session?.summary?.preview;
    return (!!preview?.grid || (preview?.points || []).length > 1) && preview?.hasField !== true;
  })
);
const hasHeatmap = computed(() => hasSavedHeatmap.value || !!legacyPositional.value);
const mapModes: PitchMode[] = ['heatmap', 'trail', 'zones'];
const slideCount = computed(() => photoUrls.value.length + (hasHeatmap.value ? mapModes.length : 0));
const activePhoto = computed(() => photoUrls.value[activeIndex.value]);
const activeMapMode = computed(() => mapModes[activeIndex.value - photoUrls.value.length] || null);

function revokePhotoUrls() {
  for (const photo of photoUrls.value) URL.revokeObjectURL(photo.url);
}
function startTimer() {
  if (timer) clearInterval(timer);
  if (slideCount.value > 1 && !paused.value && !reducedMotion.value) {
    timer = setInterval(() => (activeIndex.value = (activeIndex.value + 1) % slideCount.value), 4500);
  }
}
function selectSlide(index: number) {
  activeIndex.value = index;
  paused.value = true;
  startTimer();
}

watch(
  mediaKey,
  async (_key, _previous, onCleanup) => {
    let cancelled = false;
    onCleanup(() => (cancelled = true));
    revokePhotoUrls();
    photoUrls.value = [];
    const photos = await Promise.all(
      props.media.map(async (media) => {
        try {
          const blob = await downloadMatchMedia(media);
          return { id: media.id, url: URL.createObjectURL(blob), alt: media.caption || 'Match photo' };
        } catch {
          return null;
        }
      })
    );
    if (cancelled) {
      for (const photo of photos) if (photo) URL.revokeObjectURL(photo.url);
      return;
    }
    photoUrls.value = photos.filter(Boolean) as { id: string; url: string; alt: string }[];
    activeIndex.value = 0;
    startTimer();
  },
  { immediate: true }
);
watch([slideCount, paused, reducedMotion], startTimer);
watch(
  () => props.match.short_id,
  async () => {
    legacyPositional.value = null;
    if ((hasSavedHeatmap.value && !needsPitchAlignedPreview.value) || !props.match.file_names?.length) return;
    try {
      legacyPositional.value = await buildLegacyFeedHeatmap(props.match);
    } catch {
      // A legacy card remains text-only when its source file is unavailable.
    }
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  revokePhotoUrls();
});
onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  startTimer();
});
</script>

<template>
  <div v-if="slideCount" class="preview-carousel" @mouseenter="paused = true" @mouseleave="paused = false" @focusin="paused = true" @focusout="paused = false">
    <img v-if="activePhoto" :src="activePhoto.url" :alt="activePhoto.alt" />
    <MatchHeatmapPreview v-else-if="activeMapMode" :sessions="sessions" :positional="legacyPositional" :mode="activeMapMode" />
    <div v-if="slideCount > 1" class="carousel-dots" aria-label="Match previews">
      <button v-for="index in slideCount" :key="index" type="button" :class="{ active: index - 1 === activeIndex }" :aria-label="`Show preview ${index} of ${slideCount}`" :aria-current="index - 1 === activeIndex ? 'true' : undefined" @click="selectSlide(index - 1)"></button>
    </div>
  </div>
</template>

<style scoped>
.preview-carousel { position: relative; overflow: hidden; margin-top: 18px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-elev2); aspect-ratio: 105 / 68; }
.preview-carousel > img, .preview-carousel > :deep(.heatmap-preview) { width: 100%; height: 100%; object-fit: cover; }
.preview-carousel > :deep(.heatmap-preview) { display: grid; align-content: center; }
.carousel-dots { position: absolute; right: 8px; bottom: 8px; display: flex; gap: 4px; padding: 4px 5px; border-radius: 10px; background: rgba(0,0,0,.35); }
.carousel-dots button { width: 8px; height: 8px; padding: 0; border: 0; border-radius: 50%; background: rgba(255,255,255,.45); cursor: pointer; }.carousel-dots button.active { background: #fff; }
</style>
