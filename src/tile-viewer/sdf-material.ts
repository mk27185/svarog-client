/**
 * Custom ShaderMaterial for terrain tiles with SDF road overlay.
 *
 * SDF texture channels (sdf_generator.py):
 *   R  signed-distance  |  G  road importance  |  B  width  |  A  mask
 *
 * Landcover texture (landcover_generator.py):
 *   R  water bodies  |  G  rivers  |  B  green  |  A  railways
 *
 * Blend order: terrain → green → water → rivers → railways → roads (top)
 */

import * as THREE from 'three'
import type { TileViewerTheme } from './theme'
import { hexToVec3 } from './theme'
import { getSharedRoadPalette } from './road-palette'
import { registerTerrainMaterial } from './theme-store'

const VERT = /* glsl */`
  out vec2  vSdfUv;
  out vec3  vWorldNormal;
  out float vElevNorm;
  out float vFogDepth;

  uniform float uElevMin;
  uniform float uElevRange;

  void main() {
    vSdfUv = uv;
    vElevNorm = clamp((position.z - uElevMin) / max(uElevRange, 1.0), 0.0, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mvPos.z;
    gl_Position = projectionMatrix * mvPos;
  }
`

const FRAG = /* glsl */`
  precision mediump float;

  uniform sampler2D uSdfTexture;
  uniform sampler2D uLandcoverTexture;
  uniform sampler2D uRoadPalette;
  uniform bool      uHasSdf;
  uniform bool      uHasLandcover;
  uniform bool      uUseHighwayPalette;

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

  in vec2  vSdfUv;
  in vec3  vWorldNormal;
  in float vElevNorm;
  in float vFogDepth;

  out vec4 fragColor;

  vec3 terrainColor(float h) {
    return mix(uTerrainLow, uTerrainHigh, h);
  }

  vec3 shade(vec3 n) {
    vec3 N = normalize(n);
    float hemi = N.y * 0.5 + 0.5;
    vec3 ambient = mix(uGroundAmbient, uSkyAmbient, hemi);
    float ndl = max(0.0, dot(N, uSunDirection));
    vec3 direct = uSunColor * (uSunStrength * ndl);
    return ambient + direct;
  }

  vec3 applyFog(vec3 color, float depth) {
    float d = uFogDensity * depth;
    float fogFactor = 1.0 - exp(-d * d);
    return mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));
  }

  void main() {
    vec3 tColor = terrainColor(vElevNorm);
    vec3 light = shade(vWorldNormal);
    tColor *= light;

    if (uHasLandcover) {
      vec4 lc = texture(uLandcoverTexture, vSdfUv);
      float gMask = lc.b;
      float wMask = lc.r;
      float rMask = lc.g;
      float railMask = lc.a;

      if (gMask > 0.04) {
        vec3 c = uGreenColor * light;
        tColor = mix(tColor, c, smoothstep(0.04, 0.35, gMask));
      }
      if (wMask > 0.04) {
        vec3 c = uWaterColor * light;
        tColor = mix(tColor, c, smoothstep(0.04, 0.40, wMask));
      }
      if (rMask > 0.04) {
        vec3 c = uRiverColor * light;
        tColor = mix(tColor, c, smoothstep(0.04, 0.50, rMask));
      }
      if (railMask > 0.04) {
        vec3 c = uRailColor * light;
        tColor = mix(tColor, c, smoothstep(0.04, 0.45, railMask));
      }
    }

    if (uHasSdf) {
      vec4  sdf        = texture(uSdfTexture, vSdfUv);
      float roadMask   = sdf.a;
      float importance = sdf.g;

      if (roadMask > 0.04) {
        vec3 asphalt;
        if (uUseHighwayPalette) {
          asphalt = texture(uRoadPalette, vec2(importance, 0.5)).rgb;
        } else {
          asphalt = mix(uRoadDark, uRoadLight, importance);
        }
        asphalt *= light;
        float blend = smoothstep(0.04, 0.60, roadMask);
        tColor = mix(tColor, asphalt, blend);
      }
    }

    tColor = applyFog(tColor, vFogDepth);
    fragColor = vec4(tColor, 1.0);
  }
`

export interface SdfMaterialOptions {
  sdfTexture?: THREE.Texture
  landcoverTexture?: THREE.Texture
  elevMin?:    number
  elevRange?:  number
}

/** Backfill uniforms when HMR or cached materials predate shader changes. */
export function ensureTerrainShaderUniforms(mat: THREE.ShaderMaterial): void {
  const u = mat.uniforms
  if (!u.uSunDirection) u.uSunDirection = { value: new THREE.Vector3(0.6, 1, 0.5).normalize() }
  if (!u.uSunColor) u.uSunColor = { value: new THREE.Vector3(1, 0.96, 0.92) }
  if (!u.uSkyAmbient) u.uSkyAmbient = { value: new THREE.Vector3(0.94, 0.82, 0.71) }
  if (!u.uGroundAmbient) u.uGroundAmbient = { value: new THREE.Vector3(0.5, 0.45, 0.38) }
  if (!u.uSunStrength) u.uSunStrength = { value: 0.3 }
  if (!u.uFogColor) u.uFogColor = { value: new THREE.Vector3(0.94, 0.82, 0.71) }
  if (!u.uFogDensity) u.uFogDensity = { value: 0.0015 }
  if (!u.uRoadPalette) u.uRoadPalette = { value: getSharedRoadPalette() }
}

export function createSdfMaterial(opts: SdfMaterialOptions = {}): THREE.ShaderMaterial {
  const hasSdf = opts.sdfTexture != null
  const hasLc  = opts.landcoverTexture != null

  const mat = new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms: {
      uSdfTexture:        { value: opts.sdfTexture ?? null },
      uLandcoverTexture:  { value: opts.landcoverTexture ?? null },
      uRoadPalette:       { value: getSharedRoadPalette() },
      uHasSdf:            { value: hasSdf },
      uHasLandcover:      { value: hasLc },
      uUseHighwayPalette: { value: false },
      uTerrainLow:        { value: new THREE.Vector3(0.28, 0.48, 0.18) },
      uTerrainHigh:       { value: new THREE.Vector3(0.60, 0.50, 0.30) },
      uRoadDark:          { value: new THREE.Vector3(0.36, 0.36, 0.40) },
      uRoadLight:         { value: new THREE.Vector3(0.72, 0.70, 0.65) },
      uWaterColor:        { value: new THREE.Vector3(0.25, 0.45, 0.72) },
      uRiverColor:        { value: new THREE.Vector3(0.30, 0.52, 0.78) },
      uGreenColor:        { value: new THREE.Vector3(0.32, 0.55, 0.28) },
      uRailColor:         { value: new THREE.Vector3(0.45, 0.42, 0.40) },
      uSunDirection:      { value: new THREE.Vector3(0.6, 1.0, 0.5).normalize() },
      uSunColor:            { value: new THREE.Vector3(1.0, 0.96, 0.92) },
      uSkyAmbient:          { value: new THREE.Vector3(0.55, 0.62, 0.78) },
      uGroundAmbient:       { value: new THREE.Vector3(0.18, 0.22, 0.14) },
      uSunStrength:         { value: 0.60 },
      uFogColor:            { value: new THREE.Vector3(0.94, 0.82, 0.71) },
      uFogDensity:          { value: 0.0015 },
      uElevMin:           { value: opts.elevMin   ?? 220.0 },
      uElevRange:         { value: opts.elevRange ?? 70.0  },
    },
    side:        THREE.DoubleSide,
    fog:         false,
    glslVersion: THREE.GLSL3,
  })

  registerTerrainMaterial(mat)
  return mat
}

export function applyThemeToMaterial(
  mat: THREE.ShaderMaterial,
  theme: TileViewerTheme,
  sunDir?: THREE.Vector3,
): void {
  ensureTerrainShaderUniforms(mat)
  const u = mat.uniforms
  u.uTerrainLow!.value.set(...hexToVec3(theme.terrainLow))
  u.uTerrainHigh!.value.set(...hexToVec3(theme.terrainHigh))
  u.uRoadDark!.value.set(...hexToVec3(theme.roadDark))
  u.uRoadLight!.value.set(...hexToVec3(theme.roadLight))
  u.uWaterColor!.value.set(...hexToVec3(theme.water))
  u.uRiverColor!.value.set(...hexToVec3(theme.river))
  u.uGreenColor!.value.set(...hexToVec3(theme.green))
  u.uRailColor!.value.set(...hexToVec3(theme.rail))
  u.uUseHighwayPalette!.value = theme.useHighwayPalette
  u.uRoadPalette!.value = getSharedRoadPalette()

  u.uSunStrength!.value = theme.sunIntensity
  u.uSunColor!.value.set(...hexToVec3(theme.sunColor))

  if (sunDir) {
    u.uSunDirection!.value.copy(sunDir)
  }

  if (u.uFogColor) u.uFogColor.value.set(...hexToVec3(theme.fog))
  if (u.uFogDensity) u.uFogDensity.value = theme.fogDensity
}

export function applyTerrainAmbientToMaterial(
  mat: THREE.ShaderMaterial,
  skyAmbient: THREE.Vector3,
  groundAmbient: THREE.Vector3,
): void {
  ensureTerrainShaderUniforms(mat)
  mat.uniforms.uSkyAmbient?.value.copy(skyAmbient)
  mat.uniforms.uGroundAmbient?.value.copy(groundAmbient)
}

export function updateSdfTexture(
  mat: THREE.ShaderMaterial,
  sdfTexture: THREE.Texture,
): void {
  sdfTexture.flipY = false
  mat.uniforms.uSdfTexture!.value = sdfTexture
  mat.uniforms.uHasSdf!.value    = true
}

export function updateLandcoverTexture(
  mat: THREE.ShaderMaterial,
  landcoverTexture: THREE.Texture,
): void {
  landcoverTexture.flipY = false
  mat.uniforms.uLandcoverTexture!.value = landcoverTexture
  mat.uniforms.uHasLandcover!.value     = true
}

export function syncSunUniform(
  mat: THREE.ShaderMaterial,
  sun: THREE.DirectionalLight,
): void {
  ensureTerrainShaderUniforms(mat)
  const dir = mat.uniforms.uSunDirection?.value as THREE.Vector3 | undefined
  if (!dir) return
  const target = new THREE.Vector3()
  sun.target.getWorldPosition(target)
  const pos = new THREE.Vector3()
  sun.getWorldPosition(pos)
  dir.subVectors(pos, target).normalize()
}
