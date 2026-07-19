<template>
  <main class="not-found">
    <p class="eyebrow">404</p>
    <h1>Page not found</h1>
    <p class="hint">The page may have moved, or the link is incomplete.</p>
    <RouterLink class="btn primary" to="/">Go to feed</RouterLink>
  </main>
</template>

<style scoped>
.not-found {
  display: grid;
  place-items: start;
  align-content: center;
  gap: 12px;
  min-height: min(60vh, 520px);
  max-width: 560px;
  margin: 0 auto;
  padding: 32px 24px;
}
.not-found h1 { margin: 0; }
.not-found .hint { margin: 0 0 8px; }
</style>
