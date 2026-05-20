import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import type { TileViewerTheme } from './theme'

const ColorGradeShader = {
  uniforms: {
    tDiffuse:    { value: null },
    uSaturation: { value: 1.0 },
    uContrast:   { value: 1.0 },
    uVignette:   { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;

      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(luma), c, uSaturation);

      c = (c - 0.5) * uContrast + 0.5;

      vec2 uv = vUv * 2.0 - 1.0;
      float vig = 1.0 - uVignette * dot(uv, uv) * 0.35;
      c *= clamp(vig, 0.0, 1.0);

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), tex.a);
    }
  `,
}

export interface ColorGradePass {
  pass: ShaderPass
  applyTheme: (theme: Pick<TileViewerTheme, 'saturation' | 'contrast' | 'vignette'>) => void
}

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): { composer: EffectComposer; colorGrade: ColorGradePass } {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  // Sky shader outputs HDR; without this pass the framebuffer clamps to white.
  composer.addPass(new OutputPass())

  const gradePass = new ShaderPass(ColorGradeShader)
  composer.addPass(gradePass)

  const colorGrade: ColorGradePass = {
    pass: gradePass,
    applyTheme(theme) {
      gradePass.uniforms.uSaturation!.value = theme.saturation
      gradePass.uniforms.uContrast!.value   = theme.contrast
      gradePass.uniforms.uVignette!.value   = theme.vignette
    },
  }

  return { composer, colorGrade }
}

export function resizeComposer(
  composer: EffectComposer,
  width: number,
  height: number,
): void {
  composer.setSize(width, height)
}
