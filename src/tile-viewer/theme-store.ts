import * as THREE from 'three'
import type { TileViewerTheme } from './theme'
import { loadThemeFromStorage, mergeTheme, saveThemeToStorage } from './theme'
import { applyTerrainAmbientToMaterial, applyThemeToMaterial, syncSunUniform } from './sdf-material'
import type { WorldEnvironment } from './world-environment'
import { getTerrainAmbientColors } from './world-environment'
import { getBuildingMaterial } from './shared-materials'
import { updateSharedRoadPalette } from './road-palette'

export type ThemeChangeListener = (theme: Readonly<TileViewerTheme>) => void

const terrainMaterials = new Set<THREE.ShaderMaterial>()
let currentTheme: TileViewerTheme = mergeTheme(loadThemeFromStorage() ?? {})
const listeners = new Set<ThemeChangeListener>()
let worldEnv: WorldEnvironment | null = null
let sceneThemeApply: ((theme: TileViewerTheme) => void) | null = null

export function bindWorldEnvironment(env: WorldEnvironment): void {
  worldEnv = env
  syncSunOnAllMaterials(env.sun, env)
}

/** Scene registers this so panel `setTheme` always updates WebGL (not only Vue state). */
export function registerSceneThemeApply(apply: (theme: TileViewerTheme) => void): () => void {
  sceneThemeApply = apply
  apply(currentTheme)
  return () => {
    sceneThemeApply = null
  }
}

updateSharedRoadPalette(currentTheme.highwayStops)

export function getTheme(): Readonly<TileViewerTheme> {
  return currentTheme
}

export function registerTerrainMaterial(mat: THREE.ShaderMaterial): void {
  terrainMaterials.add(mat)
  applyThemeToMaterial(mat, currentTheme)
  if (worldEnv) syncSunOnAllMaterials(worldEnv.sun, worldEnv)
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
  sceneThemeApply?.(currentTheme)
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
  sceneThemeApply?.(currentTheme)
  for (const fn of listeners) fn(currentTheme)
  return currentTheme
}

const _skyAmb = new THREE.Vector3()
const _groundAmb = new THREE.Vector3()

export function syncSunOnAllMaterials(sun: THREE.DirectionalLight, env?: WorldEnvironment): void {
  if (env) {
    getTerrainAmbientColors(env, currentTheme, _skyAmb, _groundAmb)
  }
  for (const mat of terrainMaterials) {
    syncSunUniform(mat, sun)
    if (env) applyTerrainAmbientToMaterial(mat, _skyAmb, _groundAmb)
  }
}

export function subscribeTheme(listener: ThemeChangeListener): () => void {
  listeners.add(listener)
  listener(currentTheme)
  return () => listeners.delete(listener)
}

export interface SceneThemeTargets {
  scene: THREE.Scene
  env: WorldEnvironment
  renderer: THREE.WebGLRenderer
}

export function applyThemeToScene(targets: SceneThemeTargets, theme: TileViewerTheme): void {
  const { env, renderer } = targets

  env.applyTheme(theme)
  syncSunOnAllMaterials(env.sun, env)

  renderer.toneMappingExposure = theme.exposure
}

