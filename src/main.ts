import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { initAuth } from './lib/auth';
import { applyTheme } from './lib/theme';
import './style.css';

applyTheme(); // set <html data-theme> before first paint

// Resolve the session before mount so auth-gated UI renders correctly.
// initAuth() no-ops quickly when Supabase isn't configured.
initAuth().finally(() => {
  createApp(App).use(router).mount('#app');
});
