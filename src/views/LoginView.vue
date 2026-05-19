<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { SdCard, SdText, SdTextInput, SdButton } from 'svarog-design';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const username = ref('');
const password = ref('');
const error = ref<string | null>(null);
const busy = ref(false);

async function submit() {
  error.value = null;
  busy.value = true;
  try {
    await auth.login(username.value.trim(), password.value);
    const redirect = (route.query.redirect as string) || '/';
    await router.replace(redirect);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Přihlášení selhalo.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center bg-background-soft px-4">
    <SdCard bordered shadow="sm" class="w-full max-w-md" size="lg">
      <template #header>
        <SdText as="h1" size="xl" weight="semibold">Přihlášení 7</SdText>
      </template>
      <div class="space-y-4">
        <SdText v-if="error" as="p" size="sm" color="error">{{ error }}</SdText>
        <form class="space-y-3" @submit.prevent="submit">
          <SdTextInput v-model="username" label="Uživatelské jméno" required autocomplete="username" />
          <SdTextInput
            v-model="password"
            label="Heslo"
            type="password"
            required
            show-password-toggle
            autocomplete="current-password"
          />
          <SdButton type="submit" class="w-full" :is-loading="busy">Přihlásit se</SdButton>
        </form>
            <RouterLink v-slot="{ href, navigate }" :to="{ name: 'register' }" custom>
              <SdText
                as="a"
                :href="href"
                size="sm"
                weight="medium"
                color="primary"
                class="inline-block text-center underline underline-offset-2 hover:text-primary-700"
                @click="navigate"
              >
                Vytvořit účet
              </SdText>
            </RouterLink>
      </div>
    </SdCard>
  </div>
</template>
