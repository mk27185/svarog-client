/**
 * Outdoor lighting and atmosphere for the tile viewer.
 *
 * Sky (Preetham) + hemisphere/directional lights + optional clouds.
 * Sky/clouds follow the camera so the world can use large coordinates.
 */

import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import type { TileViewerTheme } from './theme'
import { hexToVec3 } from './theme'
import { createCloudLayer, type CloudLayer } from './cloud-layer'

/** Slightly inside camera far plane so the sky shell is not clipped. */
export function skyScaleForCamera(far: number): number {
  return far * 0.92
}

export interface WorldEnvironment {
  sky: Sky
  clouds: CloudLayer
  hemisphere: THREE.HemisphereLight
  sun: THREE.DirectionalLight
  sunDirection: THREE.Vector3
  applyTheme: (theme: TileViewerTheme) => void
  update: (camera: THREE.Camera, focus: THREE.Vector3, dt: number) => void
  dispose: () => void
}

function sunDirectionFromTheme(theme: TileViewerTheme, out: THREE.Vector3): THREE.Vector3 {
  const elev = THREE.MathUtils.degToRad(theme.sunElevation)
  const azim = THREE.MathUtils.degToRad(theme.sunAzimuth)
  const phi = Math.PI / 2 - elev
  return out.setFromSphericalCoords(1, phi, azim)
}

function atmosphereColors(
  sunDir: THREE.Vector3,
  skyOut: THREE.Color,
  groundOut: THREE.Color,
  fogOut: THREE.Color,
): void {
  const elev = Math.max(sunDir.y, 0)
  const sunset = 1 - smoothstep(0.05, 0.35, elev)

  skyOut.setHSL(0.58 - sunset * 0.08, 0.45 + sunset * 0.2, 0.55 + elev * 0.2)
  groundOut.setHSL(0.12, 0.25, 0.22 + sunset * 0.08)
  fogOut.copy(skyOut).lerp(new THREE.Color(0xc8d4e8), 0.35)
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function createWorldEnvironment(scene: THREE.Scene, cameraFar: number): WorldEnvironment {
  const skyRadius = skyScaleForCamera(cameraFar)
  const horizonColor = new THREE.Color(0x8eb8d8)
  scene.background = horizonColor.clone()

  const sky = new Sky()
  sky.scale.setScalar(skyRadius)
  sky.frustumCulled = false
  sky.renderOrder = -3
  const skyMat = sky.material as THREE.ShaderMaterial
  skyMat.fog = false
  skyMat.depthWrite = false
  skyMat.toneMapped = false

  const skyUniforms = skyMat.uniforms
  skyUniforms.turbidity!.value = 2
  skyUniforms.rayleigh!.value = 1.5
  skyUniforms.mieCoefficient!.value = 0.005
  skyUniforms.mieDirectionalG!.value = 0.8

  const clouds = createCloudLayer(skyRadius)
  const cloudMat = clouds.mesh.material as THREE.ShaderMaterial
  cloudMat.fog = false
  cloudMat.toneMapped = false

  const hemisphere = new THREE.HemisphereLight(0xb8d4f0, 0x3d4a32, 0.6)
  scene.add(hemisphere)

  const sun = new THREE.DirectionalLight(0xfff5eb, 1.0)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const r = 1400
  Object.assign(sun.shadow.camera, { near: 1, far: 5000, left: -r, right: r, bottom: -r, top: r })
  sun.shadow.bias = -0.0002
  sun.shadow.normalBias = 0.02
  scene.add(sun.target)
  scene.add(sun)

  scene.add(sky)
  scene.add(clouds.mesh)

  const sunDirection = new THREE.Vector3()
  const skyColor = new THREE.Color()
  const groundColor = new THREE.Color()
  const fogColor = new THREE.Color()
  const _camPos = new THREE.Vector3()

  scene.fog = new THREE.FogExp2(horizonColor.getHex(), 0.00018)

  function syncSunAndSky(theme: TileViewerTheme): void {
    sunDirectionFromTheme(theme, sunDirection)

    skyUniforms.sunPosition!.value.copy(sunDirection)
    skyUniforms.turbidity!.value = theme.turbidity
    skyUniforms.rayleigh!.value = theme.rayleigh

    atmosphereColors(sunDirection, skyColor, groundColor, fogColor)

    const [sr, sg, sb] = hexToVec3(theme.sunColor)
    const horizonTint = new THREE.Color(theme.fog)
    const skyTint = new THREE.Color(theme.sky)

    hemisphere.color.copy(skyTint).lerp(skyColor, 0.35).lerp(new THREE.Color(sr, sg, sb), 0.1)
    hemisphere.groundColor.copy(groundColor)
    hemisphere.intensity = theme.ambientIntensity

    sun.intensity = theme.sunIntensity
    sun.color.set(theme.sunColor)

    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(horizonTint).lerp(fogColor, 0.25)
      scene.fog.density = theme.fogDensity
    }
    const bg = horizonTint.clone()
    bg.lerp(skyTint, 0.4).lerp(fogColor, 0.2)
    scene.background = bg

    clouds.material.uniforms.uCoverage!.value = theme.cloudCoverage
    clouds.material.uniforms.uCloudBrightness!.value = theme.cloudBrightness
  }

  const env: WorldEnvironment = {
    sky,
    clouds,
    hemisphere,
    sun,
    sunDirection,
    applyTheme(theme) {
      syncSunAndSky(theme)
    },
    update(camera, focus, dt) {
      camera.getWorldPosition(_camPos)

      sky.position.copy(_camPos)
      clouds.mesh.position.copy(_camPos)
      clouds.material.uniforms.uCameraPosition!.value.copy(_camPos)

      const sunDist = 3000
      sun.position.copy(focus).addScaledVector(sunDirection, sunDist)
      sun.target.position.copy(focus)
      sun.target.updateMatrixWorld()

      clouds.update(sunDirection, clouds.material.uniforms.uCoverage!.value as number, dt)
    },
    dispose() {
      scene.remove(sky)
      scene.remove(clouds.mesh)
      scene.remove(hemisphere)
      scene.remove(sun.target)
      scene.remove(sun)
      sky.geometry.dispose()
      sky.material.dispose()
      clouds.dispose()
      hemisphere.dispose()
      sun.dispose()
    },
  }

  return env
}

export function getTerrainAmbientColors(
  env: WorldEnvironment,
  theme: TileViewerTheme,
  skyOut: THREE.Vector3,
  groundOut: THREE.Vector3,
): void {
  const sunDir = env.sunDirection
  const elev = Math.max(sunDir.y, 0)
  const [sr, sg, sb] = hexToVec3(theme.sunColor)

  skyOut.set(
    0.45 + elev * 0.35 + sr * theme.skyAmbientScale * 0.15,
    0.55 + elev * 0.3 + sg * theme.skyAmbientScale * 0.15,
    0.75 + elev * 0.2 + sb * theme.skyAmbientScale * 0.1,
  )
  groundOut.set(
    0.18 * theme.groundAmbientScale,
    0.22 * theme.groundAmbientScale,
    0.14 * theme.groundAmbientScale,
  )
}
