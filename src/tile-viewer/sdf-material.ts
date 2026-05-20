/**
 * Terrain + SDF roads + landcover.
 * All layers (terrain, water, roads) share one FogExp2 pass — same formula as scene.fog on buildings.
 * Fog depth = max(view Z, horizontal distance) so flat ground at horizon fades like vertical meshes.
 */

import * as THREE from 'three'
import type { TileViewerTheme } from './theme'
import { hexToVec3 } from './theme'
import { getPlaceholderTexture } from './dummy-texture'
import { getSharedRoadPalette } from './road-palette'
import { registerTerrainMaterial } from './theme-store'

const VERT = /* glsl */`
  out vec2  vSdfUv;
  out vec3  vWorldNormal;
  out float vElevNorm;
  out vec3  vWorldPos;

  uniform float uElevMin;
  uniform float uElevRange;

  void main() {
    vSdfUv = uv;
    vElevNorm = clamp((position.y - uElevMin) / max(uElevRange, 1.0), 0.0, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */`
  precision highp float;

  uniform sampler2D uSdfTexture;
  uniform sampler2D uLandcoverTexture;
  uniform sampler2D uRoadPalette;
  uniform float     uHasSdf;
  uniform float     uHasLandcover;
  uniform float     uUseHighwayPalette;
  uniform float     uOverlayOpacity;

  uniform vec3 uTerrainLow;
  uniform vec3 uTerrainHigh;
  uniform vec3 uRoadDark;
  uniform vec3 uRoadLight;
  uniform vec3 uWaterColor;
  uniform vec3 uRiverColor;
  uniform vec3 uGreenColor;
  uniform vec3 uRailColor;

  uniform vec3  uSunDirection;
  uniform vec3  uSunColor;
  uniform vec3  uSkyAmbient;
  uniform vec3  uGroundAmbient;
  uniform float uSunStrength;

  uniform vec3  uFogColor;
  uniform float uFogDensity;
  uniform vec3  uCameraPosition;

  in vec2  vSdfUv;
  in vec3  vWorldNormal;
  in float vElevNorm;
  in vec3  vWorldPos;

  out vec4 fragColor;

  vec3 terrainColor(float h) {
    return mix(uTerrainLow, uTerrainHigh, h);
  }

  vec3 shade(vec3 n) {
    vec3 N = normalize(n);
    float hemi = N.y * 0.5 + 0.5;
    vec3 ambient = mix(uGroundAmbient, uSkyAmbient, hemi);
    float ndl = max(0.0, dot(N, uSunDirection));
    return ambient + uSunColor * (uSunStrength * ndl);
  }

  // Three.js FogExp2 depth for buildings = view Z. Flat floor underestimates it — take max.
  float sceneFogDepth() {
    float viewDepth = max(-(viewMatrix * vec4(vWorldPos, 1.0)).z, 0.0);
    vec3 delta = vWorldPos - uCameraPosition;
    float horiz = length(delta.xz);
    return max(viewDepth, horiz);
  }

  vec3 applySceneFog(vec3 color) {
    float depth = sceneFogDepth();
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
    return mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));
  }

  void main() {
    vec3 light = shade(vWorldNormal);
    vec3 tColor = terrainColor(vElevNorm) * light;

    float overlay = clamp(uOverlayOpacity, 0.0, 1.0);

    if (uHasLandcover > 0.5) {
      vec4 lc = texture(uLandcoverTexture, vSdfUv);
      if (lc.b > 0.04) {
        tColor = mix(tColor, uGreenColor * light, smoothstep(0.04, 0.35, lc.b) * overlay);
      }
      if (lc.r > 0.04) {
        tColor = mix(tColor, uWaterColor * light, smoothstep(0.04, 0.40, lc.r) * overlay);
      }
      if (lc.g > 0.04) {
        tColor = mix(tColor, uRiverColor * light, smoothstep(0.04, 0.50, lc.g) * overlay);
      }
      if (lc.a > 0.04) {
        tColor = mix(tColor, uRailColor * light, smoothstep(0.04, 0.45, lc.a) * overlay);
      }
    }

    if (uHasSdf > 0.5) {
      vec4 sdf = texture(uSdfTexture, vSdfUv);
      if (sdf.a > 0.04) {
        vec3 asphalt = uUseHighwayPalette > 0.5
          ? texture(uRoadPalette, vec2(sdf.g, 0.5)).rgb
          : mix(uRoadDark, uRoadLight, sdf.g);
        float blend = smoothstep(0.04, 0.55, sdf.a) * overlay;
        tColor = mix(tColor, asphalt * light, blend);
      }
    }

    fragColor = vec4(applySceneFog(tColor), 1.0);
  }
`

export interface SdfMaterialOptions {
  sdfTexture?: THREE.Texture
  landcoverTexture?: THREE.Texture
  elevMin?: number
  elevRange?: number
  expectSdf?: boolean
  expectLandcover?: boolean
}

export interface SdfMaterialUserData {
  expectSdf: boolean
  expectLandcover: boolean
}

function configureOverlayTexture(tex: THREE.Texture): void {
  tex.flipY = false
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
}

export function ensureTerrainShaderUniforms(mat: THREE.ShaderMaterial): void {
  const u = mat.uniforms
  const placeholder = getPlaceholderTexture()
  if (!u.uSdfTexture?.value) u.uSdfTexture = { value: placeholder }
  if (!u.uLandcoverTexture?.value) u.uLandcoverTexture = { value: placeholder }
  if (!u.uRoadPalette?.value) u.uRoadPalette = { value: getSharedRoadPalette() }
  if (!u.uSunDirection) u.uSunDirection = { value: new THREE.Vector3(0.6, 1, 0.5).normalize() }
  if (!u.uSunColor) u.uSunColor = { value: new THREE.Vector3(1, 0.96, 0.92) }
  if (!u.uSkyAmbient) u.uSkyAmbient = { value: new THREE.Vector3(0.55, 0.5, 0.45) }
  if (!u.uGroundAmbient) u.uGroundAmbient = { value: new THREE.Vector3(0.35, 0.32, 0.28) }
  if (!u.uSunStrength) u.uSunStrength = { value: 0.3 }
  if (!u.uFogColor) u.uFogColor = { value: new THREE.Vector3(0.94, 0.82, 0.71) }
  if (!u.uFogDensity) u.uFogDensity = { value: 0.00115 }
  if (!u.uCameraPosition) u.uCameraPosition = { value: new THREE.Vector3() }
  if (u.uHasSdf == null) u.uHasSdf = { value: 0 }
  if (u.uHasLandcover == null) u.uHasLandcover = { value: 0 }
  if (u.uUseHighwayPalette == null) u.uUseHighwayPalette = { value: 0 }
  if (u.uOverlayOpacity == null) u.uOverlayOpacity = { value: 1 }
}

function syncLayerFlags(mat: THREE.ShaderMaterial): void {
  const ud = mat.userData as Partial<SdfMaterialUserData>
  const placeholder = getPlaceholderTexture()
  const sdfTex = mat.uniforms.uSdfTexture!.value as THREE.Texture
  const lcTex = mat.uniforms.uLandcoverTexture!.value as THREE.Texture
  const hasRealSdf = sdfTex != null && sdfTex !== placeholder
  const hasRealLc = lcTex != null && lcTex !== placeholder
  mat.uniforms.uHasSdf!.value = (ud.expectSdf === true || hasRealSdf) ? 1 : 0
  mat.uniforms.uHasLandcover!.value = (ud.expectLandcover === true || hasRealLc) ? 1 : 0
}

export function createSdfMaterial(opts: SdfMaterialOptions = {}): THREE.ShaderMaterial {
  const placeholder = getPlaceholderTexture()
  const expectSdf = opts.expectSdf ?? !!opts.sdfTexture
  const expectLandcover = opts.expectLandcover ?? !!opts.landcoverTexture

  if (opts.sdfTexture) configureOverlayTexture(opts.sdfTexture)
  if (opts.landcoverTexture) configureOverlayTexture(opts.landcoverTexture)

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uSdfTexture:        { value: opts.sdfTexture ?? placeholder },
      uLandcoverTexture:  { value: opts.landcoverTexture ?? placeholder },
      uRoadPalette:       { value: getSharedRoadPalette() },
      uHasSdf:            { value: expectSdf ? 1 : 0 },
      uHasLandcover:      { value: expectLandcover ? 1 : 0 },
      uUseHighwayPalette: { value: 0 },
      uOverlayOpacity:    { value: 1 },
      uTerrainLow:        { value: new THREE.Vector3(0.28, 0.48, 0.18) },
      uTerrainHigh:       { value: new THREE.Vector3(0.60, 0.50, 0.30) },
      uRoadDark:          { value: new THREE.Vector3(0.22, 0.18, 0.14) },
      uRoadLight:         { value: new THREE.Vector3(0.52, 0.46, 0.38) },
      uWaterColor:        { value: new THREE.Vector3(0.38, 0.44, 0.50) },
      uRiverColor:        { value: new THREE.Vector3(0.34, 0.40, 0.46) },
      uGreenColor:        { value: new THREE.Vector3(0.36, 0.38, 0.28) },
      uRailColor:         { value: new THREE.Vector3(0.28, 0.24, 0.20) },
      uSunDirection:      { value: new THREE.Vector3(0.6, 1.0, 0.5).normalize() },
      uSunColor:          { value: new THREE.Vector3(1.0, 0.96, 0.92) },
      uSkyAmbient:        { value: new THREE.Vector3(0.55, 0.5, 0.45) },
      uGroundAmbient:     { value: new THREE.Vector3(0.35, 0.32, 0.28) },
      uSunStrength:       { value: 0.60 },
      uFogColor:          { value: new THREE.Vector3(0.94, 0.82, 0.71) },
      uFogDensity:        { value: 0.00115 },
      uCameraPosition:    { value: new THREE.Vector3() },
      uElevMin:           { value: opts.elevMin ?? 220.0 },
      uElevRange:         { value: opts.elevRange ?? 70.0 },
    },
    side: THREE.DoubleSide,
    fog: false,
    glslVersion: THREE.GLSL3,
  })

  mat.userData = { expectSdf, expectLandcover } satisfies SdfMaterialUserData
  syncLayerFlags(mat)
  registerTerrainMaterial(mat)
  return mat
}

export function applyThemeToMaterial(
  mat: THREE.ShaderMaterial,
  theme: TileViewerTheme,
  sunDir?: THREE.Vector3,
): void {
  ensureTerrainShaderUniforms(mat)
  syncLayerFlags(mat)
  const u = mat.uniforms
  u.uTerrainLow!.value.set(...hexToVec3(theme.terrainLow))
  u.uTerrainHigh!.value.set(...hexToVec3(theme.terrainHigh))
  u.uRoadDark!.value.set(...hexToVec3(theme.roadDark))
  u.uRoadLight!.value.set(...hexToVec3(theme.roadLight))
  u.uWaterColor!.value.set(...hexToVec3(theme.water))
  u.uRiverColor!.value.set(...hexToVec3(theme.river))
  u.uGreenColor!.value.set(...hexToVec3(theme.green))
  u.uRailColor!.value.set(...hexToVec3(theme.rail))
  u.uUseHighwayPalette!.value = theme.useHighwayPalette ? 1 : 0
  u.uOverlayOpacity!.value = theme.sdfOverlayOpacity
  u.uRoadPalette!.value = getSharedRoadPalette()
  u.uSunStrength!.value = theme.sunIntensity
  u.uSunColor!.value.set(...hexToVec3(theme.sunColor))
  if (sunDir) u.uSunDirection!.value.copy(sunDir)
  u.uFogColor!.value.set(...hexToVec3(theme.fog))
  u.uFogDensity!.value = theme.fogDensity
}

export function applyTerrainAmbientToMaterial(
  mat: THREE.ShaderMaterial,
  skyAmbient: THREE.Vector3,
  groundAmbient: THREE.Vector3,
): void {
  ensureTerrainShaderUniforms(mat)
  mat.uniforms.uSkyAmbient!.value.copy(skyAmbient)
  mat.uniforms.uGroundAmbient!.value.copy(groundAmbient)
}

export function updateSdfTexture(mat: THREE.ShaderMaterial, sdfTexture: THREE.Texture): void {
  configureOverlayTexture(sdfTexture)
  mat.uniforms.uSdfTexture!.value = sdfTexture
  const ud = mat.userData as SdfMaterialUserData
  ud.expectSdf = true
  syncLayerFlags(mat)
}

export function updateLandcoverTexture(mat: THREE.ShaderMaterial, landcoverTexture: THREE.Texture): void {
  configureOverlayTexture(landcoverTexture)
  mat.uniforms.uLandcoverTexture!.value = landcoverTexture
  const ud = mat.userData as SdfMaterialUserData
  ud.expectLandcover = true
  syncLayerFlags(mat)
}

export function syncCameraUniform(mat: THREE.ShaderMaterial, camera: THREE.Camera): void {
  ensureTerrainShaderUniforms(mat)
  camera.getWorldPosition(mat.uniforms.uCameraPosition!.value as THREE.Vector3)
}

/** Keep terrain fog identical to scene.fog (buildings use the same FogExp2). */
export function syncFogUniforms(mat: THREE.ShaderMaterial, fog: THREE.FogExp2): void {
  ensureTerrainShaderUniforms(mat)
  mat.uniforms.uFogDensity!.value = fog.density
  const c = fog.color
  ;(mat.uniforms.uFogColor!.value as THREE.Vector3).set(c.r, c.g, c.b)
}

export function syncSunUniform(mat: THREE.ShaderMaterial, sun: THREE.DirectionalLight): void {
  ensureTerrainShaderUniforms(mat)
  const dir = mat.uniforms.uSunDirection!.value as THREE.Vector3
  const target = new THREE.Vector3()
  sun.target.getWorldPosition(target)
  const pos = new THREE.Vector3()
  sun.getWorldPosition(pos)
  dir.subVectors(pos, target).normalize()
}
