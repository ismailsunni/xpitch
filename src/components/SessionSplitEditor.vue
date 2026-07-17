<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtClock } from '../lib/format';
import { suggestSessionBreaksFromHR } from '../lib/segmentation';
import type { RecordSample } from '../lib/fit-parser';
import {
  getCurrentFit,
  nonCombinedSegments,
  recordingDurationSec,
  recordingStartOffsetBase,
  setBreakSessionStarts,
  setManualSplits,
  sessionStartOffsets,
  store,
} from '../store';

const emit = defineEmits<{ changed: [] }>();
const error = ref('');
const initialSplit = initialSplitState();
const sessionBreaks = ref<number[]>(initialSplit.breaks);
const breakSessionStarts = ref<number[]>(store.breakSessionStarts.length ? [...store.breakSessionStarts] : initialSplit.restStarts);

const series = computed(() => {
  const all = (getCurrentFit()?.records || []).filter((r) => r.timestamp != null);
  const records = all.filter((r) => r.heart_rate != null && r.heart_rate > 0);
  if (!records.length) return [] as { t: number; hr: number }[];
  const start = all[0].timestamp as number;
  return records.map((r) => ({ t: (r.timestamp as number) - start, hr: r.heart_rate as number }));
});
const maxTime = computed(() => recordingDurationSec() || series.value[series.value.length - 1]?.t || 1);
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
    const key = base + start;
    const isRest = breakSessionStarts.value.includes(key);
    const number = isRest ? ++rest : ++play;
    return { start, end: splitPreview.value[i + 1], key, isRest, label: `${isRest ? 'Rest' : 'Session'} ${number}` };
  });
});

function commit() {
  setManualSplits(sessionBreaks.value, []);
  setBreakSessionStarts(breakSessionStarts.value);
  emit('changed');
}
function uniqueSorted(values: number[]): number[] {
  const duration = recordingDurationSec() || Number.POSITIVE_INFINITY;
  return [...new Set(values.map((v) => Math.round(v)).filter((v) => v > 0 && v < duration))].sort((a, b) => a - b);
}
function parseSplitTime(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (text.includes(':')) {
    const parts = text.split(':').map(Number);
    if (parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
    return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
  }
  const minutes = Number(text);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : null;
}
function setBoundary(index: number, nextTime: number) {
  error.value = '';
  if (nextTime <= 0 || nextTime >= maxTime.value) {
    error.value = `Enter a split time between 0:00 and ${fmtClock(maxTime.value)}.`;
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
  breakSessionStarts.value = breakSessionStarts.value.map((start) => (start === base + oldTime ? base + nextTime : start));
  commit();
}
function updateBoundary(index: number, value: string) {
  const nextTime = parseSplitTime(value);
  if (nextTime == null) {
    error.value = `Enter a split time between 0:00 and ${fmtClock(maxTime.value)}.`;
    return;
  }
  setBoundary(index, nextTime);
}
function adjustBoundary(index: number, seconds: number) {
  setBoundary(index, sessionBreaks.value[index] + seconds);
}
function onTimelineClick(e: MouseEvent) {
  const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
  const t = Math.round(((e.clientX - box.left) / box.width) * maxTime.value);
  if (t > 0 && t < maxTime.value && !sessionBreaks.value.includes(t)) {
    sessionBreaks.value = [...sessionBreaks.value, t].sort((a, b) => a - b);
    commit();
  }
}
function removeBoundary(time: number) {
  const base = recordingStartOffsetBase() || 0;
  sessionBreaks.value = sessionBreaks.value.filter((x) => x !== time);
  breakSessionStarts.value = breakSessionStarts.value.filter((x) => x !== base + time);
  commit();
}
function timestamp(r: RecordSample): number {
  return r.timestamp as number;
}
function fileRanges(): { start: number; end: number }[] {
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
  return [...byFile.values()].map((records) => ({ start: timestamp(records[0]), end: timestamp(records[records.length - 1]) }));
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
    } else breaks.push(nextStart);
  }
  return { breaks: uniqueSorted(breaks), restStarts };
}
function autoSplitFromHR() {
  const fit = getCurrentFit();
  if (!fit) return;
  const allRecords = fit.records.filter((r) => r.timestamp != null).sort((a, b) => (a.timestamp as number) - (b.timestamp as number));
  const origin = allRecords[0]?.timestamp as number | undefined;
  const byFile = new Map<string, RecordSample[]>();
  if (store.files.length > 1 && origin != null) {
    for (const r of allRecords) {
      const name = typeof r._fileName === 'string' ? r._fileName : '';
      const records = byFile.get(name) || [];
      records.push(r);
      byFile.set(name, records);
    }
  }
  const suggested = byFile.size > 1
    ? [...byFile.values()].flatMap((records) => suggestSessionBreaksFromHR({ ...fit, records }).map((t) => t + ((records[0].timestamp as number) - origin!)))
    : suggestSessionBreaksFromHR(fit);
  if (!suggested.length) {
    error.value = 'No additional HR recovery breaks were detected. The file sessions are kept as-is.';
    return;
  }
  const fileSplit = initialSplitState();
  sessionBreaks.value = uniqueSorted([...fileSplit.breaks, ...sessionBreaks.value, ...suggested]);
  breakSessionStarts.value = [...new Set([...fileSplit.restStarts, ...breakSessionStarts.value])].sort((a, b) => a - b);
  error.value = '';
  commit();
}
function toggleSession(start: number) {
  const next = breakSessionStarts.value.includes(start)
    ? breakSessionStarts.value.filter((x) => x !== start)
    : [...breakSessionStarts.value, start];
  if (next.length >= resultSessions.value.length) error.value = 'Keep at least one session set to Play.';
  else {
    error.value = '';
    breakSessionStarts.value = next;
    commit();
  }
}
function deleteSession(index: number) {
  if (resultSessions.value.length <= 1) return;
  const base = recordingStartOffsetBase() || 0;
  const removed = resultSessions.value[index];
  const removedBoundary = index === 0 ? sessionBreaks.value[0] : sessionBreaks.value[index - 1];
  const mergedStart = index === 0 ? base + (sessionBreaks.value[0] || 0) : removed.key;
  breakSessionStarts.value = breakSessionStarts.value.filter((x) => x !== removed.key && x !== mergedStart);
  sessionBreaks.value = sessionBreaks.value.filter((x) => x !== removedBoundary);
  commit();
}
</script>

<template>
  <section class="split-editor">
    <p class="hint">{{ store.files.length }} source file{{ store.files.length === 1 ? '' : 's' }} loaded · {{ nonCombinedSegments().length }} play section{{ nonCombinedSegments().length === 1 ? '' : 's' }} detected. Click the chart to add a split, then mark each section as Play or Rest.</p>
    <template v-if="series.length">
      <div class="timeline-head"><p class="timeline-label">Heart rate</p><button class="btn ghost small" @click="autoSplitFromHR">Detect rest from HR</button></div>
      <div class="timeline-wrap">
        <svg class="timeline" viewBox="0 0 100 100" preserveAspectRatio="none" @click="onTimelineClick">
          <rect v-for="session in resultSessions" :key="session.key" :x="(session.start / maxTime) * 100" y="0" :width="((session.end - session.start) / maxTime) * 100" height="100" :class="session.isRest ? 'rest-band' : 'play-band'" />
          <polyline v-for="line in polylines" :key="line" :points="line" fill="none" stroke="var(--c-coral)" stroke-width="1.2" vector-effect="non-scaling-stroke" />
          <line v-for="t in sessionBreaks" :key="t" :x1="(t / maxTime) * 100" :x2="(t / maxTime) * 100" y1="0" y2="100" stroke="var(--accent)" stroke-width="1" vector-effect="non-scaling-stroke" />
        </svg>
        <span v-for="session in resultSessions" :key="session.key" class="section-index" :class="{ rest: session.isRest }" :style="{ left: `${(session.start / maxTime) * 100}%`, width: `${((session.end - session.start) / maxTime) * 100}%` }">{{ session.label }}</span>
      </div>
    </template>
    <p v-else class="hint">No HR data is available. Existing file sections are shown below.</p>
    <p class="section-label">Split times</p>
    <div class="chips">
      <span v-for="(t, i) in sessionBreaks" :key="t" class="chip editable-chip">
        <input :value="fmtClock(t)" aria-label="Split time" @change="updateBoundary(i, ($event.target as HTMLInputElement).value)" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
        <span class="time-stepper"><button title="Move split five seconds later" aria-label="Move split five seconds later" @click="adjustBoundary(i, 5)">▲</button><button title="Move split five seconds earlier" aria-label="Move split five seconds earlier" @click="adjustBoundary(i, -5)">▼</button></span>
        <button class="remove-button" title="Remove split" @click="removeBoundary(t)">×</button>
      </span>
      <span v-if="!sessionBreaks.length" class="hint">No split times yet</span>
    </div>
    <p class="section-label">Resulting sections</p>
    <div class="split-preview" aria-label="Session results">
      <div v-for="(session, i) in resultSessions" :key="session.key" class="split-block" :class="{ break: session.isRest }">
        <strong>{{ session.label }}</strong><span>{{ fmtClock(session.start) }}–{{ fmtClock(session.end) }}</span><label class="session-switch"><input type="checkbox" :checked="!session.isRest" :aria-label="`${session.label} is ${session.isRest ? 'rest' : 'play'}`" @change="toggleSession(session.key)" /><span class="switch-track"></span><span>{{ session.isRest ? 'Rest' : 'Play' }}</span></label><button class="delete-session" :disabled="resultSessions.length === 1" title="Delete this split and merge with the neighbouring section" @click="deleteSession(i)">×</button>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<style scoped>
.split-editor{display:grid;gap:14px}.split-editor p{margin:0}.timeline-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.timeline-label,.section-label{font:11px var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.section-label{margin-bottom:-7px!important}.timeline-wrap{position:relative}.timeline{height:180px;width:100%;display:block;background:var(--bg-elev2);border:1px solid var(--border);border-radius:10px;cursor:crosshair}.play-band{fill:rgba(200,247,81,.1)}.rest-band{fill:rgba(255,106,77,.16)}.section-index{position:absolute;top:50%;transform:translateY(-50%);text-align:center;pointer-events:none;color:rgba(85,112,24,.34);font:700 15px var(--font-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.section-index.rest{color:rgba(167,75,50,.3)}.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{padding:3px 5px;border-radius:16px;background:var(--bg-elev2);font-size:13px}.editable-chip{display:flex;align-items:center;gap:2px}.editable-chip input{width:58px;border:0;background:transparent;padding:2px 3px;font:13px var(--font-mono);text-align:center}.editable-chip input:focus{outline:1px solid var(--accent);border-radius:6px}.chip button{border:0;background:transparent;color:var(--muted);cursor:pointer}.time-stepper{display:grid;grid-template-rows:9px 9px}.time-stepper button{font-size:8px;line-height:9px;padding:0 3px}.time-stepper button:hover{color:var(--accent-ink)}.remove-button{font-size:16px;padding:2px 3px}.remove-button:hover,.delete-session:hover{color:var(--danger)}.split-preview{display:grid;gap:7px;min-height:52px}.split-block{padding:9px 10px;border-radius:8px;background:var(--accent-tint);border:1px solid var(--accent-tint-strong);display:grid;grid-template-columns:100px 1fr auto auto;align-items:center;gap:10px;font-size:12px}.split-block>span{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.split-block.break{opacity:.65;background:var(--bg-elev2)}.session-switch{display:flex!important;grid-auto-flow:column;align-items:center;gap:6px;font-size:11px!important;cursor:pointer}.session-switch input{position:absolute;opacity:0;pointer-events:none}.switch-track{width:30px;height:17px;border-radius:10px;background:var(--c-coral);position:relative;transition:.15s}.switch-track::after{content:'';position:absolute;width:13px;height:13px;left:2px;top:2px;border-radius:50%;background:#fff;transition:.15s}.session-switch input:checked+.switch-track{background:var(--accent)}.session-switch input:checked+.switch-track::after{transform:translateX(13px)}.delete-session{border:0;background:transparent;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;padding:3px 5px}.delete-session:disabled{opacity:.35;cursor:not-allowed}@media(max-width:540px){.timeline-head{align-items:start;flex-direction:column}.timeline{height:140px}.section-index{font-size:11px}.split-block{grid-template-columns:1fr auto auto}.split-block>span{grid-column:1/-1;grid-row:2}}
</style>
