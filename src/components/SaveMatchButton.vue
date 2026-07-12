<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { auth, needsUsername } from '../lib/auth';
import { isSaveable, store } from '../store';
import { createMatchFromCurrent } from '../lib/api';

const router = useRouter();
const busy = ref(false);
const err = ref('');

async function save() {
  err.value = '';
  if (needsUsername()) {
    err.value = 'Pick a username first (prompt top-right).';
    return;
  }
  busy.value = true;
  try {
    const shortId = await createMatchFromCurrent({});
    router.push({ name: 'match', params: { shortId } });
  } catch (e: any) {
    err.value = e?.message || String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <span v-if="auth.user && isSaveable() && store.cloud.mode === 'local'" class="savewrap">
    <button class="btn primary" :disabled="busy" @click="save">
      {{ busy ? 'Saving…' : '💾 Save match' }}
    </button>
    <span v-if="err" class="error save-err">{{ err }}</span>
  </span>
</template>

<style scoped>
.savewrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.save-err {
  font-size: 12px;
  max-width: 240px;
}
</style>
