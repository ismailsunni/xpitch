<script setup lang="ts">
import { computed, ref } from 'vue';
import PitchCanvas from './PitchCanvas.vue';
import { auth } from '../lib/auth';
import { updateProfile } from '../lib/api';
import { deriveAge, fmtClock } from '../lib/format';
import { compute, FORMATS, type FormatKey } from '../lib/analytics';
import { suggestSessionBreaksFromHR } from '../lib/segmentation';
import type { RecordSample } from '../lib/fit-parser';
import {
  allFields,
  appliedField,
  getCurrentFit,
  nonCombinedSegments,
  recordingDurationSec,
  recordingStartOffsetBase,
  recompute,
  setDefaultMaxHR,
  setBreakSessionStarts,
  setFormat,
  setManualSplits,
  setSelectedField,
  sessionStartOffsets,
  store,
} from '../store';

type Step = 'pitch' | 'split' | 'orientation' | 'hr';
const step = ref<Step>(store.uploadWizardStartStep || 'pitch');
const birthDate = ref('');
const error = ref('');
const savingBirthDate = ref(false);
const initialSplit = initialSplitState();
const sessionBreaks = ref<number[]>(initialSplit.breaks);
const breakSessionStarts = ref<number[]>(store.breakSessionStarts.length ? [...store.breakSessionStarts] : initialSplit.restStarts);

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
  pitch: 'Match details', split: 'Split the recording', orientation: 'Set attack direction', hr: 'Heart-rate setup',
}[step.value]));
const formatOptions = computed(() => Object.values(FORMATS).filter((f) => f.key !== 'auto'));
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
const polylines = computed(() => {
  const lines: string[][] = [];
  let current: string[] = [];
  let previous: number | null = null;
  for (const p of series.value) {
    if (previous != null && p.t - previous > 60 && current.length) {
      lines.push(current);
      current = [];
    }
    current.push(`${(p.t / maxTime.value) * 100},${100 - ((p.hr - minHr.value) / (maxHr.value - minHr.value)) * 100}`);
    previous = p.t;
  }
  if (current.length) lines.push(current);
  return lines.map((line) => line.join(' '));
});
const splitPreview = computed(() => [0, ...sessionBreaks.value, maxTime.value]);
const resultSessions = computed(() => {
  const base = recordingStartOffsetBase() || 0;
  let play = 0;
  let rest = 0;
  return splitPreview.value.slice(0, -1).map((start, i) => {
    const key = (base || 0) + start;
    const isRest = breakSessionStarts.value.includes(key);
    const number = isRest ? ++rest : ++play;
    return {
      start,
      end: splitPreview.value[i + 1],
      key,
      isRest,
      label: `${isRest ? 'Rest' : 'Session'} ${number}`,
    };
  });
});
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

function onTimelineClick(e: MouseEvent) {
  const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
  const t = Math.round(((e.clientX - box.left) / box.width) * maxTime.value);
  if (t > 0 && t < maxTime.value && !sessionBreaks.value.includes(t)) {
    sessionBreaks.value = [...sessionBreaks.value, t].sort((a, b) => a - b);
  }
}
function parseSplitTime(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (text.includes(':')) {
    const parts = text.split(':').map((part) => Number(part));
    if (parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
    return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
  }
  const minutes = Number(text);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : null;
}
function timestamp(r: RecordSample): number {
  return r.timestamp as number;
}
function fileRanges(): { name: string; start: number; end: number; records: RecordSample[] }[] {
  const fit = getCurrentFit();
  if (!fit || store.files.length <= 1) return [];
  const byFile = new Map<string, RecordSample[]>();
  const records = fit.records.filter((r) => r.timestamp != null).sort((a, b) => timestamp(a) - timestamp(b));
  for (const r of records) {
    const name = typeof r._fileName === 'string' ? r._fileName : '';
    if (!name) return [];
    const group = byFile.get(name) || [];
    group.push(r);
    byFile.set(name, group);
  }
  if (byFile.size <= 1) return [];
  return [...byFile.entries()]
    .map(([name, records]) => ({ name, records, start: timestamp(records[0]), end: timestamp(records[records.length - 1]) }))
    .sort((a, b) => a.start - b.start);
}
function initialSplitState(): { breaks: number[]; restStarts: number[] } {
  const base = recordingStartOffsetBase();
  const ranges = fileRanges();
  if (base == null || ranges.length <= 1) {
    return { breaks: [...(store.manualSplits?.sessionBreaks || sessionStartOffsets().slice(1))].sort((a, b) => a - b), restStarts: [] };
  }
  const breaks: number[] = [];
  const restStarts: number[] = [];
  for (let i = 1; i < ranges.length; i++) {
    const restStart = ranges[i - 1].end + 1;
    const previousEnd = restStart - base;
    const nextStart = ranges[i].start - base;
    if (nextStart - previousEnd > 1) {
      breaks.push(previousEnd, nextStart);
      restStarts.push(restStart);
    } else {
      breaks.push(nextStart);
    }
  }
  return { breaks: uniqueSorted(breaks), restStarts };
}
function uniqueSorted(values: number[]): number[] {
  const duration = recordingDurationSec() || Number.POSITIVE_INFINITY;
  return [...new Set(values.map((v) => Math.round(v)).filter((v) => v > 0 && v < duration))].sort((a, b) => a - b);
}
function updateBoundary(index: number, value: string) {
  error.value = '';
  const nextTime = parseSplitTime(value);
  if (nextTime == null || nextTime <= 0 || nextTime >= maxTime.value) {
    error.value = 'Enter a split time between 0:00 and ' + fmtClock(maxTime.value) + '.';
    return;
  }
  const oldTime = sessionBreaks.value[index];
  const base = recordingStartOffsetBase() || 0;
  const nextBreaks = [...sessionBreaks.value];
  nextBreaks[index] = nextTime;
  const sorted = uniqueSorted(nextBreaks);
  if (sorted.length !== nextBreaks.length) {
    error.value = 'That split time already exists.';
    return;
  }
  sessionBreaks.value = sorted;
  breakSessionStarts.value = breakSessionStarts.value.map((start) => start === base + oldTime ? base + nextTime : start);
}
function removeBoundary(time: number) {
  const base = recordingStartOffsetBase() || 0;
  sessionBreaks.value = sessionBreaks.value.filter((x) => x !== time);
  breakSessionStarts.value = breakSessionStarts.value.filter((x) => x !== base + time);
}
function autoSplitFromHR() {
  const fit = getCurrentFit();
  if (!fit) return;
  const allRecords = fit.records.filter((r) => r.timestamp != null).sort((a, b) => (a.timestamp as number) - (b.timestamp as number));
  const origin = allRecords[0]?.timestamp as number | undefined;
  const byFile = new Map<string, any[]>();
  if (store.files.length > 1 && origin != null) {
    for (const r of allRecords) {
      const name = typeof r._fileName === 'string' ? r._fileName : '';
      const records = byFile.get(name) || [];
      records.push(r);
      byFile.set(name, records);
    }
  }
  const suggested = byFile.size > 1
    ? [...byFile.values()].flatMap((records) => {
        const local = { ...fit, records };
        const offset = (records[0].timestamp as number) - origin!;
        return suggestSessionBreaksFromHR(local).map((t) => offset + t);
      })
    : suggestSessionBreaksFromHR(fit);
  if (!suggested.length) {
    error.value = 'No additional HR recovery breaks were detected. The file sessions are kept as-is.';
    return;
  }
  error.value = '';
  // Keep uploaded-file play/rest boundaries, then add HR-derived boundaries
  // inside each file when sustained recovery valleys exist.
  const fileSplit = initialSplitState();
  sessionBreaks.value = uniqueSorted([...fileSplit.breaks, ...sessionBreaks.value, ...suggested]);
  breakSessionStarts.value = [...new Set([...fileSplit.restStarts, ...breakSessionStarts.value])].sort((a, b) => a - b);
}
function applySplits() {
  setManualSplits(sessionBreaks.value, []);
  setBreakSessionStarts(breakSessionStarts.value);
}
function toggleSession(start: number) {
  error.value = '';
  const next = breakSessionStarts.value.includes(start)
    ? breakSessionStarts.value.filter((x) => x !== start)
    : [...breakSessionStarts.value, start];
  if (next.length >= resultSessions.value.length) error.value = 'Keep at least one session set to Play.';
  else breakSessionStarts.value = next;
}
function deleteSession(index: number) {
  if (resultSessions.value.length <= 1) return;
  const base = recordingStartOffsetBase() || 0;
  const removed = resultSessions.value[index];
  const removedBoundary = index === 0 ? sessionBreaks.value[0] : sessionBreaks.value[index - 1];
  // The first section also consumes the following boundary when merged.
  const mergedStart = index === 0 ? base + (sessionBreaks.value[0] || 0) : removed.key;
  breakSessionStarts.value = breakSessionStarts.value.filter((x) => x !== removed.key && x !== mergedStart);
  sessionBreaks.value = sessionBreaks.value.filter((x) => x !== removedBoundary);
}
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
  store.uploadWizardStartStep = null;
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
  if (step.value === 'pitch' && hasGps.value && !store.selectedFieldId) {
    error.value = 'Select or create the pitch before continuing. Without a pitch, distance and position data are not reliable.';
    return;
  }
  if (step.value === 'pitch' && store.options.format === 'auto') {
    error.value = 'Choose the game type before continuing.';
    return;
  }
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
        <button v-if="step !== 'pitch' || !hasGps" class="btn ghost small" @click="skip">Skip for now</button>
      </header>

      <div v-if="step === 'pitch'" class="wizard-body">
        <label>Match name
          <input v-model="store.matchTitle" type="text" placeholder="e.g. Tuesday night mini soccer" />
        </label>
        <label>Game type
          <select :value="store.options.format" @change="updateFormat(($event.target as HTMLSelectElement).value)">
            <option value="auto" disabled>Select game type</option>
            <option v-for="f in formatOptions" :key="f.key" :value="f.key">{{ f.label }}</option>
          </select>
        </label>
        <p v-if="hasGps" class="hint">Select the pitch used for this upload. The pitch controls the field transform used throughout match detail and orientation setup.</p>
        <p v-else class="hint">This file has no GPS coordinates, so a pitch cannot be mapped to it.</p>
        <template v-if="hasGps">
          <label>Pitch
            <select :value="store.selectedFieldId || ''" @change="setSelectedField(($event.target as HTMLSelectElement).value || null)">
              <option value="" disabled>Select a pitch{{ automaticFieldLabel ? ` (nearby: ${automaticFieldLabel})` : '' }}</option>
              <option v-for="field in allFields()" :key="field.id" :value="field.id">{{ field.name }}</option>
            </select>
          </label>
          <button class="btn ghost" @click="store.fieldEditorOpen = true">＋ Create a pitch</button>
        </template>
      </div>

      <div v-else-if="step === 'split'" class="wizard-body">
        <p class="hint">{{ store.files.length }} source file{{ store.files.length === 1 ? '' : 's' }} loaded · {{ nonCombinedSegments().length }} play section{{ nonCombinedSegments().length === 1 ? '' : 's' }} detected. Click the chart to split play/rest sections, then mark each section as Play or Rest.</p>
        <template v-if="series.length">
          <div class="timeline-head"><p class="timeline-label">Heart rate — click to add a split point</p><button class="btn ghost small" @click="autoSplitFromHR">Detect rest from HR</button></div>
          <svg class="timeline" viewBox="0 0 100 100" preserveAspectRatio="none" @click="onTimelineClick">
            <rect
              v-for="session in resultSessions"
              :key="session.key"
              :x="(session.start / maxTime) * 100"
              y="0"
              :width="((session.end - session.start) / maxTime) * 100"
              height="100"
              :class="session.isRest ? 'rest-band' : 'play-band'"
            />
            <polyline v-for="line in polylines" :key="line" :points="line" fill="none" stroke="var(--c-coral)" stroke-width="1.2" vector-effect="non-scaling-stroke" />
            <line v-for="t in sessionBreaks" :key="t" :x1="(t / maxTime) * 100" :x2="(t / maxTime) * 100" y1="0" y2="100" stroke="var(--accent)" stroke-width="1" vector-effect="non-scaling-stroke" />
          </svg>
        </template>
        <p v-else class="hint">No HR data is available. Existing file sections are shown below; you can revise split times from the manual split editor later.</p>
        <p class="section-label">Split times</p>
        <div class="chips">
          <span v-for="(t, i) in sessionBreaks" :key="t" class="chip editable-chip">
            <input :value="fmtClock(t)" aria-label="Split time" @change="updateBoundary(i, ($event.target as HTMLInputElement).value)" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
            <button @click="removeBoundary(t)">×</button>
          </span>
          <span v-if="!sessionBreaks.length" class="hint">No split times yet</span>
        </div>
        <p class="section-label">Resulting sections</p>
        <div class="split-preview" aria-label="Session results">
          <div v-for="(session, i) in resultSessions" :key="session.key" class="split-block" :class="{ break: session.isRest }" :style="{ flex: Math.max(1, session.end - session.start) }">
            <strong>{{ session.label }}</strong><span>{{ fmtClock(session.start) }}–{{ fmtClock(session.end) }}</span><label class="session-switch"><input type="checkbox" :checked="!session.isRest" :aria-label="`${session.label} is ${session.isRest ? 'rest' : 'play'}`" @change="toggleSession(session.key)" /><span class="switch-track"></span><span>{{ session.isRest ? 'Rest' : 'Play' }}</span></label><button class="delete-session" :disabled="resultSessions.length === 1" title="Delete this split and merge with the neighbouring section" @click="deleteSession(i)">×</button>
          </div>
        </div>
      </div>

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
