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
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import worldConfig from 'svarog-contracts/world-config.json'
import {
  geoToWorld,
  boundsToTileRange,
  latLonToTileXY,
  tileXYToLatLon,
} from './geo'
import { loadTile, prepareTilesRemote, type LoadedTile, type TileDescriptor } from './tile-loader'
import { tilesetUrl, tileAssetsPathPrefix } from './tiles-config'

// ── Tileset descriptor (TileJSON 3.0.0 + svarog extras) ───────────────────────

interface TilesetExtras {
  svarog_version?: string
  has_sdf?:        boolean
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
const BATCH       = 4

// ── scene entry point ──────────────────────────────────────────────────────────

export interface SceneHandle {
  renderer: THREE.WebGLRenderer
  origin: { lat: number; lon: number }
  focusAtGps: (lat: number, lon: number) => void
  dispose: () => void
}

export async function initScene(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  // ── renderer ───────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.shadowMap.enabled   = true
  renderer.shadowMap.type      = THREE.PCFSoftShadowMap
  renderer.toneMapping         = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0

  // ── scene ──────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x7faed0)
  scene.fog        = new THREE.Fog(0x7faed0, 2000, 4500)

  // ── lights ─────────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xfff4e8, 0.55))
  const sun = new THREE.DirectionalLight(0xfff8f0, 1.5)
  sun.position.set(600, 900, 400)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const r = 1400
  Object.assign(sun.shadow.camera, { near: 1, far: 5000, left: -r, right: r, bottom: -r, top: r })
  scene.add(sun)

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
  const globalHasSdf   = tileset.extras?.has_sdf ?? false
  const tileRange      = boundsToTileRange(tileset.bounds, zoom)

  // Global elevation range — shared across ALL tiles so that per-tile
  // terrain colouring is consistent and tile edges don't create colour seams
  // ("bread-loaf" artefact).
  const globalElevMin   = tileset.extras?.elev_min  ?? 220
  const globalElevMax   = tileset.extras?.elev_max  ?? 360
  const globalElevRange = Math.max(globalElevMax - globalElevMin, 1)

  // ELEV_Y: Y-position of the camera target (= terrain surface height).
  // Initialised from the tileset global elev_min; updated dynamically after the
  // first tile loads so the camera sits on the actual local terrain, not the
  // dataset-wide minimum (which can be 50–100 m below the user's location).
  let ELEV_Y = tileset.extras?.elev_min ?? 220

  // initDist controls the zoom level on startup: 500 m gives a good overview
  // of the 5×5 tile grid (≈750 m across at zoom 17).
  const initDist = 500

  // ── camera ─────────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 1, 12000)
  camera.position.set(0, ELEV_Y + initDist * 0.85, initDist)
  camera.lookAt(0, ELEV_Y, 0)

  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, ELEV_Y, 0)
  controls.minDistance   = 30
  controls.maxDistance   = 8000
  controls.maxPolarAngle = Math.PI / 2.05
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  // Fixed offset from target → camera so that focusAtGps just moves the target
  // and the camera follows at the same relative distance and angle.
  const cameraOffset = new THREE.Vector3().subVectors(camera.position, controls.target)

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
    return { z: zoom, x, y, offsetX, offsetZ, hasSdf: globalHasSdf, tileLat: c.lat }
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
    lt.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.geometry.dispose()
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose())
      } else {
        obj.material.dispose()
      }
    })
    liveTiles.delete(key)
  }

  let elevCalibrated = false

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
          loadTile(scene, d, assetsPrefix, globalElevMin, globalElevRange, originLat)
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

      // On first successful tile, calibrate camera height to local terrain.
      if (!elevCalibrated) {
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            ELEV_Y = r.value.elevMin
            elevCalibrated = true
            const cy = controls.target.y
            if (Math.abs(cy - ELEV_Y) > 2) {
              controls.target.setY(ELEV_Y)
              camera.position.setY(camera.position.y + (ELEV_Y - cy))
              controls.update()
            }
            break
          }
        }
      }
    }
  }

  // No initial tile load — tiles are loaded on first GPS fix so the player
  // is always at the centre of the 5×5 window (see focusAtGps below).

  // ── GPS focus ──────────────────────────────────────────────────────────────

  function focusAtGps(lat: number, lon: number) {
    const { offsetX, offsetZ } = geoToWorld(lat, lon, originLat, originLon)
    controls.target.set(offsetX, ELEV_Y, offsetZ)
    camera.position.copy(controls.target).add(cameraOffset)
    controls.update()
    userMarker.position.set(offsetX, ELEV_Y + 16, offsetZ)
    userMarker.visible = true
    void loadAround(lat, lon)
  }

  // ── render loop ────────────────────────────────────────────────────────────
  let animId: number
  function animate() {
    animId = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  // ── responsive resize ──────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const w = canvas.clientWidth, h = canvas.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  })
  ro.observe(canvas)

  return {
    renderer,
    origin: { lat: originLat, lon: originLon },
    focusAtGps,
    dispose() {
      cancelAnimationFrame(animId)
      ro.disconnect()
      // Unload all live tiles
      for (const key of [...liveTiles.keys()]) unloadTile(key)
      scene.remove(userMarker)
      markerGeom.dispose()
      markerMat.dispose()
      controls.dispose()
      renderer.dispose()
    },
  }
}
