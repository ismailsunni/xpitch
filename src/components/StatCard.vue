<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  accent?: boolean;
}>();
</script>

<template>
  <div class="card" :class="{ accent }">
    <div class="label">{{ label }}</div>
    <div class="value">{{ value }}<small v-if="unit"> {{ unit }}</small></div>
    <div v-if="sub" class="sub">{{ sub }}</div>
  </div>
</template>
