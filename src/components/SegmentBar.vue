<script setup lang="ts">
import { computed } from 'vue';
import { store, selectSegment, selectPeriod, activeSegment } from '../store';

const seg = computed(() => activeSegment());
const showBar = computed(() => store.segments.length > 1 || (seg.value?.periods.length || 0) > 0);
</script>

<template>
  <section v-if="showBar" class="segbar">
    <div class="seg-group" v-if="store.segments.length > 1">
      <span class="k">Session</span>
      <div class="seg-pills">
        <button
          v-for="s in store.segments"
          :key="s.id"
          class="pill-btn"
          :class="{ active: s.id === store.activeSegmentId }"
          @click="selectSegment(s.id)"
        >
          {{ s.label }} <span class="sub">{{ s.sublabel }}</span>
        </button>
      </div>
    </div>

    <div class="seg-group" v-if="seg && seg.periods.length">
      <span class="k">Period</span>
      <div class="seg-pills">
        <button
          class="pill-btn"
          :class="{ active: store.activePeriod === -1 }"
          @click="selectPeriod(-1)"
        >
          Full
        </button>
        <button
          v-for="p in seg.periods"
          :key="p.index"
          class="pill-btn"
          :class="{ active: store.activePeriod === p.index }"
          @click="selectPeriod(p.index)"
        >
          {{ p.label }}
        </button>
      </div>
    </div>
  </section>
</template>
