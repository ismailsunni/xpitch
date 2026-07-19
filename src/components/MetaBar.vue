<script setup lang="ts">
import { computed } from 'vue';
import { store, setFormat, appliedField, allFields, setSelectedField, openFieldEditor } from '../store';
import { auth } from '../lib/auth';
import { FORMATS } from '../lib/analytics';

const props = defineProps<{ editing?: boolean }>();

// A one-line, natural-language summary of the match. Format and pitch are
// edited inline here (they define how the match reads), so the settings gear
// only carries the remaining analysis params.
const meta = computed(() => store.analytics?.meta);
const readOnly = computed(() => store.cloud.mode === 'cloud' && auth.user?.id !== store.cloud.ownerId);
const canEditInline = computed(() => !readOnly.value && (props.editing || store.cloud.mode === 'local'));
const hasGPS = computed(() => !!meta.value?.hasGPS);
const usingField = computed(() => !!store.analytics?.positional?.hasField);
const field = computed(() => appliedField());

const when = computed(() => {
  const d: Date | undefined = meta.value?.startDate;
  return d
    ? d.toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
});

const coords = computed(() => {
  const la = meta.value?.startLat;
  const lo = meta.value?.startLon;
  return la != null && lo != null ? { la, lo } : null;
});
const osmUrl = computed(() =>
  coords.value
    ? `https://www.openstreetmap.org/?mlat=${coords.value.la}&mlon=${coords.value.lo}#map=16/${coords.value.la}/${coords.value.lo}`
    : null
);

// Where it was played: the defined pitch name, else the geocoded place.
const placeName = computed(() => {
  if (usingField.value && field.value?.name) return field.value.name;
  if (store.location) return store.location;
  if (coords.value) return `${coords.value.la.toFixed(3)}, ${coords.value.lo.toFixed(3)}`;
  return null;
});
const fieldSlug = computed(() => (usingField.value ? field.value?.slug || '' : ''));
const pitchOptions = computed(() => allFields());
const pitchValue = computed(() => store.selectedFieldId || store.appliedFieldId || '');
const hasPitchOption = computed(() => !pitchValue.value || pitchOptions.value.some((p) => p.id === pitchValue.value));
const pitchStatus = computed(() => {
  if (usingField.value) return { label: 'Pitch set', tone: 'ok' };
  if (hasGPS.value) return { label: 'GPS only', tone: 'warn' };
  return { label: 'No GPS', tone: 'muted' };
});

const formatOptions = Object.values(FORMATS);
const resolvedShort = computed(() => (meta.value ? FORMATS[meta.value.format]?.short || meta.value.format : ''));
const autoLabel = computed(() =>
  store.options.format === 'auto' && resolvedShort.value ? `Auto-detect → ${resolvedShort.value}` : 'Auto-detect'
);
function choosePitch(value: string) {
  setSelectedField(value || null);
}
</script>

<template>
  <section class="matchline" v-if="meta">
    <p class="sentence">
      <!-- Format (inline editable for owners) -->
      <select
        v-if="canEditInline"
        class="inline-select"
        :value="store.options.format"
        aria-label="Match format"
        @change="setFormat(($event.target as HTMLSelectElement).value as any)"
      >
        <option v-for="f in formatOptions" :key="f.key" :value="f.key">
          {{ f.key === 'auto' ? autoLabel : f.label }}
        </option>
      </select>
      <strong v-else>{{ meta.formatLabel }}</strong>

      <!-- Pitch / place -->
      <template v-if="placeName">
        <span class="conj">in</span>
        <template v-if="!canEditInline || !hasGPS">
          <RouterLink v-if="fieldSlug" :to="`/field/${fieldSlug}`" class="place">{{ placeName }}</RouterLink>
          <span v-else class="place">{{ placeName }}</span>
        </template>
        <select
          v-if="canEditInline && hasGPS"
          class="pitch-select"
          :value="pitchValue"
          aria-label="Select pitch"
          @change="choosePitch(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Auto pitch</option>
          <option v-if="!hasPitchOption" :value="pitchValue">Selected pitch</option>
          <option v-for="p in pitchOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button
          v-if="canEditInline && hasGPS"
          class="pitch-edit"
          :aria-label="usingField ? 'Edit or create pitch' : 'Create pitch'"
          :title="usingField ? 'Edit or create pitch' : 'Create pitch'"
          @click="openFieldEditor(undefined, 'match')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
      </template>

      <!-- When -->
      <template v-if="when">
        <span class="conj">at</span>
        <span class="when">{{ when }}</span>
        <a v-if="osmUrl" :href="osmUrl" target="_blank" rel="noopener" class="maplink">map ↗</a>
      </template>

      <span v-if="store.files.length > 1" class="files">· {{ store.files.length }} files</span>
      <span class="pitch-status" :class="pitchStatus.tone">{{ pitchStatus.label }}</span>
    </p>

    <button
      v-if="canEditInline"
      class="gear"
      :class="{ on: store.settingsOpen }"
      aria-label="Analysis settings"
      :aria-expanded="store.settingsOpen"
      title="Analysis settings"
      @click="store.settingsOpen = !store.settingsOpen"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
      <svg class="caret" :class="{ open: store.settingsOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  </section>
</template>

<style scoped>
.matchline {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 22px;
  border-bottom: 1px solid var(--border);
}
.sentence {
  margin: 0;
  font-size: 15px;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  line-height: 1.5;
}
.conj {
  color: var(--muted);
  font-weight: 400;
}
.place {
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
}
a.place:hover {
  color: var(--accent-ink);
}
.when {
  font-weight: 600;
}
.files {
  color: var(--muted2);
  font-size: 13px;
}
.maplink {
  font-size: 12.5px;
  font-weight: 500;
}
.pitch-status {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 700;
}
.pitch-status.ok {
  color: var(--accent-ink);
  border-color: var(--accent-tint-strong);
  background: var(--accent-tint);
}
.pitch-status.warn {
  color: var(--c-amber);
}
/* Format select styled to sit inside the sentence like editable text. */
.inline-select {
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 2px 6px;
  margin-left: -4px;
  cursor: pointer;
}
.inline-select:hover {
  border-color: var(--border);
  background: var(--bg-elev2);
}
.pitch-select {
  max-width: 220px;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px 7px;
  cursor: pointer;
}
.pitch-select:hover {
  border-color: var(--border-strong);
}
.pitch-edit {
  display: inline-flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 3px;
  border-radius: 6px;
  color: var(--muted);
}
.pitch-edit svg {
  width: 15px;
  height: 15px;
}
.pitch-edit:hover {
  background: var(--bg-elev2);
  color: var(--accent-ink);
}
.gear {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  padding: 6px 9px;
  border-radius: var(--ctl-radius);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: 0.15s;
}
.gear:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.gear.on {
  color: var(--accent-ink);
  border-color: var(--accent-ink);
  background: var(--accent-tint);
}
.gear svg {
  width: 16px;
  height: 16px;
}
.gear .caret {
  width: 11px;
  height: 11px;
  transition: transform 0.15s;
}
.gear .caret.open {
  transform: rotate(180deg);
}
@media (max-width: 640px) {
  .matchline {
    padding: 12px 14px;
  }
  .sentence {
    gap: 5px;
    font-size: 14px;
  }
  .inline-select,
  .pitch-select {
    max-width: 100%;
  }
  .gear {
    margin-left: 0;
  }
}
</style>
