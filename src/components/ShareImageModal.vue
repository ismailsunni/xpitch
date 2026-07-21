<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { store, allFields, dirsForSegment, nonCombinedSegments } from '../store';
import { compute } from '../lib/analytics';
import { recordsForPeriod } from '../lib/segmentation';
import { drawPitch, type PitchMode } from '../lib/pitch';
import { fmtDist, fmtDur, kmh } from '../lib/format';
import { useDialog } from '../composables/useDialog';

const emit = defineEmits<{ close: [] }>();
const props = defineProps<{
  photos?: { id: string; url: string; caption?: string | null }[];
  url?: string;
}>();

const WHOLE_MATCH = '__whole_match__';
const sessions = computed(() => nonCombinedSegments());
const wholeSegment = computed(() => store.segments.find((s) => s.kind === 'combined') || sessions.value[0]);
const activeAtOpen = store.segments.find((s) => s.id === store.activeSegmentId);
const selectedSegmentId = ref(activeAtOpen?.kind === 'combined' ? WHOLE_MATCH : store.activeSegmentId || WHOLE_MATCH);
const mode = ref<PitchMode>(store.activeTab === 'positional' ? 'heatmap' : 'heatmap');
const size = ref<'story' | 'post'>('story');
const selectedPhotoId = ref('');
const canvas = ref<HTMLCanvasElement>();
const error = ref('');

const sessionChoices = computed(() => [
  ...(wholeSegment.value ? [{ id: WHOLE_MATCH, label: 'Whole match', sublabel: wholeSegment.value.sublabel }] : []),
  ...sessions.value.map((s) => ({ id: s.id, label: s.label, sublabel: s.sublabel })),
]);
const selectedSegment = computed(() =>
  selectedSegmentId.value === WHOLE_MATCH
    ? wholeSegment.value
    : sessions.value.find((s) => s.id === selectedSegmentId.value) || wholeSegment.value || sessions.value[0]
);
const selectedLabel = computed(() =>
  selectedSegmentId.value === WHOLE_MATCH ? 'Whole match' : selectedSegment.value?.label || 'Session'
);
const sizeSpec = computed(() => (size.value === 'story' ? { w: 1080, h: 1920, label: 'Instagram story' } : { w: 1080, h: 1350, label: 'Instagram post' }));
const title = computed(() => store.matchTitle || store.location || 'Football match');
const modeLabel = computed(() => ({ heatmap: 'Heatmap', trail: 'Movement trail', zones: 'Zone occupancy' }[mode.value]));
const selectedPitch = computed(() => {
  const id = store.selectedFieldId || store.appliedFieldId;
  return id ? allFields().find((field) => field.id === id) || null : null;
});
const selectedPhoto = computed(() => props.photos?.find((photo) => photo.id === selectedPhotoId.value) || null);

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
  ctx.fillText(truncateText(ctx, text, maxWidth), x, y);
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  let out = text;
  while (out.length > 8 && ctx.measureText(out).width > maxWidth) out = out.slice(0, -2);
  return out === text ? out : `${out}…`;
}

function drawStat(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, w: number) {
  ctx.fillStyle = '#5b675e';
  ctx.font = '26px Hanken Grotesk, system-ui, sans-serif';
  ctx.fillText(label, x, y);
  ctx.fillStyle = '#13211b';
  ctx.font = '700 44px Space Grotesk, system-ui, sans-serif';
  fitText(ctx, value, x, y + 54, w);
}

function drawStoryMetric(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, w: number) {
  const center = x + w / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5b675e';
  ctx.font = '22px Hanken Grotesk, system-ui, sans-serif';
  ctx.fillText(label, center, y);
  ctx.fillStyle = '#13211b';
  ctx.font = '700 34px Space Grotesk, system-ui, sans-serif';
  ctx.fillText(truncateText(ctx, value, w), center, y + 44);
  ctx.textAlign = 'start';
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the selected photo.'));
    image.src = src;
  });
}

function drawCoverImage(ctx: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, w: number, h: number, r: number) {
  const source = image as HTMLImageElement;
  const sourceW = source.naturalWidth || source.width;
  const sourceH = source.naturalHeight || source.height;
  const scale = Math.max(w / sourceW, h / sourceH);
  const drawW = sourceW * scale;
  const drawH = sourceH * scale;
  roundedRect(ctx, x, y, w, h, r);
  ctx.save();
  ctx.clip();
  ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
  ctx.restore();
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

  const started = a.meta?.startDate ? new Date(a.meta.startDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

  const pitch = makePitchImage(a.positional);
  const pitchX = 56;
  const pitchW = w - 112;
  if (size.value === 'story') {
    // Stories lead with the actual movement map, then give it a concise
    // football context before ending with the human match photo.
    const hasPhoto = !!selectedPhoto.value;
    const pitchY = 70;
    const pitchH = hasPhoto ? 650 : 1_280;
    roundedRect(ctx, pitchX, pitchY, pitchW, pitchH, 34);
    ctx.save();
    ctx.clip();
    ctx.drawImage(pitch, pitchX, pitchY, pitchW, pitchH);
    ctx.restore();

    const role = a.football?.role?.top || 'Football player';
    const titleY = pitchY + pitchH + 70;
    const titleInset = 32;
    const titleX = pitchX + titleInset;
    const titleRight = pitchX + pitchW - titleInset;
    ctx.font = '700 54px Space Grotesk, system-ui, sans-serif';
    const titleText = truncateText(ctx, title.value, 590);
    ctx.fillStyle = '#13211b';
    ctx.fillText(titleText, titleX, titleY + 52);
    ctx.fillStyle = '#5b675e';
    ctx.font = '26px Hanken Grotesk, system-ui, sans-serif';
    const subtitle = truncateText(ctx, [selectedLabel.value, started].filter(Boolean).join(' · '), titleRight - titleX);
    ctx.fillText(subtitle, titleX, titleY + 94);

    ctx.font = '700 42px Space Grotesk, system-ui, sans-serif';
    const brandX = titleRight - 80 - 20 - ctx.measureText('xPitch').width;
    roundedRect(ctx, brandX, titleY - 4, 80, 80, 22);
    ctx.fillStyle = '#c8f751';
    ctx.fill();
    ctx.fillStyle = '#102018';
    ctx.fillText('◉', brandX + 19, titleY + 47);
    ctx.fillStyle = '#13211b';
    ctx.font = '700 42px Space Grotesk, system-ui, sans-serif';
    ctx.fillText('xPitch', brandX + 100, titleY + 51);

    const metricsY = titleY + 136;
    roundedRect(ctx, 56, metricsY, pitchW, 142, 28);
    ctx.fillStyle = '#e4ecd8';
    ctx.fill();
    const metricW = (pitchW - 56) / 3;
    drawStoryMetric(ctx, 'Distance', fmtDist(a.summary.totalDistance), 84, metricsY + 55, metricW);
    drawStoryMetric(ctx, 'Top speed', `${kmh(a.summary.topSpeed)} km/h`, 84 + metricW, metricsY + 55, metricW);
    drawStoryMetric(ctx, 'Playing role', role, 84 + metricW * 2, metricsY + 55, metricW);
    ctx.strokeStyle = '#cfdbc0';
    ctx.lineWidth = 1;
    for (const divider of [84 + metricW, 84 + metricW * 2]) {
      ctx.beginPath();
      ctx.moveTo(divider, metricsY + 24);
      ctx.lineTo(divider, metricsY + 118);
      ctx.stroke();
    }

    if (selectedPhoto.value) {
      try {
        const image = await loadImage(selectedPhoto.value.url);
        drawCoverImage(ctx, image, pitchX, metricsY + 180, pitchW, 700, 34);
      } catch (e: any) {
        error.value = e.message || 'Could not load the selected photo.';
      }
    }
    if (props.url) {
      ctx.fillStyle = '#5b675e';
      ctx.font = '20px Hanken Grotesk, system-ui, sans-serif';
      ctx.textAlign = 'center';
      fitText(ctx, props.url.replace(/^https?:\/\//, ''), w / 2, h - 34, w - 112);
      ctx.textAlign = 'start';
    }
  } else {
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
    fitText(ctx, [selectedLabel.value, started].filter(Boolean).join(' · '), 56, 312, w - 112);
    const pitchY = 350;
    const pitchH = 560;
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
  }

}

function fileName() {
  const safe = title.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'match';
  return `${safe}-${selectedLabel.value}-${mode.value}-${size.value}.png`.toLowerCase().replace(/\s+/g, '-');
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

watch([selectedSegmentId, mode, size, selectedPhotoId], () => void render());
function close() {
  emit('close');
}
const { dialogRef } = useDialog(close);
onMounted(() => {
  if (props.photos?.length) selectedPhotoId.value = props.photos[0].id;
  void render();
});
</script>

<template>
  <div class="share-overlay" @click.self="close">
    <section ref="dialogRef" class="share-modal card" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <header class="share-head">
        <h2 id="share-title">Export match graphic</h2>
      </header>

      <div class="share-workspace">
        <aside class="share-sidebar">
          <p class="hint sidebar-hint">Choose a session, map, and optional photo for the exported graphic.</p>
          <div class="share-controls">
            <label>Session
              <select v-model="selectedSegmentId">
                <option v-for="s in sessionChoices" :key="s.id" :value="s.id">{{ s.label }} · {{ s.sublabel }}</option>
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
            <label v-if="size === 'story' && props.photos?.length">Photo
              <select v-model="selectedPhotoId">
                <option value="">No photo</option>
                <option v-for="photo in props.photos" :key="photo.id" :value="photo.id">{{ photo.caption || 'Match photo' }}</option>
              </select>
            </label>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
          <div class="share-actions">
            <span class="hint">{{ sizeSpec.label }} PNG</span>
            <button class="btn ghost" @click="shareNative">Share</button>
            <button class="btn primary" @click="download">Download PNG</button>
            <button class="btn ghost small" @click="close">Close</button>
          </div>
        </aside>
        <div class="preview" :class="size">
          <canvas ref="canvas"></canvas>
        </div>
      </div>
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
  width: min(810px, 100%);
  max-height: calc(100vh - 36px);
  overflow: auto;
}
.share-head h2 {
  margin: 0;
}
.share-workspace {
  display: grid;
  grid-template-columns: 240px minmax(0, 468px);
  justify-content: center;
  gap: 20px;
  align-items: start;
  margin: 18px 0;
}
.share-sidebar {
  display: grid;
  gap: 16px;
  padding-right: 18px;
}
.sidebar-hint {
  margin: 0;
}
.share-controls {
  display: grid;
  gap: 12px;
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
  width: min(440px, 100%);
}
.preview.post canvas {
  width: min(440px, 100%);
}
.share-actions {
  display: grid;
  gap: 8px;
  align-items: start;
}
.share-actions .hint {
  margin: 0 0 2px;
}
@media (max-width: 700px) {
  .share-workspace {
    grid-template-columns: 1fr;
  }
  .share-sidebar {
    padding-right: 0;
  }
}
</style>
