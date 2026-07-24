<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { auth } from '../lib/auth';
import { userErrorMessage } from '../lib/errors';
import {
  beginStravaConnection,
  disconnectStrava,
  getStravaConnection,
  importStravaActivities,
  listStravaActivities,
  syncStravaActivities,
  type StravaActivity,
  type StravaConnection,
} from '../lib/strava';

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
const route = useRoute();
const router = useRouter();
const connection = ref<StravaConnection | null>(null);
const activities = ref<StravaActivity[]>([]);
const busy = ref('');
const error = ref('');
const notice = ref('');
const selected = ref<Set<number>>(new Set());
const selectedCount = computed(() => selected.value.size);

async function load() {
  if (!auth.user) return;
  try {
    connection.value = await getStravaConnection();
    activities.value = !props.compact && connection.value ? await listStravaActivities() : [];
    selected.value = new Set();
  } catch (e: any) {
    error.value = userErrorMessage(e, 'Could not load Strava connection status.');
  }
}

onMounted(() => {
  const status = typeof route.query.strava === 'string' ? route.query.strava : '';
  const message = typeof route.query.stravaMessage === 'string' ? route.query.stravaMessage : '';
  if (status === 'connected') notice.value = 'Strava connected. Sync activities to import one.';
  else if (status === 'denied' || status === 'error') error.value = message || 'Strava was not connected.';
  if (status) void router.replace({ query: { ...route.query, strava: undefined, stravaMessage: undefined } });
  void load();
});
watch(() => auth.user?.id, () => void load());

async function connect() {
  error.value = '';
  busy.value = 'connect';
  try {
    await beginStravaConnection();
  } catch (e: any) {
    error.value = userErrorMessage(e, 'Could not open Strava authorization.');
    busy.value = '';
  }
}

async function sync() {
  error.value = '';
  notice.value = '';
  busy.value = 'sync';
  try {
    const count = await syncStravaActivities();
    activities.value = await listStravaActivities();
    connection.value = await getStravaConnection();
    selected.value = new Set();
    notice.value = `Synced ${count} recent Strava activities.`;
  } catch (e: any) {
    error.value = userErrorMessage(e, 'Could not sync Strava activities.');
  } finally {
    busy.value = '';
  }
}

function toggle(activity: StravaActivity, event: Event) {
  const next = new Set(selected.value);
  if ((event.target as HTMLInputElement).checked) next.add(activity.strava_activity_id);
  else next.delete(activity.strava_activity_id);
  selected.value = next;
}

async function importSelected() {
  if (!selected.value.size) return;
  error.value = '';
  busy.value = 'import';
  try {
    await importStravaActivities([...selected.value]);
    await router.replace('/analyze');
  } catch (e: any) {
    error.value = userErrorMessage(e, 'Could not import the selected Strava activities.');
  } finally {
    busy.value = '';
  }
}

async function disconnect() {
  if (!window.confirm('Disconnect Strava? xPitch will delete its saved Strava tokens.')) return;
  error.value = '';
  busy.value = 'disconnect';
  try {
    await disconnectStrava();
    connection.value = null;
    activities.value = [];
    selected.value = new Set();
    notice.value = 'Strava disconnected.';
  } catch (e: any) {
    error.value = userErrorMessage(e, 'Could not disconnect Strava.');
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <section class="strava-importer" :class="{ compact }">
    <div class="strava-head">
      <div>
        <p v-if="!compact" class="eyebrow">Activity source</p>
        <h2>Import from Strava</h2>
        <p v-if="!compact">Choose one activity or combine up to ten activities into one match setup.</p>
      </div>
      <button v-if="!connection" class="btn primary" :disabled="busy === 'connect'" @click="connect">
        {{ busy === 'connect' ? 'Opening Strava…' : 'Connect Strava' }}
      </button>
      <button v-else class="btn ghost small" :disabled="busy === 'disconnect'" @click="disconnect">
        {{ busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect' }}
      </button>
    </div>

    <template v-if="connection">
      <div class="strava-status">
        <span>Connected as {{ connection.athlete_username ? '@' + connection.athlete_username : connection.athlete_firstname || 'Strava athlete' }}</span>
        <RouterLink v-if="compact" class="btn ghost small" to="/analyze?source=strava">Open importer</RouterLink>
        <button v-else class="btn ghost small" :disabled="busy === 'sync'" @click="sync">
          {{ busy === 'sync' ? 'Syncing…' : 'Sync activities' }}
        </button>
      </div>
      <template v-if="!compact">
        <div v-if="activities.length" class="strava-list">
          <div class="strava-selection">
            <span>{{ selectedCount ? selectedCount + ' selected' : 'Select one or more activities' }}</span>
            <button class="btn primary small" :disabled="!selectedCount || busy === 'import'" @click="importSelected">
              {{ busy === 'import' ? 'Importing…' : 'Import selected' }}
            </button>
          </div>
          <article v-for="activity in activities" :key="activity.strava_activity_id" class="strava-activity">
            <input type="checkbox" :checked="selected.has(activity.strava_activity_id)" :disabled="!!activity.imported_match_id || busy === 'import'" :aria-label="`Select ${activity.name || 'activity'}`" @change="toggle(activity, $event)" />
            <div>
              <strong>{{ activity.name || 'Untitled activity' }}</strong>
              <span>{{ activity.start_date ? new Date(activity.start_date).toLocaleDateString() : 'Unknown date' }} · {{ activity.sport_type || 'Activity' }}</span>
              <span>{{ activity.distance_m ? (activity.distance_m / 1000).toFixed(2) + ' km' : 'No distance' }}<template v-if="activity.has_heartrate"> · HR</template></span>
            </div>
            <span v-if="activity.imported_match_id" class="imported">Imported</span>
          </article>
        </div>
        <p v-else class="hint">No activities synced yet. Sync to load your 100 most recent Strava activities.</p>
      </template>
    </template>
    <p v-if="notice" class="hint msg ok">{{ notice }}</p>
    <p v-if="error" class="error msg">{{ error }}</p>
  </section>
</template>

<style scoped>
.strava-importer { max-width: 760px; margin: 34px auto; padding: 24px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-elev); }
.strava-importer.compact { max-width: none; margin: 18px 0 0; padding: 18px; }
.strava-head, .strava-status, .strava-activity { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.eyebrow { margin: 0 0 5px; font: 11px var(--font-mono); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
h2 { margin: 0; font-size: 20px; }
.strava-head p:not(.eyebrow) { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
.strava-status { margin-top: 16px; color: var(--muted); font-size: 13px; }
.strava-list { margin-top: 12px; border-top: 1px solid var(--border); }
.strava-selection { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px; }
.strava-activity { padding: 10px 0; border-bottom: 1px solid var(--border); }
.strava-activity input { flex: none; width: 16px; height: 16px; accent-color: var(--accent-ink); }
.strava-activity > div { min-width: 0; display: grid; gap: 2px; }
.strava-activity strong { font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.strava-activity span { color: var(--muted); font-size: 12px; }
.strava-activity .imported, .msg.ok { color: var(--accent2); font-weight: 600; }
.msg { margin: 12px 0 0; }
@media (max-width: 560px) { .strava-head { align-items: flex-start; flex-direction: column; } .strava-activity { align-items: flex-start; } }
</style>
