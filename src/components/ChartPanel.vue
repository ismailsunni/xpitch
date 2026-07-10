<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import Chart from 'chart.js/auto';

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
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <div class="chart-box"><canvas ref="canvas"></canvas></div>
</template>
