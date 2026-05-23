<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { SdDrawer } from 'svarog-design'
import gameRuntime from 'svarog-contracts/game-runtime.json'
import { initScene, type SceneHandle } from './scene'
import { useTileViewerGeolocation } from './useTileViewerGeolocation'
import { useGyro } from './useGyro'
import TileViewerSettingsPanel from './TileViewerSettingsPanel.vue'

const canvasRef = ref<HTMLCanvasElement>()
let handle: SceneHandle | null = null
let firstGpsFix = true

const status  = ref<'loading' | 'ready' | 'error'>('loading')
const message = ref('Initialising scene…')
const settingsOpen = ref(false)
const rotationMode = ref<'sensor' | 'manual'>('sensor')

const geo       = useTileViewerGeolocation()
const gyro      = useGyro(false)
const geoBanner = ref<string | null>(null)

const COMPASS_CALIBRATION = gameRuntime.camera.compass_calibration_deg

function normalizeDegrees(angle: number): number {
  return (angle % 360 + 360) % 360
}

watch(
  () => [geo.status.value, geo.message.value] as const,
  ([st, msg]) => {
    if (st === 'denied' || st === 'unsupported') {
      geoBanner.value = msg ?? 'GPS nepoužito — zůstává náhled na střed výřezu.'
    } else if (st === 'error') {
      geoBanner.value = msg ?? 'GPS chyba'
    }
  },
)

watch(
  () => gyro.data.value.compassHeading,
  (heading) => {
    if (!handle || rotationMode.value !== 'sensor' || heading === null) return
    const headingForCamera = normalizeDegrees(heading + COMPASS_CALIBRATION)
    handle.camera.setAzimuth(-headingForCamera)
  },
  { immediate: true },
)

watch(
  () => gyro.data.value.effectiveTilt,
  (tilt) => {
    if (!handle || rotationMode.value !== 'sensor' || tilt === null) return
    handle.camera.setElevation(tilt)
  },
)

watch(
  () => rotationMode.value,
  (mode) => {
    if (mode === 'sensor') gyro.enable()
    else gyro.disable()
  },
)

function toggleCameraMode() {
  handle?.camera.toggleRotationMode()
  rotationMode.value = handle?.camera.rotationMode ?? rotationMode.value
}

onMounted(async () => {
  if (!canvasRef.value) return
  try {
    handle = await initScene(canvasRef.value)
    rotationMode.value = handle.camera.rotationMode
    status.value  = 'ready'
    message.value = ''

    if (rotationMode.value === 'sensor' && gyro.checkSupport()) {
      await gyro.requestPermission()
    }

    geoBanner.value = 'Zjišťuji polohu (GPS)…'
    void geo.start((p) => {
      handle?.focusAtGps(p.latitude, p.longitude, p.accuracy, firstGpsFix)
      firstGpsFix = false
      const acc = p.accuracy > 0 ? ` ±${Math.round(p.accuracy)} m` : ''
      geoBanner.value = `GPS ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}${acc}`
    })
  } catch (e) {
    status.value  = 'error'
    message.value = String(e)
  }
})

onBeforeUnmount(() => {
  geo.stop()
  handle?.dispose()
})
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

    <div v-if="status === 'ready'" class="fab-row">
      <button
        type="button"
        class="fab"
        :title="rotationMode === 'sensor' ? 'Gyroskop — klepnutím manuální' : 'Manuální — klepnutím gyroskop'"
        @click="toggleCameraMode"
      >
        {{ rotationMode === 'sensor' ? '📱' : '🖱️' }}
      </button>
      <button
        type="button"
        class="fab"
        aria-label="Nastavení vzhledu"
        @click="settingsOpen = true"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </button>
    </div>

    <div v-if="geoBanner" class="gps-strip">{{ geoBanner }}</div>

    <SdDrawer
      v-model:is-open="settingsOpen"
      title="Vzhled mapy"
      position="right"
      size="md"
    >
      <TileViewerSettingsPanel />
    </SdDrawer>
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
  z-index: 10;
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

.fab-row {
  position: absolute;
  right: 16px;
  bottom: max(16px, env(safe-area-inset-bottom));
  z-index: 15;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: 1px solid rgba(120, 160, 210, 0.35);
  border-radius: 50%;
  background: rgba(12, 18, 32, 0.82);
  color: rgba(220, 232, 248, 0.95);
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: background 0.15s ease;
  font-size: 20px;
  line-height: 1;
}

.fab:hover {
  background: rgba(24, 36, 56, 0.92);
}

.gps-strip {
  opacity: .03;
  position: absolute;
  top: max(16px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  max-width: min(92vw, 480px);
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(8, 12, 24, 0.75);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(80, 120, 180, 0.28);
  color: rgba(210, 228, 248, 0.92);
  font-family: ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: 0.02em;
  text-align: center;
  pointer-events: none;
  z-index: 12;
}
</style>
