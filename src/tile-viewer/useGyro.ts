/**
 * Gyroscope / compass for camera sensor mode — port from legacy svarog frontend.
 */

import { computed, ref, onMounted, onUnmounted } from 'vue'

export interface GyroData {
  alpha: number | null
  beta: number | null
  gamma: number | null
  compassHeading: number | null
  effectiveTilt: number | null
}

export function useGyro(enabled = false) {
  const isSupported = ref(false)
  const isEnabled = ref(enabled)
  const compassHeading = ref<number | null>(null)
  const lastHeading = ref<number | null>(null)
  const alpha = ref<number | null>(null)
  const beta = ref<number | null>(null)
  const gamma = ref<number | null>(null)
  const effectiveTilt = ref<number | null>(null)
  const error = ref<string | null>(null)

  function normalizeDegrees(angle: number) {
    return (angle % 360 + 360) % 360
  }

  function getScreenOrientationAngle(): number {
    const angle = typeof window !== 'undefined'
      ? (window.screen?.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0)
      : 0
    return angle
  }

  function calculateEffectiveTilt(rawBeta: number | null, rawGamma: number | null): number | null {
    const screenAngle = getScreenOrientationAngle()
    let tilt: number

    if (screenAngle === 0 || screenAngle === 180) {
      if (rawBeta === null) return null
      tilt = Math.min(80, Math.max(0, rawBeta))
    } else {
      if (rawGamma === null) return null
      let adjustedGamma = rawGamma
      if (screenAngle === 270) adjustedGamma = -rawGamma
      const normalizedGamma = Math.max(-90, Math.min(90, adjustedGamma))
      tilt = Math.min(80, Math.max(0, 45 - normalizedGamma * (35 / 90)))
    }

    return tilt
  }

  function applyHeading(rawHeading: number | null) {
    if (rawHeading === null || Number.isNaN(rawHeading)) return
    const heading = normalizeDegrees(rawHeading)

    if (lastHeading.value === null) {
      lastHeading.value = heading
      compassHeading.value = heading
      return
    }

    const delta = normalizeDegrees(heading - lastHeading.value)
    const shortest = delta > 180 ? delta - 360 : delta
    const SMOOTHING = 0.25
    const blended = normalizeDegrees(lastHeading.value + shortest * SMOOTHING)
    lastHeading.value = blended
    compassHeading.value = blended
  }

  let lastEffectiveTilt: number | null = null
  function applyEffectiveTilt(rawBeta: number | null, rawGamma: number | null) {
    const newTilt = calculateEffectiveTilt(rawBeta, rawGamma)
    if (newTilt === null) return

    if (lastEffectiveTilt === null) {
      lastEffectiveTilt = newTilt
      effectiveTilt.value = newTilt
      return
    }

    const SMOOTHING = 0.2
    const blended = lastEffectiveTilt + (newTilt - lastEffectiveTilt) * SMOOTHING
    lastEffectiveTilt = blended
    effectiveTilt.value = blended
  }

  function handleOrientationAbsolute(event: DeviceOrientationEvent) {
    if (!isEnabled.value) return
    if (event.alpha !== null) {
      applyHeading(event.alpha - getScreenOrientationAngle())
      alpha.value = normalizeDegrees(event.alpha)
    }
    if (event.beta !== null) beta.value = event.beta
    if (event.gamma !== null) gamma.value = event.gamma
    applyEffectiveTilt(event.beta, event.gamma)
  }

  function handleOrientation(event: DeviceOrientationEvent) {
    if (!isEnabled.value) return

    const webkitHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
    if (webkitHeading !== undefined && webkitHeading !== null && !Number.isNaN(webkitHeading)) {
      applyHeading(webkitHeading - getScreenOrientationAngle())
    }

    if (compassHeading.value === null && event.absolute === true && event.alpha !== null) {
      applyHeading(event.alpha - getScreenOrientationAngle())
    }

    if (event.beta !== null) beta.value = event.beta
    if (event.gamma !== null) gamma.value = event.gamma
    if (event.alpha !== null) alpha.value = normalizeDegrees(event.alpha)
    applyEffectiveTilt(event.beta, event.gamma)
  }

  function enable() {
    if (!isSupported.value) {
      error.value = 'Gyroskop není podporován'
      return
    }
    isEnabled.value = true
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', handleOrientationAbsolute)
    }
    window.addEventListener('deviceorientation', handleOrientation)
  }

  function disable() {
    isEnabled.value = false
    if ('ondeviceorientationabsolute' in window) {
      window.removeEventListener('deviceorientationabsolute', handleOrientationAbsolute)
    }
    window.removeEventListener('deviceorientation', handleOrientation)
  }

  function checkSupport() {
    isSupported.value = 'DeviceOrientationEvent' in window || 'ondeviceorientationabsolute' in window
    return isSupported.value
  }

  async function requestPermission(): Promise<boolean> {
    if (!isSupported.value) return false

    const req = (DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }).requestPermission

    if (typeof req === 'function') {
      try {
        const response = await req()
        if (response === 'granted') {
          enable()
          return true
        }
        return false
      } catch {
        return false
      }
    }

    enable()
    return true
  }

  onMounted(() => {
    checkSupport()
    if (isEnabled.value && isSupported.value) enable()
  })

  onUnmounted(disable)

  return {
    isSupported,
    isEnabled: computed(() => isEnabled.value),
    data: computed<GyroData>(() => ({
      alpha: alpha.value,
      beta: beta.value,
      gamma: gamma.value,
      compassHeading: compassHeading.value,
      effectiveTilt: effectiveTilt.value,
    })),
    error,
    enable,
    disable,
    checkSupport,
    requestPermission,
  }
}
