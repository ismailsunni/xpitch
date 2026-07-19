<script setup lang="ts">
import { computed } from 'vue';
import { store, recompute, setGroupGap } from '../store';
import { auth } from '../lib/auth';
import { deriveAge } from '../lib/format';

// Revealed by the gear in the match line. Holds the analysis parameters plus
// the session-structure config (how the upload is grouped / split). Owner-only.
const readOnly = computed(() => store.cloud.mode === 'cloud' && auth.user?.id !== store.cloud.ownerId);
const multiFile = computed(() => store.files.length > 1);

function num(v: string): number | null {
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}
function onGap(e: Event) {
  const n = parseFloat((e.target as HTMLInputElement).value);
  if (isFinite(n) && n >= 0) setGroupGap(n);
}
</script>

<template>
  <section v-show="store.settingsOpen && !readOnly" class="settings">
    <span class="stitle">Analysis settings</span>
    <div class="settings-body">
      <div class="fld">
        <label for="age">Age</label>
        <input
          id="age"
          type="number"
          min="8"
          max="90"
          placeholder="—"
          title="Used to estimate max HR for heart-rate zones"
          :value="store.options.age ?? deriveAge(auth.profile?.birth_date) ?? ''"
          @change="store.options.age = num(($event.target as HTMLInputElement).value); if (store.options.maxHRSource === 'default') { store.options.maxHR = null; store.options.maxHRSource = null; } recompute()"
        />
      </div>
      <div class="fld">
        <label for="maxhr">Max HR</label>
        <input
          id="maxhr"
          type="number"
          min="120"
          max="230"
          placeholder="auto"
            :value="store.options.maxHR ?? auth.profile?.max_hr ?? ''"
          @change="store.options.maxHR = num(($event.target as HTMLInputElement).value); store.options.maxHRSource = store.options.maxHR ? 'entered' : null; recompute()"
        />
      </div>
      <div class="fld">
        <label for="resthr">Rest HR</label>
        <div class="with-unit">
          <input
            id="resthr"
            type="number"
            min="35"
            max="110"
            placeholder="optional"
            :value="store.options.restHR ?? auth.profile?.rest_hr ?? ''"
            @change="store.options.restHR = num(($event.target as HTMLInputElement).value); recompute()"
          />
          <span class="unit">bpm</span>
        </div>
      </div>
      <div class="fld">
        <label for="sprint">Sprint ≥</label>
        <div class="with-unit">
          <input
            id="sprint"
            type="number"
            min="12"
            max="35"
            step="0.1"
            :value="store.options.sprintKmh"
            @change="store.options.sprintKmh = num(($event.target as HTMLInputElement).value) ?? 25.2; recompute()"
          />
          <span class="unit">km/h</span>
        </div>
      </div>

      <div class="sep"></div>

      <div class="fld" v-if="multiFile">
        <span class="lbl">Files</span>
        <span class="ok">each file is a session</span>
      </div>
      <div class="fld" v-else>
        <label for="gap">Group within</label>
        <div class="with-unit">
          <input
            id="gap"
            type="number"
            min="0"
            max="120"
            step="1"
            title="Recordings closer together than this become one session"
            :value="store.options.groupGapMin"
            @change="onGap"
          />
          <span class="unit">min</span>
        </div>
      </div>
      <div v-if="store.cloud.mode === 'local'" class="fld">
        <span class="lbl">Sessions</span>
        <div class="with-unit">
          <button class="btn ghost small" @click="store.sessionSplitEditorOpen = true">Edit sessions</button>
          <span v-if="store.manualSplits" class="ok">manual ✓</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings {
  border-bottom: 1px solid var(--border);
  background: var(--bg-elev);
}
.stitle {
  display: block;
  padding: 12px 22px 0;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dim);
}
.settings-body {
  display: flex;
  align-items: flex-end;
  gap: 18px;
  flex-wrap: wrap;
  padding: 12px 22px 16px;
}
.fld {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.fld label,
.fld .lbl {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}
.fld input {
  width: 92px;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: var(--ctl-pad-y) var(--ctl-pad-x);
  line-height: var(--ctl-line);
  font-size: 13px;
}
.with-unit {
  display: flex;
  align-items: center;
  gap: 8px;
}
.with-unit input {
  width: 72px;
}
.unit {
  font-size: 12px;
  color: var(--muted2);
}
.ok {
  font-size: 12px;
  color: var(--accent-ink);
}
.sep {
  width: 1px;
  align-self: stretch;
  background: var(--border);
  margin: 2px 0;
}
@media (max-width: 900px) {
  .stitle {
    padding: 12px 14px 0;
  }
  .settings-body {
    padding: 12px 14px 16px;
    gap: 14px;
  }
  .sep {
    display: none;
  }
}
</style>
