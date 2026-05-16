import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { initSvarogColorScheme } from 'svarog-design';
import AppRoot from './App.vue';
import router from './router';
import './style.css';

initSvarogColorScheme();

const app = createApp(AppRoot);
const pinia = createPinia();
app.use(pinia);
app.use(router);

async function prepareNativeChrome() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    /* no-op */
  }
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    }
  });
}

void prepareNativeChrome();
app.mount('#app');
