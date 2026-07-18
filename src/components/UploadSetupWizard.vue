<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import PitchCanvas from './PitchCanvas.vue';
import SessionSplitEditor from './SessionSplitEditor.vue';
import { auth } from '../lib/auth';
import { updateProfile } from '../lib/api';
import { deriveAge } from '../lib/format';
import { compute, FORMATS, type FormatKey } from '../lib/analytics';
import {
  allFields,
  appliedField,
  getCurrentFit,
  nonCombinedSegments,
  recompute,
  setDefaultMaxHR,
  setFormat,
  setSelectedField,
  openFieldEditor,
  store,
} from '../store';

type Step = 'pitch' | 'split' | 'orientation' | 'hr';
const step = ref<Step>('pitch');
const birthDate = ref('');
const error = ref('');
const savingBirthDate = ref(false);

const hasGps = computed(() => !!store.analytics?.meta?.hasGPS);
const hasHr = computed(() => !!getCurrentFit()?.records.some((r) => r.heart_rate != null && r.heart_rate > 0));
const needsBirthDate = computed(() => hasHr.value && !auth.profile?.birth_date);
const steps = computed<Step[]>(() => [
  ...(needsBirthDate.value ? ['hr' as Step] : []),
  'pitch',
  'split',
  ...(hasGps.value && !!store.selectedFieldId ? ['orientation' as Step] : []),
]);
const stepIndex = computed(() => steps.value.indexOf(step.value));
const title = computed(() => ({
  pitch: 'Match setup', split: 'Split the recording', orientation: 'Set attack direction', hr: 'Heart-rate setup',
}[step.value]));
const formatOptions = computed(() => Object.values(FORMATS).filter((f) => f.key !== 'auto'));
const automaticFieldLabel = computed(() => appliedField()?.name || 'nearby pitch');
const orientationPitches = computed(() => {
  const field = appliedField();
  return Object.fromEntries(
    nonCombinedSegments().map((seg) => [
      seg.id,
      compute(
        { records: seg.records, sessions: seg.session ? [seg.session] : [], laps: [], events: [], activity: null, file_id: null, other: {} },
        {
          attackingDir: store.attackDirs[`${seg.id}:-1`] ?? 1,
          sideDir: store.sideDirs[`${seg.id}:-1`] ?? 1,
          field: field?.corners || null,
          format: store.options.format,
        }
      ).positional,
    ])
  ) as Record<string, any>;
});

function setOrientation(segmentId: string, dir: number) {
  store.attackDirs[`${segmentId}:-1`] = dir;
  // Attacking left/right is a 180° rotation, matching flipAttack().
  store.sideDirs[`${segmentId}:-1`] = dir;
  store.activeSegmentId = segmentId;
  store.activePeriod = -1;
  recompute();
}
function flipOrientation(segmentId: string) {
  setOrientation(segmentId, (store.attackDirs[`${segmentId}:-1`] ?? 1) * -1);
}
function updateFormat(value: string) {
  setFormat(value as FormatKey);
}
function close() {
  store.uploadWizardOpen = false;
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}
onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
function continueFromHeartRate() {
  const i = stepIndex.value + 1;
  if (i < steps.value.length) step.value = steps.value[i];
  else close();
}
function skip() {
  if (step.value === 'hr') {
    setDefaultMaxHR();
    continueFromHeartRate();
    return;
  }
  close();
}
async function saveHeartRate() {
  error.value = '';
  if (!birthDate.value) {
    setDefaultMaxHR();
    continueFromHeartRate();
    return;
  }
  const age = deriveAge(birthDate.value);
  if (!age) {
    error.value = 'Enter a valid birth date.';
    return;
  }
  savingBirthDate.value = true;
  try {
    if (auth.user) await updateProfile({ birth_date: birthDate.value });
    store.options.age = age;
    store.options.maxHR = null;
    store.options.maxHRSource = null;
    recompute();
    continueFromHeartRate();
  } catch (e: any) {
    error.value = e?.message || 'Could not save your birth date.';
  } finally {
    savingBirthDate.value = false;
  }
}
function next() {
  error.value = '';
  const i = stepIndex.value + 1;
  if (i < steps.value.length) step.value = steps.value[i];
  else if (step.value === 'hr') void saveHeartRate();
  else close();
}
function previous() {
  const i = stepIndex.value - 1;
  if (i >= 0) step.value = steps.value[i];
}
</script>

<template>
  <div class="wizard-overlay" @click.self="close">
    <section class="wizard card" role="dialog" aria-modal="true" aria-labelledby="setup-title">
      <header class="wizard-head">
        <div>
          <span class="eyebrow">Upload setup · {{ stepIndex + 1 }}/{{ steps.length }}</span>
          <h2 id="setup-title">{{ title }}</h2>
        </div>
        <button v-if="step !== 'pitch' || !hasGps" class="btn ghost small" @click="skip">Skip for now</button>
      </header>

      <div v-if="step === 'pitch'" class="wizard-body">
        <label>Match name
          <input v-model="store.matchTitle" type="text" placeholder="e.g. Tuesday night mini soccer" />
        </label>
        <label>Match format
          <select :value="store.options.format" @change="updateFormat(($event.target as HTMLSelectElement).value)">
            <option value="auto">Auto-detect</option>
            <option v-for="f in formatOptions" :key="f.key" :value="f.key">{{ f.label }}</option>
          </select>
        </label>
        <p v-if="hasGps" class="hint">A pitch improves positional accuracy and unlocks attack-direction setup. You can continue without one and add it later.</p>
        <p v-else class="hint">This file has no GPS coordinates, so a pitch cannot be mapped to it.</p>
        <template v-if="hasGps">
          <label>Pitch
            <select :value="store.selectedFieldId || ''" @change="setSelectedField(($event.target as HTMLSelectElement).value || null)">
              <option value="">No pitch yet{{ automaticFieldLabel ? ` (nearby: ${automaticFieldLabel})` : '' }}</option>
              <option v-for="field in allFields()" :key="field.id" :value="field.id">{{ field.name }}</option>
            </select>
          </label>
          <button class="btn ghost" @click="openFieldEditor(undefined, 'match')">＋ Create a pitch</button>
        </template>
      </div>

      <div v-else-if="step === 'split'" class="wizard-body"><SessionSplitEditor /></div>

      <div v-else-if="step === 'orientation'" class="wizard-body">
        <p class="hint">For each session, choose the end you attacked. You can fine-tune this later from the match page.</p>
        <div class="orient-list"><div v-for="(seg, i) in nonCombinedSegments()" :key="seg.id" class="orient-row"><div class="orientation-preview"><PitchCanvas v-if="orientationPitches[seg.id]" :positional="orientationPitches[seg.id]" mode="trail" /></div><div class="orientation-controls"><strong>Session {{ i + 1 }}</strong><span class="hint">{{ seg.sublabel }}</span><button class="btn ghost small" @click="flipOrientation(seg.id)">{{ (store.attackDirs[`${seg.id}:-1`] ?? 1) === 1 ? '▶ Attacking' : 'Attacking ◀' }} · flip</button></div></div></div>
      </div>

      <div v-else class="wizard-body">
        <p>Your birth date is used to estimate your maximum heart rate (<strong>220 − age</strong>) and set HR zones.</p>
        <label>Birth date<input v-model="birthDate" type="date" /></label>
        <p class="hint">{{ auth.user ? 'It will be saved privately to your profile.' : 'It will be used only for this analysis.' }} If you skip it, we’ll use a common 190 bpm reference maximum.</p>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <footer class="wizard-foot"><div class="wizard-actions"><button class="btn ghost" @click="close">Cancel</button><button v-if="stepIndex > 0" class="btn ghost" @click="previous">Back</button></div><span></span><button v-if="step === 'hr'" class="btn primary" :disabled="savingBirthDate" @click="saveHeartRate">{{ savingBirthDate ? 'Saving…' : birthDate ? 'Continue' : 'Use 190 bpm' }}</button><button v-else class="btn primary" @click="next">{{ stepIndex + 1 < steps.length ? 'Continue' : 'Finish setup' }}</button></footer>
    </section>
  </div>
</template>

<style scoped>
.wizard-overlay{position:fixed;inset:0;z-index:120;background:rgba(4,8,14,.72);display:grid;place-items:center;padding:18px}.wizard{width:min(620px,100%);max-height:calc(100vh - 36px);overflow:auto}.wizard-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.wizard h2{margin:3px 0 0}.eyebrow,.timeline-label,.section-label{font:11px var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.section-label{margin-bottom:-7px!important}.wizard-body{display:grid;gap:14px;margin:18px 0}.wizard-body p{margin:0}.wizard label{display:grid;gap:6px;font-size:13px;font-weight:600}.wizard input,.wizard select{background:var(--bg-elev2);border:1px solid var(--border);border-radius:var(--ctl-radius);color:var(--text);padding:8px 10px;font:inherit}.timeline-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.timeline{height:180px;width:100%;background:var(--bg-elev2);border:1px solid var(--border);border-radius:10px;cursor:crosshair}.play-band{fill:rgba(200,247,81,.1)}.rest-band{fill:rgba(255,106,77,.16)}.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{padding:4px 9px;border-radius:16px;background:var(--bg-elev2);font-size:13px}.editable-chip{display:flex;align-items:center;gap:2px;padding:3px 6px}.editable-chip input{width:58px;border:0;background:transparent;padding:2px 3px;font:13px var(--font-mono);text-align:center}.editable-chip input:focus{outline:1px solid var(--accent);border-radius:6px}.chip button{border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:16px}.split-preview{display:grid;gap:7px;min-height:52px}.split-block{padding:9px 10px;border-radius:8px;background:var(--accent-tint);border:1px solid var(--accent-tint-strong);display:grid;grid-template-columns:100px 1fr auto auto;align-items:center;gap:10px;font-size:12px}.split-block>span{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.split-block.break{opacity:.65;background:var(--bg-elev2)}.session-switch{display:flex!important;grid-auto-flow:column;align-items:center;gap:6px;font-size:11px!important;cursor:pointer}.session-switch input{position:absolute;opacity:0;pointer-events:none}.switch-track{width:30px;height:17px;border-radius:10px;background:var(--c-coral);position:relative;transition:.15s}.switch-track::after{content:'';position:absolute;width:13px;height:13px;left:2px;top:2px;border-radius:50%;background:#fff;transition:.15s}.session-switch input:checked+.switch-track{background:var(--accent)}.session-switch input:checked+.switch-track::after{transform:translateX(13px)}.delete-session{border:0;background:transparent;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;padding:3px 5px}.delete-session:hover{color:var(--danger)}.delete-session:disabled{opacity:.35;cursor:not-allowed}.orient-list{display:grid;gap:8px}.orient-row{display:grid;grid-template-columns:190px 1fr;gap:12px;padding:10px;border:1px solid var(--border);border-radius:10px}.orientation-preview svg{display:block;width:100%;background:#1f5c39;border-radius:8px;overflow:hidden}.pl-edge{fill:none;stroke:rgba(255,255,255,.6);stroke-width:1}.pl-track{fill:none;stroke:var(--accent);stroke-width:1;stroke-opacity:.7;stroke-linejoin:round;stroke-linecap:round}.orientation-controls{display:grid;align-content:center;gap:5px}.orientation-controls>div{display:flex;gap:6px;flex-wrap:wrap}.btn.on{border-color:var(--accent);color:var(--accent-ink)}.wizard-foot{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;margin-top:18px}.wizard-actions{display:flex;gap:8px;flex-wrap:wrap}@media(max-width:540px){.orient-row{grid-template-columns:1fr}.wizard-head{flex-direction:column}.timeline-head{align-items:start;flex-direction:column}.timeline{height:140px}.split-block{grid-template-columns:1fr auto auto}.split-block>span{grid-column:1/-1;grid-row:2}}
</style>
