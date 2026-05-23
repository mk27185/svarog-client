<script setup lang="ts">
import { useRouter } from 'vue-router';
import { SdButton } from 'svarog-design';
import TileViewer from '@/tile-viewer/TileViewer.vue';

const router = useRouter();

function goBack() {
  void router.push({ name: 'home' });
}
</script>

<template>
  <div class="map-page">
    <header class="map-header opacity-5">
      <SdButton variant="secondary" size="sm" @click="goBack">← Zpět</SdButton>
    </header>
    <TileViewer class="map-viewer" />
  </div>
</template>

<style scoped>
.map-page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #0a0c14;
  z-index: 0;
}

.map-header {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 20;
  padding: max(12px, env(safe-area-inset-top)) 12px 8px;
  pointer-events: none;
}

.map-header :deep(button) {
  pointer-events: auto;
}

.map-viewer {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}
</style>
