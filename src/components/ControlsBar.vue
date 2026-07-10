<script setup lang="ts">
import { store, recompute, flipAttack } from '../store';

function num(v: string): number | null {
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}
</script>

<template>
  <section class="controls">
    <div class="ctl">
      <span class="ctl-label">File</span>
      <span class="val" style="font-weight: 600; font-size: 13.5px">{{ store.fileName }}</span>
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
  </section>
</template>
