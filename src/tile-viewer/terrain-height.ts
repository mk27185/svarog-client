/**
 * Sample terrain surface height at a world X/Z position via downward raycast.
 * Mirrors svarog's projectPointOntoTerrain — intersects loaded GLB terrain meshes.
 */

import * as THREE from 'three'
import type { LoadedTile } from './tile-loader'

const DOWN = new THREE.Vector3(0, -1, 0)
const raycaster = new THREE.Raycaster()

const rayOrigin = new THREE.Vector3()

/** Camera / orbit target offset above the terrain surface (metres). */
export const PLAYER_HEIGHT_ABOVE_TERRAIN = 1.0

/** Cone marker centre so the base sits on the terrain (ConeGeometry height 14). */
export const MARKER_CENTER_ABOVE_TERRAIN = 7.0

export interface TerrainHeightSampler {
  sampleTerrainY: (worldX: number, worldZ: number) => number | null
  invalidateCache: () => void
}

export function createTerrainHeightSampler(
  getTiles: () => Iterable<LoadedTile>,
  rayOriginY: () => number,
): TerrainHeightSampler {
  let cachedMeshes: THREE.Mesh[] = []
  let cacheKey = ''

  function rebuildCache(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = []
    for (const lt of getTiles()) {
      if (lt.terrainMesh) meshes.push(lt.terrainMesh)
    }
    const key = meshes.map((m) => m.uuid).join(',')
    if (key !== cacheKey) {
      cachedMeshes = meshes
      cacheKey = key
    }
    return cachedMeshes
  }

  function sampleTerrainY(worldX: number, worldZ: number): number | null {
    const meshes = rebuildCache()
    if (meshes.length === 0) return null

    rayOrigin.set(worldX, rayOriginY(), worldZ)
    raycaster.set(rayOrigin, DOWN)

    const hits = raycaster.intersectObjects(meshes, false)
    if (hits.length === 0) return null
    return hits[0]!.point.y
  }

  return {
    sampleTerrainY,
    invalidateCache: () => { cacheKey = '' },
  }
}
