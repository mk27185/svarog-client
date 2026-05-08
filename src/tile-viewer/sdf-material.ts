/**
 * Custom ShaderMaterial for terrain tiles with SDF road overlay.
 *
 * The terrain GLB carries TEXCOORD_0 UV baked by gltf_exporter.py,
 * derived from tile_center_local (cx = total_width_m / 2):
 *
 *   u = (centred_x + cx) / (2·cx)           west=0, east=1
 *   v = 1 − (centred_y + cy) / (2·cy)       north=0, south=1
 *
 * This is the exact mapping used by sdf_generator.py, so alignment is
 * guaranteed without any client-side constants or per-tile tuning.
 *
 * SDF texture channels (sdf_generator.py):
 *   R  signed-distance  (0 = far outside, 0.5 = road edge, 1 = deep inside)
 *   G  road importance  (1 = motorway … 0 = footway)
 *   B  road half-width  (normalised)
 *   A  road mask        (1 on road, 0 off road)
 *
 * Elevation colour uses vElevNorm passed from vertex shader based on
 * raw GLTF position.z (= local elevation before Z→Y node rotation),
 * normalised against a global Prague elevation window.
 */

import * as THREE from 'three'

const VERT = /* glsl */`
  // TEXCOORD_0 baked by exporter — no computation needed
  out vec2  vSdfUv;
  out vec3  vWorldNormal;
  out float vElevNorm;

  uniform float uElevMin;
  uniform float uElevRange;

  void main() {
    vSdfUv = uv;                    // direct: matches SDF PNG coordinate system

    // position.z = raw elevation (GLTF Z-up space, before node rotation)
    vElevNorm = clamp((position.z - uElevMin) / max(uElevRange, 1.0), 0.0, 1.0);

    // Smooth normal (computeVertexNormals) → world space via modelMatrix
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */`
  precision mediump float;

  uniform sampler2D uSdfTexture;
  uniform bool      uHasSdf;

  in vec2  vSdfUv;
  in vec3  vWorldNormal;
  in float vElevNorm;

  out vec4 fragColor;

  vec3 terrainColor(float h) {
    return mix(vec3(0.28, 0.48, 0.18), vec3(0.60, 0.50, 0.30), h);
  }

  void main() {
    vec3 tColor = terrainColor(vElevNorm);

    // Lambert shading from smooth vertex normals
    vec3  sun   = normalize(vec3(0.6, 1.0, 0.5));
    float light = 0.40 + 0.60 * max(0.0, dot(normalize(vWorldNormal), sun));
    tColor *= light;

    if (uHasSdf) {
      vec4  sdf        = texture(uSdfTexture, vSdfUv);
      float roadMask   = sdf.a;
      float importance = sdf.g;

      if (roadMask > 0.04) {
        vec3  asphalt = mix(vec3(0.36, 0.36, 0.40), vec3(0.72, 0.70, 0.65), importance);
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
  /** Prague global elevation window (metres). Defaults cover the full dataset. */
  elevMin?:  number
  elevRange?: number
}

export function createSdfMaterial(opts: SdfMaterialOptions = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms: {
      uSdfTexture: { value: opts.sdfTexture ?? null },
      uHasSdf:     { value: opts.sdfTexture != null },
      uElevMin:    { value: opts.elevMin    ?? 220.0 },
      uElevRange:  { value: opts.elevRange  ?? 70.0  },
    },
    side:        THREE.DoubleSide,
    glslVersion: THREE.GLSL3,
  })
}

export function updateSdfTexture(
  mat: THREE.ShaderMaterial,
  sdfTexture: THREE.Texture,
): void {
  mat.uniforms.uSdfTexture.value = sdfTexture
  mat.uniforms.uHasSdf.value     = true
}
