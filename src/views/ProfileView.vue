<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { supabaseEnabled } from '../lib/supabase';
import { auth } from '../lib/auth';
import { deriveAge } from '../lib/format';
import { listMatches, updateProfile } from '../lib/api';
import { userErrorMessage } from '../lib/errors';
import MatchCard from '../components/MatchCard.vue';

const route = useRoute();
const state = ref<'loading' | 'ready' | 'notfound' | 'error'>('loading');
const data = ref<{ profile: any; isOwner: boolean; matches: any[] } | null>(null);
const errMsg = ref('');

async function load() {
  state.value = 'loading';
  if (!supabaseEnabled) {
    state.value = 'error';
    errMsg.value = 'Profiles aren’t available on this deployment yet.';
    return;
  }
  try {
    const res = await listMatches(String(route.params.username));
    if (!res) {
      state.value = 'notfound';
      return;
    }
    data.value = res;
    state.value = 'ready';
    if (res.isOwner && route.query.edit) openEdit();
  } catch (e: any) {
    state.value = 'error';
    errMsg.value = userErrorMessage(e, 'Could not load this profile. Try again.');
  }
}
onMounted(load);
watch(() => route.params.username, load);
// Re-fetch once the session resolves (so the owner sees unlisted/private too)
// or on sign in/out.
watch(() => auth.user?.id, load);

// ---- Owner profile edit ----
const editing = ref(false);
const form = ref({ display_name: '', birth_date: '', bio: '' });
const saveErr = ref('');
function openEdit() {
  form.value = {
    display_name: auth.profile?.display_name || '',
    birth_date: auth.profile?.birth_date || '',
    bio: auth.profile?.bio || '',
  };
  saveErr.value = '';
  editing.value = true;
}
async function saveProfile() {
  saveErr.value = '';
  try {
    await updateProfile({
      display_name: form.value.display_name || null,
      birth_date: form.value.birth_date || null,
      bio: form.value.bio || null,
    });
    if (data.value) data.value.profile.display_name = form.value.display_name;
    editing.value = false;
  } catch (e: any) {
    saveErr.value = userErrorMessage(e, 'Could not save your profile. Try again.');
  }
}
</script>

<template>
  <main class="tabpane">
    <p v-if="state === 'loading'" class="empty">Loading profile…</p>
    <p v-else-if="state === 'error'" class="empty">We couldn’t load this profile. <button class="linkbtn" @click="load">Retry</button></p>
    <p v-else-if="state === 'notfound'" class="empty">No user “{{ route.params.username }}”.</p>
    <template v-else-if="data">
      <header class="profile-head">
        <div class="pf-avatar">{{ (data.profile.username || '?')[0].toUpperCase() }}</div>
        <div>
          <h1 style="margin: 0">@{{ data.profile.username }}</h1>
          <p v-if="data.profile.display_name" class="hint" style="margin: 2px 0 0">
            {{ data.profile.display_name }}
          </p>
          <p class="hint" style="margin: 2px 0 0">
            {{ data.matches.length }} match{{ data.matches.length === 1 ? '' : 'es' }}
            <template v-if="data.isOwner && deriveAge(auth.profile?.birth_date)">
              · {{ deriveAge(auth.profile?.birth_date) }} yrs
            </template>
          </p>
        </div>
        <button v-if="data.isOwner && !editing" class="btn ghost small" @click="openEdit">Edit profile</button>
      </header>

      <div v-if="data.isOwner && editing" class="panel edit-form">
        <div class="ef-row">
          <label>Display name<input v-model="form.display_name" type="text" placeholder="Your name" /></label>
          <label>Birth date<input v-model="form.birth_date" type="date" /></label>
        </div>
        <label>Bio<textarea v-model="form.bio" rows="2" placeholder="Optional"></textarea></label>
        <p class="hint" style="margin: 6px 0 0">
          Your birth date stays private; it’s used to auto-fill your age and max HR when analyzing.
        </p>
        <p v-if="saveErr" class="error" style="margin: 6px 0 0">{{ saveErr }}</p>
        <div class="ef-actions">
          <button class="btn ghost small" @click="editing = false">Cancel</button>
          <button class="btn primary small" @click="saveProfile">Save</button>
        </div>
      </div>

      <p v-if="!data.matches.length" class="empty">
        <template v-if="data.isOwner">
          No saved matches yet. Open a FIT, GPX, or TCX file, then hit <strong>Save match</strong>.
        </template>
        <template v-else>No public matches.</template>
      </p>

      <div v-else class="match-grid">
        <MatchCard v-for="m in data.matches" :key="m.short_id" :match="m" />
      </div>
    </template>
  </main>
</template>

<style scoped>
.profile-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 22px;
}
.pf-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(180deg, rgba(200, 247, 81, 0.28), rgba(63, 230, 160, 0.18));
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 800;
}
.profile-head > button {
  margin-left: auto;
}
.edit-form {
  margin-bottom: 22px;
}
.edit-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  margin-bottom: 10px;
}
.edit-form input,
.edit-form textarea {
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
.ef-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.ef-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}
.match-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
@media (max-width: 560px) {
  .ef-row {
    grid-template-columns: 1fr;
  }
}
</style>
