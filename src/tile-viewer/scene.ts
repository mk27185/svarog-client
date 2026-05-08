/**
 * Three.js scene setup for the SDF road PoC.
 *
 * Tile world offsets are derived from the geographic bbox centres stored in
 * tile-manifest.json, NOT from integer-step × 200 m.  Each tile's DEM spans
 * ≈ 218 m (the downloader adds ~9 m padding on each side), so placing tiles
 * at fixed 200 m intervals creates visible seams.  Computing offsets from
 * the actual lat/lon centres using an equirectangular projection centred on
 * the grid centre eliminates the misalignment.
 *
 * World-space layout (Three.js, Y-up):
 *   east   = +X
 *   south  = +Z  (Mercator tile-y increases southward)
 *   up     = +Y  (elevation, ~244 m absolute for Prague)
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadTile, type TileDescriptor } from './tile-loader'

// Prague centre elevation in Three.js world Y (GLTF Z→Y rotation, absolute metres)
const ELEV_Y = 244.0

// ── metres per degree at a given latitude ─────────────────────────
const MPD_LAT = 111_320.0
function mpdLon(lat: number): number {
  return MPD_LAT * Math.cos((lat * Math.PI) / 180)
}

// ── manifest types ─────────────────────────────────────────────────
interface ManifestTile {
  name: string
  /** [lat_min, lon_min, lat_max, lon_max] */
  bbox: [number, number, number, number]
  outputs: { sdf_texture: string | null }
}

interface Manifest {
  tiles: ManifestTile[]
}

// ── helpers ────────────────────────────────────────────────────────
function tileCentre(bbox: [number, number, number, number]): { lat: number; lon: number } {
  return {
    lat: (bbox[0] + bbox[2]) / 2,
    lon: (bbox[1] + bbox[3]) / 2,
  }
}

function geoToWorld(
  lat: number,
  lon: number,
  originLat: number,
  originLon: number,
): { offsetX: number; offsetZ: number } {
  const lon0 = mpdLon(originLat)
  return {
    offsetX: (lon - originLon) * lon0,
    offsetZ: -(lat - originLat) * MPD_LAT,   // south = +Z
  }
}

// ── scene entry point ──────────────────────────────────────────────
export interface SceneHandle {
  renderer: THREE.WebGLRenderer
  dispose: () => void
}

export async function initScene(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  // ── renderer ────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.shadowMap.enabled   = true
  renderer.shadowMap.type      = THREE.PCFSoftShadowMap
  renderer.toneMapping         = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0

  // ── scene ────────────────────────────────────────────────────────
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x7faed0)
  scene.fog        = new THREE.Fog(0x7faed0, 2000, 4500)

  // ── lights ───────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xfff4e8, 0.55))

  const sun = new THREE.DirectionalLight(0xfff8f0, 1.5)
  sun.position.set(600, 900, 400)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const r = 1400
  Object.assign(sun.shadow.camera, { near: 1, far: 5000, left: -r, right: r, bottom: -r, top: r })
  scene.add(sun)

  // ── fetch manifest ────────────────────────────────────────────────
  const res      = await fetch('/tiles/tile-manifest.json')
  const manifest = await res.json() as Manifest

  // Find the geographic centre of the full grid (used as world origin)
  const allCentres = manifest.tiles.map((t) => tileCentre(t.bbox))
  const originLat = allCentres.reduce((s, c) => s + c.lat, 0) / allCentres.length
  const originLon = allCentres.reduce((s, c) => s + c.lon, 0) / allCentres.length

  // Estimate grid half-extent for camera placement
  const offsets = allCentres.map((c) => geoToWorld(c.lat, c.lon, originLat, originLon))
  const maxExtent = offsets.reduce(
    (m, o) => Math.max(m, Math.abs(o.offsetX), Math.abs(o.offsetZ)),
    0,
  )

  // ── camera ───────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 1, 8000)
  camera.position.set(0, ELEV_Y + maxExtent * 1.2, maxExtent * 1.6)
  camera.lookAt(0, ELEV_Y, 0)

  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, ELEV_Y, 0)
  controls.minDistance   = 100
  controls.maxDistance   = 5000
  controls.maxPolarAngle = Math.PI / 2.1
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  // ── build tile descriptors ────────────────────────────────────────
  const descriptors: TileDescriptor[] = manifest.tiles.map((t) => {
    const [z, x, y] = t.name.split('/').map(Number)
    const c = tileCentre(t.bbox)
    const { offsetX, offsetZ } = geoToWorld(c.lat, c.lon, originLat, originLon)
    return {
      z,
      x,
      y,
      hasSdf:  t.outputs.sdf_texture != null,
      offsetX,
      offsetZ,
    }
  })

  // ── load tiles in batches ─────────────────────────────────────────
  ;(async () => {
    const BATCH = 4
    for (let i = 0; i < descriptors.length; i += BATCH) {
      await Promise.allSettled(
        descriptors.slice(i, i + BATCH).map((d) =>
          loadTile(scene, d).catch((e) =>
            console.warn(`tile ${d.z}/${d.x}/${d.y} failed`, e),
          ),
        ),
      )
    }
  })()

  // ── render loop ──────────────────────────────────────────────────
  let animId: number
  function animate() {
    animId = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  // ── responsive resize ────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const w = canvas.clientWidth, h = canvas.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  })
  ro.observe(canvas)

  return {
    renderer,
    dispose() {
      cancelAnimationFrame(animId)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
    },
  }
}
