<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { auth, setUsername } from '../lib/auth';
import { supabaseEnabled } from '../lib/supabase';
import { updateProfile } from '../lib/api';
import { userErrorMessage } from '../lib/errors';
import {
  beginStravaConnection,
  disconnectStrava,
  getStravaConnection,
  importStravaActivity,
  listStravaActivities,
  syncStravaActivities,
  type StravaActivity,
  type StravaConnection,
} from '../lib/strava';

const form = ref({ username: '', display_name: '', birth_date: '', max_hr: '', rest_hr: '', bio: '' });
const err = ref('');
const ok = ref(false);
const busy = ref(false);
const route = useRoute();
const router = useRouter();
const stravaConnection = ref<StravaConnection | null>(null);
const stravaActivities = ref<StravaActivity[]>([]);
const stravaBusy = ref('');
const stravaError = ref('');
const stravaNotice = ref('');

function init() {
  const p = auth.profile;
  form.value = {
    username: p?.username || '',
    display_name: p?.display_name || '',
    birth_date: p?.birth_date || '',
    max_hr: p?.max_hr?.toString() || '',
    rest_hr: p?.rest_hr?.toString() || '',
    bio: p?.bio || '',
  };
}
onMounted(init);
watch(() => auth.profile, init);

async function loadStrava() {
  if (!supabaseEnabled || !auth.user) return;
  try {
    stravaConnection.value = await getStravaConnection();
    stravaActivities.value = stravaConnection.value ? await listStravaActivities() : [];
  } catch (e: any) {
    stravaError.value = userErrorMessage(e, 'Could not load Strava connection status.');
  }
}

onMounted(() => {
  const status = typeof route.query.strava === 'string' ? route.query.strava : '';
  const message = typeof route.query.stravaMessage === 'string' ? route.query.stravaMessage : '';
  if (status === 'connected') stravaNotice.value = 'Strava connected. Sync activities to import one.';
  else if (status === 'denied' || status === 'error') stravaError.value = message || 'Strava was not connected.';
  if (status) void router.replace({ query: {} });
  void loadStrava();
});

async function connectStrava() {
  stravaError.value = '';
  stravaBusy.value = 'connect';
  try {
    await beginStravaConnection();
  } catch (e: any) {
    stravaError.value = userErrorMessage(e, 'Could not open Strava authorization.');
    stravaBusy.value = '';
  }
}

async function syncStrava() {
  stravaError.value = '';
  stravaNotice.value = '';
  stravaBusy.value = 'sync';
  try {
    const count = await syncStravaActivities();
    stravaActivities.value = await listStravaActivities();
    stravaConnection.value = await getStravaConnection();
    stravaNotice.value = `Synced ${count} recent Strava activities.`;
  } catch (e: any) {
    stravaError.value = userErrorMessage(e, 'Could not sync Strava activities.');
  } finally {
    stravaBusy.value = '';
  }
}

async function importActivity(activity: StravaActivity) {
  stravaError.value = '';
  stravaBusy.value = `import-${activity.strava_activity_id}`;
  try {
    await importStravaActivity(activity.strava_activity_id);
    await router.push('/analyze');
  } catch (e: any) {
    stravaError.value = userErrorMessage(e, 'Could not import this Strava activity.');
  } finally {
    stravaBusy.value = '';
  }
}

async function disconnect() {
  if (!window.confirm('Disconnect Strava? xPitch will delete its saved Strava tokens.')) return;
  stravaError.value = '';
  stravaBusy.value = 'disconnect';
  try {
    await disconnectStrava();
    stravaConnection.value = null;
    stravaActivities.value = [];
    stravaNotice.value = 'Strava disconnected.';
  } catch (e: any) {
    stravaError.value = userErrorMessage(e, 'Could not disconnect Strava.');
  } finally {
    stravaBusy.value = '';
  }
}

async function save() {
  err.value = '';
  ok.value = false;
  busy.value = true;
  try {
    const maxHR = form.value.max_hr ? Number(form.value.max_hr) : null;
    const restHR = form.value.rest_hr ? Number(form.value.rest_hr) : null;
    if ((maxHR != null && (!Number.isInteger(maxHR) || maxHR < 120 || maxHR > 230)) ||
        (restHR != null && (!Number.isInteger(restHR) || restHR < 35 || restHR > 110)) ||
        (maxHR != null && restHR != null && restHR >= maxHR)) {
      err.value = 'Use a maximum HR from 120–230 bpm and a resting HR from 35–110 bpm, lower than maximum HR.';
      return;
    }
    const cur = (auth.profile?.username || '').toLowerCase();
    const next = form.value.username.trim().toLowerCase();
    if (next && next !== cur) {
      const e = await setUsername(next);
      if (e) {
        err.value = e;
        return;
      }
    }
    await updateProfile({
      display_name: form.value.display_name || null,
      birth_date: form.value.birth_date || null,
      max_hr: maxHR,
      rest_hr: restHR,
      bio: form.value.bio || null,
    });
    ok.value = true;
  } catch (e: any) {
    err.value = userErrorMessage(e, 'Could not save your profile. Try again.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="tabpane" style="max-width: 560px">
    <h1 style="margin-top: 0">Your profile</h1>
    <p v-if="!supabaseEnabled" class="empty">Not available on this deployment.</p>
    <p v-else-if="!auth.user" class="empty">Please <RouterLink to="/login">log in</RouterLink> first.</p>
    <div v-else class="panel form">
      <label>Username<input v-model="form.username" placeholder="username" /></label>
      <label>Display name<input v-model="form.display_name" placeholder="Your name" /></label>
      <label>Birth date<input v-model="form.birth_date" type="date" /></label>
      <label>Maximum heart rate<input v-model="form.max_hr" type="number" min="120" max="230" step="1" placeholder="Optional" /></label>
      <label>Resting heart rate<input v-model="form.rest_hr" type="number" min="35" max="110" step="1" placeholder="Optional" /></label>
      <label>Bio<textarea v-model="form.bio" rows="3" placeholder="Optional"></textarea></label>
      <p class="hint" style="margin: 0">
        These private defaults are used for new analysis unless a match has its own setting. Resting HR enables heart-rate-reserve zones.
        Changing your username changes your profile URL.
      </p>
      <p v-if="err" class="error" style="margin: 8px 0 0">{{ err }}</p>
      <p v-if="ok" class="hint" style="margin: 8px 0 0; color: var(--accent2)">
        Saved ✓ — <RouterLink :to="'/' + form.username">view your profile</RouterLink>
      </p>
      <div class="actions">
        <RouterLink class="btn ghost small" :to="auth.profile?.username ? '/' + auth.profile.username : '/'">Back</RouterLink>
        <button class="btn primary" :disabled="busy" @click="save">{{ busy ? 'Saving…' : 'Save' }}</button>
      </div>
    </div>
    <section v-if="supabaseEnabled && auth.user" class="panel strava-panel">
      <div class="strava-head">
        <div>
          <h2>Strava</h2>
          <p>Connect to import GPS and heart-rate streams from your recent activities.</p>
        </div>
        <button v-if="!stravaConnection" class="btn primary" :disabled="stravaBusy === 'connect'" @click="connectStrava">
          {{ stravaBusy === 'connect' ? 'Opening Strava…' : 'Connect Strava' }}
        </button>
        <button v-else class="btn ghost small" :disabled="stravaBusy === 'disconnect'" @click="disconnect">
          {{ stravaBusy === 'disconnect' ? 'Disconnecting…' : 'Disconnect' }}
        </button>
      </div>
      <template v-if="stravaConnection">
        <div class="strava-status">
          <span>Connected as {{ stravaConnection.athlete_username ? '@' + stravaConnection.athlete_username : stravaConnection.athlete_firstname || 'Strava athlete' }}</span>
          <button class="btn ghost small" :disabled="stravaBusy === 'sync'" @click="syncStrava">
            {{ stravaBusy === 'sync' ? 'Syncing…' : 'Sync activities' }}
          </button>
        </div>
        <div v-if="stravaActivities.length" class="strava-list">
          <article v-for="activity in stravaActivities" :key="activity.strava_activity_id" class="strava-activity">
            <div>
              <strong>{{ activity.name || 'Untitled activity' }}</strong>
              <span>{{ activity.start_date ? new Date(activity.start_date).toLocaleDateString() : 'Unknown date' }} · {{ activity.sport_type || 'Activity' }}</span>
              <span>{{ activity.distance_m ? (activity.distance_m / 1000).toFixed(2) + ' km' : 'No distance' }}<template v-if="activity.has_heartrate"> · HR</template></span>
            </div>
            <button class="btn ghost small" :disabled="!!activity.imported_match_id || stravaBusy === `import-${activity.strava_activity_id}`" @click="importActivity(activity)">
              {{ activity.imported_match_id ? 'Imported' : stravaBusy === `import-${activity.strava_activity_id}` ? 'Importing…' : 'Import' }}
            </button>
          </article>
        </div>
        <p v-else class="hint">No activities synced yet. Sync to load your 100 most recent Strava activities.</p>
      </template>
      <p v-if="stravaNotice" class="hint strava-msg ok">{{ stravaNotice }}</p>
      <p v-if="stravaError" class="error strava-msg">{{ stravaError }}</p>
    </section>
  </main>
</template>

<style scoped>
.form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  margin-bottom: 12px;
}
.form input,
.form textarea {
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: var(--ctl-pad-y) var(--ctl-pad-x);
  line-height: var(--ctl-line);
  font-size: 14px;
  text-transform: none;
  letter-spacing: 0;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}
.strava-panel {
  margin-top: 18px;
}
.strava-head,
.strava-status,
.strava-activity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.strava-head h2 { margin: 0; font-size: 18px; }
.strava-head p { margin: 3px 0 0; color: var(--muted); font-size: 13px; max-width: 360px; }
.strava-status { margin-top: 14px; font-size: 13px; color: var(--muted); }
.strava-list { margin-top: 12px; border-top: 1px solid var(--border); }
.strava-activity { padding: 10px 0; border-bottom: 1px solid var(--border); }
.strava-activity > div { min-width: 0; display: grid; gap: 2px; }
.strava-activity strong { font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.strava-activity span { color: var(--muted); font-size: 12px; }
.strava-msg { margin: 12px 0 0; }
.strava-msg.ok { color: var(--accent2); }
@media (max-width: 560px) {
  .strava-head { align-items: flex-start; flex-direction: column; }
  .strava-activity { align-items: flex-start; }
}
</style>
