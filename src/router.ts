import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { getProfileByUsername } from './lib/api';
import { supabaseEnabled } from './lib/supabase';

// Static routes must precede the dynamic /:username catch-all.
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./views/FeedView.vue') },
  { path: '/analyze', name: 'analyze', component: () => import('./views/AnalyzeView.vue') },
  { path: '/history', name: 'history', component: () => import('./views/HistoryView.vue') },
  { path: '/fields', name: 'fields', component: () => import('./views/FieldsView.vue') },
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
  { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue') },
  { path: '/help', name: 'help', component: () => import('./views/HelpView.vue') },
  { path: '/match/:shortId/:seq?', name: 'match', component: () => import('./views/MatchView.vue') },
  { path: '/field/:slug', name: 'field', component: () => import('./views/FieldView.vue') },
  {
    path: '/:username',
    name: 'profile',
    component: () => import('./views/ProfileView.vue'),
    beforeEnter: async (to) => {
      if (!supabaseEnabled) return true;
      try {
        const profile = await getProfileByUsername(String(to.params.username));
        return profile ? true : { name: 'not-found' };
      } catch {
        // Let ProfileView show its retry state when the lookup itself fails.
        return true;
      }
    },
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue') },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
