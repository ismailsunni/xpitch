<script setup lang="ts">
import { computed } from 'vue';
import { store, selectSegment, selectPeriod, activeSegment } from '../store';

const props = defineProps<{ editing?: boolean }>();
const emit = defineEmits<{ editSessions: [] }>();

// Pure chooser: pick a session / period. Grouping and manual split are config
// (in the gear settings), not part of choosing.
const seg = computed(() => activeSegment());
const showBar = computed(() => props.editing || store.segments.length > 1 || (seg.value?.periods.length || 0) > 0);
</script>

<template>
  <section v-if="showBar" class="segbar">
    <div class="seg-group session-pills" v-if="store.segments.length > 1">
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

    <!-- Mobile: the session pills become a dropdown to save space. -->
    <div class="seg-group session-select" v-if="store.segments.length > 1">
      <span class="k">Session</span>
      <select
        class="seg-dropdown"
        :value="store.activeSegmentId"
        @change="selectSegment(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="s in store.segments" :key="s.id" :value="s.id">{{ s.label }} · {{ s.sublabel }}</option>
      </select>
    </div>

    <div class="seg-group" v-if="seg && seg.periods.length">
      <span class="k">Period</span>
      <div class="seg-pills">
        <button class="pill-btn" :class="{ active: store.activePeriod === -1 }" @click="selectPeriod(-1)">Full</button>
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
    <button v-if="props.editing" class="btn ghost small edit-sessions" @click="emit('editSessions')">Edit sessions</button>
  </section>
</template>

<style scoped>
.seg-dropdown {
  min-width: 0;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: var(--ctl-pad-y-sm) 10px;
  line-height: var(--ctl-line-sm);
  font-size: 13px;
  cursor: pointer;
  max-width: 100%;
}
/* Pills on desktop, dropdown on mobile. */
.session-select {
  display: none;
}
.edit-sessions {
  margin-left: auto;
}
@media (max-width: 640px) {
  .session-pills {
    display: none;
  }
  .session-select {
    display: flex;
    width: 100%;
    min-width: 0;
    flex-wrap: nowrap;
  }
  .seg-dropdown {
    flex: 1;
    width: 100%;
  }
  .edit-sessions {
    margin-left: 0;
  }
}
</style>
