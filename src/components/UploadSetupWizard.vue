<script setup lang="ts">
import { computed, ref } from 'vue';
import { auth } from '../lib/auth';
import { updateProfile } from '../lib/api';
import { deriveAge, fmtClock } from '../lib/format';
import { buildFieldTransform, buildPitchTransform } from '../lib/geo';
import {
  allFields,
  appliedField,
  getCurrentFit,
  nonCombinedSegments,
  recordingDurationSec,
  recompute,
  setDefaultMaxHR,
  setBreakFiles,
  setManualSplits,
  setSelectedField,
  store,
} from '../store';

type Step = 'pitch' | 'split' | 'orientation' | 'hr';
const step = ref<Step>('pitch');
const newBreak = ref('');
const birthDate = ref('');
const error = ref('');
const savingBirthDate = ref(false);
const sessionBreaks = ref<number[]>([...(store.manualSplits?.sessionBreaks || [])].sort((a, b) => a - b));

const hasGps = computed(() => !!store.analytics?.meta?.hasGPS);
const hasHr = computed(() => !!getCurrentFit()?.records.some((r) => r.heart_rate != null && r.heart_rate > 0));
const needsBirthDate = computed(() => hasHr.value && !auth.profile?.birth_date);
const steps = computed<Step[]>(() => [
  'pitch',
  'split',
  ...(hasGps.value ? ['orientation' as Step] : []),
  ...(needsBirthDate.value ? ['hr' as Step] : []),
]);
const stepIndex = computed(() => steps.value.indexOf(step.value));
const title = computed(() => ({
  pitch: 'Choose your pitch', split: 'Split the recording', orientation: 'Set attack direction', hr: 'Heart-rate setup',
}[step.value]));
const series = computed(() => {
  const all = (getCurrentFit()?.records || []).filter((r) => r.timestamp != null);
  const records = all.filter((r) => r.heart_rate != null && r.heart_rate > 0);
  if (!records.length) return [] as { t: number; hr: number }[];
  const start = all[0].timestamp as number;
  return records.map((r) => ({ t: (r.timestamp as number) - start, hr: r.heart_rate as number }));
});
const maxTime = computed(() => recordingDurationSec() || series.value[series.value.length - 1]?.t || 1);
const automaticFieldLabel = computed(() => appliedField()?.name || 'nearby pitch');
const minHr = computed(() => Math.min(...series.value.map((p) => p.hr), 50));
const maxHr = computed(() => Math.max(...series.value.map((p) => p.hr), minHr.value + 1));
const polyline = computed(() => series.value.map((p) => `${(p.t / maxTime.value) * 100},${100 - ((p.hr - minHr.value) / (maxHr.value - minHr.value)) * 100}`).join(' '));
const splitPreview = computed(() => [0, ...sessionBreaks.value, maxTime.value]);
const selectedField = computed(() => allFields().find((f) => f.id === store.selectedFieldId) || null);

function trackPoints(seg: any): string {
  const gps = seg.records
    .filter((r: any) => r.position_lat != null && r.position_long != null)
    .map((r: any) => ({ lat: r.position_lat as number, lon: r.position_long as number }));
  // The selected/upload-matched field is also what store.recompute() supplies
  // to match detail, so this preview uses its exact transform.
  const field = selectedField.value || appliedField();
  const transform = (field ? buildFieldTransform(field.corners) : null) || buildPitchTransform(gps);
  if (!transform) return '';
  const dir = store.attackDirs[`${seg.id}:-1`] ?? 1;
  const OFF = 0.12; // drop fixes this far beyond a line as GPS error / off-pitch
  const out: string[] = [];
  for (const p of gps) {
    const q = transform.project(p.lat, p.lon);
    let u = dir === 1 ? q.u : 1 - q.u;
    let v = dir === 1 ? q.v : 1 - q.v;
    if (field) {
      if (u < -OFF || u > 1 + OFF || v < -OFF || v > 1 + OFF) continue;
      u = Math.min(1, Math.max(0, u));
      v = Math.min(1, Math.max(0, v));
    }
    // Map onto the pitch rect (x 2..98, y 2..62) of the 100×64 viewBox.
    out.push(`${(2 + u * 96).toFixed(1)},${(2 + v * 60).toFixed(1)}`);
  }
  return out.join(' ');
}

function parseTime(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  if (v.includes(':')) {
    const [m, s] = v.split(':').map(Number);
    return isFinite(m) && isFinite(s) ? m * 60 + s : null;
  }
  const min = Number(v);
  return isFinite(min) ? Math.round(min * 60) : null;
}
function addBreak(value?: number) {
  const t = value ?? parseTime(newBreak.value);
  error.value = '';
  if (t == null || t <= 0 || t >= maxTime.value) {
    error.value = `Enter a time between 0:00 and ${fmtClock(maxTime.value)}.`;
    return;
  }
  if (!sessionBreaks.value.includes(t)) sessionBreaks.value = [...sessionBreaks.value, t].sort((a, b) => a - b);
  newBreak.value = '';
}
function onTimelineClick(e: MouseEvent) {
  const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
  addBreak(Math.round(((e.clientX - box.left) / box.width) * maxTime.value));
}
function applySplits() {
  setManualSplits(sessionBreaks.value, []);
}
function toggleBreak(file: string) {
  error.value = '';
  const next = store.breakFiles.includes(file) ? store.breakFiles.filter((x) => x !== file) : [...store.breakFiles, file];
  if (!setBreakFiles(next)) error.value = 'Keep at least one file as a match session.';
  else sessionBreaks.value = [];
}
function setOrientation(segmentId: string, dir: number) {
  store.attackDirs[`${segmentId}:-1`] = dir;
  // Attacking left/right is a 180° rotation, matching flipAttack().
  store.sideDirs[`${segmentId}:-1`] = dir;
  store.activeSegmentId = segmentId;
  store.activePeriod = -1;
  recompute();
}
function close() {
  store.uploadWizardOpen = false;
}
function skip() {
  if (needsBirthDate.value && !birthDate.value) setDefaultMaxHR();
  close();
}
async function saveHeartRate() {
  error.value = '';
  if (!birthDate.value) {
    setDefaultMaxHR();
    close();
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
    close();
  } catch (e: any) {
    error.value = e?.message || 'Could not save your birth date.';
  } finally {
    savingBirthDate.value = false;
  }
}
function next() {
  error.value = '';
  // An automatic nearby match becomes this upload's single pitch, ensuring all
  // session previews and match detail share the same field transform.
  if (step.value === 'pitch' && !store.selectedFieldId && appliedField()) setSelectedField(appliedField()!.id);
  if (step.value === 'split') applySplits();
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
  <div class="wizard-overlay" role="dialog" aria-modal="true" aria-labelledby="setup-title">
    <section class="wizard card">
      <header class="wizard-head">
        <div>
          <span class="eyebrow">Upload setup · {{ stepIndex + 1 }}/{{ steps.length }}</span>
          <h2 id="setup-title">{{ title }}</h2>
        </div>
        <button class="btn ghost small" @click="skip">Skip for now</button>
      </header>

      <div v-if="step === 'pitch'" class="wizard-body">
        <p v-if="hasGps" class="hint">Pick one pitch for this upload. The nearby match below becomes the pitch used throughout match detail and orientation setup.</p>
        <p v-else class="hint">This file has no GPS coordinates, so a pitch cannot be mapped to it.</p>
        <template v-if="hasGps">
          <label>Pitch
            <select :value="store.selectedFieldId || ''" @change="setSelectedField(($event.target as HTMLSelectElement).value || null)">
              <option value="">Automatically matched pitch{{ automaticFieldLabel ? ` (${automaticFieldLabel})` : '' }}</option>
              <option v-for="field in allFields()" :key="field.id" :value="field.id">{{ field.name }}</option>
            </select>
          </label>
          <button class="btn ghost" @click="store.fieldEditorOpen = true">＋ Create a pitch</button>
        </template>
      </div>

      <div v-else-if="step === 'split'" class="wizard-body">
        <p class="hint">{{ store.files.length }} source file{{ store.files.length === 1 ? '' : 's' }} loaded · {{ nonCombinedSegments().length }} session{{ nonCombinedSegments().length === 1 ? '' : 's' }} detected. Add a boundary where one match ends and the next begins.</p>
        <div v-if="store.files.length > 1" class="file-sessions">
          <span class="timeline-label">Uploaded files — mark a rest/break to exclude it from this match</span>
          <div v-for="(file, i) in store.files" :key="file" class="file-session" :class="{ break: store.breakFiles.includes(file) }"><strong>Session {{ i + 1 }}</strong><span>{{ file }}</span><button class="btn ghost small" @click="toggleBreak(file)">{{ store.breakFiles.includes(file) ? 'Include' : 'Mark break' }}</button></div>
        </div>
        <template v-if="series.length">
          <p class="timeline-label">Heart rate — click the trace to add a session boundary</p>
          <svg class="timeline" viewBox="0 0 100 100" preserveAspectRatio="none" @click="onTimelineClick">
            <polyline :points="polyline" fill="none" stroke="var(--c-coral)" stroke-width="1.2" vector-effect="non-scaling-stroke" />
            <line v-for="t in sessionBreaks" :key="t" :x1="(t / maxTime) * 100" :x2="(t / maxTime) * 100" y1="0" y2="100" stroke="var(--accent)" stroke-width="1" vector-effect="non-scaling-stroke" />
          </svg>
        </template>
        <p v-else class="hint">No HR data is available. Add session boundaries by elapsed time if automatic grouping is not right.</p>
        <div class="break-add"><input v-model="newBreak" placeholder="e.g. 27:00" @keyup.enter="addBreak()" /><button class="btn ghost small" @click="addBreak()">Add break</button></div>
        <div class="chips"><span v-for="t in sessionBreaks" :key="t" class="chip">{{ fmtClock(t) }} <button @click="sessionBreaks = sessionBreaks.filter((x) => x !== t)">×</button></span><span v-if="!sessionBreaks.length" class="hint">No manual boundaries</span></div>
        <div class="split-preview" aria-label="Session timeline preview">
          <div v-for="(_, i) in splitPreview.slice(0, -1)" :key="i" class="split-block" :style="{ flex: Math.max(1, splitPreview[i + 1] - splitPreview[i]) }">
            <strong>Session {{ i + 1 }}</strong><span>{{ fmtClock(splitPreview[i]) }}–{{ fmtClock(splitPreview[i + 1]) }}</span>
          </div>
        </div>
      </div>

      <div v-else-if="step === 'orientation'" class="wizard-body">
        <p class="hint">For each session, choose the end you attacked. You can fine-tune this later from the match page.</p>
        <div class="orient-list"><div v-for="(seg, i) in nonCombinedSegments()" :key="seg.id" class="orient-row"><div class="orientation-preview"><svg viewBox="0 0 100 64" preserveAspectRatio="xMidYMid meet" aria-label="GPS track on the pitch"><defs><clipPath :id="'wclip' + i"><rect x="2" y="2" width="96" height="60" rx="3" /></clipPath></defs><rect class="pl-edge" x="2" y="2" width="96" height="60" rx="3" /><path class="pl-edge" d="M50 2V62M2 17h12v30H2M86 17h12v30H86" /><circle class="pl-edge" cx="50" cy="32" r="9" /><polyline class="pl-track" :points="trackPoints(seg)" :clip-path="'url(#wclip' + i + ')'" /></svg></div><div class="orientation-controls"><strong>Session {{ i + 1 }}</strong><span class="hint">{{ seg.sublabel }}</span><div><button class="btn ghost small" :class="{ on: (store.attackDirs[`${seg.id}:-1`] ?? 1) === 1 }" @click="setOrientation(seg.id, 1)">▶ Attacking</button><button class="btn ghost small" :class="{ on: (store.attackDirs[`${seg.id}:-1`] ?? 1) === -1 }" @click="setOrientation(seg.id, -1)">Attacking ◀</button></div></div></div></div>
      </div>

      <div v-else class="wizard-body">
        <p>Your birth date is used to estimate your maximum heart rate (<strong>220 − age</strong>) and set HR zones.</p>
        <label>Birth date<input v-model="birthDate" type="date" /></label>
        <p class="hint">{{ auth.user ? 'It will be saved privately to your profile.' : 'It will be used only for this analysis.' }} If you skip it, we’ll use a common 190 bpm reference maximum.</p>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <footer class="wizard-foot"><button v-if="stepIndex > 0" class="btn ghost" @click="previous">Back</button><span></span><button v-if="step === 'hr'" class="btn primary" :disabled="savingBirthDate" @click="saveHeartRate">{{ savingBirthDate ? 'Saving…' : birthDate ? 'Continue' : 'Use 190 bpm' }}</button><button v-else class="btn primary" @click="next">{{ stepIndex + 1 < steps.length ? 'Continue' : 'Finish setup' }}</button></footer>
    </section>
  </div>
</template>

<style scoped>
.wizard-overlay{position:fixed;inset:0;z-index:120;background:rgba(4,8,14,.72);display:grid;place-items:center;padding:18px}.wizard{width:min(620px,100%);max-height:calc(100vh - 36px);overflow:auto}.wizard-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.wizard h2{margin:3px 0 0}.eyebrow,.timeline-label{font:11px var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.wizard-body{display:grid;gap:14px;margin:18px 0}.wizard-body p{margin:0}.wizard label{display:grid;gap:6px;font-size:13px;font-weight:600}.wizard input,.wizard select{background:var(--bg-elev2);border:1px solid var(--border);border-radius:var(--ctl-radius);color:var(--text);padding:8px 10px;font:inherit}.timeline{height:180px;width:100%;background:var(--bg-elev2);border:1px solid var(--border);border-radius:10px;cursor:crosshair}.break-add{display:flex;gap:8px}.break-add input{width:130px}.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{padding:4px 9px;border-radius:16px;background:var(--bg-elev2);font-size:13px}.chip button{border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:16px}.file-sessions{display:grid;gap:6px}.file-session{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--border);border-radius:9px;font-size:12px}.file-session span{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.file-session.break{opacity:.55;background:var(--bg-elev2);text-decoration:line-through}.file-session.break button{text-decoration:none}.split-preview{display:flex;gap:4px;min-height:52px}.split-block{min-width:60px;padding:7px;border-radius:8px;background:var(--accent-tint);border:1px solid var(--accent-tint-strong);display:grid;gap:3px;font-size:11px;overflow:hidden}.split-block span{color:var(--muted);white-space:nowrap}.orient-list{display:grid;gap:8px}.orient-row{display:grid;grid-template-columns:190px 1fr;gap:12px;padding:10px;border:1px solid var(--border);border-radius:10px}.orientation-preview svg{display:block;width:100%;background:#1f5c39;border-radius:8px;overflow:hidden}.pl-edge{fill:none;stroke:rgba(255,255,255,.6);stroke-width:1}.pl-track{fill:none;stroke:var(--accent);stroke-width:1;stroke-opacity:.7;stroke-linejoin:round;stroke-linecap:round}.orientation-controls{display:grid;align-content:center;gap:5px}.orientation-controls>div{display:flex;gap:6px;flex-wrap:wrap}.btn.on{border-color:var(--accent);color:var(--accent-ink)}.wizard-foot{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;margin-top:18px}@media(max-width:540px){.orient-row{grid-template-columns:1fr}.wizard-head{flex-direction:column}.timeline{height:140px}.file-session{grid-template-columns:1fr auto}.file-session span{grid-column:1/-1;grid-row:2}}
</style>
