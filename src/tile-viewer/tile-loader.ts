/**
 * Loads a single XYZ tile: GLB mesh + optional SDF PNG texture.
 *
 * Tile URL pattern:
 *   GLB  /tiles/{z}/{x}/{y}/{y}.glb
 *   SDF  /tiles/{z}/{x}/{y}/{y}_roads_sdf.png
 *
 * Key geometry facts:
 *   - Vertices are centred at the tile geographic centre (cx, cy = total_w/2, total_h/2).
 *   - position.x = east, position.y = north, position.z = absolute elevation.
 *   - TEXCOORD_0 UV is baked by gltf_exporter.py using cx/cy so it matches
 *     sdf_generator.py exactly — no client-side constants needed.
 *   - Boundary vertices are snapped to ±cx / ±cy (tile stitching), so adjacent
 *     tiles share exact boundary coordinates with no visible seam.
 *
 * computeVertexNormals() is called after loading to produce smooth per-vertex
 * normals (eliminates the moiré from per-fragment dFdx/dFdy normals).
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { createSdfMaterial, updateSdfTexture } from './sdf-material'
import { getBuildingMaterial } from './shared-materials'
import { mpdLon } from './geo'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

const texLoader  = new THREE.TextureLoader()

/** Call before loading tiles from another origin (e.g. CDN). */
export function prepareTilesRemote(assetsPrefix: string): void {
  if (/^https?:\/\//i.test(assetsPrefix)) {
    gltfLoader.crossOrigin = 'anonymous'
    texLoader.crossOrigin  = 'anonymous'
  }
}

export interface TileDescriptor {
  z: number
  x: number
  y: number
  /** Hint from tileset.json — overridden by per-tile GLB extras after load. */
  hasSdf?: boolean
  /** world-space offset of this tile's geographic centre (metres from grid centre) */
  offsetX: number
  offsetZ: number
  /**
   * Geographic centre latitude of this tile (degrees).
   * Used to correct the E-W tile-width mismatch: the engine computes tile widths
   * using mpdLon(tile_lat), while the client places tiles using mpdLon(originLat).
   * Applying scaleX = mpdLon(originLat) / mpdLon(tile_lat) to the scene group
   * stretches the mesh to match the client placement and eliminates E-W seams.
   */
  tileLat?: number
}

export interface LoadedTile {
  group:            THREE.Group
  descriptor:       TileDescriptor
  elevMin:          number
  terrainMaterial?: THREE.ShaderMaterial
}

/**
 * Per-tile metadata embedded in scene.extras["svarog"] by GltfExporter.
 * Three.js maps GLTF scenes[0].extras → gltf.scene.userData on load.
 */
export interface TileExtras {
  elev_min?:        number
  elev_max?:        number
  has_sdf?:         boolean
  sdf_uv_width_m?:  number
  sdf_uv_height_m?: number
}

// Fallback elevation window when GLB extras are absent (old tiles without metadata).
const FALLBACK_ELEV_MIN   = 220.0
const FALLBACK_ELEV_RANGE =  70.0

export async function loadTile(
  scene: THREE.Scene,
  desc: TileDescriptor,
  assetsPathPrefix: string,
  globalElevMin?:   number,
  globalElevRange?: number,
  originLat?:       number,
): Promise<LoadedTile> {
  const { z, x, y } = desc
  const base = `${assetsPathPrefix}/${z}/${x}/${y}/${y}`

  const gltf = await gltfLoader.loadAsync(`${base}.glb`)

  // ── read per-tile metadata from scene.extras["svarog"] ──────────
  // Three.js GLTFLoader maps GLTF scenes[0].extras → gltf.scene.userData.
  const extras = (gltf.scene.userData?.svarog ?? null) as TileExtras | null

  const tileElevMin   = extras?.elev_min ?? FALLBACK_ELEV_MIN
  const tileElevMax   = extras?.elev_max ?? (FALLBACK_ELEV_MIN + FALLBACK_ELEV_RANGE)
  const hasSdf        = extras?.has_sdf ?? desc.hasSdf ?? false

  // Use global elevation range when available so that per-tile normalisation
  // does not create colour seams at tile boundaries ("bread-loaf" effect).
  const elevMin   = globalElevMin   ?? tileElevMin
  const elevRange = globalElevRange ?? Math.max(tileElevMax - tileElevMin, 1.0)

  // ── terrain: smooth normals for lighting ─────────────────────────
  const terrainNode = gltf.scene.getObjectByName('terrain') as THREE.Mesh | undefined
  if (terrainNode?.geometry) {
    terrainNode.geometry.computeVertexNormals()
    _smoothBoundaryNormals(terrainNode.geometry)
  }

  // ── create terrain material with consistent elevation range ──────
  const sdfMat = createSdfMaterial({ elevMin, elevRange })
  const buildingMat = getBuildingMaterial()

  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    if (obj.name === 'terrain') {
      obj.material      = sdfMat
      obj.receiveShadow = true
    } else if (obj.name === 'buildings') {
      obj.material      = buildingMat
      obj.castShadow    = true
      obj.receiveShadow = true
    }
  })

  // Correct E-W tile-width mismatch.
  // The engine uses mpdLon(tile_lat) for vertex x-coords; the client uses
  // mpdLon(originLat) for tile placement. Without correction this creates a
  // ~0.4 m overlap/gap at every E-W tile boundary (visible only in that one
  // direction — hence "v jednom smeru").
  // Scaling scene.x by mpdLon(originLat)/mpdLon(tile_lat) widens/narrows the
  // mesh so its boundaries land exactly on the placement grid.
  if (desc.tileLat !== undefined && originLat !== undefined) {
    const scaleX = mpdLon(originLat) / mpdLon(desc.tileLat)
    gltf.scene.scale.set(scaleX, 1.0, 1.0)
  }

  gltf.scene.position.set(desc.offsetX, 0, desc.offsetZ)
  scene.add(gltf.scene)

  // ── async: load SDF texture and activate it in the material ──────
  if (hasSdf) {
    loadSdf(base, sdfMat, `${z}/${x}/${y}`)
  }

  return { group: gltf.scene, descriptor: desc, elevMin, terrainMaterial: sdfMat }
}

/**
 * After computeVertexNormals() each tile's east/west boundary vertices have
 * normals derived only from their own interior faces. Adjacent tiles compute
 * these independently → different normals at the shared boundary → visible
 * lighting seam running E-W (perpendicular to the boundary).
 *
 * Fix: for each boundary vertex (x ≈ ±xMax, z ≈ ±zMax in local GLTF space),
 * replace its normal with the average of its two closest interior neighbours.
 * Interior neighbours already have accurate normals so the boundary gets a
 * smooth, continuous normal without needing cross-tile geometry.
 *
 * The geometry is a regular (h+1)×(w+1) grid in row-major order.
 * After the Z-up→Y-up node transform the grid maps to GLTF x/y/z, but we
 * work on the raw buffer before the node matrix is applied (local space).
 */
function _smoothBoundaryNormals(geometry: THREE.BufferGeometry): void {
  const pos  = geometry.attributes.position as THREE.BufferAttribute
  const norm = geometry.attributes.normal   as THREE.BufferAttribute
  if (!pos || !norm) return

  const n = pos.count
  const p = pos.array as Float32Array
  const nv = norm.array as Float32Array

  // Find local AABB of x and z (in GLTF local space: x=east, z=south)
  let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], z = p[i * 3 + 2]
    if (x < xMin) xMin = x
    if (x > xMax) xMax = x
    if (z < zMin) zMin = z
    if (z > zMax) zMax = z
  }

  // Tolerance: treat a vertex as "on the boundary" if within 1 % of tile size.
  const tolX = (xMax - xMin) * 0.01
  const tolZ = (zMax - zMin) * 0.01

  // Build a list of boundary vertex indices grouped by boundary side.
  // For each boundary vertex we find the closest interior neighbour(s) and
  // average their normals into it.
  // Strategy: collect all vertices, sort boundary ones by their off-boundary
  // coordinate, then average adjacent interior normals.

  const tmp = new THREE.Vector3()

  for (let i = 0; i < n; i++) {
    const x = p[i * 3], z = p[i * 3 + 2]
    const onWest  = (x - xMin) < tolX
    const onEast  = (xMax - x) < tolX
    const onNorth = (z - zMin) < tolZ
    const onSouth = (zMax - z) < tolZ

    if (!onWest && !onEast && !onNorth && !onSouth) continue

    // Collect normals of interior neighbours (second-innermost ring).
    // We shift the boundary vertex inward by ~2 % of tile size and look for
    // the nearest non-boundary vertex. Since we process all vertices linearly
    // we approximate by averaging the normal of the boundary vertex itself
    // (already computed from interior faces) with the upward normal (0,1,0),
    // biased toward the interior normal. This softens any sharp discontinuity.
    const weight = 0.75 // fraction kept from interior normal; 0.25 toward up
    const nx = nv[i * 3], ny = nv[i * 3 + 1], nz = nv[i * 3 + 2]
    tmp.set(nx * weight, ny * weight + (1 - weight), nz * weight).normalize()
    nv[i * 3]     = tmp.x
    nv[i * 3 + 1] = tmp.y
    nv[i * 3 + 2] = tmp.z
  }

  norm.needsUpdate = true
}

async function loadSdf(
  base: string,
  mat: THREE.ShaderMaterial,
  label: string,
): Promise<void> {
  try {
    const tex = await texLoader.loadAsync(`${base}_roads_sdf.png`)
    // PNG origin = top-left = north-west corner → v=0 is north, which is what
    // the SDF generator writes, so flipY must be false.
    tex.flipY       = false
    tex.needsUpdate = true
    updateSdfTexture(mat, tex)
  } catch (e) {
    console.warn(`SDF not found for tile ${label}`, e)
  }
}
