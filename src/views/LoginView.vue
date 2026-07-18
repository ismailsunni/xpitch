<script setup lang="ts">
import { ref } from 'vue';
import { auth, signInWithEmail, signInWithGoogle } from '../lib/auth';
import { supabaseEnabled } from '../lib/supabase';

const email = ref('');
const sent = ref(false);
const err = ref('');
const busy = ref(false);

async function magic() {
  err.value = '';
  busy.value = true;
  const { error } = await signInWithEmail(email.value.trim());
  busy.value = false;
  if (error) err.value = error.message;
  else sent.value = true;
}
async function google() {
  err.value = '';
  const { error } = await signInWithGoogle();
  if (error) err.value = error.message;
}
</script>

<template>
  <main class="login">
    <div class="card login-card">
      <h1 style="margin-top: 0">Sign in to xPitch</h1>
      <template v-if="!supabaseEnabled">
        <p class="hint">Login isn’t configured on this deployment yet.</p>
      </template>
      <template v-else-if="auth.user">
        <p>You’re signed in as <strong>{{ auth.profile?.username || auth.user.email }}</strong>.</p>
        <RouterLink class="btn primary" to="/">Go to xPitch</RouterLink>
      </template>
      <template v-else-if="sent">
        <p>✅ Check your email for a sign-in link.</p>
      </template>
      <template v-else>
        <button class="btn" style="width: 100%" @click="google">Continue with Google</button>
        <div class="or">or</div>
        <input v-model="email" type="email" placeholder="you@email.com" @keyup.enter="magic" />
        <button class="btn primary" style="width: 100%; margin-top: 8px" :disabled="busy || !email" @click="magic">
          {{ busy ? 'Sending…' : 'Email me a sign-in link' }}
        </button>
        <p v-if="err" class="error">{{ err }}</p>
      </template>
      <p class="hint" style="margin-top: 16px">
        You can analyze <code>.fit</code> files without an account — an account is only needed to
        save matches, get a profile, and reuse pitches.
      </p>
    </div>
  </main>
</template>

<style scoped>
.login {
  display: flex;
  justify-content: center;
  padding: 48px 20px;
}
.login-card {
  width: min(440px, 100%);
}
.login-card input {
  width: 100%;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: var(--ctl-pad-y) var(--ctl-pad-x);
  line-height: var(--ctl-line);
  font-size: 14px;
}
.or {
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  margin: 12px 0;
}
</style>
