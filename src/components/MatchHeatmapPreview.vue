<script setup lang="ts">
import { computed } from 'vue';
import PitchCanvas from './PitchCanvas.vue';
import type { PitchMode } from '../lib/pitch';

const props = withDefaults(defineProps<{ sessions: any[]; positional?: any | null; mode?: PitchMode }>(), { mode: 'heatmap' });
const GRID_X = 24;
const GRID_Y = 16;

const positional = computed(() => {
  if (props.positional) return props.positional;
  const preview = props.sessions
    .map((session) => session?.summary?.preview)
    .find((value) => value?.grid || value?.points?.length > 1);
  if (!preview) return null;
  if (preview.grid && preview.GX && preview.GY && preview.gridMax) {
    const points = (preview.points || []).map((point: any, index: number) => ({ ...point, tSec: point.tSec ?? index }));
    const zoneGrid = preview.zoneGrid || Array.from({ length: 3 }, (_, zoneY) =>
      Array.from({ length: 6 }, (_, zoneX) => {
        let total = 0;
        for (let y = Math.floor((zoneY * preview.GY) / 3); y < Math.floor(((zoneY + 1) * preview.GY) / 3); y++) {
          for (let x = Math.floor((zoneX * preview.GX) / 6); x < Math.floor(((zoneX + 1) * preview.GX) / 6); x++) total += preview.grid[y]?.[x] || 0;
        }
        return total;
      })
    );
    return { ...preview, points, zoneGrid };
  }

  // Older saved matches kept only sampled points. Rebuild the same heatmap input
  // shape so their feed preview remains useful without downloading the FIT file.
  const grid = Array.from({ length: GRID_Y }, () => Array<number>(GRID_X).fill(0));
  let totalU = 0;
  let totalV = 0;
  for (const point of preview.points) {
    const x = Math.max(0, Math.min(GRID_X - 1, Math.floor(point.u * GRID_X)));
    const y = Math.max(0, Math.min(GRID_Y - 1, Math.floor(point.v * GRID_Y)));
    grid[y][x]++;
    totalU += point.u;
    totalV += point.v;
  }
  const zoneGrid = Array.from({ length: 3 }, (_, zoneY) =>
    Array.from({ length: 6 }, (_, zoneX) => {
      let total = 0;
      for (let y = Math.floor((zoneY * GRID_Y) / 3); y < Math.floor(((zoneY + 1) * GRID_Y) / 3); y++) {
        for (let x = Math.floor((zoneX * GRID_X) / 6); x < Math.floor(((zoneX + 1) * GRID_X) / 6); x++) total += grid[y][x];
      }
      return total;
    })
  );
  return {
    ...preview,
    points: preview.points.map((point: any, index: number) => ({ ...point, tSec: point.tSec ?? index })),
    GX: GRID_X,
    GY: GRID_Y,
    grid,
    gridMax: Math.max(1, ...grid.flat()),
    zoneGrid,
    avgPos: { u: totalU / preview.points.length, v: totalV / preview.points.length },
  };
});
</script>

<template>
  <div v-if="positional" class="heatmap-preview"><PitchCanvas :positional="positional" :mode="mode" /></div>
</template>

<style scoped>
.heatmap-preview { width: 100%; overflow: hidden; background: var(--bg-elev2); }
.heatmap-preview :deep(.pitch-wrap), .heatmap-preview :deep(canvas) { width: 100%; display: block; }
</style>
