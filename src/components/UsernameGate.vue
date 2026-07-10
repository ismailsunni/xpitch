<script setup lang="ts">
import { ref, computed } from 'vue';
import { setUsername, usernameError, signOut } from '../lib/auth';

const name = ref('');
const err = ref('');
const busy = ref(false);
const preview = computed(() => (name.value.trim().toLowerCase() || 'username'));

async function save() {
  const v = usernameError(name.value);
  if (v) {
    err.value = v;
    return;
  }
  busy.value = true;
  const e = await setUsername(name.value);
  busy.value = false;
  err.value = e || '';
}
</script>

<template>
  <div class="gate-overlay">
    <div class="gate card">
      <h3>Choose your username</h3>
      <p class="hint" style="margin: 4px 0 12px">
        Your profile will live at ismailsunni.id/xpitch/<strong style="color: var(--text)">{{ preview }}</strong>
      </p>
      <input v-model="name" placeholder="username" autofocus @keyup.enter="save" />
      <p v-if="err" class="error" style="margin: 8px 0 0">{{ err }}</p>
      <div class="gate-actions">
        <button class="btn ghost small" @click="signOut">Cancel</button>
        <button class="btn primary" :disabled="busy" @click="save">{{ busy ? '…' : 'Continue' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gate-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 14, 0.72);
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}
.gate {
  width: min(420px, 100%);
}
.gate input {
  width: 100%;
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
}
.gate-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}
</style>
