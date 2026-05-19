import * as THREE from 'three'
import type { TileViewerTheme } from './theme'
import { loadThemeFromStorage, mergeTheme, saveThemeToStorage } from './theme'
import { applyThemeToMaterial, syncSunUniform } from './sdf-material'
import { getBuildingMaterial } from './shared-materials'
import { updateSharedRoadPalette } from './road-palette'

export type ThemeChangeListener = (theme: Readonly<TileViewerTheme>) => void

const terrainMaterials = new Set<THREE.ShaderMaterial>()
let currentTheme: TileViewerTheme = mergeTheme(loadThemeFromStorage() ?? {})
const listeners = new Set<ThemeChangeListener>()

updateSharedRoadPalette(currentTheme.highwayStops)

export function getTheme(): Readonly<TileViewerTheme> {
  return currentTheme
}

export function registerTerrainMaterial(mat: THREE.ShaderMaterial): void {
  terrainMaterials.add(mat)
  applyThemeToMaterial(mat, currentTheme)
}

export function unregisterTerrainMaterial(mat: THREE.ShaderMaterial): void {
  terrainMaterials.delete(mat)
}

export function setGlobalElevation(elevMin: number, elevRange: number): void {
  for (const mat of terrainMaterials) {
    mat.uniforms.uElevMin!.value = elevMin
    mat.uniforms.uElevRange!.value = elevRange
  }
}

export function setTheme(partial: Partial<TileViewerTheme>): TileViewerTheme {
  currentTheme = mergeTheme({ ...currentTheme, ...partial })
  updateSharedRoadPalette(currentTheme.highwayStops)

  for (const mat of terrainMaterials) {
    applyThemeToMaterial(mat, currentTheme)
  }
  // Sun direction is applied from scene via syncSunOnAllMaterials after lights update

  getBuildingMaterial().color.setHex(
    parseInt(currentTheme.building.replace('#', ''), 16),
  )

  saveThemeToStorage(currentTheme)
  for (const fn of listeners) fn(currentTheme)
  return currentTheme
}

export function resetTheme(): TileViewerTheme {
  try {
    localStorage.removeItem('svarog.tileViewer.theme')
  } catch { /* ignore */ }
  currentTheme = mergeTheme({})
  updateSharedRoadPalette(currentTheme.highwayStops)
  for (const mat of terrainMaterials) {
    applyThemeToMaterial(mat, currentTheme)
  }
  getBuildingMaterial().color.setHex(
    parseInt(currentTheme.building.replace('#', ''), 16),
  )
  saveThemeToStorage(currentTheme)
  for (const fn of listeners) fn(currentTheme)
  return currentTheme
}

export function syncSunOnAllMaterials(sun: THREE.DirectionalLight): void {
  for (const mat of terrainMaterials) {
    syncSunUniform(mat, sun)
  }
}

export function subscribeTheme(listener: ThemeChangeListener): () => void {
  listeners.add(listener)
  listener(currentTheme)
  return () => listeners.delete(listener)
}

export interface SceneThemeTargets {
  scene: THREE.Scene
  ambient: THREE.AmbientLight
  sun: THREE.DirectionalLight
  renderer: THREE.WebGLRenderer
}

export function applyThemeToScene(targets: SceneThemeTargets, theme: TileViewerTheme): void {
  const { scene, ambient, sun, renderer } = targets

  scene.background = new THREE.Color(theme.sky)
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.set(theme.fog)
    scene.fog.near = theme.fogNear
    scene.fog.far = theme.fogFar
  }

  ambient.intensity = theme.ambientIntensity
  sun.intensity = theme.sunIntensity
  sun.color.set(theme.sunColor)

  renderer.toneMappingExposure = theme.exposure
}

