/**
 * Loads a single XYZ tile: GLB mesh + optional embedded or sidecar textures.
 *
 * Tile URL pattern:
 *   GLB  /tiles/{z}/{x}/{y}/{y}.glb
 *   SDF  /tiles/{z}/{x}/{y}/{y}_roads_sdf.png  (fallback when not embedded)
 *   LC   /tiles/{z}/{x}/{y}/{y}_landcover.png   (fallback when not embedded)
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import {
  createSdfMaterial,
  updateSdfTexture,
  updateLandcoverTexture,
} from './sdf-material'
import { getBuildingMaterial } from './shared-materials'
import { mpdLon } from './geo'
import {
  createNavmeshDebugObject,
  loadNavmeshFromGltf,
  type NavmeshTileData,
} from './navmesh-loader'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

const texLoader = new THREE.TextureLoader()

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
  hasSdf?: boolean
  hasLandcover?: boolean
  offsetX: number
  offsetZ: number
  tileLat?: number
}

export interface LoadedTile {
  group:            THREE.Group
  descriptor:       TileDescriptor
  elevMin:          number
  terrainMesh?:     THREE.Mesh
  terrainMaterial?: THREE.ShaderMaterial
  navmesh?:         NavmeshTileData | null
  navmeshDebug?:    THREE.LineSegments | null
}

export interface TileExtras {
  elev_min?:           number
  elev_max?:           number
  has_sdf?:            boolean
  sdf_embedded?:       boolean
  texture_roads?:      number
  has_landcover?:      boolean
  texture_landcover?:  number
  has_navmesh?:        boolean
  sdf_uv_width_m?:     number
  sdf_uv_height_m?:    number
}

const FALLBACK_ELEV_MIN   = 220.0
const FALLBACK_ELEV_RANGE =  70.0

function extractEmbeddedSdfTexture(terrainNode: THREE.Mesh | undefined): THREE.Texture | null {
  if (!terrainNode) return null
  const raw = terrainNode.material
  const mats = Array.isArray(raw) ? raw : [raw]
  for (const m of mats) {
    if (m && 'map' in m && m.map instanceof THREE.Texture) {
      const tex = m.map
      tex.flipY = false
      return tex
    }
  }
  return null
}

async function resolveGltfTexture(gltf: GLTF, index: number): Promise<THREE.Texture | null> {
  try {
    const tex = await gltf.parser.getDependency('texture', index)
    if (tex instanceof THREE.Texture) {
      tex.flipY = false
      return tex
    }
  } catch {
    /* missing texture */
  }
  return null
}

export async function loadTile(
  scene: THREE.Scene,
  desc: TileDescriptor,
  assetsPathPrefix: string,
  globalElevMin?:   number,
  globalElevRange?: number,
  originLat?:       number,
  showNavmeshDebug = false,
): Promise<LoadedTile> {
  const { z, x, y } = desc
  const base = `${assetsPathPrefix}/${z}/${x}/${y}/${y}`

  const gltf = await gltfLoader.loadAsync(`${base}.glb`)

  const extras = (gltf.scene.userData?.svarog ?? null) as TileExtras | null

  const tileElevMin   = extras?.elev_min ?? FALLBACK_ELEV_MIN
  const tileElevMax   = extras?.elev_max ?? (FALLBACK_ELEV_MIN + FALLBACK_ELEV_RANGE)
  const hasSdf        = extras?.has_sdf ?? desc.hasSdf ?? false
  const hasLandcover  = extras?.has_landcover ?? desc.hasLandcover ?? false

  const elevMin   = globalElevMin   ?? tileElevMin
  const elevRange = globalElevRange ?? Math.max(tileElevMax - tileElevMin, 1.0)

  const terrainNode = gltf.scene.getObjectByName('terrain') as THREE.Mesh | undefined
  if (terrainNode?.geometry) {
    terrainNode.geometry.computeVertexNormals()
    _smoothBoundaryNormals(terrainNode.geometry)
  }

  let sdfTex = extractEmbeddedSdfTexture(terrainNode)
  if (!sdfTex && extras?.sdf_embedded && extras.texture_roads != null) {
    sdfTex = await resolveGltfTexture(gltf, extras.texture_roads)
  }

  let landcoverTex: THREE.Texture | null = null
  if (hasLandcover && extras?.texture_landcover != null) {
    landcoverTex = await resolveGltfTexture(gltf, extras.texture_landcover)
  }

  const sdfMat = createSdfMaterial({
    sdfTexture: sdfTex ?? undefined,
    landcoverTexture: landcoverTex ?? undefined,
    elevMin,
    elevRange,
  })
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

  if (desc.tileLat !== undefined && originLat !== undefined) {
    const scaleX = mpdLon(originLat) / mpdLon(desc.tileLat)
    gltf.scene.scale.set(scaleX, 1.0, 1.0)
  }

  gltf.scene.position.set(desc.offsetX, 0, desc.offsetZ)
  scene.add(gltf.scene)

  const label = `${z}/${x}/${y}`

  if (hasSdf && !sdfTex) {
    void loadSdfSidecar(base, sdfMat, label)
  }

  if (hasLandcover && !landcoverTex) {
    void loadLandcoverSidecar(base, sdfMat, label)
  }

  const navmesh = await loadNavmeshFromGltf(gltf)
  let navmeshDebug: THREE.LineSegments | null = null
  if (navmesh && showNavmeshDebug) {
    navmeshDebug = createNavmeshDebugObject(navmesh)
    gltf.scene.add(navmeshDebug)
  }

  return {
    group: gltf.scene,
    descriptor: desc,
    elevMin,
    terrainMesh: terrainNode,
    terrainMaterial: sdfMat,
    navmesh,
    navmeshDebug,
  }
}

export function setNavmeshDebugVisible(tile: LoadedTile, visible: boolean): void {
  if (!tile.navmesh) return
  if (visible) {
    if (!tile.navmeshDebug) {
      tile.navmeshDebug = createNavmeshDebugObject(tile.navmesh)
      tile.group.add(tile.navmeshDebug)
    }
    tile.navmeshDebug.visible = true
  } else if (tile.navmeshDebug) {
    tile.navmeshDebug.visible = false
  }
}

function _smoothBoundaryNormals(geometry: THREE.BufferGeometry): void {
  const pos  = geometry.attributes.position as THREE.BufferAttribute
  const norm = geometry.attributes.normal   as THREE.BufferAttribute
  if (!pos || !norm) return

  const n = pos.count
  const p = pos.array as Float32Array
  const nv = norm.array as Float32Array

  let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], z = p[i * 3 + 2]
    if (x < xMin) xMin = x
    if (x > xMax) xMax = x
    if (z < zMin) zMin = z
    if (z > zMax) zMax = z
  }

  const tolX = (xMax - xMin) * 0.01
  const tolZ = (zMax - zMin) * 0.01
  const tmp = new THREE.Vector3()

  for (let i = 0; i < n; i++) {
    const x = p[i * 3], z = p[i * 3 + 2]
    const onWest  = (x - xMin) < tolX
    const onEast  = (xMax - x) < tolX
    const onNorth = (z - zMin) < tolZ
    const onSouth = (zMax - z) < tolZ

    if (!onWest && !onEast && !onNorth && !onSouth) continue

    const weight = 0.75
    const nx = nv[i * 3], ny = nv[i * 3 + 1], nz = nv[i * 3 + 2]
    tmp.set(nx * weight, ny * weight + (1 - weight), nz * weight).normalize()
    nv[i * 3]     = tmp.x
    nv[i * 3 + 1] = tmp.y
    nv[i * 3 + 2] = tmp.z
  }

  norm.needsUpdate = true
}

async function loadSdfSidecar(
  base: string,
  mat: THREE.ShaderMaterial,
  label: string,
): Promise<void> {
  try {
    const tex = await texLoader.loadAsync(`${base}_roads_sdf.png`)
    tex.flipY = false
    tex.needsUpdate = true
    updateSdfTexture(mat, tex)
  } catch (e) {
    console.warn(`SDF not found for tile ${label}`, e)
  }
}

async function loadLandcoverSidecar(
  base: string,
  mat: THREE.ShaderMaterial,
  label: string,
): Promise<void> {
  try {
    const tex = await texLoader.loadAsync(`${base}_landcover.png`)
    tex.flipY = false
    tex.needsUpdate = true
    updateLandcoverTexture(mat, tex)
  } catch (e) {
    console.warn(`Landcover not found for tile ${label}`, e)
  }
}
