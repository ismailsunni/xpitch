import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { initAuth } from './lib/auth';
import './style.css';

// Resolve the session before mount so auth-gated UI renders correctly.
// initAuth() no-ops quickly when Supabase isn't configured.
initAuth().finally(() => {
  createApp(App).use(router).mount('#app');
});
