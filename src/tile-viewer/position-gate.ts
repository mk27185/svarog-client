import { haversineMeters } from './geo'

export interface PositionGateConfig {
  minMoveMeters: number
  minIntervalMs: number
}

/**
 * Filters noisy / too-frequent GPS fixes before updating the scene or server.
 */
export function createPositionGate(config: PositionGateConfig) {
  let last: { lat: number; lon: number; time: number } | null = null

  function shouldAccept(lat: number, lon: number, force = false): boolean {
    const now = Date.now()
    if (force || !last) {
      last = { lat, lon, time: now }
      return true
    }

    const moved = haversineMeters(last.lat, last.lon, lat, lon)
    const elapsed = now - last.time

    if (moved >= config.minMoveMeters) {
      last = { lat, lon, time: now }
      return true
    }
    if (elapsed >= config.minIntervalMs) {
      last = { lat, lon, time: now }
      return true
    }
    return false
  }

  function reset() {
    last = null
  }

  return { shouldAccept, reset }
}
