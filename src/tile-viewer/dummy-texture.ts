import * as THREE from 'three'

/** 1×1 placeholder so samplers are never null when tiles load textures async. */
let placeholder: THREE.DataTexture | null = null

export function getPlaceholderTexture(): THREE.DataTexture {
  if (!placeholder) {
    // Alpha 0 — must not trigger road/water branches before real PNG loads.
    placeholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
    placeholder.needsUpdate = true
    placeholder.colorSpace = THREE.NoColorSpace
  }
  return placeholder
}
