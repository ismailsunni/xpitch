<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { auth, setUsername } from '../lib/auth';
import { supabaseEnabled } from '../lib/supabase';
import { updateProfile } from '../lib/api';

const form = ref({ username: '', display_name: '', birth_date: '', bio: '' });
const err = ref('');
const ok = ref(false);
const busy = ref(false);

function init() {
  const p = auth.profile;
  form.value = {
    username: p?.username || '',
    display_name: p?.display_name || '',
    birth_date: p?.birth_date || '',
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
    <h2 style="margin-top: 0">Your profile</h2>
    <p v-if="!supabaseEnabled" class="empty">Not available on this deployment.</p>
    <p v-else-if="!auth.user" class="empty">Please <RouterLink to="/login">log in</RouterLink> first.</p>
    <div v-else class="panel form">
      <label>Username<input v-model="form.username" placeholder="username" /></label>
      <label>Display name<input v-model="form.display_name" placeholder="Your name" /></label>
      <label>Birth date<input v-model="form.birth_date" type="date" /></label>
      <label>Bio<textarea v-model="form.bio" rows="3" placeholder="Optional"></textarea></label>
      <p class="hint" style="margin: 0">
        Your birth date stays private — it’s used to auto-fill your age and max HR when analyzing.
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
  border-radius: 8px;
  padding: 9px 12px;
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
