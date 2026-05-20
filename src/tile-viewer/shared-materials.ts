import * as THREE from 'three'

let buildingMaterial: THREE.MeshStandardMaterial | null = null

export function getBuildingMaterial(): THREE.MeshStandardMaterial {
  if (!buildingMaterial) {
    buildingMaterial = new THREE.MeshStandardMaterial({
      color: 0x847566,
      roughness: 0.92,
      metalness: 0.0,
      side: THREE.DoubleSide,
      flatShading: true,
      fog: true,
    })
  }
  return buildingMaterial
}
