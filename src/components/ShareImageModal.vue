<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { store, allFields, dirsForSegment, nonCombinedSegments } from '../store';
import { compute } from '../lib/analytics';
import { recordsForPeriod } from '../lib/segmentation';
import { drawPitch, type PitchMode } from '../lib/pitch';
import { fmtDist, fmtDur, kmh } from '../lib/format';

const emit = defineEmits<{ close: [] }>();

const sessions = computed(() => nonCombinedSegments());
const selectedSegmentId = ref(store.activeSegmentId || sessions.value[0]?.id || '');
const mode = ref<PitchMode>(store.activeTab === 'positional' ? 'heatmap' : 'heatmap');
const size = ref<'story' | 'post'>('story');
const canvas = ref<HTMLCanvasElement>();
const error = ref('');

const selectedSegment = computed(() => sessions.value.find((s) => s.id === selectedSegmentId.value) || sessions.value[0]);
const sizeSpec = computed(() => (size.value === 'story' ? { w: 1080, h: 1920, label: 'Instagram story' } : { w: 1080, h: 1350, label: 'Instagram post' }));
const title = computed(() => store.matchTitle || store.location || 'Football match');
const modeLabel = computed(() => ({ heatmap: 'Heatmap', trail: 'Movement trail', zones: 'Zone occupancy' }[mode.value]));
const selectedPitch = computed(() => {
  const id = store.selectedFieldId || store.appliedFieldId;
  return id ? allFields().find((field) => field.id === id) || null : null;
});

function analyticsForSelection() {
  const seg = selectedSegment.value;
  if (!seg) return null;
  const dirs = dirsForSegment(seg);
  return compute(
    {
      records: recordsForPeriod(seg, -1),
      sessions: seg.session ? [seg.session] : [],
      laps: [],
      events: [],
      activity: null,
      file_id: null,
      other: {},
    },
    {
      age: store.options.age,
      maxHR: store.options.maxHR,
      maxHRSource: store.options.maxHRSource || undefined,
      sprintKmh: store.options.sprintKmh,
      highIntensityKmh: store.options.highIntensityKmh,
      attackingDir: dirs.attacking_dir,
      sideDir: dirs.side_dir,
      field: selectedPitch.value?.corners || null,
      format: store.options.format,
    }
  );
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  let out = text;
  while (out.length > 8 && ctx.measureText(out).width > maxWidth) out = out.slice(0, -2);
  if (out !== text) out += '…';
  ctx.fillText(out, x, y);
}

function drawStat(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, w: number) {
  ctx.fillStyle = '#5b675e';
  ctx.font = '26px Hanken Grotesk, system-ui, sans-serif';
  ctx.fillText(label, x, y);
  ctx.fillStyle = '#13211b';
  ctx.font = '700 44px Space Grotesk, system-ui, sans-serif';
  fitText(ctx, value, x, y + 54, w);
}

function makePitchImage(positional: any): HTMLCanvasElement {
  const wrap = document.createElement('div');
  wrap.className = 'pitch-wrap';
  wrap.style.position = 'fixed';
  wrap.style.left = '-9999px';
  wrap.style.top = '0';
  wrap.style.width = '980px';
  wrap.style.border = '0';
  const pitch = document.createElement('canvas');
  wrap.appendChild(pitch);
  document.body.appendChild(wrap);
  drawPitch(pitch, positional, mode.value);
  document.body.removeChild(wrap);
  return pitch;
}

async function render() {
  await nextTick();
  error.value = '';
  const c = canvas.value;
  const a = analyticsForSelection();
  if (!c || !a?.ok || !a.positional) {
    error.value = 'This session has no GPS data to export.';
    return;
  }

  const { w, h } = sizeSpec.value;
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f2f5ef';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#c8f751';
  roundedRect(ctx, 56, 54, 84, 84, 24);
  ctx.fill();
  ctx.fillStyle = '#102018';
  ctx.font = '700 44px Space Grotesk, system-ui, sans-serif';
  ctx.fillText('◉', 78, 111);
  ctx.fillStyle = '#13211b';
  ctx.font = '700 38px Space Grotesk, system-ui, sans-serif';
  ctx.fillText('xPitch', 158, 108);

  ctx.fillStyle = '#5b675e';
  ctx.font = '28px Hanken Grotesk, system-ui, sans-serif';
  ctx.fillText(modeLabel.value, 56, 190);
  ctx.fillStyle = '#13211b';
  ctx.font = '700 58px Space Grotesk, system-ui, sans-serif';
  fitText(ctx, title.value, 56, 260, w - 112);
  ctx.fillStyle = '#5b675e';
  ctx.font = '30px Hanken Grotesk, system-ui, sans-serif';
  const seg = selectedSegment.value;
  const started = a.meta?.startDate ? new Date(a.meta.startDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  fitText(ctx, [seg?.label, started].filter(Boolean).join(' · '), 56, 312, w - 112);

  const pitch = makePitchImage(a.positional);
  const pitchX = 56;
  const pitchY = size.value === 'story' ? 390 : 350;
  const pitchW = w - 112;
  const pitchH = size.value === 'story' ? 760 : 560;
  roundedRect(ctx, pitchX, pitchY, pitchW, pitchH, 34);
  ctx.save();
  ctx.clip();
  ctx.drawImage(pitch, pitchX, pitchY, pitchW, pitchH);
  ctx.restore();

  const statsY = pitchY + pitchH + 78;
  const colW = (w - 144) / 2;
  drawStat(ctx, 'Distance', fmtDist(a.summary.totalDistance), 56, statsY, colW);
  drawStat(ctx, 'Duration', fmtDur(a.summary.durationS), 56 + colW + 32, statsY, colW);
  drawStat(ctx, 'Top speed', `${kmh(a.summary.topSpeed)} km/h`, 56, statsY + 150, colW);
  drawStat(ctx, a.physio ? 'Avg heart rate' : 'Moving time', a.physio ? `${a.physio.avgHR} bpm` : fmtDur(a.summary.movingTime), 56 + colW + 32, statsY + 150, colW);

  ctx.fillStyle = '#5b675e';
  ctx.font = '24px Hanken Grotesk, system-ui, sans-serif';
  ctx.fillText('Generated from GPS/HR data · estimates only', 56, h - 70);
}

function fileName() {
  const safe = title.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'match';
  return `${safe}-${selectedSegment.value?.label || 'session'}-${mode.value}-${size.value}.png`.toLowerCase().replace(/\s+/g, '-');
}

async function canvasBlob(): Promise<Blob | null> {
  await render();
  return new Promise((resolve) => canvas.value?.toBlob(resolve, 'image/png', 0.95));
}

async function download() {
  const blob = await canvasBlob();
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareNative() {
  const blob = await canvasBlob();
  if (!blob) return;
  const file = new File([blob], fileName(), { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: title.value, files: [file] });
  } else {
    await download();
  }
}

watch([selectedSegmentId, mode, size], () => void render());
onMounted(() => void render());
</script>

<template>
  <div class="share-overlay" role="dialog" aria-modal="true" aria-labelledby="share-title">
    <section class="share-modal card">
      <header class="share-head">
        <div>
          <p class="eyebrow">Share image</p>
          <h2 id="share-title">Export match graphic</h2>
          <p class="hint">Choose a session and map. Defaults use the current match view.</p>
        </div>
        <button class="btn ghost small" @click="emit('close')">✕ Close</button>
      </header>

      <div class="share-controls">
        <label>Session
          <select v-model="selectedSegmentId">
            <option v-for="s in sessions" :key="s.id" :value="s.id">{{ s.label }} · {{ s.sublabel }}</option>
          </select>
        </label>
        <label>Map
          <select v-model="mode">
            <option value="heatmap">Heatmap</option>
            <option value="trail">Movement trail</option>
            <option value="zones">Zone occupancy</option>
          </select>
        </label>
        <label>Size
          <select v-model="size">
            <option value="story">Instagram story · 1080×1920</option>
            <option value="post">Instagram post · 1080×1350</option>
          </select>
        </label>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <div class="preview" :class="size">
        <canvas ref="canvas"></canvas>
      </div>

      <footer class="share-foot">
        <span class="hint">{{ sizeSpec.label }} PNG</span>
        <div>
          <button class="btn ghost" @click="shareNative">Share</button>
          <button class="btn primary" @click="download">Download PNG</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.share-overlay {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(4, 8, 14, 0.72);
}
.share-modal {
  width: min(1040px, 100%);
  max-height: calc(100vh - 36px);
  overflow: auto;
}
.share-head,
.share-foot {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
}
.share-head h2 {
  margin: 0;
}
.eyebrow {
  margin: 0 0 4px;
  font: 11px var(--font-mono);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}
.share-controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 18px 0;
}
label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}
select {
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: 9px 10px;
}
.preview {
  display: grid;
  place-items: center;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 14px;
}
canvas {
  max-width: 100%;
  height: auto;
  border-radius: 12px;
  box-shadow: var(--shadow);
}
.preview.story canvas {
  width: min(360px, 100%);
}
.preview.post canvas {
  width: min(440px, 100%);
}
.share-foot {
  margin-top: 16px;
  align-items: center;
}
.share-foot > div {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
@media (max-width: 700px) {
  .share-head,
  .share-foot {
    flex-direction: column;
  }
  .share-controls {
    grid-template-columns: 1fr;
  }
}
</style>
