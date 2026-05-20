/**
 * Load EXT_svarog_navmesh from a GLB (accessor-based triangle soup).
 */

import * as THREE from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'

export interface NavmeshTileData {
  vertices: Float32Array
  indices: Uint32Array
}

/** Z-up tile-local → Y-up GLTF (same as engine node matrix). */
export function navmeshZUpToYUp(vertices: Float32Array): Float32Array {
  const out = new Float32Array(vertices.length)
  for (let i = 0; i < vertices.length; i += 3) {
    out[i]     = vertices[i]!
    out[i + 1] = vertices[i + 2]!
    out[i + 2] = -vertices[i + 1]!
  }
  return out
}

export async function loadNavmeshFromGltf(gltf: GLTF): Promise<NavmeshTileData | null> {
  const json = gltf.parser.json as {
    scene?: number
    scenes?: Array<{ extensions?: Record<string, unknown> }>
  }
  const sceneIndex = json.scene ?? 0
  const sceneDef = json.scenes?.[sceneIndex]
  const ext = sceneDef?.extensions?.EXT_svarog_navmesh as {
    verticesAccessor?: number
    indicesAccessor?: number
  } | undefined

  if (ext?.verticesAccessor == null || ext?.indicesAccessor == null) {
    return null
  }

  try {
    const vertAttr = await gltf.parser.getDependency('accessor', ext.verticesAccessor) as THREE.BufferAttribute
    const idxAttr  = await gltf.parser.getDependency('accessor', ext.indicesAccessor) as THREE.BufferAttribute

    const vertices = new Float32Array(vertAttr.array as ArrayLike<number>)
    const indices  = new Uint32Array(idxAttr.array as ArrayLike<number>)

    return { vertices: navmeshZUpToYUp(vertices), indices }
  } catch (e) {
    console.warn('Navmesh extension parse failed', e)
    return null
  }
}

export function createNavmeshDebugObject(data: NavmeshTileData): THREE.LineSegments {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3))
  geo.setIndex(Array.from(data.indices))
  const wire = new THREE.WireframeGeometry(geo)
  const lines = new THREE.LineSegments(
    wire,
    new THREE.LineBasicMaterial({ color: 0x22cc88, transparent: true, opacity: 0.55 }),
  )
  lines.name = 'navmesh-debug'
  lines.renderOrder = 10
  return lines
}
