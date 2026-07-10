<script setup lang="ts">
import { useRoute } from 'vue-router';
const route = useRoute();
</script>

<template>
  <main class="tabpane">
    <h2>Pitch</h2>
    <p class="hint">Field pages (satellite view + matches played here) arrive in a later phase — “{{ route.params.slug }}”.</p>
  </main>
</template>
