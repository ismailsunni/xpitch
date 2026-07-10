import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Absolute base for the GitHub Pages project subpath. Required for vue-router
// history mode (deep links like /xpitch/match/{id}) and matched by the custom
// domain (https://ismailsunni.id/xpitch/). A dist/404.html copy provides the
// SPA fallback for those deep links (see package.json build script).
export default defineConfig({
  base: '/xpitch/',
  plugins: [vue()],
});
