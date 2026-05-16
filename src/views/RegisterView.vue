<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { SdCard, SdText, SdTextInput, SdButton } from 'svarog-design';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const username = ref('');
const email = ref('');
const password = ref('');
const password2 = ref('');
const error = ref<string | null>(null);
const busy = ref(false);

const passwordMismatch = computed(
  () => password.value.length > 0 && password2.value.length > 0 && password.value !== password2.value
);

async function submit() {
  error.value = null;
  if (password.value !== password2.value) {
    error.value = 'Hesla se neshodují.';
    return;
  }
  busy.value = true;
  try {
    await auth.register({
      username: username.value.trim(),
      email: email.value.trim() || undefined,
      password: password.value,
    });
    await router.replace({ name: 'home' });
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Registrace selhala.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center bg-background-soft px-4">
    <SdCard bordered shadow="sm" class="w-full max-w-md" size="lg">
      <template #header>
        <SdText as="h1" size="xl" weight="semibold">Registrace</SdText>
      </template>
      <div class="space-y-4">
        <SdText v-if="error" as="p" size="sm" color="error">{{ error }}</SdText>
        <SdText v-if="passwordMismatch" as="p" size="sm" color="error">Hesla se neshodují.</SdText>
        <form class="space-y-3" @submit.prevent="submit">
          <SdTextInput v-model="username" label="Uživatelské jméno" required autocomplete="username" />
          <SdTextInput v-model="email" label="E-mail (volitelné)" type="email" autocomplete="email" />
          <SdTextInput
            v-model="password"
            label="Heslo (min. 8 znaků)"
            type="password"
            required
            show-password-toggle
            autocomplete="new-password"
          />
          <SdTextInput
            v-model="password2"
            label="Potvrzení hesla"
            type="password"
            required
            show-password-toggle
            autocomplete="new-password"
          />
          <SdButton type="submit" class="w-full" :is-loading="busy" :disabled="passwordMismatch">
            Založit účet
          </SdButton>
        </form>
        <div class="text-center">
          <RouterLink v-slot="{ href, navigate }" :to="{ name: 'login' }" custom>
            <SdText
              as="a"
              :href="href"
              size="sm"
              weight="medium"
              color="primary"
              class="inline-block text-center underline underline-offset-2 hover:text-primary-700"
              @click="navigate"
            >
              Už mám účet
            </SdText>
          </RouterLink>
        </div>
      </div>
    </SdCard>
  </div>
</template>
