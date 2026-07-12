<script setup lang="ts">
import { computed } from 'vue';
import { store, selectSegment, selectPeriod, activeSegment, setGroupGap } from '../store';
import { auth } from '../lib/auth';

const seg = computed(() => activeSegment());
const multiFile = computed(() => store.files.length > 1);
const readOnly = computed(() => store.cloud.mode === 'cloud' && auth.user?.id !== store.cloud.ownerId);
const showBar = computed(
  () => store.segments.length > 1 || (seg.value?.periods.length || 0) > 0 || multiFile.value
);

function onGap(e: Event) {
  const n = parseFloat((e.target as HTMLInputElement).value);
  if (isFinite(n) && n >= 0) setGroupGap(n);
}
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

    <div class="seg-group" v-if="multiFile && !readOnly">
      <span class="k">Group within</span>
      <input
        type="number"
        class="gap-input"
        min="0"
        max="120"
        step="1"
        :value="store.options.groupGapMin"
        @change="onGap"
        title="Recordings closer than this become one session"
      />
      <span class="k">min</span>
    </div>
  </section>
</template>

<style scoped>
.gap-input {
  width: 58px;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: var(--ctl-pad-y-sm) 10px;
  line-height: var(--ctl-line-sm);
  font-size: 13px;
}
</style>
