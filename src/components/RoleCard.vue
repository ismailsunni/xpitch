<script setup lang="ts">
defineProps<{ role: any }>();
</script>

<template>
  <div v-if="role">
    <div class="role-hero">
      <div class="role-badge">{{ role.top }}</div>
      <div>
        <div class="role-conf">
          Estimate confidence: <strong style="color: var(--text)">{{ role.confidence }}%</strong>
        </div>
        <ul class="role-notes">
          <li v-for="(n, i) in role.notes" :key="i">{{ n }}</li>
        </ul>
      </div>
    </div>
    <div class="role-rank">
      <div class="ctl-label" style="margin-bottom: 6px">Ranked candidates</div>
      <span v-for="(r, i) in role.ranked.slice(0, 5)" :key="i" class="pill">
        {{ i === 0 ? '★ ' : '' }}{{ r.role }}
      </span>
    </div>
    <p class="hint">
      Heuristic estimate from position, movement spread and sprint activity. Use “Flip attack
      direction” if defensive/attacking looks reversed.
    </p>
  </div>
  <p v-else class="empty">Role estimate needs GPS data.</p>
</template>
