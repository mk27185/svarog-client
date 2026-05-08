<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { initScene, type SceneHandle } from './scene'

const canvasRef = ref<HTMLCanvasElement>()
let handle: SceneHandle | null = null

const status  = ref<'loading' | 'ready' | 'error'>('loading')
const message = ref('Initialising scene…')

onMounted(async () => {
  if (!canvasRef.value) return
  try {
    handle  = await initScene(canvasRef.value)
    status.value  = 'ready'
    message.value = ''
  } catch (e) {
    status.value  = 'error'
    message.value = String(e)
  }
})

onBeforeUnmount(() => handle?.dispose())
</script>

<template>
  <div class="viewer">
    <canvas ref="canvasRef" class="canvas" />

    <div v-if="status !== 'ready'" class="overlay">
      <div :class="['badge', status]">
        <span v-if="status === 'loading'" class="spinner" />
        {{ status === 'loading' ? 'Loading tiles…' : message }}
      </div>
    </div>

    <div class="legend">
      <span class="dot terrain" /> terrain
      <span class="dot road"    /> SDF roads
      <span class="dot building"/> buildings
    </div>

    <div class="hint">Orbit · Scroll zoom · Right-drag pan</div>
  </div>
</template>

<style scoped>
.viewer {
  position: relative;
  width: 100%;
  height: 100%;
}

.canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-radius: 8px;
  font-family: system-ui, sans-serif;
  font-size: 14px;
  letter-spacing: 0.02em;
  backdrop-filter: blur(6px);
}

.badge.loading {
  background: rgba(10, 20, 40, 0.72);
  color: #d0e4f8;
  border: 1px solid rgba(100, 160, 220, 0.4);
}

.badge.error {
  background: rgba(60, 10, 10, 0.82);
  color: #ffb0b0;
  border: 1px solid rgba(220, 80, 80, 0.5);
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(150, 200, 255, 0.3);
  border-top-color: #90c8ff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin { to { transform: rotate(360deg); } }

.legend {
  position: absolute;
  bottom: 20px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  border-radius: 6px;
  background: rgba(10, 12, 20, 0.65);
  backdrop-filter: blur(6px);
  color: rgba(220, 232, 248, 0.9);
  font-family: system-ui, sans-serif;
  font-size: 12px;
  letter-spacing: 0.03em;
  border: 1px solid rgba(80, 120, 180, 0.25);
}

.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dot.terrain  { background: #5a8847; }
.dot.road     { background: #aaa8b8; }
.dot.building { background: #9ba5b4; }

.hint {
  position: absolute;
  bottom: 20px;
  right: 20px;
  color: rgba(200, 215, 235, 0.55);
  font-family: system-ui, sans-serif;
  font-size: 11px;
  letter-spacing: 0.04em;
}
</style>
