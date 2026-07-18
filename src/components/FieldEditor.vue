<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { Translate } from 'ol/interaction';
import { LineString, Polygon, Point } from 'ol/geom';
import { fromLonLat, toLonLat } from 'ol/proj';
import { boundingExtent } from 'ol/extent';
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from 'ol/style';
import type { MapBrowserEvent } from 'ol';
import { store, addField, updateField, setSelectedField } from '../store';
import { auth } from '../lib/auth';
import { upsertFieldCloud } from '../lib/api';

// Logged in: pitches live in the cloud; guests: localStorage.
const userFields = computed(() => (auth.user ? store.cloudFields : store.fields));
// Whether the loaded pitch is one the user can update in place.
const isEditingOwn = computed(
  () => !!editingId.value && userFields.value.some((f) => f.id === editingId.value)
);

const mapEl = ref<HTMLDivElement>();
const cornersLL = ref<number[][]>([]); // [lon, lat]
const basemap = ref<'sat' | 'osm'>('sat');
const showManual = ref(false);
const manualText = ref('');
const err = ref('');
const fieldName = ref('');
const editingId = ref<string | null>(null);
const visibility = ref<'private' | 'unlisted' | 'public'>('unlisted');
const hasTrack = ref(false);
const placeQuery = ref('');
const placeResults = ref<{ display_name: string; lat: string; lon: string; boundingbox?: string[] }[]>([]);
const placeSearching = ref(false);
const placeError = ref('');

let map: Map | null = null;
let cornerSource: VectorSource;
let savedFieldSource: VectorSource;
let osmLayer: TileLayer<OSM>;
let satLayer: TileLayer<XYZ>;
let polyFeature: Feature<Polygon> | null = null;

const cornerStyle = (i: number) =>
  new Style({
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: '#c8f751' }),
      stroke: new Stroke({ color: '#052012', width: 2 }),
    }),
    text: new Text({ text: String(i + 1), fill: new Fill({ color: '#052012' }), font: 'bold 11px system-ui' }),
  });

// [lon,lat] ring closed back to the first corner, in map projection.
function closedRing(ll: number[][]): number[][] {
  const ring = ll.map((c) => fromLonLat(c));
  if (ll.length) ring.push(fromLonLat(ll[0]));
  return ring;
}

function redrawCorners() {
  cornerSource.clear();
  polyFeature = null;
  const ll = cornersLL.value;
  if (ll.length >= 3) {
    polyFeature = new Feature(new Polygon([closedRing(ll)]));
    polyFeature.setStyle(
      new Style({ stroke: new Stroke({ color: '#c8f751', width: 2 }), fill: new Fill({ color: 'rgba(200,247,81,0.18)' }) })
    );
    cornerSource.addFeature(polyFeature);
  }
  ll.forEach((c, i) => {
    const f = new Feature(new Point(fromLonLat(c)));
    f.set('cidx', i); // tag so the Translate interaction knows which corner it is
    f.setStyle(cornerStyle(i));
    cornerSource.addFeature(f);
  });
}

function refreshSavedFields() {
  if (!savedFieldSource) return;
  savedFieldSource.clear();
  for (const field of userFields.value) {
    if (!field.corners?.length) continue;
    const polygon = new Feature(new Polygon([closedRing(field.corners.map((corner) => [corner.lon, corner.lat]))]));
    polygon.set('name', field.name);
    savedFieldSource.addFeature(polygon);
  }
}

watch(userFields, refreshSavedFields, { deep: true });

// Live drag of a corner handle: rewrite that corner and reshape the polygon
// in place (no full redraw, which would drop the feature being dragged).
function onCornerDrag(e: any) {
  const f = e.features?.item(0) as Feature<Point> | undefined;
  const idx = f?.get('cidx');
  if (!f || idx == null) return;
  const ll = toLonLat(f.getGeometry()!.getCoordinates());
  cornersLL.value[idx] = [ll[0], ll[1]];
  if (polyFeature && cornersLL.value.length >= 3) {
    polyFeature.getGeometry()!.setCoordinates([closedRing(cornersLL.value)]);
  }
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

async function searchPlaces() {
  const query = placeQuery.value.trim();
  if (query.length < 2) {
    placeError.value = 'Enter at least two characters to search.';
    placeResults.value = [];
    return;
  }
  placeSearching.value = true;
  placeError.value = '';
  try {
    const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5' });
    if (navigator.language) params.set('accept-language', navigator.language);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Search is temporarily unavailable.');
    placeResults.value = await response.json();
    if (!placeResults.value.length) placeError.value = 'No places found.';
  } catch (e: any) {
    placeError.value = e?.message || 'Could not search for that place.';
  } finally {
    placeSearching.value = false;
  }
}

function selectPlace(place: { display_name: string; lat: string; lon: string; boundingbox?: string[] }) {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !map) return;
  const box = place.boundingbox?.map(Number);
  if (box?.length === 4 && box.every(Number.isFinite)) {
    const [south, north, west, east] = box;
    fitTo([fromLonLat([west, south]), fromLonLat([east, north])]);
  } else {
    map.getView().animate({ center: fromLonLat([lon, lat]), zoom: 18, duration: 250 });
  }
  placeQuery.value = place.display_name;
  placeResults.value = [];
  placeError.value = '';
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

async function save() {
  if (cornersLL.value.length < 4) {
    err.value = 'Place all 4 corners of the pitch first.';
    return;
  }
  const corners = cornersLL.value.map((c) => ({ lat: c[1], lon: c[0] }));
  const name = fieldName.value.trim() || 'Field ' + (userFields.value.length + 1);
  let savedId: string | null = null;
  try {
    if (auth.user) {
      // Editing an existing cloud pitch updates it; otherwise create a new one.
      const cloudId = store.cloudFields.some((f) => f.id === editingId.value) ? editingId.value! : undefined;
      const saved = await upsertFieldCloud({ id: cloudId, name, corners, visibility: visibility.value });
      savedId = saved.id;
    } else {
      const isUser = store.fields.some((f) => f.id === editingId.value);
      if (editingId.value && isUser) {
        updateField(editingId.value, name, corners);
        savedId = editingId.value;
      }
      else savedId = addField(name, corners);
    }
  } catch (e: any) {
    err.value = e?.message || 'Could not save pitch';
    return;
  }
  if (savedId) setSelectedField(savedId);
  close();
}

function close() {
  store.fieldEditorOpen = false;
  store.editFieldTarget = null;
  store.fieldEditorContext = 'standalone';
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
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
  savedFieldSource = new VectorSource();
  const savedFieldLayer = new VectorLayer({
    source: savedFieldSource,
    style: (feature) =>
      new Style({
        stroke: new Stroke({ color: 'rgba(43,108,255,0.72)', width: 2 }),
        fill: new Fill({ color: 'rgba(43,108,255,0.08)' }),
        text: new Text({
          text: String(feature.get('name') || ''),
          fill: new Fill({ color: 'rgba(43,108,255,0.95)' }),
          stroke: new Stroke({ color: 'rgba(8,12,10,0.8)', width: 3 }),
          font: '600 12px system-ui',
          overflow: true,
        }),
      }),
  });
  refreshSavedFields();

  const samples: any[] = store.fieldEditorContext === 'match'
    ? (store.analytics?.samples || []).filter((s) => s.lat != null && s.lon != null)
    : [];
  const step = Math.max(1, Math.floor(samples.length / 2000));
  const track3857: number[][] = [];
  for (let i = 0; i < samples.length; i += step) track3857.push(fromLonLat([samples[i].lon, samples[i].lat]));
  hasTrack.value = track3857.length > 0;
  const trackLayer = new VectorLayer({
    source: new VectorSource({ features: track3857.length ? [new Feature(new LineString(track3857))] : [] }),
    style: new Style({ stroke: new Stroke({ color: 'rgba(255,220,80,0.9)', width: 2 }) }),
  });

  map = new Map({
    target: mapEl.value,
    layers: [osmLayer, satLayer, trackLayer, savedFieldLayer, cornerLayer],
    view: new View({ center: fromLonLat([0, 0]), zoom: 2 }),
    controls: [],
  });
  map.on('click', onMapClick);

  // Drag any placed corner to fine-tune it (edit pitch).
  const translate = new Translate({
    hitTolerance: 6,
    filter: (f) => f.get('cidx') != null,
  });
  translate.on('translating', onCornerDrag);
  translate.on('translateend', onCornerDrag);
  map.addInteraction(translate);

  // Only an explicit Edit pitch action may preload an existing field. New
  // pitch starts with a blank polygon, even when a match has a pitch applied.
  const target = store.editFieldTarget;
  if (target) {
    cornersLL.value = target.corners.map((c) => [c.lon, c.lat]);
    fieldName.value = target.name;
    editingId.value = target.id;
    visibility.value = (target.visibility as any) || 'unlisted';
    redrawCorners();
  } else {
    fieldName.value = store.location || '';
  }

  const focus = track3857.length ? track3857 : cornersLL.value.map((c) => fromLonLat(c));
  setTimeout(() => {
    map?.updateSize();
    if (focus.length) fitTo(focus);
    else centerForNewPitch();
  }, 60);
});

// New-pitch mode: start near a known pitch, else the user's location.
function centerForNewPitch() {
  const f = store.cloudFields[0] || store.fields[0];
  if (f && f.corners?.length) {
    fitTo(f.corners.map((c) => fromLonLat([c.lon, c.lat])));
    return;
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => map?.getView().animate({ center: fromLonLat([pos.coords.longitude, pos.coords.latitude]), zoom: 18 }),
      () => {},
      { timeout: 5000 }
    );
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  map?.setTarget(undefined);
  map = null;
});
</script>

<template>
  <div class="fe-overlay" @click.self="close">
    <div class="fe-modal" role="dialog" aria-modal="true" aria-labelledby="field-editor-title">
      <header class="fe-head">
        <div>
          <h3 id="field-editor-title">{{ editingId ? 'Edit pitch' : hasTrack ? 'Set the pitch field' : 'New pitch' }}</h3>
          <p class="hint" style="margin: 2px 0 0">
            Click the <strong>4 corners</strong> of the pitch on the map ({{ cornersLL.length }}/4), then
            <strong>drag a corner</strong> to fine-tune it.
            <template v-if="hasTrack">Your GPS track is shown in yellow.</template>
            Saved pitches auto-match matches played there.
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

      <form class="place-search" @submit.prevent="searchPlaces">
        <input v-model="placeQuery" type="search" placeholder="Search for a place or address" aria-label="Search for a place or address" />
        <button class="btn ghost small" type="submit" :disabled="placeSearching">{{ placeSearching ? 'Searching…' : 'Search' }}</button>
        <div v-if="placeResults.length || placeError" class="place-results">
          <button v-for="place in placeResults" :key="`${place.lat}:${place.lon}:${place.display_name}`" type="button" @click="selectPlace(place)">{{ place.display_name }}</button>
          <p v-if="placeError" class="error">{{ placeError }}</p>
        </div>
      </form>

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
        <label v-if="auth.user" class="fe-name">
          <span class="k">Visibility</span>
          <select v-model="visibility">
            <option value="private">Private (only me)</option>
            <option value="unlisted">Unlisted (link only)</option>
            <option value="public">Public (anyone can reuse)</option>
          </select>
        </label>
        <div class="fe-actions">
          <button class="btn ghost small" @click="close">Cancel</button>
          <button class="btn primary" :disabled="cornersLL.length < 4" @click="save">
            {{ isEditingOwn ? 'Update pitch' : editingId ? 'Save as new pitch' : 'Save pitch' }}
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
  /* The upload wizard can launch this editor; it must remain actionable above it. */
  z-index: 130;
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
.fe-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border);
}
.seg {
  display: flex;
  gap: 4px;
}
.place-search {
  position: relative;
  display: flex;
  gap: 8px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border);
}
.place-search > input {
  width: min(420px, 100%);
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: var(--ctl-pad-y-sm) 10px;
  font: inherit;
  font-size: 13px;
}
.place-results {
  position: absolute;
  z-index: 2;
  top: calc(100% - 4px);
  left: 18px;
  width: min(560px, calc(100vw - 72px));
  max-height: 220px;
  overflow: auto;
  background: var(--bg-elev);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow);
}
.place-results button {
  display: block;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  padding: 9px 10px;
  text-align: left;
  font: inherit;
  font-size: 12px;
  line-height: 1.35;
  cursor: pointer;
}
.place-results button:hover {
  background: var(--bg-elev2);
}
.place-results .error {
  margin: 0;
  padding: 9px 10px;
  font-size: 12px;
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
  background: #0d1712;
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
.fe-name input,
.fe-name select {
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: var(--ctl-pad-y) var(--ctl-pad-x);
  line-height: var(--ctl-line);
  font-size: 13px;
  min-width: 220px;
}
.fe-name select {
  min-width: 180px;
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
