/**
 * Three.js scene for the tile viewer.
 *
 * Tile loading: 5×5 window around the current GPS position (or tileset centre
 * on startup). When GPS updates, missing tiles in the new window are fetched;
 * already-loaded tiles stay in the scene (no dispose — 25-tile window keeps
 * memory bounded as long as the user doesn't roam the whole dataset).
 * GPS positions outside the tileset bounds are clamped so the initial dataset
 * tiles always load even when the device is far from the generated area.
 *
 * World-space layout (Three.js, Y-up):
 *   east  = +X  |  south = +Z  |  up = +Y (elevation)
 */

import * as THREE from 'three'
import worldConfig from 'svarog-contracts/world-config.json'
import gameRuntime from 'svarog-contracts/game-runtime.json'
import {
  geoToWorld,
  worldToGeo,
  boundsToTileRange,
  latLonToTileXY,
  tileXYToLatLon,
} from './geo'
import { createGpsKalmanFilter } from './gps-kalman'
import { createThirdPersonCamera, type RotationMode, type ThirdPersonCamera } from './third-person-camera'
import {
  loadTile,
  prepareTilesRemote,
  setNavmeshDebugVisible,
  type LoadedTile,
  type TileDescriptor,
} from './tile-loader'
import { tilesetUrl, tileAssetsPathPrefix } from './tiles-config'
import type { TileViewerTheme } from './theme'
import {
  applyThemeToScene,
  bindWorldEnvironment,
  getTheme,
  registerSceneThemeApply,
  setGlobalElevation,
  setTheme as applyStoredTheme,
  subscribeTheme,
  syncTerrainMaterials,
  unregisterTerrainMaterial,
  type SceneThemeTargets,
} from './theme-store'
import { createPostProcessing, resizeComposer } from './post-processing'
import { createWorldEnvironment } from './world-environment'
import {
  createTerrainHeightSampler,
  MARKER_CENTER_ABOVE_TERRAIN,
  PLAYER_HEIGHT_ABOVE_TERRAIN,
} from './terrain-height'

// ── Tileset descriptor (TileJSON 3.0.0 + svarog extras) ───────────────────────

interface TilesetExtras {
  svarog_version?: string
  has_sdf?:        boolean
  has_landcover?:  boolean
  has_navmesh?:    boolean
  elev_min?:       number | null
  elev_max?:       number | null
}

interface Tileset {
  tilejson: string
  tiles:    string[]
  minzoom:  number
  maxzoom:  number
  /** [lonW, latS, lonE, latN] WGS84 */
  bounds:   [number, number, number, number]
  /** [lon, lat, zoom] */
  center:   [number, number, number]
  extras?:  TilesetExtras
}

// ── constants ─────────────────────────────────────────────────────────────────

/**
 * Half-side of the loaded tile window, sourced from svarog-contracts/world-config.json.
 * load_radius_tiles:1 → 3×3 grid, 2 → 5×5, etc.
 */
const WINDOW_HALF = worldConfig.load_radius_tiles
const BATCH       = gameRuntime.tiles.load_batch_size
const TILE_LOAD_MIN_INTERVAL_MS = gameRuntime.tiles.load_min_interval_ms
const TILE_RELOAD_MIN_MOVE_M    = gameRuntime.gps.display_min_move_meters

// ── scene entry point ──────────────────────────────────────────────────────────

export interface SceneHandle {
  renderer: THREE.WebGLRenderer
  origin: { lat: number; lon: number }
  camera: ThirdPersonCamera
  focusAtGps: (lat: number, lon: number, accuracyM?: number, force?: boolean) => void
  setTheme: (partial: Partial<TileViewerTheme>) => TileViewerTheme
  getTheme: () => Readonly<TileViewerTheme>
  dispose: () => void
}

export async function initScene(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  // ── renderer ───────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.shadowMap.enabled   = false
  renderer.toneMapping         = THREE.NoToneMapping
  renderer.toneMappingExposure = 1.0

  // ── scene ──────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene()

  const camCfg = gameRuntime.camera
  const camera = new THREE.PerspectiveCamera(
    camCfg.fov, canvas.clientWidth / canvas.clientHeight, 1, 25_000,
  )

  const env = createWorldEnvironment(scene)
  bindWorldEnvironment(env)

  const sceneTargets: SceneThemeTargets = { scene, env, renderer }

  // ── fetch tileset.json ─────────────────────────────────────────────────────
  const assetsPrefix = tileAssetsPathPrefix()
  prepareTilesRemote(assetsPrefix)

  const res = await fetch(tilesetUrl())
  if (!res.ok) throw new Error(`Tileset HTTP ${res.status}: ${tilesetUrl()}`)
  const tileset = await res.json() as Tileset

  const zoom           = tileset.minzoom
  const [lonW, latS, lonE, latN] = tileset.bounds
  const originLat      = (latS + latN) / 2
  const originLon      = (lonW + lonE) / 2
  const globalHasSdf       = tileset.extras?.has_sdf ?? false
  const globalHasLandcover = tileset.extras?.has_landcover ?? false
  const tileRange      = boundsToTileRange(tileset.bounds, zoom)

  // Global elevation range — shared across ALL tiles so that per-tile
  // terrain colouring is consistent and tile edges don't create colour seams
  // ("bread-loaf" artefact).
  const globalElevMin   = tileset.extras?.elev_min  ?? 220
  const globalElevMax   = tileset.extras?.elev_max  ?? 360
  const globalElevRange = Math.max(globalElevMax - globalElevMin, 1)
  setGlobalElevation(globalElevMin, globalElevRange)

  // ELEV_Y: Y-position of the camera target (= terrain surface height).
  // Initialised from the tileset global elev_min; updated dynamically after the
  // first tile loads so the camera sits on the actual local terrain, not the
  // dataset-wide minimum (which can be 50–100 m below the user's location).
  /** Fallback Y when terrain tiles are not loaded yet (dataset-wide minimum). */
  let fallbackElevY = tileset.extras?.elev_min ?? 220

  const terrainHeight = createTerrainHeightSampler(
    () => liveTiles.values(),
    () => globalElevMax + 500,
  )

  const playerTarget = new THREE.Vector3(0, fallbackElevY, 0)

  const positionKalman = createGpsKalmanFilter(gameRuntime.gps.kalman)

  const cameraController = createThirdPersonCamera(
    camera,
    canvas,
    {
      minDistance: camCfg.min_distance,
      maxDistance: camCfg.max_distance,
      minElevation: camCfg.min_elevation,
      maxElevation: camCfg.max_elevation,
      defaultDistance: camCfg.default_distance,
      defaultElevation: camCfg.default_elevation,
      defaultAzimuth: camCfg.default_azimuth,
    },
    camCfg.default_rotation_mode as RotationMode,
  )
  cameraController.setTarget(playerTarget)

  const { composer, colorGrade } = createPostProcessing(renderer, scene, camera)

  // ── GPS marker ─────────────────────────────────────────────────────────────
  const markerGeom = new THREE.ConeGeometry(3.5, 14, 10)
  const markerMat  = new THREE.MeshStandardMaterial({
    color: 0xe84848, emissive: 0x351010, roughness: 0.45, metalness: 0.1,
  })
  const userMarker = new THREE.Mesh(markerGeom, markerMat)
  userMarker.castShadow = true
  userMarker.visible    = false
  scene.add(userMarker)

  // ── tile window loader ─────────────────────────────────────────────────────

  /**
   * Tiles currently present in the scene, keyed by `${zoom}/${x}/${y}`.
   * Used both to avoid duplicate fetches and to unload tiles that leave the
   * view window when the player moves.
   */
  const liveTiles = new Map<string, LoadedTile>()

  /** Keys of tiles currently in-flight (fetch started but not yet resolved). */
  const inFlight = new Set<string>()

  function tileKey(x: number, y: number): string {
    return `${zoom}/${x}/${y}`
  }

  function makeDescriptor(x: number, y: number): TileDescriptor {
    const c = tileXYToLatLon(zoom, x, y)
    const { offsetX, offsetZ } = geoToWorld(c.lat, c.lon, originLat, originLon)
    return {
      z: zoom, x, y, offsetX, offsetZ,
      hasSdf: globalHasSdf,
      hasLandcover: globalHasLandcover,
      tileLat: c.lat,
    }
  }

  /**
   * Clamp (lat, lon) to the tileset bounding box so that GPS positions outside
   * the dataset still produce valid tile indices.
   */
  function clampToDataset(lat: number, lon: number): { lat: number; lon: number } {
    return {
      lat: Math.max(latS, Math.min(latN, lat)),
      lon: Math.max(lonW, Math.min(lonE, lon)),
    }
  }

  /**
   * Compute the full set of tile keys that should be visible around (lat, lon).
   * Constrained to the tileset bounds.
   */
  function windowKeysAround(lat: number, lon: number): Set<string> {
    const center = latLonToTileXY(lat, lon, zoom)
    const keys = new Set<string>()
    for (let dy = -WINDOW_HALF; dy <= WINDOW_HALF; dy++) {
      for (let dx = -WINDOW_HALF; dx <= WINDOW_HALF; dx++) {
        const x = center.x + dx
        const y = center.y + dy
        if (x < tileRange.xMin || x > tileRange.xMax) continue
        if (y < tileRange.yMin || y > tileRange.yMax) continue
        keys.add(tileKey(x, y))
      }
    }
    return keys
  }

  /** Release GPU + scene resources for a single tile. */
  function unloadTile(key: string): void {
    const lt = liveTiles.get(key)
    if (!lt) return
    scene.remove(lt.group)
    if (lt.terrainMaterial) {
      unregisterTerrainMaterial(lt.terrainMaterial)
      lt.terrainMaterial.dispose()
    }
    if (lt.navmeshDebug) {
      lt.navmeshDebug.geometry.dispose()
      ;(lt.navmeshDebug.material as THREE.Material).dispose()
    }
    lt.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.geometry.dispose()
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const m of mats) {
        if (m !== lt.terrainMaterial) m.dispose()
      }
    })
    liveTiles.delete(key)
    terrainHeight.invalidateCache()
  }

  function applyNavmeshDebugToAllTiles(visible: boolean): void {
    for (const lt of liveTiles.values()) {
      setNavmeshDebugVisible(lt, visible)
    }
  }

  function applyFullTheme(theme: TileViewerTheme): void {
    applyThemeToScene(sceneTargets, theme)
    colorGrade.applyTheme(theme)
    syncTerrainMaterials(env.sun, env, camera, scene.fog)
  }

  const unregSceneTheme = registerSceneThemeApply(applyFullTheme)
  const unsubTheme = subscribeTheme((theme) => {
    applyNavmeshDebugToAllTiles(theme.showNavmeshDebug)
  })

  let elevCalibrated = false
  let lastTileLoadAt = 0
  let pendingTileLoad: { lat: number; lon: number } | null = null
  let tileLoadTimer: ReturnType<typeof setTimeout> | null = null
  let lastTileLoadWorld: { x: number; z: number } | null = null

  function scheduleLoadAround(lat: number, lon: number) {
    pendingTileLoad = { lat, lon }
    const elapsed = performance.now() - lastTileLoadAt
    const delay = Math.max(0, TILE_LOAD_MIN_INTERVAL_MS - elapsed)

    if (tileLoadTimer !== null) return

    tileLoadTimer = setTimeout(() => {
      tileLoadTimer = null
      const p = pendingTileLoad
      pendingTileLoad = null
      if (!p) return
      lastTileLoadAt = performance.now()
      void loadAround(p.lat, p.lon)
    }, delay)
  }

  function maybeScheduleTilesForFilteredPosition(force: boolean) {
    if (!positionKalman.isInitialized()) return

    const { x, z } = positionKalman.getPosition()
    if (
      force
      || !lastTileLoadWorld
      || Math.hypot(x - lastTileLoadWorld.x, z - lastTileLoadWorld.z) >= TILE_RELOAD_MIN_MOVE_M
    ) {
      lastTileLoadWorld = { x, z }
      const geo = worldToGeo(x, z, originLat, originLon)
      scheduleLoadAround(geo.lat, geo.lon)
    }
  }

  function terrainYAt(offsetX: number, offsetZ: number): number {
    const sampled = terrainHeight.sampleTerrainY(offsetX, offsetZ)
    return sampled ?? fallbackElevY
  }

  function syncPlayerWorldPosition(offsetX: number, offsetZ: number) {
    const surfaceY = terrainYAt(offsetX, offsetZ)
    playerTarget.set(offsetX, surfaceY + PLAYER_HEIGHT_ABOVE_TERRAIN, offsetZ)
    cameraController.setTarget(playerTarget)
    userMarker.position.set(offsetX, surfaceY + MARKER_CENTER_ABOVE_TERRAIN, offsetZ)
    userMarker.visible = true
  }

  /**
   * Load the WINDOW_HALF×2+1 square of tiles around (lat, lon), clamped to
   * dataset bounds, and unload any tiles that have drifted outside the window.
   */
  async function loadAround(lat: number, lon: number): Promise<void> {
    const clamped   = clampToDataset(lat, lon)
    const wantedKeys = windowKeysAround(clamped.lat, clamped.lon)

    // ── unload tiles no longer in window ──────────────────────────────────
    for (const key of liveTiles.keys()) {
      if (!wantedKeys.has(key)) unloadTile(key)
    }

    // ── build descriptor list for tiles not yet live or in-flight ─────────
    const center = latLonToTileXY(clamped.lat, clamped.lon, zoom)
    const toLoad: TileDescriptor[] = []

    // Spiral order: Chebyshev distance 0 first, then 1, 2, …
    for (let dist = 0; dist <= WINDOW_HALF; dist++) {
      for (let dy = -dist; dy <= dist; dy++) {
        for (let dx = -dist; dx <= dist; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== dist) continue
          const x = center.x + dx
          const y = center.y + dy
          const k = tileKey(x, y)
          if (!wantedKeys.has(k)) continue
          if (liveTiles.has(k) || inFlight.has(k)) continue
          inFlight.add(k)
          toLoad.push(makeDescriptor(x, y))
        }
      }
    }

    // ── fetch in small parallel batches ───────────────────────────────────
    for (let i = 0; i < toLoad.length; i += BATCH) {
      const results = await Promise.allSettled(
        toLoad.slice(i, i + BATCH).map((d) =>
          loadTile(
            scene, d, assetsPrefix, globalElevMin, globalElevRange, originLat,
            getTheme().showNavmeshDebug,
          )
            .then((lt) => {
              const k = tileKey(d.x, d.y)
              inFlight.delete(k)
              // A unload request may have arrived while the fetch was in-flight.
              if (!windowKeysAround(clamped.lat, clamped.lon).has(k)) {
                unloadTile(k)   // remove immediately if no longer wanted
                liveTiles.delete(k)
                return null
              }
              liveTiles.set(k, lt)
              return lt
            })
            .catch((e) => {
              inFlight.delete(tileKey(d.x, d.y))
              console.warn(`tile ${d.z}/${d.x}/${d.y}`, e)
              return null
            }),
        ),
      )

      // On first successful tile, refresh fallback elevation and re-snap player.
      if (!elevCalibrated) {
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            fallbackElevY = r.value.elevMin
            elevCalibrated = true
            terrainHeight.invalidateCache()
            if (userMarker.visible) {
              syncPlayerWorldPosition(playerTarget.x, playerTarget.z)
            }
            break
          }
        }
      } else if (userMarker.visible) {
        terrainHeight.invalidateCache()
        syncPlayerWorldPosition(playerTarget.x, playerTarget.z)
      }
    }
  }

  // No initial tile load — tiles are loaded on first GPS fix so the player
  // is always at the centre of the 5×5 window (see focusAtGps below).

  // ── GPS focus ──────────────────────────────────────────────────────────────

  function focusAtGps(lat: number, lon: number, accuracyM = 0, force = false) {
    const { offsetX, offsetZ } = geoToWorld(lat, lon, originLat, originLon)
    if (!positionKalman.correct(offsetX, offsetZ, accuracyM, force)) return

    const { x, z } = positionKalman.getPosition()
    syncPlayerWorldPosition(x, z)
    maybeScheduleTilesForFilteredPosition(force)
  }

  // ── render loop ────────────────────────────────────────────────────────────
  let animId: number
  let lastFrameTime = performance.now()
  function animate() {
    animId = requestAnimationFrame(animate)

    const now = performance.now()
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1)
    lastFrameTime = now

    if (positionKalman.isInitialized()) {
      positionKalman.predict(dt)
      const { x, z } = positionKalman.getPosition()
      syncPlayerWorldPosition(x, z)
      maybeScheduleTilesForFilteredPosition(false)
    }

    cameraController.update()
    env.update(playerTarget)
    syncTerrainMaterials(env.sun, env, camera, scene.fog)
    composer.render()
  }
  animate()

  // ── responsive resize ──────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const w = canvas.clientWidth, h = canvas.clientHeight
    renderer.setSize(w, h, false)
    resizeComposer(composer, w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  })
  ro.observe(canvas)

  return {
    renderer,
    origin: { lat: originLat, lon: originLon },
    camera: cameraController,
    focusAtGps,
    setTheme(partial) {
      const theme = applyStoredTheme(partial)
      applyFullTheme(theme)
      return theme
    },
    getTheme,
    dispose() {
      cancelAnimationFrame(animId)
      if (tileLoadTimer !== null) clearTimeout(tileLoadTimer)
      ro.disconnect()
      unsubTheme()
      unregSceneTheme()
      composer.dispose()
      cameraController.dispose()
      for (const key of [...liveTiles.keys()]) unloadTile(key)
      scene.remove(userMarker)
      markerGeom.dispose()
      markerMat.dispose()
      env.dispose()
      renderer.dispose()
    },
  }
}
