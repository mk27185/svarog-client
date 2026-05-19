import * as THREE from 'three'

let buildingMaterial: THREE.MeshStandardMaterial | null = null

export function getBuildingMaterial(): THREE.MeshStandardMaterial {
  if (!buildingMaterial) {
    buildingMaterial = new THREE.MeshStandardMaterial({
      color: 0x9ba5b4,
      roughness: 0.8,
      metalness: 0.05,
      side: THREE.DoubleSide,
      flatShading: true,
    })
  }
  return buildingMaterial
}
