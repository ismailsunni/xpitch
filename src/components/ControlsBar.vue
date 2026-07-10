<script setup lang="ts">
import { computed } from 'vue';
import { store, recompute, flipAttack, clearField, setFormat } from '../store';
import { FORMATS } from '../lib/analytics';

function num(v: string): number | null {
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

const hasGPS = computed(() => !!store.analytics?.meta?.hasGPS);
const usingField = computed(() => !!store.analytics?.positional?.hasField);
const fieldIgnored = computed(() => !!store.analytics?.positional?.fieldIgnored);

const formatOptions = Object.values(FORMATS);
// When 'auto', show what it resolved to (e.g. "Auto → Mini-soccer").
const resolvedFormat = computed(() => {
  const m = store.analytics?.meta;
  if (!m) return '';
  if (store.options.format === 'auto') return 'Auto → ' + (FORMATS[m.format]?.short || m.format);
  return FORMATS[m.format]?.short || '';
});
</script>

<template>
  <section class="controls">
    <div class="ctl">
      <span class="ctl-label">File</span>
      <span class="val" style="font-weight: 600; font-size: 13.5px">{{ store.fileName }}</span>
    </div>
    <div class="ctl">
      <label for="format">Format</label>
      <select
        id="format"
        class="ctl-select"
        :value="store.options.format"
        @change="setFormat(($event.target as HTMLSelectElement).value as any)"
      >
        <option v-for="f in formatOptions" :key="f.key" :value="f.key">{{ f.label }}</option>
      </select>
      <span class="hint" style="margin: 2px 0 0">{{ resolvedFormat }}</span>
    </div>
    <div class="ctl">
      <label for="age">Age</label>
      <input
        id="age"
        type="number"
        min="8"
        max="90"
        placeholder="—"
        :value="store.options.age ?? ''"
        @change="store.options.age = num(($event.target as HTMLInputElement).value); recompute()"
      />
    </div>
    <div class="ctl">
      <label for="maxhr">Max HR</label>
      <input
        id="maxhr"
        type="number"
        min="120"
        max="230"
        placeholder="auto"
        :value="store.options.maxHR ?? ''"
        @change="store.options.maxHR = num(($event.target as HTMLInputElement).value); recompute()"
      />
    </div>
    <div class="ctl">
      <label for="sprint">Sprint ≥ (km/h)</label>
      <input
        id="sprint"
        type="number"
        min="12"
        max="35"
        step="0.1"
        :value="store.options.sprintKmh"
        @change="store.options.sprintKmh = num(($event.target as HTMLInputElement).value) ?? 19.8; recompute()"
      />
    </div>
    <div class="ctl">
      <button class="btn ghost small" title="Swap which end of the pitch is 'attacking'" @click="flipAttack">
        ⇄ Flip attack direction
      </button>
    </div>

    <div class="ctl" v-if="hasGPS">
      <span class="ctl-label">Pitch</span>
      <div style="display: flex; gap: 8px; align-items: center">
        <button class="btn ghost small" @click="store.fieldEditorOpen = true">
          📐 {{ usingField ? 'Edit field' : 'Set field' }}
        </button>
        <span
          class="hint"
          style="margin: 0"
          :class="{ warn: fieldIgnored }"
          :title="fieldIgnored ? 'Saved field is >3 km away; using auto-inferred pitch' : ''"
        >
          <template v-if="usingField">custom ✓</template>
          <template v-else-if="fieldIgnored">field off-venue</template>
          <template v-else>auto-inferred</template>
        </span>
        <button v-if="usingField || fieldIgnored" class="linkbtn" style="font-size: 12px" @click="clearField">
          clear
        </button>
      </div>
    </div>
  </section>
</template>
