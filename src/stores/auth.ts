import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { trpc } from '@/lib/trpc';
import { readSessionId, writeSessionId } from '@/lib/session-storage';
import type { AuthUser } from '@/types/auth';

export type { AuthUser };

export const useAuthStore = defineStore('auth', () => {
  const sessionId = ref<string | null>(readSessionId());
  const user = ref<AuthUser | null>(null);
  const loading = ref(false);

  const isAuthenticated = computed(() => !!sessionId.value);

  function setSession(id: string | null) {
    sessionId.value = id;
    writeSessionId(id);
  }

  async function fetchMe() {
    if (!sessionId.value) {
      user.value = null;
      return;
    }
    loading.value = true;
    try {
      const me = await trpc.auth.me.query();
      user.value = me as AuthUser;
    } catch {
      setSession(null);
      user.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function login(username: string, password: string) {
    const res = await trpc.auth.login.mutate({ username, password });
    if (!res.success) {
      throw new Error(res.error);
    }
    setSession(res.sessionId);
    user.value = res.user as AuthUser;
  }

  async function register(payload: { username: string; email?: string; password: string }) {
    const res = await trpc.auth.register.mutate({
      username: payload.username,
      email: payload.email,
      password: payload.password,
    });
    if (!res.success) {
      throw new Error(res.error);
    }
    setSession(res.sessionId);
    user.value = res.user as AuthUser;
  }

  async function logout() {
    try {
      if (sessionId.value) await trpc.auth.logout.mutate();
    } catch {
      /* offline */
    }
    setSession(null);
    user.value = null;
  }

  return {
    sessionId,
    user,
    loading,
    isAuthenticated,
    setSession,
    fetchMe,
    login,
    register,
    logout,
  };
});
