import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue') },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (auth.isAuthenticated && !auth.user && to.meta.requiresAuth) {
    await auth.fetchMe();
  }
  if ((to.name === 'login' || to.name === 'register') && auth.isAuthenticated) {
    await auth.fetchMe();
    if (auth.user) return { name: 'home' };
  }
});

export default router;
