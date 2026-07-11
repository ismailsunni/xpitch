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
import { fromLonLat } from 'ol/proj';
import { boundingExtent } from 'ol/extent';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style';
import { store, appliedField } from '../store';

// Standalone mode (e.g. the /field page): pass the pitch corners directly and
// render just the pitch on satellite, without a player track.
const props = defineProps<{ fieldCorners?: { lat: number; lon: number }[] }>();

const mapEl = ref<HTMLDivElement>();
const basemap = ref<'sat' | 'osm'>('sat');
let map: Map | null = null;
let osmLayer: TileLayer<OSM>;
let satLayer: TileLayer<XYZ>;

function setBasemap(b: 'sat' | 'osm') {
  basemap.value = b;
  osmLayer.setVisible(b === 'osm');
  satLayer.setVisible(b === 'sat');
}

onMounted(() => {
  osmLayer = new TileLayer({ source: new OSM(), visible: false });
  satLayer = new TileLayer({
    source: new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attributions: 'Imagery © Esri, Maxar, Earthstar Geographics',
      maxZoom: 20,
      crossOrigin: 'anonymous',
    }),
  });

  const layers: any[] = [osmLayer, satLayer];
  const focus: number[][] = [];

  // Field polygon: explicit corners (standalone) or the applied match field.
  const field = props.fieldCorners ? { corners: props.fieldCorners } : appliedField();
  if (field) {
    const ring = field.corners.map((c) => fromLonLat([c.lon, c.lat]));
    ring.push(ring[0]);
    focus.push(...ring);
    layers.push(
      new VectorLayer({
        source: new VectorSource({ features: [new Feature(new Polygon([ring]))] }),
        style: new Style({
          stroke: new Stroke({ color: '#38bdf8', width: 2 }),
          fill: new Fill({ color: 'rgba(56,189,248,0.10)' }),
        }),
      })
    );
  }

  // Player track for the current view (skipped in standalone field mode).
  const samples: any[] = props.fieldCorners
    ? []
    : (store.analytics?.samples || []).filter((s) => s.lat != null && s.lon != null);
  const step = Math.max(1, Math.floor(samples.length / 2500));
  const track: number[][] = [];
  for (let i = 0; i < samples.length; i += step) track.push(fromLonLat([samples[i].lon, samples[i].lat]));
  if (track.length) {
    if (!field) focus.push(...track);
    const feats: Feature[] = [new Feature(new LineString(track))];
    const mk = (pt: number[], color: string) => {
      const f = new Feature(new Point(pt));
      f.setStyle(new Style({ image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: '#04121c', width: 1.5 }) }) }));
      return f;
    };
    feats.push(mk(track[0], '#8c5afa'), mk(track[track.length - 1], '#ff961e'));
    layers.push(
      new VectorLayer({
        source: new VectorSource({ features: feats }),
        style: new Style({ stroke: new Stroke({ color: 'rgba(255,220,80,0.85)', width: 2 }) }),
      })
    );
  }

  map = new Map({
    target: mapEl.value,
    layers,
    view: new View({ center: fromLonLat([0, 0]), zoom: 2 }),
  });

  setTimeout(() => {
    map?.updateSize();
    if (focus.length) map?.getView().fit(boundingExtent(focus), { padding: [30, 30, 30, 30], maxZoom: 19 });
  }, 60);
});

onBeforeUnmount(() => {
  map?.setTarget(undefined);
  map = null;
});
</script>

<template>
  <div class="pm-wrap">
    <div class="pm-toolbar">
      <button class="btn small" :class="{ primary: basemap === 'sat' }" @click="setBasemap('sat')">🛰️ Satellite</button>
      <button class="btn small" :class="{ primary: basemap === 'osm' }" @click="setBasemap('osm')">🗺️ Map</button>
    </div>
    <div ref="mapEl" class="pm-map"></div>
  </div>
</template>

<style scoped>
.pm-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pm-toolbar {
  display: flex;
  gap: 6px;
}
.pm-map {
  width: 100%;
  height: 340px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: #0d141d;
}
:deep(.ol-attribution) {
  font-size: 10px;
}
</style>
