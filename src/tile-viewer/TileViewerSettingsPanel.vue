<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
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

function onColor(
  key: 'terrainLow' | 'terrainHigh' | 'roadDark' | 'roadLight' | 'water' | 'river' | 'green' | 'rail' | 'building' | 'sky' | 'fog' | 'sunColor',
  e: Event,
) {
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

/** UI slider 0–100 ↔ fogDensity ≈ 0.00005–0.0005 */
const fogDensityUi = computed({
  get: () => Math.round(theme.value.fogDensity * 100_000),
  set: (ui) => patch('fogDensity', ui / 100_000),
})

function onFogDensityUi(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  if (!Number.isNaN(v)) fogDensityUi.value = v
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
    <p class="intro">
      Obloha je 3D model (Preetham) — barvy horizontu a mlhy ovlivní „Horizont“ a „Mlha“.
      Terén má vlastní shader; slunce výška/azimut mění stíny na mapě i na terénu.
    </p>

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
      <SdText as="h3" size="sm" weight="semibold">Voda a zeleň</SdText>
      <label class="row">
        <span>Vodní plochy</span>
        <input type="color" :value="theme.water" @input="onColor('water', $event)" />
      </label>
      <label class="row">
        <span>Řeky a potoky</span>
        <input type="color" :value="theme.river" @input="onColor('river', $event)" />
      </label>
      <label class="row">
        <span>Zeleň a parky</span>
        <input type="color" :value="theme.green" @input="onColor('green', $event)" />
      </label>
      <label class="row">
        <span>Železnice</span>
        <input type="color" :value="theme.rail" @input="onColor('rail', $event)" />
      </label>
    </section>

    <SdDivider />

    <section>
      <SdText as="h3" size="sm" weight="semibold">Budovy a atmosféra</SdText>
      <label class="row">
        <span>Budovy</span>
        <input type="color" :value="theme.building" @input="onColor('building', $event)" />
      </label>
      <label class="row">
        <span>Horizont / ambient nebe</span>
        <input type="color" :value="theme.sky" @input="onColor('sky', $event)" />
      </label>
      <label class="row">
        <span>Barva mlhy</span>
        <input type="color" :value="theme.fog" @input="onColor('fog', $event)" />
      </label>
      <label class="row">
        <span>Mlha — síla ({{ fogDensityUi }})</span>
        <input
          type="range"
          min="5"
          max="50"
          step="1"
          :value="fogDensityUi"
          @input="onFogDensityUi"
        />
      </label>
      <label class="row">
        <span>Mraky — pokrytí ({{ Math.round(theme.cloudCoverage * 100) }} %)</span>
        <input type="range" min="0" max="1" step="0.05" :value="theme.cloudCoverage" @input="onNumber('cloudCoverage', $event)" />
      </label>
      <label class="row">
        <span>Obloha — zakalení (turbidity)</span>
        <input type="range" min="1" max="10" step="0.5" :value="theme.turbidity" @input="onNumber('turbidity', $event)" />
      </label>
      <label class="row">
        <span>Slunce — výška ({{ theme.sunElevation }}°)</span>
        <input type="range" min="5" max="80" step="1" :value="theme.sunElevation" @input="onNumber('sunElevation', $event)" />
      </label>
      <label class="row">
        <span>Slunce — azimut ({{ theme.sunAzimuth }}°)</span>
        <input type="range" min="0" max="360" step="5" :value="theme.sunAzimuth" @input="onNumber('sunAzimuth', $event)" />
      </label>
    </section>

    <SdDivider />

    <section>
      <SdText as="h3" size="sm" weight="semibold">Osvětlení</SdText>
      <label class="row">
        <span>Hemisféra (ambient)</span>
        <input type="range" min="0" max="2" step="0.05" :value="theme.ambientIntensity" @input="onNumber('ambientIntensity', $event)" />
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
        <span>Exposure (jas celé scény)</span>
        <input type="range" min="0.5" max="2.5" step="0.05" :value="theme.exposure" @input="onNumber('exposure', $event)" />
      </label>
    </section>

    <SdDivider />

    <section>
      <SdText as="h3" size="sm" weight="semibold">Navigace (debug)</SdText>
      <label class="row toggle-row">
        <span>Zobrazit navmesh (drátěný model)</span>
        <SdToggle
          :model-value="theme.showNavmeshDebug"
          @update:model-value="patch('showNavmeshDebug', $event)"
        />
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

.intro {
  margin: 0;
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.4;
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
