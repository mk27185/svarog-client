/**
 * Minimal atmosphere: sky = fog color, FogExp2, soft lights.
 * Visual reference: three.js webgl_geometry_terrain (efd1b5 + dense fog).
 */

import * as THREE from 'three'
import type { TileViewerTheme } from './theme'
import { hexToVec3 } from './theme'

/** Shared atmosphere tint — sky and fog must match for horizon merge. */
export function atmosphereColorFromTheme(theme: TileViewerTheme): THREE.Color {
  return new THREE.Color(theme.fog)
}

export interface WorldEnvironment {
  ambient: THREE.AmbientLight
  sun: THREE.DirectionalLight
  sunDirection: THREE.Vector3
  fogColor: THREE.Color
  applyTheme: (theme: TileViewerTheme) => void
  update: (focus: THREE.Vector3) => void
  dispose: () => void
}

function sunDirectionFromTheme(theme: TileViewerTheme, out: THREE.Vector3): THREE.Vector3 {
  const elev = THREE.MathUtils.degToRad(theme.sunElevation)
  const azim = THREE.MathUtils.degToRad(theme.sunAzimuth)
  const phi = Math.PI / 2 - elev
  return out.setFromSphericalCoords(1, phi, azim)
}

export function createWorldEnvironment(scene: THREE.Scene): WorldEnvironment {
  const fogColor = new THREE.Color(0xefd1b5)
  scene.background = fogColor.clone()
  scene.fog = new THREE.FogExp2(fogColor.getHex(), 0.00115)

  const ambient = new THREE.AmbientLight(0xefd1b5, 1.0)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xfff0e0, 0.35)
  sun.castShadow = false
  scene.add(sun.target)
  scene.add(sun)

  const sunDirection = new THREE.Vector3(0.4, 0.7, 0.3).normalize()

  function syncAtmosphere(theme: TileViewerTheme): void {
    sunDirectionFromTheme(theme, sunDirection)

    const atmos = atmosphereColorFromTheme(theme)
    fogColor.copy(atmos)
    scene.background = atmos.clone()

    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(atmos)
      scene.fog.density = theme.fogDensity
    }

    ambient.color.copy(atmos)
    ambient.intensity = theme.ambientIntensity

    sun.intensity = theme.sunIntensity
    sun.color.set(theme.sunColor)
  }

  const env: WorldEnvironment = {
    ambient,
    sun,
    sunDirection,
    fogColor,
    applyTheme: syncAtmosphere,
    update(focus) {
      sun.position.copy(focus).addScaledVector(sunDirection, 2000)
      sun.target.position.copy(focus)
      sun.target.updateMatrixWorld()
    },
    dispose() {
      scene.remove(ambient)
      scene.remove(sun.target)
      scene.remove(sun)
      ambient.dispose()
      sun.dispose()
    },
  }

  return env
}

/** Warm ambient for terrain shader — matches atmosphere, low contrast. */
export function getTerrainAmbientColors(
  _env: WorldEnvironment,
  theme: TileViewerTheme,
  skyOut: THREE.Vector3,
  groundOut: THREE.Vector3,
): void {
  const [r, g, b] = hexToVec3(theme.fog)
  const lift = theme.ambientIntensity * 0.08
  skyOut.set(
    Math.min(r + lift, 0.82),
    Math.min(g + lift, 0.76),
    Math.min(b + lift * 0.9, 0.68),
  )
  groundOut.set(r * 0.42, g * 0.38, b * 0.34)
}
