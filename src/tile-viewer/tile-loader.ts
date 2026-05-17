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
import { createSdfMaterial, updateSdfTexture } from './sdf-material'

const gltfLoader = new GLTFLoader()
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
  hasSdf: boolean
  /** world-space offset of this tile's geographic centre (metres from grid centre) */
  offsetX: number
  offsetZ: number
}

export interface LoadedTile {
  group: THREE.Group
  descriptor: TileDescriptor
}

// Shared building material — flat-shaded blocks, no SDF needed
const BUILDING_MAT = new THREE.MeshStandardMaterial({
  color: 0x9ba5b4,
  roughness: 0.8,
  metalness: 0.05,
  side: THREE.DoubleSide,
  flatShading: true,
})

// Global elevation range used to keep terrain colour consistent across all tiles.
// Prague sits between ~220 m and ~290 m; a 60 m window covers the full dataset.
const GLOBAL_ELEV_MIN   = 220.0
const GLOBAL_ELEV_RANGE =  70.0

export async function loadTile(
  scene: THREE.Scene,
  desc: TileDescriptor,
  assetsPathPrefix: string,
): Promise<LoadedTile> {
  const { z, x, y } = desc
  const base = `${assetsPathPrefix}/${z}/${x}/${y}/${y}`

  const gltf = await gltfLoader.loadAsync(`${base}.glb`)

  // ── terrain: smooth normals for lighting (no moiré) ─────────────
  const terrainNode = gltf.scene.getObjectByName('terrain') as THREE.Mesh | undefined
  if (terrainNode?.geometry) {
    // TEXCOORD_0 UV is already baked into the GLB by the exporter —
    // we only need to add smooth normals (the GLB has none).
    terrainNode.geometry.computeVertexNormals()
  }

  // ── create terrain material (UV comes from geometry attribute) ───
  const sdfMat = createSdfMaterial({
    elevMin:   GLOBAL_ELEV_MIN,
    elevRange: GLOBAL_ELEV_RANGE,
  })

  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    if (obj.name === 'terrain') {
      obj.material      = sdfMat
      obj.receiveShadow = true
    } else if (obj.name === 'buildings') {
      obj.material      = BUILDING_MAT
      obj.castShadow    = true
      obj.receiveShadow = true
    }
  })

  gltf.scene.position.set(desc.offsetX, 0, desc.offsetZ)
  scene.add(gltf.scene)

  // ── async: load SDF texture and activate it in the material ──────
  if (desc.hasSdf) {
    loadSdf(base, sdfMat, `${z}/${x}/${y}`)
  }

  return { group: gltf.scene, descriptor: desc }
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
