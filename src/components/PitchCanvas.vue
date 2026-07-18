<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { drawPitch } from '../lib/pitch';
import type { PitchMode } from '../lib/pitch';
import { theme } from '../lib/theme';

const props = defineProps<{ positional: any; mode: PitchMode }>();
const canvas = ref<HTMLCanvasElement>();
let ro: ResizeObserver | null = null;

function draw() {
  if (canvas.value) drawPitch(canvas.value, props.positional, props.mode);
}

onMounted(() => {
  draw();
  ro = new ResizeObserver(() => draw());
  if (canvas.value?.parentElement) ro.observe(canvas.value.parentElement);
});
watch(() => [props.positional, props.mode], draw);
watch(() => theme.mode, draw); // recolour the pitch on light↔dark switch
onBeforeUnmount(() => ro?.disconnect());
</script>

<template>
  <div class="pitch-wrap"><canvas ref="canvas" role="img" :aria-label="`${mode} pitch map based on the selected match GPS data`"></canvas></div>
</template>
