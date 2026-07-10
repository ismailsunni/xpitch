<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { LineString, Polygon, Point } from 'ol/geom';
import { fromLonLat, toLonLat } from 'ol/proj';
import { boundingExtent } from 'ol/extent';
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from 'ol/style';
import type { MapBrowserEvent } from 'ol';
import { store, addField, updateField, removeField, appliedField } from '../store';

const mapEl = ref<HTMLDivElement>();
const cornersLL = ref<number[][]>([]); // [lon, lat]
const basemap = ref<'sat' | 'osm'>('sat');
const showManual = ref(false);
const manualText = ref('');
const err = ref('');
const fieldName = ref('');
const editingId = ref<string | null>(null);

let map: Map | null = null;
let cornerSource: VectorSource;
let osmLayer: TileLayer<OSM>;
let satLayer: TileLayer<XYZ>;

const cornerStyle = (i: number) =>
  new Style({
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: '#38bdf8' }),
      stroke: new Stroke({ color: '#04121c', width: 2 }),
    }),
    text: new Text({ text: String(i + 1), fill: new Fill({ color: '#04121c' }), font: 'bold 11px system-ui' }),
  });

function redrawCorners() {
  cornerSource.clear();
  const ll = cornersLL.value;
  if (ll.length >= 3) {
    const ring = ll.map((c) => fromLonLat(c));
    ring.push(fromLonLat(ll[0]));
    const poly = new Feature(new Polygon([ring]));
    poly.setStyle(
      new Style({ stroke: new Stroke({ color: '#38bdf8', width: 2 }), fill: new Fill({ color: 'rgba(56,189,248,0.18)' }) })
    );
    cornerSource.addFeature(poly);
  }
  ll.forEach((c, i) => {
    const f = new Feature(new Point(fromLonLat(c)));
    f.setStyle(cornerStyle(i));
    cornerSource.addFeature(f);
  });
}

function onMapClick(e: MapBrowserEvent<any>) {
  if (cornersLL.value.length >= 4) return;
  const ll = toLonLat(e.coordinate);
  cornersLL.value = [...cornersLL.value, [ll[0], ll[1]]];
  redrawCorners();
}

function resetCorners() {
  cornersLL.value = [];
  err.value = '';
  redrawCorners();
}

function setBasemap(b: 'sat' | 'osm') {
  basemap.value = b;
  osmLayer.setVisible(b === 'osm');
  satLayer.setVisible(b === 'sat');
}

function fitTo(coords3857: number[][]) {
  if (!map || !coords3857.length) return;
  map.getView().fit(boundingExtent(coords3857), { padding: [50, 50, 50, 50], maxZoom: 19 });
}

function applyManual() {
  err.value = '';
  try {
    const t = manualText.value.trim();
    let out: number[][] = [];
    if (t.startsWith('{')) {
      const g = JSON.parse(t);
      let ring: number[][] | undefined;
      if (g.type === 'Polygon') ring = g.coordinates[0];
      else if (g.type === 'Feature') ring = g.geometry.coordinates[0];
      else if (g.type === 'FeatureCollection') ring = g.features[0].geometry.coordinates[0];
      if (!ring) throw new Error('No polygon found in GeoJSON');
      out = ring.slice(0, 4).map((c: number[]) => [c[0], c[1]]);
    } else {
      const rows = t
        .split(/\n+/)
        .map((l) => l.split(/[,\s]+/).map(Number).filter((n) => isFinite(n)))
        .filter((r) => r.length >= 2);
      out = rows.slice(0, 4).map((r) => [r[1], r[0]]); // typed "lat, lon"
    }
    if (out.length < 4) throw new Error('Need at least 4 corners');
    cornersLL.value = out;
    redrawCorners();
    fitTo(out.map((c) => fromLonLat(c)));
  } catch (e: any) {
    err.value = e?.message || 'Could not parse input';
  }
}

function loadSaved(f: { id: string; name: string; corners: { lat: number; lon: number }[] }) {
  cornersLL.value = f.corners.map((c) => [c.lon, c.lat]);
  fieldName.value = f.name;
  editingId.value = f.id;
  err.value = '';
  redrawCorners();
  fitTo(cornersLL.value.map((c) => fromLonLat(c)));
}

function deleteSaved(id: string) {
  removeField(id);
  if (editingId.value === id) {
    editingId.value = null;
    resetCorners();
  }
}

function save() {
  if (cornersLL.value.length < 4) {
    err.value = 'Place all 4 corners of the pitch first.';
    return;
  }
  const corners = cornersLL.value.map((c) => ({ lat: c[1], lon: c[0] }));
  const name = fieldName.value.trim() || 'Field ' + (store.fields.length + 1);
  if (editingId.value) updateField(editingId.value, name, corners);
  else addField(name, corners);
  close();
}

function close() {
  store.fieldEditorOpen = false;
}

onMounted(() => {
  osmLayer = new TileLayer({ source: new OSM(), visible: false });
  satLayer = new TileLayer({
    source: new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attributions: 'Imagery © Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
      crossOrigin: 'anonymous',
    }),
  });
  cornerSource = new VectorSource();
  const cornerLayer = new VectorLayer({ source: cornerSource });

  const samples: any[] = (store.analytics?.samples || []).filter((s) => s.lat != null && s.lon != null);
  const step = Math.max(1, Math.floor(samples.length / 2000));
  const track3857: number[][] = [];
  for (let i = 0; i < samples.length; i += step) track3857.push(fromLonLat([samples[i].lon, samples[i].lat]));
  const trackLayer = new VectorLayer({
    source: new VectorSource({ features: track3857.length ? [new Feature(new LineString(track3857))] : [] }),
    style: new Style({ stroke: new Stroke({ color: 'rgba(255,220,80,0.9)', width: 2 }) }),
  });

  map = new Map({
    target: mapEl.value,
    layers: [osmLayer, satLayer, trackLayer, cornerLayer],
    view: new View({ center: fromLonLat([0, 0]), zoom: 2 }),
    controls: [],
  });
  map.on('click', onMapClick);

  // Preload the field already applied to this view, if any.
  const applied = appliedField();
  if (applied) {
    cornersLL.value = applied.corners.map((c) => [c.lon, c.lat]);
    fieldName.value = applied.name;
    editingId.value = applied.id;
    redrawCorners();
  } else {
    fieldName.value = store.location || 'Field ' + (store.fields.length + 1);
  }

  const focus = track3857.length ? track3857 : cornersLL.value.map((c) => fromLonLat(c));
  setTimeout(() => {
    map?.updateSize();
    fitTo(focus);
  }, 60);
});

onBeforeUnmount(() => {
  map?.setTarget(undefined);
  map = null;
});
</script>

<template>
  <div class="fe-overlay">
    <div class="fe-modal">
      <header class="fe-head">
        <div>
          <h3>Set the pitch field</h3>
          <p class="hint" style="margin: 2px 0 0">
            Click the <strong>4 corners</strong> of the pitch on the map ({{ cornersLL.length }}/4).
            Your GPS track is shown in yellow. Saved pitches are matched to matches by location
            automatically.
          </p>
        </div>
        <button class="btn ghost small" @click="close">✕ Close</button>
      </header>

      <div class="fe-toolbar">
        <div class="seg">
          <button class="btn small" :class="{ primary: basemap === 'sat' }" @click="setBasemap('sat')">🛰️ Satellite</button>
          <button class="btn small" :class="{ primary: basemap === 'osm' }" @click="setBasemap('osm')">🗺️ Map</button>
        </div>
        <button class="btn ghost small" @click="resetCorners">↺ Reset corners</button>
        <button class="btn ghost small" @click="showManual = !showManual">⌨ Enter coordinates</button>
        <span v-if="err" class="error" style="margin: 0; font-size: 12.5px">{{ err }}</span>
      </div>

      <div v-if="store.fields.length" class="fe-saved">
        <span class="k">Saved pitches</span>
        <span v-for="f in store.fields" :key="f.id" class="pill-btn" :class="{ active: editingId === f.id }">
          <span style="cursor: pointer" @click="loadSaved(f)">{{ f.name }}</span>
          <span class="del" title="Delete" @click="deleteSaved(f.id)">✕</span>
        </span>
      </div>

      <div v-if="showManual" class="fe-manual">
        <textarea
          v-model="manualText"
          rows="4"
          placeholder="Paste GeoJSON Polygon, or 4 lines of &quot;lat, lon&quot;:
46.2041, 6.1430
46.2042, 6.1436
46.2038, 6.1437
46.2037, 6.1431"
        ></textarea>
        <button class="btn small" @click="applyManual">Apply coordinates</button>
      </div>

      <div ref="mapEl" class="fe-map"></div>

      <footer class="fe-foot">
        <label class="fe-name">
          <span class="k">Pitch name</span>
          <input v-model="fieldName" type="text" placeholder="e.g. Rledok Mini Soccer" />
        </label>
        <div class="fe-actions">
          <button class="btn ghost small" @click="close">Cancel</button>
          <button class="btn primary" :disabled="cornersLL.length < 4" @click="save">
            {{ editingId ? 'Update pitch' : 'Save pitch' }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.fe-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 14, 0.72);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}
.fe-modal {
  width: min(980px, 100%);
  height: min(90vh, 860px);
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.fe-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
.fe-head h3 {
  margin: 0;
  font-size: 16px;
}
.fe-toolbar,
.fe-saved {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border);
}
.fe-saved .k {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}
.fe-saved .pill-btn {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.fe-saved .del {
  color: var(--muted);
  cursor: pointer;
  font-size: 11px;
}
.fe-saved .del:hover {
  color: var(--danger);
}
.seg {
  display: flex;
  gap: 4px;
}
.fe-manual {
  display: flex;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  align-items: flex-start;
}
.fe-manual textarea {
  flex: 1;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 8px 10px;
  font: 12px ui-monospace, monospace;
  resize: vertical;
}
.fe-map {
  flex: 1;
  min-height: 0;
  background: #0d141d;
}
.fe-foot {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}
.fe-name {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.fe-name .k {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}
.fe-name input {
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 13px;
  min-width: 220px;
}
.fe-actions {
  display: flex;
  gap: 10px;
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
:deep(.ol-attribution) {
  font-size: 10px;
}
</style>
