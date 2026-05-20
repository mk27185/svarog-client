/**
 * 3rd-person camera (Ingress-style) — plain TS port of svarog useThirdPersonCamera.
 * Player stays centred; azimuth/elevation/distance drive the orbit.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export type RotationMode = 'sensor' | 'manual'

export interface CameraConfig {
  minDistance: number
  maxDistance: number
  minElevation: number
  maxElevation: number
  defaultDistance: number
  defaultElevation: number
  defaultAzimuth: number
}

export interface ThirdPersonCamera {
  readonly rotationMode: RotationMode
  toggleRotationMode(): void
  setTarget(target: THREE.Vector3): void
  setAzimuth(deg: number): void
  setElevation(deg: number): void
  setDistance(dist: number): void
  update(): void
  dispose(): void
}

export function createThirdPersonCamera(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  config: CameraConfig,
  initialMode: RotationMode = 'sensor',
): ThirdPersonCamera {
  const target = new THREE.Vector3(0, 0, 0)
  let distance = config.defaultDistance
  let elevation = config.defaultElevation
  let azimuth = config.defaultAzimuth
  let rotationMode: RotationMode = initialMode

  const controls = new OrbitControls(camera, domElement)
  controls.target.copy(target)
  controls.enablePan = false
  controls.enableZoom = true
  controls.enableRotate = rotationMode === 'manual'
  controls.minDistance = config.minDistance
  controls.maxDistance = config.maxDistance
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  controls.addEventListener('change', () => {
    if (rotationMode === 'manual') {
      updateAnglesFromCamera()
    } else {
      const newDistance = camera.position.distanceTo(target)
      if (Math.abs(newDistance - distance) > 0.1) {
        distance = newDistance
      }
    }
  })

  function updateAnglesFromCamera() {
    const direction = new THREE.Vector3()
      .subVectors(camera.position, target)
      .normalize()

    azimuth = Math.atan2(direction.z, direction.x) * 180 / Math.PI
    elevation = Math.acos(direction.y) * 180 / Math.PI
    distance = camera.position.distanceTo(target)
  }

  function calculateLookAtTarget(): THREE.Vector3 {
    const minElevation = config.minElevation
    const maxElevation = config.maxElevation
    const normalizedElevation = Math.max(0, Math.min(1,
      (elevation - minElevation) / (maxElevation - minElevation),
    ))

    let curvedElevation: number
    if (normalizedElevation < 0.5) {
      curvedElevation = Math.sin(normalizedElevation * Math.PI)
    } else {
      curvedElevation = 1.0 - (normalizedElevation - 0.5) * 1.2
    }

    const baseOffset = 1.0
    const normalizedDistance = distance / 100
    const distanceScale = Math.max(0.5, Math.min(16.0, normalizedDistance * 5.0))
    const offsetY = curvedElevation * baseOffset * distanceScale

    return target.clone().add(new THREE.Vector3(0, offsetY, 0))
  }

  function calculateCameraPosition(): THREE.Vector3 {
    const elevRad = elevation * Math.PI / 180
    const azimRad = azimuth * Math.PI / 180

    return new THREE.Vector3(
      target.x + distance * Math.sin(elevRad) * Math.cos(azimRad),
      target.y + distance * Math.cos(elevRad),
      target.z + distance * Math.sin(elevRad) * Math.sin(azimRad),
    )
  }

  function update() {
    const lookAtTarget = calculateLookAtTarget()
    controls.target.copy(lookAtTarget)

    if (rotationMode === 'manual') {
      controls.enableRotate = true
      const cameraPos = calculateCameraPosition()
      camera.position.copy(cameraPos)
      camera.lookAt(lookAtTarget)
      controls.update()
      updateAnglesFromCamera()
    } else {
      controls.enableRotate = false
      controls.enableZoom = true
      const cameraPos = calculateCameraPosition()
      camera.position.copy(cameraPos)
      camera.lookAt(lookAtTarget)
      controls.update()
      distance = camera.position.distanceTo(target)
    }
  }

  function setTarget(newTarget: THREE.Vector3) {
    target.copy(newTarget)
    update()
  }

  function setAzimuth(newAzimuth: number) {
    azimuth = newAzimuth
    if (rotationMode === 'sensor') update()
  }

  function setElevation(newElevation: number) {
    elevation = Math.max(config.minElevation, Math.min(config.maxElevation, newElevation))
    if (rotationMode === 'sensor') update()
  }

  function setDistance(newDistance: number) {
    distance = Math.max(config.minDistance, Math.min(config.maxDistance, newDistance))
    update()
  }

  function toggleRotationMode() {
    const wasManual = rotationMode === 'manual'
    rotationMode = rotationMode === 'sensor' ? 'manual' : 'sensor'
    controls.enableRotate = rotationMode === 'manual'
    if (wasManual && rotationMode === 'sensor') {
      updateAnglesFromCamera()
    }
    update()
  }

  update()

  return {
    get rotationMode() { return rotationMode },
    toggleRotationMode,
    setTarget,
    setAzimuth,
    setElevation,
    setDistance,
    update,
    dispose() {
      controls.dispose()
    },
  }
}
