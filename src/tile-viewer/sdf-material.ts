/**
 * Custom ShaderMaterial for terrain tiles with SDF road overlay.
 *
 * SDF texture channels (sdf_generator.py):
 *   R  signed-distance  |  G  road importance  |  B  width  |  A  mask
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

  uniform float uElevMin;
  uniform float uElevRange;

  void main() {
    vSdfUv = uv;
    vElevNorm = clamp((position.z - uElevMin) / max(uElevRange, 1.0), 0.0, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */`
  precision mediump float;

  uniform sampler2D uSdfTexture;
  uniform sampler2D uRoadPalette;
  uniform bool      uHasSdf;
  uniform bool      uUseHighwayPalette;

  uniform vec3 uTerrainLow;
  uniform vec3 uTerrainHigh;
  uniform vec3 uRoadDark;
  uniform vec3 uRoadLight;

  uniform vec3  uSunDirection;
  uniform float uAmbient;
  uniform float uSunStrength;

  in vec2  vSdfUv;
  in vec3  vWorldNormal;
  in float vElevNorm;

  out vec4 fragColor;

  vec3 terrainColor(float h) {
    return mix(uTerrainLow, uTerrainHigh, h);
  }

  float lambert(vec3 n) {
    float ndl = max(0.0, dot(normalize(n), uSunDirection));
    return uAmbient + uSunStrength * ndl;
  }

  void main() {
    vec3 tColor = terrainColor(vElevNorm);
    float light = lambert(vWorldNormal);
    tColor *= light;

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

    fragColor = vec4(tColor, 1.0);
  }
`

export interface SdfMaterialOptions {
  sdfTexture?: THREE.Texture
  elevMin?:    number
  elevRange?:  number
}

export function createSdfMaterial(opts: SdfMaterialOptions = {}): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms: {
      uSdfTexture:       { value: opts.sdfTexture ?? null },
      uRoadPalette:      { value: getSharedRoadPalette() },
      uHasSdf:           { value: opts.sdfTexture != null },
      uUseHighwayPalette:{ value: false },
      uTerrainLow:       { value: new THREE.Vector3(0.28, 0.48, 0.18) },
      uTerrainHigh:      { value: new THREE.Vector3(0.60, 0.50, 0.30) },
      uRoadDark:         { value: new THREE.Vector3(0.36, 0.36, 0.40) },
      uRoadLight:        { value: new THREE.Vector3(0.72, 0.70, 0.65) },
      uSunDirection:     { value: new THREE.Vector3(0.6, 1.0, 0.5).normalize() },
      uAmbient:          { value: 0.40 },
      uSunStrength:      { value: 0.60 },
      uElevMin:          { value: opts.elevMin   ?? 220.0 },
      uElevRange:        { value: opts.elevRange ?? 70.0  },
    },
    side:        THREE.DoubleSide,
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
  const u = mat.uniforms
  u.uTerrainLow!.value.set(...hexToVec3(theme.terrainLow))
  u.uTerrainHigh!.value.set(...hexToVec3(theme.terrainHigh))
  u.uRoadDark!.value.set(...hexToVec3(theme.roadDark))
  u.uRoadLight!.value.set(...hexToVec3(theme.roadLight))
  u.uUseHighwayPalette!.value = theme.useHighwayPalette
  u.uRoadPalette!.value = getSharedRoadPalette()

  const ambient = theme.ambientIntensity
  const sun = theme.sunIntensity
  u.uAmbient!.value = ambient
  u.uSunStrength!.value = sun

  if (sunDir) {
    u.uSunDirection!.value.copy(sunDir)
  }
}

export function updateSdfTexture(
  mat: THREE.ShaderMaterial,
  sdfTexture: THREE.Texture,
): void {
  mat.uniforms.uSdfTexture!.value = sdfTexture
  mat.uniforms.uHasSdf!.value    = true
}

export function syncSunUniform(
  mat: THREE.ShaderMaterial,
  sun: THREE.DirectionalLight,
): void {
  const target = new THREE.Vector3()
  sun.target.getWorldPosition(target)
  const pos = new THREE.Vector3()
  sun.getWorldPosition(pos)
  mat.uniforms.uSunDirection!.value.subVectors(pos, target).normalize()
}
