import * as THREE from 'three'
import type { HighwayColorStop } from './theme'
import { hexToVec3 } from './theme'

const PALETTE_SIZE = 256

/**
 * 1D LUT: sample at SDF G (importance) for per-highway road colour.
 */
export function createRoadPaletteTexture(stops: HighwayColorStop[]): THREE.DataTexture {
  const data = new Uint8Array(PALETTE_SIZE * 4)
  const sorted = [...stops].sort((a, b) => a.t - b.t)

  for (let i = 0; i < PALETTE_SIZE; i++) {
    const t = i / (PALETTE_SIZE - 1)
    const [r, g, b] = sampleStops(sorted, t)
    const o = i * 4
    data[o]     = Math.round(r * 255)
    data[o + 1] = Math.round(g * 255)
    data[o + 2] = Math.round(b * 255)
    data[o + 3] = 255
  }

  const tex = new THREE.DataTexture(data, PALETTE_SIZE, 1, THREE.RGBAFormat)
  tex.needsUpdate = true
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

function sampleStops(stops: HighwayColorStop[], t: number): [number, number, number] {
  if (stops.length === 0) return [0.5, 0.5, 0.5]
  if (t <= stops[0]!.t) return hexToVec3(stops[0]!.color)
  if (t >= stops[stops.length - 1]!.t) return hexToVec3(stops[stops.length - 1]!.color)

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!
    const b = stops[i + 1]!
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / Math.max(b.t - a.t, 1e-6)
      const ca = hexToVec3(a.color)
      const cb = hexToVec3(b.color)
      return [
        ca[0] + (cb[0] - ca[0]) * f,
        ca[1] + (cb[1] - ca[1]) * f,
        ca[2] + (cb[2] - ca[2]) * f,
      ]
    }
  }
  return hexToVec3(stops[stops.length - 1]!.color)
}

let sharedPalette: THREE.DataTexture | null = null

export function getSharedRoadPalette(): THREE.DataTexture {
  if (!sharedPalette) sharedPalette = createRoadPaletteTexture([])
  return sharedPalette
}

export function updateSharedRoadPalette(stops: HighwayColorStop[]): void {
  const tex = getSharedRoadPalette()
  const sorted = [...stops].sort((a, b) => a.t - b.t)
  const data = tex.image.data as Uint8Array
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const t = i / (PALETTE_SIZE - 1)
    const [r, g, b] = sampleStops(sorted, t)
    const o = i * 4
    data[o]     = Math.round(r * 255)
    data[o + 1] = Math.round(g * 255)
    data[o + 2] = Math.round(b * 255)
    data[o + 3] = 255
  }
  tex.needsUpdate = true
}
