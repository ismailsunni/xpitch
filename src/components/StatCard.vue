<script setup lang="ts">
import InfoTip from './InfoTip.vue';

defineProps<{
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  accent?: boolean;
  info?: string;
}>();
</script>

<template>
  <div class="card" :class="{ accent }">
    <div class="label">{{ label }}<InfoTip :text="info" /></div>
    <div class="value">{{ value }}<small v-if="unit"> {{ unit }}</small></div>
    <div v-if="sub" class="sub">{{ sub }}</div>
  </div>
</template>
