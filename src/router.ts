import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

// Static routes must precede the dynamic /:username catch-all.
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
  { path: '/match/:shortId/:seq?', name: 'match', component: () => import('./views/MatchView.vue') },
  { path: '/field/:slug', name: 'field', component: () => import('./views/FieldView.vue') },
  { path: '/:username', name: 'profile', component: () => import('./views/ProfileView.vue') },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
