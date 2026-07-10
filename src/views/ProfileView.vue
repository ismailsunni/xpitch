<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { supabase, supabaseEnabled } from '../lib/supabase';

const route = useRoute();
const state = ref<'loading' | 'ready' | 'notfound' | 'error'>('loading');
const profile = ref<any>(null);

async function load() {
  state.value = 'loading';
  if (!supabaseEnabled) {
    state.value = 'error';
    return;
  }
  const u = String(route.params.username);
  const { data } = await supabase!
    .from('profiles')
    .select('username, display_name, bio, avatar_url')
    .eq('username', u)
    .maybeSingle();
  profile.value = data;
  state.value = data ? 'ready' : 'notfound';
}
onMounted(load);
watch(() => route.params.username, load);
</script>

<template>
  <main class="tabpane">
    <p v-if="state === 'loading'" class="empty">Loading…</p>
    <p v-else-if="state === 'error'" class="empty">Profiles aren’t available on this deployment yet.</p>
    <p v-else-if="state === 'notfound'" class="empty">No user “{{ route.params.username }}”.</p>
    <template v-else>
      <h2 style="margin-bottom: 4px">@{{ profile.username }}</h2>
      <p v-if="profile.display_name" class="hint" style="margin: 0">{{ profile.display_name }}</p>
      <p class="hint">Your saved matches will appear here (coming in the next update).</p>
    </template>
  </main>
</template>
