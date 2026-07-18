<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { auth, setUsername } from '../lib/auth';
import { supabaseEnabled } from '../lib/supabase';
import { updateProfile } from '../lib/api';

const form = ref({ username: '', display_name: '', birth_date: '', max_hr: '', rest_hr: '', bio: '' });
const err = ref('');
const ok = ref(false);
const busy = ref(false);

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
    err.value = e?.message || String(e);
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
</style>
