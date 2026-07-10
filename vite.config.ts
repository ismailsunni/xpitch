import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// base: './' keeps asset URLs relative so the built SPA works when served from
// a GitHub Pages project subpath (https://user.github.io/<repo>/) or any host.
export default defineConfig({
  base: './',
  plugins: [vue()],
});
