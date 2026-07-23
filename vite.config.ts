import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// Absolute base for the GitHub Pages project subpath. Required for vue-router
// history mode (deep links like /xpitch/match/{id}) and matched by the custom
// domain (https://ismailsunni.id/xpitch/). A dist/404.html copy provides the
// SPA fallback for those deep links (see package.json build script).
export default defineConfig({
  base: '/xpitch/',
  plugins: [
    vue(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,png,svg,ico,webp}'],
      },
      manifest: {
        id: '/xpitch/',
        name: 'xPitch - Football Match Analytics',
        short_name: 'xPitch',
        description: 'Football match analysis from FIT, GPX, and TCX activity files.',
        start_url: '/xpitch/',
        scope: '/xpitch/',
        display: 'standalone',
        theme_color: '#c8f751',
        background_color: '#f5f7f1',
        icons: [
          { src: 'icons/xpitch.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/xpitch-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/xpitch-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        share_target: {
          action: '/xpitch/import',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [{ name: 'activity', accept: ['.fit', '.gpx', '.tcx'] }],
          },
        },
        file_handlers: [{
          action: '/xpitch/analyze',
          accept: {
            'application/octet-stream': ['.fit'],
            'application/gpx+xml': ['.gpx'],
            'application/vnd.garmin.tcx+xml': ['.tcx'],
          },
        }],
      },
    }),
  ],
});
