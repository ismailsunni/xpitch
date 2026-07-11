<script setup lang="ts">
import { ref } from 'vue';
import { store, setManualSplits, clearManualSplits, recordingDurationSec } from '../store';
import { fmtClock } from '../lib/format';

const total = recordingDurationSec();
const sessionBreaks = ref<number[]>([...(store.manualSplits?.sessionBreaks || [])].sort((a, b) => a - b));
const halfBreaks = ref<number[]>([...(store.manualSplits?.halfBreaks || [])].sort((a, b) => a - b));
const newSession = ref('');
const newHalf = ref('');
const err = ref('');

// "mm:ss" or plain minutes → seconds.
function parseTime(s: string): number | null {
  s = s.trim();
  if (!s) return null;
  if (s.includes(':')) {
    const [m, sec] = s.split(':').map(Number);
    if (isFinite(m) && isFinite(sec)) return m * 60 + sec;
    return null;
  }
  const min = Number(s);
  return isFinite(min) ? Math.round(min * 60) : null;
}

type Kind = 'session' | 'half';
const listFor = (k: Kind) => (k === 'session' ? sessionBreaks : halfBreaks);
const inputFor = (k: Kind) => (k === 'session' ? newSession : newHalf);

function addBreak(kind: Kind) {
  err.value = '';
  const raw = inputFor(kind);
  const t = parseTime(raw.value);
  if (t == null || t <= 0 || t >= total) {
    err.value = `Enter a time between 0:00 and ${fmtClock(total)} (mm:ss or minutes).`;
    return;
  }
  const list = listFor(kind);
  if (!list.value.includes(t)) list.value = [...list.value, t].sort((a, b) => a - b);
  raw.value = '';
}
function removeBreak(kind: Kind, t: number) {
  const list = listFor(kind);
  list.value = list.value.filter((x) => x !== t);
}

function apply() {
  setManualSplits(sessionBreaks.value, halfBreaks.value);
  close();
}
function reset() {
  clearManualSplits();
  close();
}
function close() {
  store.manualSplitOpen = false;
}
</script>

<template>
  <div class="ms-overlay">
    <div class="ms-modal card">
      <header class="ms-head">
        <h3 style="margin: 0">Split recording manually</h3>
        <button class="btn ghost small" @click="close">✕</button>
      </header>
      <p class="hint" style="margin: 6px 0 14px">
        Recording length <strong style="color: var(--text)">{{ fmtClock(total) }}</strong>. Enter break
        times (from the start, as <code>mm:ss</code> or minutes). Use the Overview speed/HR profile to
        spot them.
      </p>

      <div class="ms-col">
        <span class="k">Session breaks — start of a new match</span>
        <div class="chips">
          <span v-for="t in sessionBreaks" :key="t" class="chip">
            {{ fmtClock(t) }} <span class="x" @click="removeBreak('session', t)">✕</span>
          </span>
          <span v-if="!sessionBreaks.length" class="hint" style="margin: 0">none</span>
        </div>
        <div class="add">
          <input v-model="newSession" placeholder="e.g. 27:00" @keyup.enter="addBreak('session')" />
          <button class="btn ghost small" @click="addBreak('session')">Add</button>
        </div>
      </div>

      <div class="ms-col">
        <span class="k">Half breaks — where you switched ends</span>
        <div class="chips">
          <span v-for="t in halfBreaks" :key="t" class="chip">
            {{ fmtClock(t) }} <span class="x" @click="removeBreak('half', t)">✕</span>
          </span>
          <span v-if="!halfBreaks.length" class="hint" style="margin: 0">none</span>
        </div>
        <div class="add">
          <input v-model="newHalf" placeholder="e.g. 12:30" @keyup.enter="addBreak('half')" />
          <button class="btn ghost small" @click="addBreak('half')">Add</button>
        </div>
      </div>

      <p v-if="err" class="error" style="margin: 4px 0 0">{{ err }}</p>

      <footer class="ms-foot">
        <button class="btn ghost small" @click="reset">Clear (automatic)</button>
        <div style="display: flex; gap: 10px">
          <button class="btn ghost small" @click="close">Cancel</button>
          <button class="btn primary" @click="apply">Apply split</button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.ms-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 14, 0.72);
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}
.ms-modal {
  width: min(520px, 100%);
}
.ms-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ms-col {
  margin: 14px 0;
}
.ms-col .k {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  margin-bottom: 8px;
}
.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.chip {
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 4px 10px;
  font-size: 13px;
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.chip .x {
  cursor: pointer;
  color: var(--muted);
  font-size: 11px;
}
.chip .x:hover {
  color: var(--danger);
}
.add {
  display: flex;
  gap: 8px;
}
.add input {
  width: 120px;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 13px;
}
.ms-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 18px;
}
</style>
