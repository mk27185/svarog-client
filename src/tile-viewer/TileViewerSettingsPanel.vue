<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { SdToggle, SdButton, SdText, SdDivider } from 'svarog-design'
import type { TileViewerTheme, HighwayColorStop } from './theme'
import { DEFAULT_HIGHWAY_STOPS } from './theme'
import { getTheme, setTheme, resetTheme, subscribeTheme } from './theme-store'

const theme = ref<TileViewerTheme>(structuredClone(getTheme()) as TileViewerTheme)

let unsub: (() => void) | null = null

onMounted(() => {
  unsub = subscribeTheme((t) => {
    theme.value = structuredClone(t) as TileViewerTheme
  })
})

onBeforeUnmount(() => {
  unsub?.()
})

function patch<K extends keyof TileViewerTheme>(key: K, value: TileViewerTheme[K]) {
  setTheme({ [key]: value })
}

function onColor(key: 'terrainLow' | 'terrainHigh' | 'roadDark' | 'roadLight' | 'building' | 'sky' | 'fog' | 'sunColor', e: Event) {
  patch(key, (e.target as HTMLInputElement).value)
}

function onStopColor(index: number, e: Event) {
  const stops: HighwayColorStop[] = theme.value.highwayStops.map((s, i) =>
    i === index ? { ...s, color: (e.target as HTMLInputElement).value } : { ...s },
  )
  patch('highwayStops', stops)
}

function onNumber(key: keyof TileViewerTheme, e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  if (!Number.isNaN(v)) patch(key, v as TileViewerTheme[typeof key])
}

function onReset() {
  resetTheme()
}

const stopLabels = [
  'Cesty (nízká)',
  'Track / service',
  'Residential',
  'Terciární',
  'Sekundární',
  'Primární',
  'Trunk',
  'Dálnice',
]
</script>

<template>
  <div class="settings">
    <section>
      <SdText as="h3" size="sm" weight="semibold">Terén</SdText>
      <label class="row">
        <span>Nížiny</span>
        <input type="color" :value="theme.terrainLow" @input="onColor('terrainLow', $event)" />
      </label>
      <label class="row">
        <span>Výšiny</span>
        <input type="color" :value="theme.terrainHigh" @input="onColor('terrainHigh', $event)" />
      </label>
    </section>

    <SdDivider />

    <section>
      <SdText as="h3" size="sm" weight="semibold">Silnice</SdText>
      <label class="row toggle-row">
        <span>Paleta podle typu (SDF kanál G)</span>
        <SdToggle
          :model-value="theme.useHighwayPalette"
          @update:model-value="patch('useHighwayPalette', $event)"
        />
      </label>
      <template v-if="!theme.useHighwayPalette">
        <label class="row">
          <span>Tmavá</span>
          <input type="color" :value="theme.roadDark" @input="onColor('roadDark', $event)" />
        </label>
        <label class="row">
          <span>Světlá</span>
          <input type="color" :value="theme.roadLight" @input="onColor('roadLight', $event)" />
        </label>
      </template>
      <template v-else>
        <p class="hint">Barvy podle importance z SDF (0 = chodník … 1 = dálnice).</p>
        <label
          v-for="(stop, i) in theme.highwayStops"
          :key="i"
          class="row"
        >
          <span>{{ stopLabels[i] ?? `Stupeň ${i + 1}` }}</span>
          <input type="color" :value="stop.color" @input="onStopColor(i, $event)" />
        </label>
        <SdButton variant="secondary" size="sm" @click="patch('highwayStops', DEFAULT_HIGHWAY_STOPS.map((s) => ({ ...s })))">
          Obnovit paletu silnic
        </SdButton>
      </template>
    </section>

    <SdDivider />

    <section>
      <SdText as="h3" size="sm" weight="semibold">Budovy a atmosféra</SdText>
      <label class="row">
        <span>Budovy</span>
        <input type="color" :value="theme.building" @input="onColor('building', $event)" />
      </label>
      <label class="row">
        <span>Obloha</span>
        <input type="color" :value="theme.sky" @input="onColor('sky', $event)" />
      </label>
      <label class="row">
        <span>Mlha</span>
        <input type="color" :value="theme.fog" @input="onColor('fog', $event)" />
      </label>
      <label class="row">
        <span>Mlha — začátek (m)</span>
        <input type="range" min="500" max="4000" step="50" :value="theme.fogNear" @input="onNumber('fogNear', $event)" />
      </label>
      <label class="row">
        <span>Mlha — konec (m)</span>
        <input type="range" min="2000" max="8000" step="100" :value="theme.fogFar" @input="onNumber('fogFar', $event)" />
      </label>
    </section>

    <SdDivider />

    <section>
      <SdText as="h3" size="sm" weight="semibold">Osvětlení</SdText>
      <label class="row">
        <span>Ambient</span>
        <input type="range" min="0" max="1.5" step="0.05" :value="theme.ambientIntensity" @input="onNumber('ambientIntensity', $event)" />
      </label>
      <label class="row">
        <span>Slunce — intenzita</span>
        <input type="range" min="0" max="3" step="0.1" :value="theme.sunIntensity" @input="onNumber('sunIntensity', $event)" />
      </label>
      <label class="row">
        <span>Slunce — barva</span>
        <input type="color" :value="theme.sunColor" @input="onColor('sunColor', $event)" />
      </label>
      <label class="row">
        <span>Exposure (tone mapping)</span>
        <input type="range" min="0.3" max="2.5" step="0.05" :value="theme.exposure" @input="onNumber('exposure', $event)" />
      </label>
    </section>

    <SdDivider />

    <section>
      <SdText as="h3" size="sm" weight="semibold">Post-processing</SdText>
      <label class="row">
        <span>Saturace</span>
        <input type="range" min="0" max="2" step="0.05" :value="theme.saturation" @input="onNumber('saturation', $event)" />
      </label>
      <label class="row">
        <span>Kontrast</span>
        <input type="range" min="0.5" max="1.8" step="0.05" :value="theme.contrast" @input="onNumber('contrast', $event)" />
      </label>
      <label class="row">
        <span>Vignette</span>
        <input type="range" min="0" max="1" step="0.05" :value="theme.vignette" @input="onNumber('vignette', $event)" />
      </label>
    </section>

    <div class="footer-actions">
      <SdButton variant="secondary" size="sm" @click="onReset">Obnovit vše</SdButton>
    </div>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

section {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.875rem;
  color: var(--color-text, #334155);
}

.toggle-row {
  align-items: center;
}

.row input[type='color'] {
  width: 2.75rem;
  height: 2rem;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.row input[type='range'] {
  flex: 1;
  min-width: 6rem;
}

.hint {
  margin: 0;
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.35;
}

.footer-actions {
  padding-top: 0.5rem;
}
</style>
