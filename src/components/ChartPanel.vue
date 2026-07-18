<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import Chart from 'chart.js/auto';
import { theme } from '../lib/theme';

const props = defineProps<{ config: any }>();
const canvas = ref<HTMLCanvasElement>();
let chart: Chart | null = null;

function render() {
  if (!canvas.value) return;
  if (chart) chart.destroy();
  chart = new Chart(canvas.value.getContext('2d')!, props.config);
}

onMounted(render);
watch(() => props.config, render);
watch(() => theme.mode, render); // recolor axes/series on light↔dark switch
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <div class="chart-box"><canvas ref="canvas" role="img" :aria-label="config?.options?.plugins?.title?.text || 'Match analysis chart'"></canvas></div>
</template>
