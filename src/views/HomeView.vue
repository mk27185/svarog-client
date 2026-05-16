<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { SdNavbar, SdCard, SdText, SdButton } from 'svarog-design';
import { useAuthStore } from '@/stores/auth';
import TileViewer from '@/tile-viewer/TileViewer.vue';

const auth = useAuthStore();
const router = useRouter();

onMounted(async () => {
  if (auth.isAuthenticated && !auth.user) {
    await auth.fetchMe();
  }
});

async function onLogout() {
  await auth.logout();
  await router.push({ name: 'login' });
}
</script>

<template>
  <div class="min-h-dvh bg-background-soft text-text">
    <SdNavbar variant="light" sticky elevated>
      <template #brand>
        <span class="font-semibold text-lg">Svarog</span>
      </template>
      <template #navigation />
      <template #actions>
        <SdButton v-if="auth.user" variant="secondary" size="sm" @click="onLogout">Odhlásit</SdButton>
      </template>
    </SdNavbar>

    <main class="max-w-lg mx-auto px-4 py-10">
      <SdCard bordered shadow="sm" size="lg">
        <template #header>
          <SdText as="h1" size="xl" weight="semibold">Vítej, {{ auth.user?.username }}</SdText>
        </template>
        <div class="space-y-3">
          <SdText as="p" size="sm" color="muted">
            Účet je připojený k backendu. Níže je vývojový náhled dlaždic (vyžaduje lokální data
            <code class="text-xs">svarog-engine/outputs</code> při
            <code class="text-xs">npm run dev</code>).
          </SdText>
          <SdText v-if="auth.user?.email" as="p" size="sm">E-mail: {{ auth.user.email }}</SdText>
          <SdText as="p" size="sm" color="muted">Role: {{ auth.user?.role }}</SdText>
        </div>
      </SdCard>
    </main>

    <section class="mt-8 w-full max-w-6xl mx-auto px-4 pb-10" aria-label="Náhled dlaždic">
      <div class="h-[min(70vh,52rem)] w-full overflow-hidden rounded-lg border border-gray-200 bg-black dark:border-gray-700">
        <TileViewer />
      </div>
    </section>
  </div>
</template>
